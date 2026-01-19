/**
 * Clue DVD Game - AI Scenario Generation
 *
 * Single-call AI prompt that generates narrative + clues + inspector notes
 * from the fixed solution and allowed lists.
 */

import type { CampaignPlan, GeneratedScenario } from "../types/campaign";
import {
  SUSPECTS,
  ITEMS,
  LOCATIONS,
  TIME_PERIODS,
  MYSTERY_THEMES,
} from "../data/game-elements";

const OPENAI_MODEL = "gpt-5-nano-2025-08-07";

type AiScenarioOutput = {
  event: {
    name: string;
    purpose: string;
  };
  intro: string;
  narrative: {
    opening: string;
    setting: string;
    atmosphere: string;
    closing: string;
  };
  solution: {
    suspect: string;
    item: string;
    location: string;
    time: string;
  };
  clues: string[];
  inspectorNotes: string[];
};

type TimelineOutput = {
  event: {
    name: string;
    type: string;
    purpose: string;
  };
  beats: Array<{
    order: number;
    time: string;
    title: string;
    whatHappened: string;
    mainLocations: string[];
  }>;
  suspects: Record<string, Array<{
    beat: number;
    location: string;
    activity: string;
    social: string;
  }>>;
};

type CentralOccasionSpec = {
  event: {
    type: string;
    name: string;
    purpose: string;
    occasionHook: string;
    guestOfHonor: string | null;
  };
};

type ProgramSkeletonOutput = {
  event: CentralOccasionSpec["event"];
  beats: Array<{
    order: number;
    time: string;
    title: string;
    whatHappened: string;
    attentionShift: string;
    mainLocations: string[];
  }>;
};

let lastAiScenarioOutput: AiScenarioOutput | null = null;
let lastAiStage1Raw: string | null = null;
let lastAiStage2Raw: string | null = null;
let lastAiStage3Raw: string | null = null;
let lastAiStage4Raw: string | null = null;
let lastAiStage1Parsed: CentralOccasionSpec | null = null;
let lastAiStage2Parsed: ProgramSkeletonOutput | null = null;
let lastAiStage3Parsed: TimelineOutput | null = null;

function stripJsonFence(text: string): string {
  return text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function extractFirstJson(text: string): string {
  const cleaned = stripJsonFence(text);
  const start = cleaned.indexOf("{");
  if (start === -1) return cleaned;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i += 1) {
    const ch = cleaned[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") depth -= 1;
    if (depth === 0) {
      return cleaned.slice(start, i + 1);
    }
  }
  return cleaned.slice(start);
}

function sanitizeJsonText(text: string): string {
  let result = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        result += ch;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        result += ch;
        continue;
      }
      if (ch === "\"") {
        inString = false;
        result += ch;
        continue;
      }
      if (ch === "\n") {
        result += "\\n";
        continue;
      }
      if (ch === "\r") {
        result += "\\r";
        continue;
      }
      if (ch === "\t") {
        result += "\\t";
        continue;
      }
      result += ch;
      continue;
    }
    if (ch === "\"") {
      inString = true;
    }
    result += ch;
  }
  return result;
}

