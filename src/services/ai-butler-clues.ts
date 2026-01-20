import { BUTLER_CLUE_SYSTEM_PROMPT, buildButlerClueUserPrompt } from "../data/ai-butler-prompt";
import {
  SUSPECTS,
  ITEMS,
  LOCATIONS,
  TIME_PERIODS,
  type Suspect,
  type Item,
  type Location,
  type TimePeriod,
} from "../data/game-elements";

type ButlerClueResponse = {
  clues: Array<{
    speaker: "Butler";
    greeting: "Good day" | "Hello" | "Coming" | "Good evening";
    text: string;
  }>;
};

type ButlerAiDebug = {
  systemPrompt: string;
  userPrompt: string;
  rawResponse: string;
  parsed?: ButlerClueResponse;
  answerKey?: {
    suspect: string;
    item: string;
    location: string;
    time: string;
  };
  formattedClues?: string[];
};

let lastButlerAiDebug: ButlerAiDebug | null = null;

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const MODEL_NAME = "gpt-5.2-2025-12-11";
const ALLOWED_GREETINGS = new Set(["Good day", "Hello", "Coming", "Good evening"]);

export async function generateButlerClues(apiKey: string, params: {
  clueCount: number;
  solution: {
    suspectId: string;
    itemId: string;
    locationId: string;
    timeId: string;
  };
}): Promise<string[]> {
  const answerKey = {
    suspect: findName(SUSPECTS, params.solution.suspectId),
    item: findName(ITEMS, params.solution.itemId),
    location: findName(LOCATIONS, params.solution.locationId),
    time: findName(TIME_PERIODS, params.solution.timeId),
  };

  const suspectList = SUSPECTS.filter((s) => s.id !== params.solution.suspectId)
    .map((s) => s.displayName);
  const itemList = ITEMS.filter((i) => i.id !== params.solution.itemId)
    .map((i) => i.nameUS);
  const locationList = LOCATIONS.filter((l) => l.id !== params.solution.locationId)
    .map((l) => l.name);
  const timeList = TIME_PERIODS.filter((t) => t.id !== params.solution.timeId)
    .map((t) => t.name);

  const userPrompt = buildButlerClueUserPrompt({
    clueCount: params.clueCount,
    suspectList,
    itemList,
    locationList,
    timeList,
    answerKey,
  });
  lastButlerAiDebug = {
    systemPrompt: BUTLER_CLUE_SYSTEM_PROMPT,
    userPrompt,
    rawResponse: "",
    answerKey,
  };

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      temperature: 0.4,
      input: [
        { role: "system", content: BUTLER_CLUE_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${errorText}`);
  }

  const data = await response.json() as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };

  const outputText =
    data.output_text ??
    data.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text ?? "")
      .join("") ??
    "";

  const cleaned = stripCodeFences(outputText);
  if (lastButlerAiDebug) {
    lastButlerAiDebug.rawResponse = outputText;
  }
  if (!cleaned.trim()) {
    throw new Error("OpenAI response was empty.");
  }

  const parsed = JSON.parse(cleaned) as ButlerClueResponse;
  if (lastButlerAiDebug) {
    lastButlerAiDebug.parsed = parsed;
  }
  if (!parsed.clues || !Array.isArray(parsed.clues)) {
    throw new Error("OpenAI response did not include clues.");
  }
  if (parsed.clues.length !== params.clueCount) {
    throw new Error(`Expected ${params.clueCount} clues, received ${parsed.clues.length}.`);
  }

  const formatted = parsed.clues.map((clue) => formatClue(clue));
  if (lastButlerAiDebug) {
    lastButlerAiDebug.formattedClues = formatted;
  }
  return formatted;
}

function formatClue(clue: ButlerClueResponse["clues"][number]): string {
  const greeting = ALLOWED_GREETINGS.has(clue.greeting) ? clue.greeting : "Good day";
  let text = clue.text.trim();
  for (const candidate of ALLOWED_GREETINGS) {
    const prefix = new RegExp(`^${candidate}\\s*[\\-–—:]\\s*`, "i");
    if (prefix.test(text)) {
      text = text.replace(prefix, "");
      break;
    }
  }
  text = text.replace(/^[-–—]\s*/, "");
  return `${greeting} — ${text}`;
}

function findName<T extends Suspect | Item | Location | TimePeriod>(list: T[], id: string): string {
  const match = list.find((entry) => entry.id === id);
  if (!match) return id;
  if ("displayName" in match) return match.displayName;
  if ("nameUS" in match) return match.nameUS;
  if ("name" in match) return match.name;
  return id;
}

function stripCodeFences(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) return value;
  return trimmed.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "");
}

export function getLastButlerAiDebug(): ButlerAiDebug | null {
  return lastButlerAiDebug;
}
