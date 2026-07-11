import { STORY_SYSTEM_PROMPT, buildStoryUserPrompt } from "../data/ai-story-prompt";
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

type AuthorAiResponse = {
  butler_clues: string[];
  closing: string;
};

type StoryAiResponse = AuthorAiResponse & {
  opening: string;
  inspector_notes: string[];
};

type StoryAiDebug = {
  systemPrompt: string;
  userPrompt: string;
  rawResponse: string;
  openingPrompt?: string;
  openingRawResponse?: string;
  inspectorPrompt?: string;
  inspectorRawResponse?: string;
  parsed?: StoryAiResponse;
  answerKey: {
    suspect: string;
    item: string;
    location: string;
    time: string;
  };
  formattedClues?: string[];
};

let lastStoryAiDebug: StoryAiDebug | null = null;

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL_NAME = "claude-sonnet-5";
const MAX_OUTPUT_TOKENS = 6000;
const ALLOWED_GREETINGS = ["Good day", "Hello", "Coming", "Good evening"];
const OCCASIONS = [
  "a charity subscription gathering",
  "a private musical recital",
  "a celebration of a family anniversary",
  "a benefit for the village hospital",
  "a weekend house tournament",
  "a reception for a visiting dignitary",
  "an engagement celebration",
  "a gathering of the county arts society",
  "a costume fête",
  "a reunion of old family friends",
];
const OPENING_TOOL_NAME = "submit_opening";
const OPENING_TOOL = {
  name: OPENING_TOOL_NAME,
  description: "Submit the occasion-setting introduction.",
  input_schema: {
    type: "object",
    properties: { opening: { type: "string" } },
    required: ["opening"],
    additionalProperties: false,
  },
};
const STORY_TOOL_NAME = "submit_mystery";
const STORY_TOOL = {
  name: STORY_TOOL_NAME,
  description: "Submit the completed mystery in the required application format.",
  input_schema: {
    type: "object",
    properties: {
      butler_clues: {
        type: "array",
        items: { type: "string" },
        minItems: 10,
        maxItems: 10,
      },
      closing: { type: "string" },
    },
    required: ["butler_clues", "closing"],
    additionalProperties: false,
  },
};
const INSPECTOR_TOOL_NAME = "submit_inspector_notes";
const INSPECTOR_TOOL = {
  name: INSPECTOR_TOOL_NAME,
  description: "Submit Inspector Brown's two investigative notes.",
  input_schema: {
    type: "object",
    properties: {
      inspector_notes: {
        type: "array",
        items: { type: "string" },
        minItems: 2,
        maxItems: 2,
      },
    },
    required: ["inspector_notes"],
    additionalProperties: false,
  },
};