function parseJsonSafely<T>(text: string): T {
  const raw = extractFirstJson(text);
  try {
    return JSON.parse(raw) as T;
  } catch {
    const sanitized = sanitizeJsonText(raw)
      .replace(/[""]/g, "\"")
      .replace(/[‘']/g, "'")
      .replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(sanitized) as T;
  }
}

function countSentences(text: string): number {
  const matches = text.match(/[.!?]+(?:\s|$)/g);
  if (!matches) return text.trim().length > 0 ? 1 : 0;
  return matches.length;
}

function normalizeForMatch(text: string): string {
  return (text || "")
    .toLowerCase()
    .replace(/['‘]/g, "'")
    .replace(/[""]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function countSentencesLoose(text: string): number {
  const t = (text || "").trim();
  if (!t) return 0;
  const matches = t.match(/[.!?]+/g);
  return matches ? matches.length : 1;
}

function containsTheftLanguage(raw: string): boolean {
  const t = normalizeForMatch(raw);
  const patterns = [
    /\btheft\b/,
    /\bstolen\b/,
    /\bmissing\b/,
    /\btaken\b/,
    /\bvanished\b/,
    /\bdisappeared\b/,
    /\bcrime\b/,
    /\binvestigation\b/,
    /\bculprit\b/,
    /\bguilty\b/,
  ];
  return patterns.some((re) => re.test(t));
}

function containsAlibiOrClearanceLanguage(raw: string): boolean {
  const t = normalizeForMatch(raw);

  const alwaysBad = [
    /\bruled out\b/,
    /\bcouldn't have\b/,
    /\bcould not have\b/,
    /\bnever left\b/,
    /\balibi\b/,
    /\bexonerat(?:ed|e|es|ing)\b/,
  ];
  if (alwaysBad.some((re) => re.test(t))) return true;

  if (/\binnocent\b/.test(t) && !/\binnocent-looking\b/.test(t)) return true;

  const clearedBad = [
    /\bcleared of\b/,
    /\bcleared (him|her|them|you|me)\b/,
    /\bcleared the suspect\b/,
    /\bcleared from suspicion\b/,
  ];
  if (clearedBad.some((re) => re.test(t))) return true;

  return false;
}

function extractStage1Anchors(timeline: any) {
  const beatTitles = new Set<string>();
  const beatTimes = new Set<string>();
  const beatLocations = new Set<string>();

  for (const b of timeline?.beats || []) {
    if (typeof b?.title === "string") beatTitles.add(b.title);
    if (typeof b?.time === "string") beatTimes.add(b.time);
    if (Array.isArray(b?.mainLocations)) {
      for (const loc of b.mainLocations) {
        if (typeof loc === "string") beatLocations.add(loc);
      }
    }
  }
  return { beatTitles, beatTimes, beatLocations };
}

export function validateAiOutput(plan: CampaignPlan, output: AiScenarioOutput, timeline: any): void {
  if (!output.event?.name || !output.event?.purpose) throw new Error("AI output missing event details.");
  if (!output.intro?.trim()) throw new Error("AI output missing intro paragraph.");
  if (!output.narrative?.opening || !output.narrative?.setting || !output.narrative?.atmosphere || !output.narrative?.closing) {
    throw new Error("AI output missing narrative fields.");
  }
  if (!output.solution?.suspect || !output.solution?.item || !output.solution?.location || !output.solution?.time) {
    throw new Error("AI output missing solution echo.");
  }
  if (!Array.isArray(output.clues) || output.clues.length !== plan.clues.length) throw new Error("AI output clue count mismatch.");
  if (!Array.isArray(output.inspectorNotes) || output.inspectorNotes.length !== 2) throw new Error("AI output must contain exactly 2 inspector notes.");

  const stage1EventName = timeline?.event?.name;
  if (stage1EventName && output.event.name != stage1EventName) {
    throw new Error("Stage 2 event.name must match Stage 1 event.name exactly.");
  }

  const suspectName = SUSPECTS.find((s) => s.id === plan.solution.suspectId)?.displayName;
  const locationName = LOCATIONS.find((l) => l.id === plan.solution.locationId)?.name;
  const timeName = TIME_PERIODS.find((t) => t.id === plan.solution.timeId)?.name;
  const item = ITEMS.find((i) => i.id === plan.solution.itemId);

  if (suspectName && output.solution.suspect !== suspectName) throw new Error("Solution suspect echo mismatch.");
  if (locationName && output.solution.location !== locationName) throw new Error("Solution location echo mismatch.");
  if (timeName && output.solution.time !== timeName) throw new Error("Solution time echo mismatch.");
  if (item && output.solution.item !== item.nameUS) throw new Error("Solution item echo mismatch.");

  if (item) {
    const outside = normalizeForMatch(
      [
        output.event.name,
        output.event.purpose,
        output.intro,
        output.narrative.opening,
        output.narrative.setting,
        output.narrative.atmosphere,
        output.narrative.closing,
        ...output.clues,
        ...output.inspectorNotes,
      ].join(" ")
    );
    const needle = normalizeForMatch(item.nameUS);
    if (needle && outside.includes(needle)) throw new Error("Solution item must not appear outside solution.item.");
  }

  const narrativeBlock = [
    output.event.name,
    output.event.purpose,
    output.intro,
    output.narrative.opening,
    output.narrative.setting,
    output.narrative.atmosphere,
    output.narrative.closing,
  ].join(" ");

  if (containsTheftLanguage(narrativeBlock)) throw new Error("Event or narrative contains theft/crime language.");
  if (containsAlibiOrClearanceLanguage(narrativeBlock)) throw new Error("Event or narrative contains alibi/clearance language.");

  const { beatTitles, beatTimes, beatLocations } = extractStage1Anchors(timeline);
  const allowedPrefixes = ['coming...', "'ello...", "good day...", "as I recall..."];

  for (const [index, clue] of output.clues.entries()) {
    if (typeof clue !== "string" || !clue.trim()) throw new Error(`AI output contains invalid clue entry at index ${index}.`);

    if (!allowedPrefixes.some((p) => clue.startsWith(p))) {
      throw new Error(`Clue ${index + 1} must start with a valid prefix (no leading spaces).`);
    }

    const sentences = typeof countSentences === "function" ? countSentences(clue) : countSentencesLoose(clue);
    if (sentences < 1 || sentences > 5) throw new Error(`Clue ${index + 1} must be 1-5 sentences.`);

    if (containsTheftLanguage(clue)) throw new Error(`Clue ${index + 1} contains theft/crime language.`);
    if (containsAlibiOrClearanceLanguage(clue)) throw new Error(`Clue ${index + 1} contains alibi/clearance language.`);

    const lc = normalizeForMatch(clue);
    const hasTime = listHasMatch(beatTimes, lc);
    const hasLoc = listHasMatch(beatLocations, lc);
    const hasBeat = listHasMatch(beatTitles, lc);
    if (!hasTime && !hasLoc && !hasBeat) {
      throw new Error(`Clue ${index + 1} is not grounded to the Stage 1 timeline (no beat/time/location reference).`);
    }
  }

  for (const [i, note] of output.inspectorNotes.entries()) {
    if (!note || !note.trim()) throw new Error("Inspector note text is required.");

    if (containsTheftLanguage(note)) throw new Error(`Inspector note ${i + 1} contains theft/crime language.`);
    if (containsAlibiOrClearanceLanguage(note)) throw new Error("Inspector note contains alibi/clearance language.");

    const ln = normalizeForMatch(note);
    const hasTime = listHasMatch(beatTimes, ln);
    const hasLoc = listHasMatch(beatLocations, ln);
    const hasBeat = listHasMatch(beatTitles, ln);
    if (!hasTime && !hasLoc && !hasBeat) {
      throw new Error(`Inspector note ${i + 1} is not grounded to the Stage 1 timeline (no beat/time/location reference).`);
    }
  }
}

function listHasMatch(setValues: Set<string>, haystackLower: string): boolean {
  for (const val of setValues) {
    if (haystackLower.includes(normalizeForMatch(val))) return true;
  }
  return false;
}
async function callOpenAi(
  apiKey: string,
  prompt: string,
  schema: Record<string, unknown>
): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: prompt,
      max_output_tokens: 8000,
      reasoning: { effort: "low" },
      text: {
        format: {
          type: "json_schema",
          name: schema.name,
          schema: schema.schema,
          strict: true,
        },
        verbosity: "low",
      },
    }),
  });

  const rawBody = await response.text();
  const payload = (rawBody ? JSON.parse(rawBody) : {}) as {
    error?: { message?: string };
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };

  if (!response.ok) {
    const message = payload?.error?.message || rawBody || "OpenAI request failed.";
    throw new Error(message);
  }

  const content = payload?.output?.flatMap((item) => item.content ?? []) ?? [];
  const text = (
    payload?.output_text
    ?? content.find((item) => item.type === "output_text")?.text
    ?? content.find((item) => item.text)?.text
  )?.trim();
  if (!text) {
    throw new Error(
      rawBody
        ? `OpenAI response was empty. Raw payload: ${rawBody}`
        : `OpenAI response was empty. Status: ${response.status}`
    );
  }
  return text;
}

function validateTimelineOutput(plan: CampaignPlan, output: TimelineOutput): void {
  if (!output.event?.name || !output.event?.type || !output.event?.purpose) {
    throw new Error("Timeline output missing event details.");
  }
  if (!Array.isArray(output.beats) || output.beats.length < 5 || output.beats.length > 7) {
    throw new Error("Timeline output must include 5 to 7 beats.");
  }
  if (!output.suspects || typeof output.suspects !== "object") {
    throw new Error("Timeline output missing suspects map.");
  }

  const suspectNames = SUSPECTS.map((s) => s.displayName);
  const locationNames = LOCATIONS.map((l) => l.name);
  const timeNames = TIME_PERIODS.map((t) => t.name);

  const outputSuspects = Object.keys(output.suspects);
  for (const name of outputSuspects) {
    if (!suspectNames.includes(name)) {
      throw new Error(`Timeline output includes unknown suspect "${name}".`);
    }
  }
  for (const name of suspectNames) {
    if (!output.suspects[name]) {
      throw new Error(`Timeline output missing suspect "${name}".`);
    }
  }

  const beatOrders = new Set<number>();
  for (const beat of output.beats) {
    if (typeof beat.order !== "number") {
      throw new Error("Timeline beat missing order number.");
    }
    beatOrders.add(beat.order);
    if (!timeNames.includes(beat.time)) {
      throw new Error(`Timeline beat has invalid time "${beat.time}".`);
    }
    if (!beat.title || !beat.whatHappened) {
      throw new Error("Timeline beat missing title or whatHappened.");
    }
    if (!Array.isArray(beat.mainLocations) || beat.mainLocations.length < 1 || beat.mainLocations.length > 2) {
      throw new Error("Timeline beat must include 1-2 main locations.");
    }
    for (const loc of beat.mainLocations) {
      if (!locationNames.includes(loc)) {
        throw new Error(`Timeline beat uses unknown location "${loc}".`);
      }
    }
  }

  for (const [name, entries] of Object.entries(output.suspects)) {
    if (!Array.isArray(entries) || entries.length !== output.beats.length) {
      throw new Error(`Timeline suspect "${name}" must appear in every beat.`);
    }
    const seenBeats = new Set<number>();
    for (const entry of entries) {
      if (typeof entry.beat !== "number") {
        throw new Error(`Timeline suspect "${name}" has invalid beat reference.`);
      }
      seenBeats.add(entry.beat);
      if (!beatOrders.has(entry.beat)) {
        throw new Error(`Timeline suspect "${name}" references unknown beat ${entry.beat}.`);
      }
      if (!locationNames.includes(entry.location)) {
        throw new Error(`Timeline suspect "${name}" has invalid location "${entry.location}".`);
      }
      if (!entry.activity || !entry.social) {
        throw new Error(`Timeline suspect "${name}" missing activity or social details.`);
      }
    }
    if (seenBeats.size != output.beats.length) {
      throw new Error(`Timeline suspect "${name}" must include one entry per beat.`);
    }
  }
}

function validateCentralOccasionSpec(
  spec: CentralOccasionSpec,
  suspects: { displayName: string }[]
): void {
  const event = spec.event;
  if (!event?.type || !event?.name || !event?.purpose || !event?.occasionHook) {
    throw new Error("Central occasion spec missing event fields.");
  }
  const typeLower = normalizeForMatch(event.type);
  const bannedTypes = ["gathering", "meeting", "evening", "salon", "event"];
  if (bannedTypes.some((term) => typeLower === term)) {
    throw new Error("Central occasion type is too generic.");
  }
  if (/[,&]/.test(event.type) || /\band\b/i.test(event.type)) {
    throw new Error("Central occasion type must be a single noun phrase.");
  }
  const nameLower = normalizeForMatch(event.name);
  const bannedNameTerms = ["mystery", "theft", "crime", "case"];
  if (bannedNameTerms.some((term) => nameLower.includes(term))) {
    throw new Error("Central occasion name includes a banned term.");
  }
  if (!normalizeForMatch(event.purpose).includes("mr. boddy")) {
    throw new Error("Central occasion purpose must mention Mr. Boddy as host.");
  }
  if (event.guestOfHonor !== null) {
    const suspectNames = suspects.map((s) => s.displayName);
    if (!suspectNames.includes(event.guestOfHonor)) {
      throw new Error("Central occasion guestOfHonor must be a suspect or null.");
    }
    if (!normalizeForMatch(event.purpose).includes(normalizeForMatch(event.guestOfHonor))) {
      throw new Error("Central occasion purpose must mention the guest of honor.");
    }
  }
}

function validateProgramSkeletonOutput(
  program: ProgramSkeletonOutput,
  eventSpec: CentralOccasionSpec,
  locations: { name: string }[],
  times: { name: string }[],
  solution: { timeName: string; locationName: string }
): void {
  const event = program.event;
  const base = eventSpec.event;
  if (
    event.name !== base.name ||
    event.type !== base.type ||
    event.purpose !== base.purpose ||
    event.occasionHook !== base.occasionHook ||
    event.guestOfHonor !== base.guestOfHonor
  ) {
    throw new Error("Program skeleton event fields must match Step 1 exactly.");
  }
  if (!Array.isArray(program.beats) || program.beats.length < 5 || program.beats.length > 7) {
    throw new Error("Program skeleton must include 5 to 7 beats.");
  }
  const locationNames = locations.map((l) => l.name);
  const timeNames = times.map((t) => t.name);
  const orders = new Set<number>();
  for (const beat of program.beats) {
    if (typeof beat.order !== "number") {
      throw new Error("Program beat missing order.");
    }
    if (orders.has(beat.order)) {
      throw new Error("Program beat order must be unique.");
    }
    orders.add(beat.order);
    if (!timeNames.includes(beat.time)) {
      throw new Error(`Program beat has invalid time "${beat.time}".`);
    }
    if (!beat.title || !beat.whatHappened) {
      throw new Error("Program beat missing title or whatHappened.");
    }
    if (!beat.attentionShift) {
      throw new Error("Program beat missing attentionShift.");
    }
    if (!Array.isArray(beat.mainLocations) || beat.mainLocations.length < 1 || beat.mainLocations.length > 2) {
      throw new Error("Program beat must include 1-2 main locations.");
    }
    for (const loc of beat.mainLocations) {
      if (!locationNames.includes(loc)) {
        throw new Error(`Program beat uses invalid location "${loc}".`);
      }
    }
    if (containsTheftLanguage(`${beat.title} ${beat.whatHappened} ${beat.attentionShift}`)) {
      throw new Error("Program beats must not include theft/crime language.");
    }
  }
  const hasSolutionTime = program.beats.some((beat) => beat.time === solution.timeName);
  const hasSolutionLoc = program.beats.some((beat) => beat.mainLocations.includes(solution.locationName));
  if (!hasSolutionTime) {
    throw new Error("Program skeleton must include the solution time.");
  }
  if (!hasSolutionLoc) {
    throw new Error("Program skeleton must include the solution location.");
  }
}


export async function generateAiScenarioText(
  apiKey: string,
  plan: CampaignPlan
): Promise<AiScenarioOutput> {
  const theme = MYSTERY_THEMES.find((t) => t.id === plan.themeId);
  const suspect = SUSPECTS.find((s) => s.id === plan.solution.suspectId);
  const item = ITEMS.find((i) => i.id === plan.solution.itemId);
  const location = LOCATIONS.find((l) => l.id === plan.solution.locationId);
  const time = TIME_PERIODS.find((t) => t.id === plan.solution.timeId);
  if (!theme || !suspect || !item || !location || !time) {
    throw new Error("Invalid plan data for AI generation.");
  }

  const suspectEntriesSchema = {
    type: "array",
    minItems: 5,
    maxItems: 7,
    items: {
      type: "object",
      additionalProperties: false,
      required: ["beat", "location", "activity", "social"],
      properties: {
        beat: { type: "number" },
        location: { type: "string", enum: LOCATIONS.map((l) => l.name) },
        activity: { type: "string" },
        social: { type: "string" },
      },
    },
  };

  const timelineSchema = {
    name: "ClueTimeline",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["event", "beats", "suspects"],
      properties: {
        event: {
          type: "object",
          additionalProperties: false,
          required: ["name", "type", "purpose"],
          properties: {
            name: { type: "string" },
            type: { type: "string" },
            purpose: { type: "string" },
          },
        },
        beats: {
          type: "array",
          minItems: 5,
          maxItems: 7,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["order", "time", "title", "whatHappened", "mainLocations"],
            properties: {
              order: { type: "number" },
              time: { type: "string", enum: TIME_PERIODS.map((t) => t.name) },
              title: { type: "string" },
              whatHappened: { type: "string" },
              mainLocations: {
                type: "array",
                minItems: 1,
                maxItems: 2,
                items: { type: "string", enum: LOCATIONS.map((l) => l.name) },
              },
            },
          },
        },
        suspects: {
          type: "object",
          additionalProperties: false,
          required: SUSPECTS.map((s) => s.displayName),
          properties: Object.fromEntries(
            SUSPECTS.map((s) => [s.displayName, suspectEntriesSchema])
          ),
        },
      },
    },
  };

  const scenarioSchema = {
    name: "ClueScenario",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["event", "intro", "narrative", "solution", "clues", "inspectorNotes"],
      properties: {
        event: {
          type: "object",
          additionalProperties: false,
          required: ["name", "purpose"],
          properties: {
            name: { type: "string" },
            purpose: { type: "string" },
          },
        },
        intro: { type: "string" },
        narrative: {
          type: "object",
          additionalProperties: false,
          required: ["opening", "setting", "atmosphere", "closing"],
          properties: {
            opening: { type: "string" },
            setting: { type: "string" },
            atmosphere: { type: "string" },
            closing: { type: "string" },
          },
        },
        solution: {
          type: "object",
          additionalProperties: false,
          required: ["suspect", "item", "location", "time"],
          properties: {
            suspect: { type: "string", enum: [suspect.displayName] },
            item: { type: "string", enum: [item.nameUS] },
            location: { type: "string", enum: [location.name] },
            time: { type: "string", enum: [time.name] },
          },
        },
        clues: {
          type: "array",
          minItems: plan.clues.length,
          maxItems: plan.clues.length,
          items: { type: "string" },
        },
        inspectorNotes: {
          type: "array",
          minItems: 2,
          maxItems: 2,
          items: { type: "string" },
        },
      },
    },
  };

  const centralOccasionSchema = {
    name: "ClueCentralOccasion",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["event"],
      properties: {
        event: {
          type: "object",
          additionalProperties: false,
          required: ["type", "name", "purpose", "occasionHook", "guestOfHonor"],
          properties: {
            type: { type: "string" },
            name: { type: "string" },
            purpose: { type: "string" },
            occasionHook: { type: "string" },
            guestOfHonor: { anyOf: [{ type: "string" }, { type: "null" }] },
          },
        },
      },
    },
  };

  const programSkeletonSchema = {
    name: "ClueProgramSkeleton",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["event", "beats"],
      properties: {
        event: {
          type: "object",
          additionalProperties: false,
          required: ["type", "name", "purpose", "occasionHook", "guestOfHonor"],
          properties: {
            type: { type: "string" },
            name: { type: "string" },
            purpose: { type: "string" },
            occasionHook: { type: "string" },
            guestOfHonor: { anyOf: [{ type: "string" }, { type: "null" }] },
          },
        },
        beats: {
          type: "array",
          minItems: 5,
          maxItems: 7,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["order", "time", "title", "whatHappened", "attentionShift", "mainLocations"],
            properties: {
              order: { type: "number" },
              time: { type: "string", enum: TIME_PERIODS.map((t) => t.name) },
              title: { type: "string" },
              whatHappened: { type: "string" },
              attentionShift: { type: "string" },
              mainLocations: {
                type: "array",
                minItems: 1,
                maxItems: 2,
                items: { type: "string", enum: LOCATIONS.map((l) => l.name) },
              },
            },
          },
        },
      },
    },
  };

  const suspectsList = SUSPECTS.map((s) => s.displayName).join(", ");
  const itemsList = ITEMS.map((i) => i.nameUS).join(", ");
  const locationsList = LOCATIONS.map((l) => l.name).join(", ");
  const timesList = TIME_PERIODS.map((t) => t.name).join(", ");

  const promptStage1 = `You are generating Step 1: the CENTRAL OCCASION & THEME SPEC for a Clue-style deduction scenario.

Your ONLY job is to define the single real-world social occasion that explains:
- why everyone is present
- what kind of event this is
- what makes THIS instance special or timely

Do NOT write any schedule, beats, movements, rooms, or times.
Do NOT mention any crime, theft, disappearance, or item.

OUTPUT JSON ONLY:

{
  "event": {
    "type": string,
    "name": string,
    "purpose": string,
    "occasionHook": string,
    "guestOfHonor": string | null
  }
}

QUALITY RULES (CRITICAL):

- event.type must be:
  - a specific kind of real-world social or cultural event
  - not a vague term like "gathering", "meeting", "evening", "salon", or "event"
  - something that implies a planned program

- event.name must be:
  - a proper, plausible title for this specific occasion
  - not generic ("AI Mystery Night", "The Big Event", etc.)
  - must NOT include: "AI", "Mystery", "Theft", "Crime", "Case"
- event.type and event.name must NOT use "Garden Party" or any "garden party" phrasing.
- Do NOT use the word "candlelit" anywhere in event fields.

- event.purpose must:
  - clearly explain why this event is being held at all
  - mention Mr. Boddy as the host

- occasionHook must:
  - explain what makes THIS particular instance special, urgent, or notable
  - mention Mr. Boddy as the host

- guestOfHonor must be null OR one of the provided SUSPECT names.

EVENT TYPE IDEAS (EXAMPLES ONLY):
Birthday Banquet, Anniversary Dinner, Holiday Party, Sports & Games Social,
Hosted Dinner, Charity Fundraiser, Exhibition Opening, Auction Preview, Concert / Recital,
Promotion Celebration, Movie Deal Party, Book Deal Party, Memorial Gathering, Dedication Ceremony,
Murder-Mystery Dinner Party

THEME:
- Name: ${theme.name}
- Period: ${theme.period}
- Atmosphere: ${theme.atmosphericElements.join(", ")}

SUSPECTS: ${suspectsList}

Return ONLY the JSON.`;

  const eventSpecText = await callOpenAi(apiKey, promptStage1, centralOccasionSchema);
  lastAiStage1Raw = eventSpecText;
  const eventSpec = parseJsonSafely<CentralOccasionSpec>(eventSpecText);
  lastAiStage1Parsed = eventSpec;

  const promptStage2 = `You are generating Step 2: the PROGRAM SKELETON for a Clue-style deduction scenario.

You are given a locked EVENT SPEC from Step 1 and the game's allowed TIMES and LOCATIONS.
Your job is to outline the program as 5-7 scheduled beats.

Do NOT write clues.
Do NOT assign per-suspect alibis.
Do NOT mention any crime, theft, disappearance, or item.

OUTPUT JSON ONLY:

{
  "event": {
    "type": string,
    "name": string,
    "purpose": string,
    "occasionHook": string,
    "guestOfHonor": string | null
  },
  "beats": [
    {
      "order": number,
      "time": string,
      "title": string,
      "whatHappened": string,
      "attentionShift": string,
      "mainLocations": [string, string]
    }
  ]
}

CRITICAL RULES:
- You MUST copy the Step 1 event fields EXACTLY into "event". No edits.
- Use 5-7 beats total.
- Each beat MUST:
  - use EXACTLY ONE of the provided TIMES
  - use 1-2 of the provided LOCATIONS
  - describe a scheduled segment that fits the event (arrival, remarks, viewing, game, dinner, intermission, closing, etc.)
  - include a concrete "attentionShift" (announcement, setup change, spill, delay, split activity, performance start/end, etc.)

- At least ONE beat MUST be an ordinary disruption or split that divides attention.
- The solution TIME and LOCATION must appear somewhere in the beats as normal segments.
- Do NOT highlight the solution time/location.
- Do NOT use meta/puzzle language (no "clue-based", "mystery", "game about clues", "AI", "case", "investigation").
- Avoid repeating the same pair of rooms in consecutive beats.
- Do NOT use "garden party" language or "candlelit" wording anywhere.
- Do NOT mention generic "staff" or "attendees"; if needed, use Mr. Boddy, Mrs. White, or Rusty by name.

TIME ORDER (IMPORTANT):
- Treat the TIMES list below as the program order for this event.
- Beats MUST follow this order as listed (first beat uses the first time, next beat uses a later time in the list).
- Do not assume the labels are literal clocks; they are program slots.
- Do NOT describe the event as "evening" unless the TIMES list includes evening-style labels.
- Match activity language to the TIMES list (if Dawn/Breakfast/Late Morning, use morning-appropriate segments).
- Avoid night-only language ("night", "soiree", "candlelit") unless TIMES include evening labels.

SECRECY:
- Do NOT mention the solution item text.
- Do NOT mention theft/missing/crime/investigation.

STEP_1_EVENT:
${JSON.stringify(eventSpec)}

THEME:
- Name: ${theme.name}
- Period: ${theme.period}
- Atmosphere: ${theme.atmosphericElements.join(", ")}

SOLUTION (DO NOT MENTION IN OUTPUT):
- Suspect: ${suspect.displayName}
- Item: ${item.nameUS}
- Location: ${location.name}
- Time: ${time.name}

LOCATIONS: ${locationsList}
TIMES: ${timesList}
TIME_ORDER: ${timesList}

Return ONLY the JSON.`;

  const programText = await callOpenAi(apiKey, promptStage2, programSkeletonSchema);
  lastAiStage2Raw = programText;
  const program = parseJsonSafely<ProgramSkeletonOutput>(programText);
  lastAiStage2Parsed = program;

  const promptStage3 = `You are generating Step 3: the HIDDEN GROUND-TRUTH TIMELINE (strict structure).

You are given the Step 2 PROGRAM SKELETON. Convert it into a strict beat timeline and assign every suspect
to a location, activity, and social context at EACH beat.

Do NOT write story prose or clues.
Do NOT mention any crime, theft, disappearance, or item.

OUTPUT JSON ONLY in EXACT structure:

{
  "event": {
    "name": string,
    "type": string,
    "purpose": string
  },
  "beats": [
    {
      "order": number,
      "time": string,
      "title": string,
      "whatHappened": string,
      "mainLocations": [ string, string ]
    }
  ],
  "suspects": {
    "SUSPECT NAME": [
      {
        "beat": number,
        "location": string,
        "activity": string,
        "social": string
      }
    ]
  }
}

HARD RULES:
- Use ONLY the provided SUSPECT, LOCATION, and TIME names.
- Beats must be 5-7 total and match the Step 2 order and times.
- Every suspect MUST appear in EVERY beat (one entry per beat).
- Event fields must align with Step 2 (no drift).
- Movements must be motivated by whatHappened or social.
- The solution time/location must be a normal part of the schedule (not highlighted).

STAGE 3 ASYMMETRY (CRITICAL):
- For each beat, at least 3 suspects must be in a different location than the main location (small splits).
- Each suspect’s activity must be unique per beat (no copy-paste activities).
- Social field must change across beats: mention a different person OR a different reason than the previous beat.
- At least 3 suspects must be placed in the secondary location each beat.
- Each suspect's location MUST be one of the beat's mainLocations.
- Treat mainLocations[0] as the primary location and mainLocations[1] as the secondary location.

ACTIVITY ANCHOR:
- Activities must explicitly reference the beat title or segment (e.g., "remarks" -> "deliver remarks", "stroll" -> "guide stroll").

SOCIAL SPECIFICITY:
- Social must be one of:
  "with <Suspect Name>", "alone", "tasked: <short reason>", "delayed: <short reason>".
- "with <Suspect Name>" must name a different suspect than the current one.
- Do NOT use the suspect's own name in "tasked:" or "delayed:"; use a real reason instead.
- Do NOT use "other guests", "attendees", or "staff" unless it is Mrs. White or Rusty by name.

STEP_2_PROGRAM_JSON:
${JSON.stringify(program)}

SOLUTION (DO NOT MENTION IN OUTPUT):
- Suspect: ${suspect.displayName}
- Item: ${item.nameUS}
- Location: ${location.name}
- Time: ${time.name}

SUSPECTS: ${suspectsList}
LOCATIONS: ${locationsList}
TIMES: ${timesList}

Return ONLY the JSON.`;

  const timelineText = await callOpenAi(apiKey, promptStage3, timelineSchema);
  lastAiStage3Raw = timelineText;
  const timeline = parseJsonSafely<TimelineOutput>(timelineText);
  lastAiStage3Parsed = timeline;

  const promptStage4 = `You are given a hidden ground-truth event timeline JSON (from Stage 3).

Your job is to transform it into:
- A Clue-style narrative wrapper
- 7 indirect, messy, human clues
- 2 precise inspector notes
- And an embedded solution object for the game engine

These clues must require cross-referencing to solve. No single clue should be clean, obvious, or sufficient.

You MUST follow ALL rules.

────────────────────────────────────────
INPUTS YOU RECEIVE

1) TIMELINE_JSON:
${JSON.stringify(timeline)}

2) THEME:
- Name: ${theme.name}
- Period: ${theme.period}
- Atmosphere: ${theme.atmosphericElements.join(", ")}

3) SOLUTION (CONFIDENTIAL — DO NOT REVEAL IN STORY/CLUES/NOTES):
- Suspect: ${suspect.displayName}
- Item: ${item.nameUS}
- Location: ${location.name}
- Time: ${time.name}

4) SUSPECTS: ${suspectsList}
5) ITEMS: ${itemsList}
6) LOCATIONS: ${locationsList}
7) TIMES: ${timesList}

────────────────────────────────────────
OUTPUT FORMAT (JSON ONLY)

Return exactly:

{
  "event": { "name": string, "purpose": string },
  "intro": string,
  "narrative": {
    "opening": string,
    "setting": string,
    "atmosphere": string,
    "closing": string
  },
  "solution": {
    "suspect": string,
    "item": string,
    "location": string,
    "time": string
  },
  "clues": [ string, string, string, string, string, string, string ],
  "inspectorNotes": [ string, string ]
}

No extra fields. No markdown. Output ONLY the JSON.

────────────────────────────────────────
GROUNDING & CONSISTENCY (HARD)

- output.event.name MUST equal TIMELINE_JSON.event.name exactly.
- output.event.purpose MUST closely match TIMELINE_JSON.event.purpose.

- Use ONLY provided names:
  - Suspects from SUSPECTS
  - Locations from LOCATIONS
  - Times from TIMES
  - You MAY reference Stage 3 beat titles but MUST NOT invent new ones.

- Do NOT invent:
  - people
  - rooms/areas
  - time labels

- TIMELINE_JSON is the hidden truth:
  - Movements and groupings must remain consistent with it.
  - You may blur or compress sequencing, but must NOT contradict:
    - who was where in a beat
    - which rooms/times exist

────────────────────────────────────────
ABSOLUTE SECRECY (HARD)

- The solution item name MUST appear ONLY in solution.item.
- It MUST NOT appear in:
  - event, intro, narrative, clues, or inspectorNotes.
- Do NOT name the solution item’s category or type anywhere else.
- Do NOT use generic item-type words that could reveal the solution item (e.g., pin, hairpin, pen, knife, book, medal, coin, key, letter, paperweight, etc.).

- The story, clues, and notes must NEVER:
  - mention theft, disappearance, or a crime
  - mention investigation, guilt, or blame
  - say something is missing or gone
  - use the word "candlelit"
  - use "garden party" phrasing
  - use "soiree" or "night" language if the TIMES list is morning/day slots

- The “problem” may ONLY be implied by:
  - confusion
  - disruption
  - something feeling out of place
  - a physical space or surface not looking right

────────────────────────────────────────
VALIDATOR-SAFE LANGUAGE (HARD BAN)

Do NOT use these words anywhere in intro, narrative, clues, or inspectorNotes:
- innocent
- ruled out
- couldn't have / could not have
- never left
- alibi
- cleared (in a personal sense)
- exonerated
- candlelit
- garden party
 - soiree

Use uncertain memory language instead (seemed like / felt like / maybe / I’m not sure / I can’t swear to it).

────────────────────────────────────────
NARRATIVE WRAPPER

- The narrative is about the event, not a crime.
- It must establish the central occasion and reference multiple program segments.
- End with a sense that something felt “off” without naming what.
- Match descriptive language to the TIMES list (avoid evening/night phrasing for morning/day slots).

────────────────────────────────────────
MOTIFS

- Reuse several vague motifs seeded in Stage 3 (books, jewelry, tools, art, etc.).
- Spread them across different suspects.
- Never imply any one matters.
- Never imply any specific object is important.

────────────────────────────────────────
CLUES — CORE PHILOSOPHY

Clues are human recollections of ordinary logistics that accidentally define constraints.

They:
- Describe schedules, movement, supervision, access, interruptions, setup/cleanup, crowd flow, room usage.
- Do NOT describe the object, the act, or the mystery.
- Do NOT explain their own meaning.

They must read like:
“Someone explaining their day,” not “someone explaining a puzzle.”

Each clue should primarily constrain ONE of:
- time
- place
- people
- access

The solution must only emerge by combining multiple clues.

────────────────────────────────────────
CLUE FORMAT (HARD)

- Each clue MUST start with EXACTLY one of:
  "coming..."
  "'ello..."
  "good day..."
  "as I recall..."

- Each clue is 2–5 sentences.

────────────────────────────────────────
CLUE CONTENT RULES

- Clues may be:
  - personal, narrative recollections
  - or impersonal, record-like observations
- Both must remain indirect and non-interpretive.

- Include:
  - mundane details
  - small frustrations
  - interruptions
  - uncertainty
  - irrelevant bits

- No clue should:
  - point at the solution
  - sound like a hint
  - explain its relevance

- Each clue must focus on a DIFFERENT aspect of event logistics:
  (setup, movement, supervision, cleanup, scheduling, delay, transition, regrouping, etc.)

────────────────────────────────────────
SUSPECT DISTRIBUTION

- Exactly 2 clues mention NO suspect.
- The other 5 clues each mention EXACTLY ONE suspect (from SUSPECTS).
- Do NOT list multiple suspects in one clue.
- Do NOT use generic "staff" unless it is Mrs. White or Rusty by name.

────────────────────────────────────────
PHYSICALITY REQUIREMENT

- At least 5 of 7 clues MUST involve:
  - a physical surface/display/table/stand/shelf/case/furniture interaction.
- Do NOT imply something is missing.
- Only imply something was disturbed or not as expected.

────────────────────────────────────────
INSPECTOR NOTES

Inspector Notes are cold, factual records of physical state.

They:
- Are not narrative
- Are not interpretive
- Are not atmospheric

CORE RULES:
- Exactly 2 notes.
- Each note:
  - 1–3 sentences
  - Names EXACTLY ONE location (from LOCATIONS)
  - References EXACTLY ONE time (from TIMES) OR one Stage 3 beat title
  - Describes EXACTLY ONE physical state or condition

- Examples of allowed physical states:
  - surface disturbed
  - container open/closed
  - display reset/not reset
  - area cleared/occupied
  - group of objects rearranged
  - something cleaned or left in place
  - something locked/unlocked
  - something powered on/off
  - something aligned/misaligned

- Each note should constrain WHEN or WHERE or WHAT TYPE of place/surface.
- It must not explain which one it constrains.

- Must NOT:
  - mention the solution item
  - mention theft or absence
  - mention guilt, suspicion, cause, or interpretation
  - be story-like

Tone: logbook / venue report / checklist style.

────────────────────────────────────────
FINAL CHECK

- No invented names, rooms, or time labels.
- output.event.name matches Stage 3 exactly.
- Solution item appears ONLY in solution.item.
- JSON schema matches exactly.

Return ONLY the JSON.`;

  const text = await callOpenAi(apiKey, promptStage4, scenarioSchema);
  lastAiStage4Raw = text;
  const parsed = parseJsonSafely<AiScenarioOutput>(text);
  lastAiScenarioOutput = parsed;
  return parsed;
}
export function getLastAiScenarioOutput(): AiScenarioOutput | null {
  return lastAiScenarioOutput;
}

export function getLastAiStageOutputs() {
  return {
    stage1: { raw: lastAiStage1Raw, parsed: lastAiStage1Parsed },
    stage2: { raw: lastAiStage2Raw, parsed: lastAiStage2Parsed },
    stage3: { raw: lastAiStage3Raw, parsed: lastAiStage3Parsed },
    stage4: { raw: lastAiStage4Raw, parsed: lastAiScenarioOutput },
  };
}

export function applyAiScenarioText(
  base: GeneratedScenario,
  aiText: AiScenarioOutput
): GeneratedScenario {
  const clues = base.clues.map((clue, index) => ({
    ...clue,
    text: aiText.clues[index] ?? clue.text,
  }));

  const inspectorNotes = base.inspectorNotes.map((note, index) => ({
    ...note,
    text: aiText.inspectorNotes[index] ?? note.text,
  }));

  return {
    ...base,
    clues,
    inspectorNotes,
    narrative: {
      ...base.narrative,
      opening: `${aiText.intro.trim()}\n\n${aiText.narrative.opening}`,
      setting: aiText.narrative.setting,
      atmosphere: aiText.narrative.atmosphere,
      closing: aiText.narrative.closing,
    },
  };
}
