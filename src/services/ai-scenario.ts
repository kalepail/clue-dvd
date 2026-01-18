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

let lastAiScenarioOutput: AiScenarioOutput | null = null;

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
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, "\"")
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

function extractStage1Anchors(timeline: TimelineOutput) {
  const beatTitles = new Set<string>();
  const beatTimes = new Set<string>();
  const beatLocations = new Set<string>();

  for (const beat of timeline?.beats || []) {
    if (typeof beat?.title === "string") beatTitles.add(beat.title);
    if (typeof beat?.time === "string") beatTimes.add(beat.time);
    if (Array.isArray(beat?.mainLocations)) {
      for (const loc of beat.mainLocations) {
        if (typeof loc === "string") beatLocations.add(loc);
      }
    }
  }
  return { beatTitles, beatTimes, beatLocations };
}

function validateAiOutput(plan: CampaignPlan, output: AiScenarioOutput, timeline: TimelineOutput): void {
  if (!output.event?.name || !output.event?.purpose) throw new Error("AI output missing event details.");
  if (!output.intro?.trim()) throw new Error("AI output missing intro paragraph.");
  if (!output.narrative?.opening || !output.narrative?.setting || !output.narrative?.atmosphere || !output.narrative?.closing) {
    throw new Error("AI output missing narrative fields.");
  }
  if (!output.solution?.suspect || !output.solution?.item || !output.solution?.location || !output.solution?.time) {
    throw new Error("AI output missing solution echo.");
  }
  if (!Array.isArray(output.clues) || output.clues.length !== plan.clues.length) {
    throw new Error("AI output clue count mismatch.");
  }
  if (!Array.isArray(output.inspectorNotes) || output.inspectorNotes.length !== 2) {
    throw new Error("AI output must contain exactly 2 inspector notes.");
  }

  const stage1EventName = timeline?.event?.name;
  if (stage1EventName && output.event.name !== stage1EventName) {
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
  const allowedPrefixes = ["coming...", "'ello...", "good day...", "as I recall..."];

  for (const [index, clue] of output.clues.entries()) {
    if (typeof clue !== "string" || !clue.trim()) throw new Error(`AI output contains invalid clue entry at index ${index}.`);

    if (!allowedPrefixes.some((prefix) => clue.startsWith(prefix))) {
      throw new Error(`Clue ${index + 1} must start with a valid prefix (no leading spaces).`);
    }

    const sentences = typeof countSentences === "function" ? countSentences(clue) : countSentencesLoose(clue);
    if (sentences < 1 || sentences > 5) throw new Error(`Clue ${index + 1} must be 1-5 sentences.`);

    if (containsTheftLanguage(clue)) throw new Error(`Clue ${index + 1} contains theft/crime language.`);
    if (containsAlibiOrClearanceLanguage(clue)) throw new Error(`Clue ${index + 1} contains alibi/clearance language.`);

    const lc = normalizeForMatch(clue);
    const hasTime = Array.from(beatTimes).some((time) => lc.includes(normalizeForMatch(time)));
    const hasLoc = Array.from(beatLocations).some((loc) => lc.includes(normalizeForMatch(loc)));
    const hasBeat = Array.from(beatTitles).some((title) => lc.includes(normalizeForMatch(title)));
    if (!hasTime && !hasLoc && !hasBeat) {
      throw new Error(`Clue ${index + 1} is not grounded to the Stage 1 timeline (no beat/time/location reference).`);
    }
  }

  for (const [index, note] of output.inspectorNotes.entries()) {
    if (!note || !note.trim()) throw new Error("Inspector note text is required.");

    if (containsTheftLanguage(note)) throw new Error(`Inspector note ${index + 1} contains theft/crime language.`);
    if (containsAlibiOrClearanceLanguage(note)) throw new Error("Inspector note contains alibi/clearance language.");

    const ln = normalizeForMatch(note);
    const hasTime = Array.from(beatTimes).some((time) => ln.includes(normalizeForMatch(time)));
    const hasLoc = Array.from(beatLocations).some((loc) => ln.includes(normalizeForMatch(loc)));
    const hasBeat = Array.from(beatTitles).some((title) => ln.includes(normalizeForMatch(title)));
    if (!hasTime && !hasLoc && !hasBeat) {
      throw new Error(`Inspector note ${index + 1} is not grounded to the Stage 1 timeline (no beat/time/location reference).`);
    }
  }
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

  const suspectsList = SUSPECTS.map((s) => s.displayName).join(", ");
  const itemsList = ITEMS.map((i) => i.nameUS).join(", ");
  const locationsList = LOCATIONS.map((l) => l.name).join(", ");
  const timesList = TIME_PERIODS.map((t) => t.name).join(", ");

  const promptStage1 = `You are an EVENT SCHEDULER and CAUSAL PLANNER.

You are generating the hidden ground-truth timeline for a Clue-style mystery.

This timeline will be used by another system to generate clues.

Your job is NOT to write prose or clues.
Your job IS to produce a coherent, causal schedule of:
- what the event is
- what the scheduled program segments are
- where everyone is during each segment
- why people move, gather, split, or get delayed

The solution is already decided (see inputs).

You MUST design the event flow AROUND the solution time and place so that:
- It feels natural
- It creates distraction, transition, or divided attention at that moment
- But you MUST NOT mention the item, theft, disappearance, or crime in any way.

────────────────────────────────────────
OUTPUT FORMAT (JSON ONLY -- NO MARKDOWN, NO COMMENTS, NO EXTRA TEXT)

Return EXACTLY this structure:

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

Do not add fields. Do not omit fields.

────────────────────────────────────────
ABSOLUTE CONSTRAINTS

- Use ONLY the provided:
  - suspect names
  - location names
  - time names

- Do NOT invent:
  - new people
  - unnamed guests
  - unnamed staff
  - new rooms or areas
  - new times

- If staff are referenced, they MUST be Mrs. White and/or Rusty and treated as normal suspects.

- Every suspect MUST appear in EVERY beat.

- Do NOT mention:
  - the item
  - a theft
  - a disappearance
  - a crime
  - an investigation

────────────────────────────────────────
STRUCTURE RULES

- Use 5 to 7 beats total (do not exceed 7).
- Each beat MUST:
  - Use exactly one of the provided TIMES
  - Use 1-2 of the provided LOCATIONS

- The event MUST be a specific real-world gathering.

Examples include (but are not limited to):
- a birthday or anniversary celebration
- a holiday gathering or New Year's party
- a garden party or outdoor social
- a sports-and-games social afternoon
- a hosted dinner or formal banquet
- a murder-mystery dinner party
- a charity event or fundraiser
- an exhibition opening or gallery showing
- a concert, recital, or performance evening
- an auction preview or society showing
- a promotion, award, or business deal celebration
- a movie deal announcement or book deal party
- a memorial, dedication, or commemorative event

- The event MUST:
  - Have a host or a guest of honor or a clear reason for being held
  - Have a clear purpose
  - Have a planned program or schedule

- The program MUST include:
  - A beginning (arrival / welcome)
  - A middle (one or more activities)
  - An end (closing, departure, or final gathering)

────────────────────────────────────────
CENTRAL OCCASION RULE

The entire timeline MUST revolve around ONE clear central occasion.

This occasion MUST:
- Be the reason everyone is present
- Be the reason the schedule exists
- Be the narrative "glue" that explains the whole event

The "event" object MUST clearly state:
- What the occasion is
- Who is hosting or being honored (if applicable)
- Why this gathering is happening now

Every beat should feel like a natural, planned part of THIS occasion's program.

This event should be coherent enough that, after the mystery is solved, someone could give a full monologue recounting the entire evening in order.

────────────────────────────────────────
CAUSALITY RULES (CRITICAL)

The beats are PROGRAM SEGMENTS of the event.

They MUST form a cause -> effect chain.

Each beat must naturally lead to the next, for example:
- A toast causes people to gather
- A performance causes people to move
- An announcement causes people to split up
- A disturbance, delay, or interruption causes confusion or rerouting

NO RANDOM MOVEMENT.

A suspect may only change rooms if:
- The beat's "whatHappened" explains why, OR
- Their "social" field explains why.

"whatHappened" MUST explain:
- What part of the event program is happening
- What changed from the previous segment
- Why people moved, regrouped, or were distracted

────────────────────────────────────────
DISTURBANCE & AMBIGUITY RULE

At least one beat SHOULD include:
- A minor disturbance, delay, interruption, lull, late arrival, or distraction
- Something that divides attention or creates a time window
- Something ordinary and non-suspicious

Examples:
- Something is knocked over
- A disagreement draws attention
- An unscheduled pause occurs
- The group splits into separate activities
- Part of the group is briefly occupied elsewhere

This must remain vague and ordinary.
Do NOT mention any crime, item, or wrongdoing.

────────────────────────────────────────
MOTIF & CONVERSATION SEEDING RULE

Across the entire event, you SHOULD naturally include several vague conversational or thematic motifs, such as:
- books, history, research, or documents
- jewelry, fashion, or accessories
- tools, weapons, or sporting topics
- art, artifacts, or collectibles
- personal items, gifts, or curiosities

These should appear as:
- casual conversations
- passing remarks
- background chatter
- social interactions

Rules:
- Do NOT mention any specific item from the solution.
- Do NOT imply that anything is missing.
- Do NOT make any one motif feel uniquely important.
- Do NOT attach these motifs only to the solution suspect.
- At least THREE different motifs must appear across the event.

These exist only to be harvested later by the clue generator.

────────────────────────────────────────
SUSPECT TRACKING RULES

For EACH suspect at EACH beat, you MUST include:
- location
- activity
- social (who they are with OR why they are there)

- Movements must make physical sense.
- No teleporting.
- No being in two places at once.
- If someone stays in place, explain why.

────────────────────────────────────────
SOLUTION INTEGRATION (SECRET DESIGN CONSTRAINT)

You MUST design the event so that:

- The solution TIME and LOCATION are:
  - A normal, scheduled part of the event
  - A moment of distraction, transition, or divided attention
  - Not highlighted or treated as special in the narrative

- The solution must feel:
  - Plausible
  - Naturally embedded
  - Only obvious in hindsight

You may include vague phrasing like:
- "sometime around this point"
- "during the confusion"
- "while attention was elsewhere"

But NEVER mention a crime or missing item.

────────────────────────────────────────
INPUTS

THEME:
- Name: ${theme.name}
- Period: ${theme.period}
- Atmosphere: ${theme.atmosphericElements.join(", ")}

SOLUTION (DO NOT MENTION IN OUTPUT):
- Suspect: ${suspect.displayName}
- Item: ${item.nameUS}
- Location: ${location.name}
- Time: ${time.name}

SUSPECTS: ${suspectsList}
LOCATIONS: ${locationsList}
TIMES: ${timesList}

────────────────────────────────────────
FINAL VALIDATION CHECKLIST

- Every suspect appears in every beat
- Every beat has a cause and an effect
- All movement is motivated
- The event makes sense as a real scheduled gathering
- The entire timeline is unified by one central occasion
- The solution is naturally embedded as a plausible opportunity
- The motifs are present but not suspicious
- Output is valid JSON and matches the schema EXACTLY

Return ONLY the JSON.`;

  const timelineText = await callOpenAi(apiKey, promptStage1, timelineSchema);
  const timeline = parseJsonSafely<TimelineOutput>(timelineText);
  validateTimelineOutput(plan, timeline);

  const promptStage2 = `You are given a hidden ground-truth event timeline JSON (from Stage 1).

Your job is to transform it into:
- A Clue-style narrative wrapper
- 7 difficult, messy, human clues
- 2 precise inspector notes
- And an embedded solution object for the game engine

These clues MUST be challenging and require cross-referencing to solve.
No clue should be clean, obvious, or sufficient on its own.

You MUST follow ALL rules.

────────────────────────────────────────
INPUTS YOU RECEIVE

1) TIMELINE_JSON:
${JSON.stringify(timeline)}

2) THEME:
- Name: ${theme.name}
- Period: ${theme.period}
- Atmosphere: ${theme.atmosphericElements.join(", ")}

3) SOLUTION (CONFIDENTIAL -- DO NOT REVEAL IN STORY/CLUES/NOTES):
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
HARD GROUNDING RULES (CRITICAL)

- You MUST reuse the Stage 1 event identity:
  - output.event.name MUST equal TIMELINE_JSON.event.name exactly.
  - output.event.purpose MUST be a close paraphrase of TIMELINE_JSON.event.purpose (or copy it).

- You MUST use ONLY provided names:
  - Any named suspect in clues/notes MUST be from SUSPECTS.
  - Any location mentioned MUST be from LOCATIONS.
  - Any time mentioned MUST be from TIMES.
  - You MAY reference Stage 1 beat titles, but you MUST NOT invent new beat names.

- Do NOT invent:
  - new people (no "Lady Lavender", etc.)
  - new rooms/areas (no "Conservatory", etc.)
  - new time labels (no "Breakfast", etc.)

────────────────────────────────────────
ABSOLUTE SECRECY RULES (CRITICAL)

- The solution item text MUST appear ONLY in solution.item.
- The solution item MUST NOT appear in:
  - event.name, event.purpose
  - intro
  - narrative
  - any clue
  - any inspector note

- Do NOT name the solution item's CATEGORY or TYPE anywhere outside solution.item.

- The story MUST NOT say:
  - theft happened
  - something was stolen, missing, taken, vanished, or gone
  - a crime occurred
  - an investigation is underway

- The "problem" must be implied ONLY by:
  - confusion
  - a space or surface not looking right
  - a schedule disruption
  - people reacting to something being "out of place" or "disturbed"

────────────────────────────────────────
VALIDATOR-SAFE LANGUAGE (HARD BAN)

NEVER use any of these phrases anywhere in intro, narrative, clues, or inspectorNotes:
- innocent
- ruled out
- couldn't have
- could not have
- never left
- alibi
- cleared (in the sense of clearing a person; avoid the word entirely to be safe)
- exonerated

Use uncertain memory phrasing instead (seemed like / felt like / maybe / I'm not sure / I can't swear to it).

────────────────────────────────────────
USING THE STAGE 1 TIMELINE (CRITICAL)

- TIMELINE_JSON is the hidden truth.
- Movements and groupings MUST remain consistent with it.
- You may blur exact sequencing, but you MUST NOT contradict:
  - where a person was during a beat
  - which rooms/times exist

────────────────────────────────────────
NARRATIVE WRAPPER RULES

- Narrative is NOT about a crime.
- It must establish the central occasion and reference multiple program segments.
- End with a sense that something felt "off" without naming what.

────────────────────────────────────────
MOTIF USAGE RULE

- Reuse several vague motifs seeded in Stage 1 (books, jewelry, tools, art, etc.).
- Spread them across different suspects.
- Never imply which matters.
- Never imply any specific object is important.

────────────────────────────────────────
CLUE WRITING RULES

Clues are unreliable human memories.

- Each clue MUST start with EXACTLY one of these prefixes (no leading spaces):
  "coming..."
  "'ello..."
  "good day..."
  "as I recall..."

- Each clue:
  - 2-5 sentences
  - Contains multiple details
  - Blends at least TWO moments or beats together
  - Includes at least ONE distraction, interruption, or mistaken assumption
  - Does NOT explain what it means
  - MUST contain at least ONE explicit uncertainty marker:
    "maybe", "I'm not sure", "I might be mixing it up", or "I can't swear to it".

- At least 5 of 7 clues MUST reference:
  - confusion
  - disruption
  - people being pulled away
  - a delay
  - something being "out of place"

Clues 1 and 2:
  - Early scene-setting
  - MUST NOT mention:
    - solution suspect
    - solution location
    - solution time

────────────────────────────────────────
SUSPECT DISTRIBUTION RULES

- Exactly 2 clues mention NO suspect.
- Remaining 5 clues each mention EXACTLY ONE suspect name (from SUSPECTS).
- Do NOT list multiple suspects in one clue.

────────────────────────────────────────
PHYSICALITY & SPACE RULE

- At least 5 of 7 clues MUST involve a physical surface/display/table/stand/shelf/case/furniture interaction.
- Do NOT imply something is missing.
- Only imply something was disturbed or not as expected.

────────────────────────────────────────
INSPECTOR NOTES RULES

- Exactly 2 notes.
- Each note:
  - EXACTLY ONE location name (from LOCATIONS)
  - References EXACTLY ONE time (from TIMES) OR one Stage 1 beat title
  - 1-3 sentences
  - Only physical irregularity, no theft/absence language, no blame

────────────────────────────────────────
FINAL CHECK

- No invented names, rooms, or time labels
- output.event.name equals Stage 1 event name
- Solution item appears ONLY in solution.item
- JSON schema matches exactly

Return ONLY the JSON.`;

  const text = await callOpenAi(apiKey, promptStage2, scenarioSchema);
  const parsed = parseJsonSafely<AiScenarioOutput>(text);
  validateAiOutput(plan, parsed, timeline);
  lastAiScenarioOutput = parsed;
  return parsed;
}
export function getLastAiScenarioOutput(): AiScenarioOutput | null {
  return lastAiScenarioOutput;
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