export async function generateStoryPackage(apiKey: string, params: {
  plan: CampaignPlan;
}): Promise<{
  opening: string;
  butlerClues: string[];
  inspectorNotes: string[];
  closing: string;
}> {
  const answerKey = {
    suspect: findName(SUSPECTS, params.plan.solution.suspectId),
    item: findName(ITEMS, params.plan.solution.itemId),
    location: findName(LOCATIONS, params.plan.solution.locationId),
    time: findName(TIME_PERIODS, params.plan.solution.timeId),
  };
  const openingResult = await generateOpening(apiKey, params.plan.seed);
  const userPrompt = buildStoryUserPrompt({
    suspectList: SUSPECTS.map((s) => s.displayName),
    itemList: ITEMS.map((i) => i.nameUS),
    locationList: LOCATIONS.map((l) => l.name),
    timeList: TIME_PERIODS.map((t) => t.name),
    opening: openingResult.opening,
    answerKey,
  });

  lastStoryAiDebug = {
    systemPrompt: STORY_SYSTEM_PROMPT,
    userPrompt,
    rawResponse: "",
    openingPrompt: openingResult.prompt,
    openingRawResponse: openingResult.rawResponse,
    answerKey,
  };

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: STORY_SYSTEM_PROMPT,
      messages: [
        { role: "user", content: userPrompt },
      ],
      tools: [STORY_TOOL],
      tool_choice: { type: "tool", name: STORY_TOOL_NAME },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic request failed: ${response.status} ${errorText}`);
  }

  const data = await response.json() as {
    content?: Array<{
      type?: string;
      text?: string;
      name?: string;
      input?: unknown;
    }>;
  };

  const toolInput = data.content?.find(
    (content) => content.type === "tool_use" && content.name === STORY_TOOL_NAME
  )?.input;
  const outputText = data.content
    ?.filter((content) => content.type === "text")
    .map((content) => content.text ?? "")
    .join("") ?? "";

  if (lastStoryAiDebug) {
    lastStoryAiDebug.rawResponse = toolInput
      ? JSON.stringify(toolInput, null, 2)
      : outputText;
  }

  const parsed = toolInput
    ? toolInput as AuthorAiResponse
    : parseAuthorJson(stripCodeFences(outputText));
  if (!parsed.closing) {
    throw new Error("Anthropic response missing closing.");
  }
  if (!Array.isArray(parsed.butler_clues) || parsed.butler_clues.length !== 10) {
    throw new Error(`Expected 10 butler clues, received ${parsed.butler_clues?.length ?? 0}.`);
  }
  const formattedClues = parsed.butler_clues.map((clue, index) =>
    formatButlerClue(clue, index)
  );
  const inspectorNotes = await generateInspectorNotes(apiKey, {
    opening: openingResult.opening,
    butlerClues: formattedClues,
    answerKey,
  });
  const completedStory: StoryAiResponse = {
    ...parsed,
    opening: openingResult.opening,
    inspector_notes: inspectorNotes,
  };
  if (lastStoryAiDebug) {
    lastStoryAiDebug.parsed = completedStory;
    lastStoryAiDebug.formattedClues = formattedClues;
  }

  return {
    opening: openingResult.opening,
    butlerClues: formattedClues,
    inspectorNotes,
    closing: parsed.closing.trim(),
  };
}

async function generateOpening(apiKey: string, seed: number): Promise<{
  opening: string;
  prompt: string;
  rawResponse: string;
}> {
  const occasion = OCCASIONS[Math.abs(seed) % OCCASIONS.length];
  const prompt = `Write a brief introduction explaining only why Mr. Boddy has gathered a full company of acquaintances: ${occasion}.

Use two or three polished sentences in a restrained 1920s British country-house tone. This is pure occasion-setting, before any mystery begins. Do not mention or hint at a theft, missing property, suspicion, investigation, or crime. Do not name any suspect, valuable, room, game location, meal, or time of day.`;

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        max_tokens: 350,
        system: "Write only a neutral social introduction. Return the requested structured result.",
        messages: [{ role: "user", content: prompt }],
        tools: [OPENING_TOOL],
        tool_choice: { type: "tool", name: OPENING_TOOL_NAME },
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic opening request failed: ${response.status} ${await response.text()}`);
    }
    const data = await response.json() as {
      content?: Array<{ type?: string; name?: string; input?: unknown }>;
    };
    const input = data.content?.find(
      (content) => content.type === "tool_use" && content.name === OPENING_TOOL_NAME
    )?.input as { opening?: unknown } | undefined;
    const rawResponse = input ? JSON.stringify(input, null, 2) : "";
    if (typeof input?.opening !== "string" || !input.opening.trim()) {
      throw new Error("Anthropic opening response missing opening.");
    }
    const opening = input.opening.trim();
    if (containsForbiddenOpeningDetail(opening)) {
      return { opening: buildFallbackOpening(occasion), prompt, rawResponse };
    }
    return { opening, prompt, rawResponse };
  } catch (error) {
    return {
      opening: buildFallbackOpening(occasion),
      prompt,
      rawResponse: `Fallback used: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

export function containsForbiddenOpeningDetail(opening: string): boolean {
  const cardNames = [
    ...SUSPECTS.map((entry) => entry.displayName),
    ...ITEMS.map((entry) => entry.nameUS),
    ...LOCATIONS.map((entry) => entry.name),
    ...TIME_PERIODS.map((entry) => entry.name),
  ];
  if (cardNames.some((name) => containsExactTerm(opening, name))) return true;
  return /\b(theft|stolen|missing|crime|mystery|investigat(?:e|ion)|suspic(?:ion|ious)|morning|afternoon|evening|luncheon|supper|teatime|meal)\b/i.test(opening);
}

function buildFallbackOpening(occasion: string): string {
  return `Mr. Boddy had invited a broad circle of acquaintances to his home for ${occasion}. The gathering promised ceremony, conversation, and the sort of polite rivalries that made his invitations difficult to refuse.`;
}

async function generateInspectorNotes(apiKey: string, params: {
  opening: string;
  butlerClues: string[];
  answerKey: StoryAiDebug["answerKey"];
}): Promise<string[]> {
  const inspectorPrompt = `You are Inspector Brown reviewing an investigation in progress. You know the hidden solution privately, but the players must not receive any answer card from your notes.

Write two short notes that point toward the reasoning path supporting the true solution without writing, paraphrasing, or directly identifying any of the four answer values. Help players notice which kinds of statements should be compared or which assumption deserves re-examination. Phrase each as an investigative observation or question, not a conclusion. Do not announce a leading theory, combine a person with a place and time, summarize the clues, or use generic detective sayings. Each note should offer a different useful perspective and remain one or two sentences.

Private solution — never repeat these values in the notes:
- suspect: ${params.answerKey.suspect}
- item: ${params.answerKey.item}
- location: ${params.answerKey.location}
- time: ${params.answerKey.time}

Investigation:
${JSON.stringify({ opening: params.opening, butler_clues: params.butlerClues }, null, 2)}`;

  if (lastStoryAiDebug) lastStoryAiDebug.inspectorPrompt = inspectorPrompt;

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      max_tokens: 700,
      system: "Write restrained, useful Inspector Brown notes for a 1920s Clue DVD-style investigation. Return only the structured result.",
      messages: [{ role: "user", content: inspectorPrompt }],
      tools: [INSPECTOR_TOOL],
      tool_choice: { type: "tool", name: INSPECTOR_TOOL_NAME },
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic Inspector request failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json() as {
    content?: Array<{ type?: string; name?: string; input?: unknown }>;
  };
  const input = data.content?.find(
    (content) => content.type === "tool_use" && content.name === INSPECTOR_TOOL_NAME
  )?.input as { inspector_notes?: unknown } | undefined;

  if (lastStoryAiDebug) {
    lastStoryAiDebug.inspectorRawResponse = input ? JSON.stringify(input, null, 2) : "";
  }
  if (!Array.isArray(input?.inspector_notes) || input.inspector_notes.length !== 2) {
    throw new Error(`Expected 2 Inspector notes, received ${input?.inspector_notes?.length ?? 0}.`);
  }
  const notes = input.inspector_notes.map((note) => String(note).trim());
  const answerValues = Object.values(params.answerKey);
  const leakedAnswer = notes.some((note) =>
    answerValues.some((value) => containsExactTerm(note, value))
  );
  if (leakedAnswer) {
    throw new Error("Inspector notes included an answer value; please generate the mystery again.");
  }
  return notes;
}

function containsExactTerm(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\W)${escaped}(?=$|\\W)`, "i").test(text);
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

export function stripCodeFences(value: string): string {
  const trimmed = value.trim();
  let unwrapped = trimmed;
  if (unwrapped.startsWith("```")) {
    // Claude may emit either ```json followed by a newline or put the JSON
    // on the same line as the opening fence.
    unwrapped = unwrapped
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
  }

  const objectStart = unwrapped.indexOf("{");
  const objectEnd = unwrapped.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    return unwrapped.slice(objectStart, objectEnd + 1);
  }
  return unwrapped;
}

