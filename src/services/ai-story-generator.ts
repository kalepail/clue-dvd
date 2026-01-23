import { STORY_SYSTEM_PROMPT, buildStoryUserPrompt } from "../data/ai-story-prompt";
import { buildStorySpec, type StorySpec } from "./story-pool-selector";
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
import type { CampaignPlan } from "../types/campaign";

type StoryAiResponse = {
  opening: string;
  butler_clues: string[];
  inspector_notes: string[];
  closing: string;
};

type StoryAiDebug = {
  systemPrompt: string;
  userPrompt: string;
  rawResponse: string;
  parsed?: StoryAiResponse;
  storySpec: StorySpec;
  answerKey: {
    suspect: string;
    item: string;
    location: string;
    time: string;
  };
  formattedClues?: string[];
};

let lastStoryAiDebug: StoryAiDebug | null = null;

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const MODEL_NAME = "gpt-5.2-2025-12-11";
const ALLOWED_GREETINGS = ["Good day", "Hello", "Coming", "Good evening"];

export async function generateStoryPackage(apiKey: string, params: {
  plan: CampaignPlan;
}): Promise<{
  opening: string;
  butlerClues: string[];
  inspectorNotes: string[];
  closing: string;
}> {
  const storySpec = buildStorySpec(params.plan);
  const answerKey = {
    suspect: findName(SUSPECTS, params.plan.solution.suspectId),
    item: findName(ITEMS, params.plan.solution.itemId),
    location: findName(LOCATIONS, params.plan.solution.locationId),
    time: findName(TIME_PERIODS, params.plan.solution.timeId),
  };

  const userPrompt = buildStoryUserPrompt({
    storySpec,
    suspectList: SUSPECTS.map((s) => s.displayName),
    itemList: ITEMS.map((i) => i.nameUS),
    locationList: LOCATIONS.map((l) => l.name),
    timeList: TIME_PERIODS.map((t) => t.name),
    answerKey,
  });

  lastStoryAiDebug = {
    systemPrompt: STORY_SYSTEM_PROMPT,
    userPrompt,
    rawResponse: "",
    storySpec,
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
        { role: "system", content: STORY_SYSTEM_PROMPT },
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

  if (lastStoryAiDebug) {
    lastStoryAiDebug.rawResponse = outputText;
  }

  const cleaned = stripCodeFences(outputText);
  if (!cleaned.trim()) {
    throw new Error("OpenAI response was empty.");
  }

  const parsed = JSON.parse(cleaned) as StoryAiResponse;
  if (!parsed.opening || !parsed.closing) {
    throw new Error("OpenAI response missing opening or closing.");
  }
  if (!Array.isArray(parsed.butler_clues) || parsed.butler_clues.length !== 10) {
    throw new Error(`Expected 10 butler clues, received ${parsed.butler_clues?.length ?? 0}.`);
  }
  if (!Array.isArray(parsed.inspector_notes) || parsed.inspector_notes.length !== 2) {
    throw new Error(`Expected 2 inspector notes, received ${parsed.inspector_notes?.length ?? 0}.`);
  }

  const formattedClues = parsed.butler_clues.map((clue, index) =>
    formatButlerClue(clue, index)
  );
  if (lastStoryAiDebug) {
    lastStoryAiDebug.parsed = parsed;
    lastStoryAiDebug.formattedClues = formattedClues;
  }

  return {
    opening: parsed.opening.trim(),
    butlerClues: formattedClues,
    inspectorNotes: parsed.inspector_notes.map((note) => note.trim()),
    closing: parsed.closing.trim(),
  };
}


export function getLastStoryAiDebug(): StoryAiDebug | null {
  return lastStoryAiDebug;
}

function formatButlerClue(value: string, index: number): string {
  const text = value.trim();
  const extracted = extractGreeting(text);
  const greeting = extracted.greeting ?? ALLOWED_GREETINGS[index % ALLOWED_GREETINGS.length];
  let normalizedBody = stripGreetingPrefixes(extracted.body);
  normalizedBody = stripTimePreface(normalizedBody);
  return `${greeting} — ${normalizedBody}`;
}

function stripGreetingPrefixes(value: string): string {
  let result = value.trim();
  const prefix = /^(?:["'“”‘’]*\\s*)?(Good day|Hello|Coming|Good evening)\\b\\s*[-–—,:]*\\s*/i;
  while (prefix.test(result)) {
    result = result.replace(prefix, "").trim();
  }
  return result;
}

function extractGreeting(value: string): { greeting?: string; body: string } {
  const trimmed = value.trim();
  const greetingPattern = /^(?:["'“”‘’]*\\s*)?(Good day|Hello|Coming|Good evening)\\b/i;
  const match = trimmed.match(greetingPattern);
  if (!match) return { body: trimmed };
  const greeting = normalizeGreeting(match[1]);
  let body = trimmed.slice(match[0].length).trim();
  body = body.replace(/^[-–—,:]\\s*/, "");
  return { greeting, body };
}

function stripTimePreface(value: string): string {
  const prefixed = value.trim();
  const pattern = /^(earlier|later|just|right|shortly)\\s+this\\s+(morning|afternoon|evening|night|day)\\s*[,:-]?\\s+/i;
  if (pattern.test(prefixed)) {
    return prefixed.replace(pattern, "");
  }
  return prefixed;
}

function normalizeGreeting(value: string): string {
  const match = ALLOWED_GREETINGS.find((g) => g.toLowerCase() === value.toLowerCase());
  return match ?? "Good day";
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
  const fenceMatch = trimmed.match(/```[a-zA-Z]*\\n([\\s\\S]*?)```/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  if (!trimmed.startsWith("```")) return value;
  return trimmed.replace(/^```[a-zA-Z]*\\n?/, "").replace(/```$/, "");
}
