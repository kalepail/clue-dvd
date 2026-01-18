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
      .replace(/[“”]/g, "\"")
      .replace(/[‘’]/g, "'")
      .replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(sanitized) as T;
  }
}

function countSentences(text: string): number {
  const matches = text.match(/[.!?]+(?:\s|$)/g);
  if (!matches) return text.trim().length > 0 ? 1 : 0;
  return matches.length;
}

function validateAiOutput(plan: CampaignPlan, output: AiScenarioOutput): void {
  if (!output.event?.name || !output.event?.purpose) {
    throw new Error("AI output missing event details.");
  }
  if (!output.intro?.trim()) {
    throw new Error("AI output missing intro paragraph.");
  }
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

  const item = ITEMS.find((i) => i.id === plan.solution.itemId);
  if (item) {
    const narrativeBlock = [
      output.event.name,
      output.event.purpose,
      output.intro,
      output.narrative.opening,
      output.narrative.setting,
      output.narrative.atmosphere,
      output.narrative.closing,
    ].join(" ");
    if (narrativeBlock.includes(item.nameUS)) {
      throw new Error("Solution item must not appear in event or narrative text.");
    }
  }

  const alibiPhrases = [
    "innocent",
    "ruled out",
    "couldn't have",
    "could not have",
    "never left",
    "alibi",
    "cleared",
    "exonerated",
  ];

  for (const [index, clue] of output.clues.entries()) {
    if (typeof clue !== "string" || !clue.trim()) {
      throw new Error(`AI output contains invalid clue entry at index ${index}.`);
    }
    const sentences = countSentences(clue);
    if (sentences < 1 || sentences > 5) {
      throw new Error(`Clue ${index + 1} must be 1-5 sentences.`);
    }
    const lower = clue.toLowerCase();
    if (alibiPhrases.some((phrase) => lower.includes(phrase))) {
      throw new Error(`Clue ${index + 1} contains alibi/clearance language.`);
    }
  }

  for (const note of output.inspectorNotes) {
    if (!note || !note.trim()) {
      throw new Error("Inspector note text is required.");
    }
    const lower = note.toLowerCase();
    if (alibiPhrases.some((phrase) => lower.includes(phrase))) {
      throw new Error("Inspector note contains alibi/clearance language.");
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

  const schema = {
    name: "ClueSinglePrompt",
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

  const prompt = `You are a narrative generator for a Clue-style mystery game.

You must generate the event, intro, narrative, 7 clues, and 2 inspector notes from scratch
using ONLY the provided suspects, items, locations, and times.

Follow ALL rules strictly.

────────────────────────────────────────
OUTPUT FORMAT (JSON ONLY)

Output a single JSON object with exactly these fields:

{
  "event": {
    "name": string,
    "purpose": string
  },
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

No extra fields.
No markdown.
No explanations.
Return ONLY the JSON object.

────────────────────────────────────────
HARD RULES (must never be violated)

- Crime is always THEFT (never murder).
- Clues must each be 1–5 sentences.
- Do NOT use alibi or clearance language (including words or phrases like:
  “innocent”, “ruled out”, “couldn’t have”, “never left”, “alibi”, “cleared”, “exonerated”, etc.).
- The solution item MUST NOT appear in:
  - the event name
  - the event purpose
  - the intro
  - any narrative text (opening, setting, atmosphere, closing)
- The solution item must not be named in any clue or inspector note.
  It MAY be hinted at thematically or indirectly.
- Use ONLY the provided suspects, items, locations, and times.
- Do NOT invent new suspects, items, rooms, or times.
- Do NOT reveal the solution explicitly in the story, clues, or inspector notes.
- Do NOT invent any character names, titles, or nicknames.
- Every named person must be EXACTLY one of the provided SUSPECTS names.
- Do not use placeholders like “a companion,” “the newcomer,” or invented names.

────────────────────────────────────────
CAMOUFLAGE & DISTRIBUTION RULES

- The solution suspect, location, and time MAY appear in the story and clues.
- They must:
  - Not be clustered together in the same clue or note.
  - Not be described more vividly or suspiciously than other suspects/locations/times.
  - Not appear more often or more prominently than other comparable elements.
- The story should mention multiple suspects, rooms, and times in comparable ways so the solution elements are camouflaged among them.

────────────────────────────────────────
EVENT STRUCTURE REQUIREMENT

- The mystery MUST be centered around a specific, concrete event
  (e.g., birthday party, holiday dinner, ball, concert, charity auction, themed party, etc.).
- The event must:
  - Be named clearly
  - Have a purpose
  - Explain why all suspects are present
  - Event name must NOT include the words: "AI", "Mystery", "Theft".
  - Event name must be specific (e.g., "The Winter Masquerade Ball", "The Garden Benefit Concert").

- The story must describe:
  - What kind of event it is
  - What activities or program it includes
  - How the day/evening flows from start to finish

- The narrative must include at least 3 distinct event “beats” such as:
  - a speech, toast, or announcement
  - a performance, game, or group activity
  - a distraction, interruption, or moment of confusion (lights flicker, applause, crowd movement, etc.)

- These beats must:
  - Naturally cause people to move between rooms
  - Create moments where attention is divided

────────────────────────────────────────
THEFT CONTEXT REQUIREMENT

- The theft must have affected the flow of the event.
- At least 4 of the 7 clues must reference one of:
  - Someone missing time from the event
  - A small disturbance, interruption, or confusion
  - Staff or guests reacting to something being misplaced
  - A hurried movement, dropped object, or raised voices
  - People retracing steps or whispering about a problem

- These references must be:
  - Indirect
  - Casual
  - Anecdotal
  - Not stated as “the theft happened here” or “X stole Y”

- The theft must feel like:
  - A social disruption
  - Not yet a solved crime

- Do NOT explicitly state that a theft occurred inside any clue.
  The theft must only be implied through reactions, confusion, or disruption.

────────────────────────────────────────
CLUE WRITING RULES

- Each clue must read like a remembered moment from the event, not like evidence.
- Each clue should sound like:
  - a guest recalling something odd or memorable
  - a servant repeating gossip or a passing comment
  - a casual observation that mixes relevant and irrelevant details
- Write clues in a natural, conversational, first-person or anecdotal voice.
- Prefer:
  “I remember…”
  “Someone mentioned…”
  “There was a moment when…”
  “I couldn’t help noticing…”
- Do not write in a neutral narrator voice.

- Clues MUST:
  - Contain multiple details, only some of which are important
  - Include social context (conversation, mood, activity, distraction)
  - Often include either:
    - a small disruption
    - a missing presence
    - a moment of confusion
    - or a hurried movement

- Clues MUST NOT:
  - State or explain the theft directly
  - State or explain what they prove
  - Sound like police notes or evidence logs

- Clues 1–2:
  - Should focus on the event’s normal flow and early oddities
  - Must not mention the solution suspect, item, location, or time

- Across all 7 clues:
  - Vary suspects, locations, and times
  - Make them feel like overlapping, imperfect memories of the same event

SUSPECT COVERAGE REQUIREMENT

- Every suspect must be mentioned by name in at least one of the 7 clues.
- At least 5 of the 7 clues must mention exactly ONE suspect by name (to create distinct suspect “threads”).
- Each suspect-mentioned clue must include at least two of the following about that suspect:
  - an activity they were doing
  - who they were talking to (must be another suspect name or “staff/guest” unnamed)
  - a mood/condition (nervous, unwell, distracted, cheerful, impatient, etc.)
  - a specific object interaction (without naming the solution item)
  - a reason they were in that area (game, toast, performance, dessert, coat check, etc.)

CLUE ANCHOR REQUIREMENT

Every clue must contain:
- at least one suspect name (unless it is one of the “no suspect named” clues),
- at least one location name OR one event beat (toast, game, performance, dinner, etc.),
- at least one time reference using a provided time name OR an implied sequence marker tied to the program (before the toast, during the interlude, after dessert, etc.).

At least 2 clues must name NO suspect (these are atmosphere/scene clues), but they must still include a location + time + event beat.

- Most clues should contain at least one concrete anchor:
  a location, a time reference, or a named activity from the event.
- Not every clue must contain all three.
- Anchors can be implied through context, not always stated explicitly.
- Vary sentence length and structure across clues.
- Some clues should be one long, rambling memory.
- Some should be short and slightly vague.
- Avoid repeating the same grammatical pattern.
- Even if multiple suspects appear in a clue, one moment or one interaction should be the emotional focus.
- Do not list several suspects doing unrelated things in the same clue.

────────────────────────────────────────
INSPECTOR NOTES RULES

- Inspector notes are in-world observations recorded by staff or the inspector.
- They are more concrete and specific than normal clues, but still not conclusive.
- They describe:
  - a physical condition of a room or object
  - a timing-related observation
  - a movement or access pattern
  - or something that changed during the event

- Each inspector note must:
  - Contain exactly ONE concrete observation
  - Be written as a factual observation, not a conclusion
  - Avoid naming the solution item
  - Avoid stating who is guilty
  - Avoid using alibi or clearance language
  - Describe ONLY ONE physical or environmental observation
  - It may be 1–3 sentences and may include descriptive detail, but it must not:
    - Combine multiple different observations
    - Describe cause, sequence, or interpretation
    - Mention more than one room or more than one object
  - Think of each note as one entry in a staff or inspector’s log describing a single thing that looked wrong or out of place.
  - If two odd things were noticed, they must be written as two separate inspector notes.
  - An inspector note must never mention more than two of:
    - a location
    - an object
    - a physical condition

- Inspector notes must:
  - Not repeat the same information as any clue
  - Add new, concrete details

INSPECTOR NOTES UTILITY REQUIREMENT

- Each inspector note must reference:
  - a specific location name AND
  - either a time name OR a program beat (after the toast, during intermission, etc.)
- Each inspector note must help narrow possibilities by describing access, movement, or a changed condition.
- Do not introduce mysterious objects unless they are from the ITEMS list.

────────────────────────────────────────
STYLE & REALISM RULES

- Tone: classic Clue, grounded, subtle.
- Clues should feel like:
  - overheard stories
  - remembered conversations
  - casual remarks
  - personal impressions
- Avoid:
  - clinical wording
  - procedural wording
  - modern slang
  - melodrama

- Every clue must sound like it could have been spoken by someone who attended the event.
- At least 4 of the 7 clues must:
  - Mention a conversation, social interaction, or shared moment
  - Contain at least one irrelevant detail that does not matter to the solution
- Do not optimize clues for efficiency.
- Do not write “clean” clues.
- Messy, human, indirect memories are better.

────────────────────────────────────────
NARRATIVE REQUIREMENTS

- The narrative must make the event feel real, scheduled, and structured.
- It must be possible to imagine:
  - Where people were at different parts of the event
  - What they were likely doing at those times
- The theft must feel like it happened because:
  - People were distracted
  - Or rooms were briefly unattended
  - Or the schedule created a natural opportunity

- Most clues should reference:
  - specific moments in the event
  - specific activities (speeches, games, music, dinner, intermission, etc.)
  - or transitions between activities

────────────────────────────────────────
INPUTS (YOU MUST USE THESE EXACT NAMES)

THEME:
- Name: ${theme.name}
- Period: ${theme.period}
- Atmosphere: ${theme.atmosphericElements.join(", ")}

SOLUTION (CONFIDENTIAL — DO NOT REVEAL IN STORY TEXT):
- Suspect: ${suspect.displayName}
- Item: ${item.nameUS}
- Location: ${location.name}
- Time: ${time.name}

SUSPECTS: ${suspectsList}
ITEMS: ${itemsList}
LOCATIONS: ${locationsList}
TIMES: ${timesList}

────────────────────────────────────────
FINAL CHECK BEFORE YOU OUTPUT

- The solution item does NOT appear anywhere except in solution.item.
- The solution is NOT stated or implied directly.
- All names come ONLY from the provided lists.
- The output is valid JSON and matches the schema exactly.

Return ONLY the JSON object.`;

  const text = await callOpenAi(apiKey, prompt, schema);
  const parsed = parseJsonSafely<AiScenarioOutput>(text);
  validateAiOutput(plan, parsed);
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