export function parseStoryJson(value: string): StoryAiResponse {
  return parseJsonWithRepair<StoryAiResponse>(value);
}

function parseAuthorJson(value: string): AuthorAiResponse {
  return parseJsonWithRepair<AuthorAiResponse>(value);
}

function parseJsonWithRepair<T>(value: string): T {
  try {
    return JSON.parse(value) as T;
  } catch (originalError) {
    const repaired = escapeControlCharactersInsideStrings(value);
    if (repaired === value) throw originalError;

    try {
      return JSON.parse(repaired) as T;
    } catch {
      throw originalError;
    }
  }
}

function escapeControlCharactersInsideStrings(value: string): string {
  let result = "";
  let insideString = false;
  let escaped = false;

  for (const character of value) {
    if (!insideString) {
      result += character;
      if (character === '"') insideString = true;
      continue;
    }

    if (escaped) {
      result += character;
      escaped = false;
      continue;
    }

    if (character === "\\") {
      result += character;
      escaped = true;
    } else if (character === '"') {
      result += character;
      insideString = false;
    } else if (character === "\n") {
      result += "\\n";
    } else if (character === "\r") {
      result += "\\r";
    } else if (character === "\t") {
      result += "\\t";
    } else {
      result += character;
    }
  }

  return result;
}
