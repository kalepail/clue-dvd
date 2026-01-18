/**
 * Clue DVD Game - AI Scenario Generation
 *
 * Uses a single Cloudflare Workers AI call to generate story + clue text + inspector notes
 * for a pre-planned scenario. Output is structured JSON and validated before use.
 */

import type { CampaignPlan, GeneratedScenario } from "../types/campaign";
import {
  SUSPECTS,
  ITEMS,
  LOCATIONS,
  TIME_PERIODS,
  MYSTERY_THEMES,
} from "../data/game-elements";
import { getNPCContext, getCompactContext } from "../data/ai-context";
import { SeededRandom } from "./seeded-random";

const OPENAI_MODEL = "gpt-4o";

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
  clues: Array<{
    position: number;
    text: string;
  }>;
  inspectorNotes: Array<{
    id: "N1" | "N2";
    text: string;
    relatedClues?: number[];
  }>;
};

let lastAiScenarioOutput: AiScenarioOutput | null = null;

type StorySkeleton = {
  event: {
    name: string;
    purpose: string;
    type: string;
  };
  intro: string;
  narrative: {
    opening: string;
    setting: string;
    atmosphere: string;
    closing: string;
  };
  timelineBeats: Array<{
    time: string;
    globalBeat: string;
    roomBeats: Array<{ location: string; detail: string }>;
  }>;
  suspectObservations: Array<{
    suspect: string;
    time: string;
    location: string;
    kind: "whereabout" | "witness" | "constraint" | "motive" | "interaction";
    detail: string;
  }>;
  roomEvidencePool: Array<{
    location: string;
    time: string;
    kind: "physical" | "sensory" | "staff" | "traffic";
    detail: string;
  }>;
  neutralDetails: Array<{
    time: string;
    kind: "event" | "movement" | "object" | "sound";
    detail: string;
  }>;
  solution: {
    suspect: string;
    item: string;
    location: string;
    time: string;
  };
};

type ClueFact = {
  position: number;
  speaker: string;
  time: string;
  location?: string;
  mentions: {
    suspects: string[];
    items: string[];
    locations: string[];
    times: string[];
  };
  detail: string;
  eliminationType: string;
};

type RewriteOutput = {
  clues: Array<{ position: number; text: string }>;
  inspectorNotes: Array<{ id: "N1" | "N2"; text: string; relatedClues?: number[] }>;
};

type NoteFact = {
  id: "N1" | "N2";
  relatedClues: number[];
  focus: string;
  mentions: {
    suspects: string[];
    items: string[];
    locations: string[];
    times: string[];
  };
  detail: string;
};

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
    const sanitized = sanitizeJsonText(raw);
    return JSON.parse(sanitized) as T;
  }
}

function countSentences(text: string): number {
  const matches = text.match(/[.!?]+(?:\s|$)/g);
  if (!matches) return text.trim().length > 0 ? 1 : 0;
  return matches.length;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = haystack.match(new RegExp(`\\b${escaped}\\b`, "gi"));
  return matches ? matches.length : 0;
}

function containsAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => countOccurrences(haystack, needle) > 0);
}

function pickRandom<T>(rng: SeededRandom, list: T[]): T | null {
  if (list.length === 0) return null;
  return list[rng.nextInt(0, list.length - 1)];
}

function joinNames(list: string[]): string {
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")}, and ${list[list.length - 1]}`;
}

function validateAiOutput(plan: CampaignPlan, output: AiScenarioOutput): void {
  if (!output.event?.name || !output.event?.purpose) {
    throw new Error("AI output missing event details.");
  }

  if (!output.intro || !output.intro.trim()) {
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

  const positions = new Set<number>();
  const suspect = SUSPECTS.find((s) => s.id === plan.solution.suspectId);
  const item = ITEMS.find((i) => i.id === plan.solution.itemId);
  const location = LOCATIONS.find((l) => l.id === plan.solution.locationId);
  const time = TIME_PERIODS.find((t) => t.id === plan.solution.timeId);
  if (!suspect || !item || !location || !time) {
    throw new Error("Invalid solution data for AI validation.");
  }

  let solutionMentionsEarly = 0;
  let suspectMentions = 0;
  let itemMentions = 0;
  let locationMentions = 0;
  const timeReferences = new Set<string>();
  const solutionTimeAlibiPhrases = [
    "not the thief",
    "ruled out",
    "eliminated",
    "innocent",
    "couldn't have",
    "could not have",
    "wasn't",
    "was not",
    "never left",
    "alibi",
    "accounted for",
    "cleared",
  ];
  const otherSuspectMentions = new Set<string>();
  let otherSuspectMentionCount = 0;
  let noSuspectClueCount = 0;
  let noSolutionElementClueCount = 0;

  for (const clue of output.clues) {
    if (typeof clue.position !== "number" || !clue.text || !clue.text.trim()) {
      throw new Error("AI output contains invalid clue entries.");
    }
    positions.add(clue.position);
    const sentences = countSentences(clue.text);
    if (sentences < 1 || sentences > 5) {
      throw new Error(`Clue ${clue.position} must be 1-5 sentences.`);
    }

    const text = clue.text;
    const suspectHits = countOccurrences(text, suspect.displayName);
    const itemHits = countOccurrences(text, item.nameUS);
    const locationHits = countOccurrences(text, location.name);
    const timeHits = countOccurrences(text, time.name);

    suspectMentions += suspectHits;
    itemMentions += itemHits;
    locationMentions += locationHits;
    if (timeHits > 0) {
      const lower = text.toLowerCase();
      const hasAlibiPhrase = solutionTimeAlibiPhrases.some((phrase) => lower.includes(phrase));
      if (hasAlibiPhrase) {
        throw new Error("Solution time may be referenced, but not to clear suspects or give explicit alibis.");
      }
    }

    for (const t of TIME_PERIODS) {
      if (t.id === time.id) continue;
      if (countOccurrences(text, t.name) > 0) {
        timeReferences.add(t.name);
      }
    }

    if (clue.position <= 2) {
      solutionMentionsEarly += suspectHits + itemHits;
    }

    const hasSuspectName = SUSPECTS.some((s) => countOccurrences(text, s.displayName) > 0);
    if (!hasSuspectName) {
      noSuspectClueCount += 1;
    }

    for (const s of SUSPECTS) {
      if (s.id === suspect.id) continue;
      const hits = countOccurrences(text, s.displayName);
      if (hits > 0) {
        otherSuspectMentions.add(s.displayName);
        otherSuspectMentionCount += hits;
      }
    }

    if (suspectHits + itemHits + locationHits + timeHits === 0) {
      noSolutionElementClueCount += 1;
    }
  }

  if (positions.size !== plan.clues.length) {
    throw new Error("AI output contains duplicate clue positions.");
  }

  if (solutionMentionsEarly > 0) {
    throw new Error("Clues 1-2 must not mention the solution suspect or item.");
  }

  if (suspectMentions > 2) {
    throw new Error("Solution suspect mentioned too often in clues.");
  }

  if (itemMentions > 2) {
    throw new Error("Solution item mentioned too often in clues.");
  }

  if (locationMentions > 2) {
    throw new Error("Solution location mentioned too often in clues.");
  }

  if (noSuspectClueCount < 2) {
    throw new Error("At least two clues must avoid naming any suspect.");
  }

  if (noSolutionElementClueCount < 3) {
    throw new Error("At least three clues must avoid mentioning solution elements.");
  }

  if (timeReferences.size < 3) {
    throw new Error("Clues must reference at least three different times.");
  }

  if (otherSuspectMentions.size < 3 || otherSuspectMentionCount < 4) {
    throw new Error("Clues must reference multiple other guests and their whereabouts.");
  }

  if (!Array.isArray(output.inspectorNotes) || output.inspectorNotes.length !== 2) {
    throw new Error("AI output must contain exactly 2 inspector notes.");
  }

  for (const note of output.inspectorNotes) {
    if (note.id !== "N1" && note.id !== "N2") {
      throw new Error("Inspector note IDs must be N1 and N2.");
    }
    if (!note.text || !note.text.trim()) {
      throw new Error("Inspector note text is required.");
    }
    if (note.relatedClues) {
      for (const position of note.relatedClues) {
        if (position < 1 || position > plan.clues.length) {
          throw new Error("Inspector note relatedClues out of range.");
        }
      }
    }
  }
}

function getElementNames(category: string, ids: string[]): string[] {
  return ids.map((id) => {
    if (category === "suspect") {
      return SUSPECTS.find((s) => s.id === id)?.displayName || id;
    }
    if (category === "item") {
      return ITEMS.find((i) => i.id === id)?.nameUS || id;
    }
    if (category === "location") {
      return LOCATIONS.find((l) => l.id === id)?.name || id;
    }
    return TIME_PERIODS.find((t) => t.id === id)?.name || id;
  });
}

async function generateStorySkeleton(
  apiKey: string,
  plan: CampaignPlan
): Promise<StorySkeleton> {
  const theme = MYSTERY_THEMES.find((t) => t.id === plan.themeId);
  const suspect = SUSPECTS.find((s) => s.id === plan.solution.suspectId);
  const item = ITEMS.find((i) => i.id === plan.solution.itemId);
  const location = LOCATIONS.find((l) => l.id === plan.solution.locationId);
  const time = TIME_PERIODS.find((t) => t.id === plan.solution.timeId);
  if (!theme || !suspect || !item || !location || !time) {
    throw new Error("Invalid plan data for skeleton generation.");
  }

  const suspectNames = SUSPECTS.map((s) => s.displayName);
  const itemNames = ITEMS.map((i) => i.nameUS);
  const locationNames = LOCATIONS.map((l) => l.name);
  const timeNames = TIME_PERIODS.map((t) => t.name);

  const schema = {
    name: "ClueStorySkeleton",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "event",
        "intro",
        "narrative",
        "timelineBeats",
        "suspectObservations",
        "roomEvidencePool",
        "neutralDetails",
        "solution",
      ],
      properties: {
        event: {
          type: "object",
          additionalProperties: false,
          required: ["name", "purpose", "type"],
          properties: {
            name: { type: "string" },
            purpose: { type: "string" },
            type: { type: "string" },
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
        timelineBeats: {
          type: "array",
          minItems: 5,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["time", "globalBeat", "roomBeats"],
            properties: {
              time: { type: "string", enum: timeNames },
              globalBeat: { type: "string" },
              roomBeats: {
                type: "array",
                minItems: 2,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["location", "detail"],
                  properties: {
                    location: { type: "string", enum: locationNames },
                    detail: { type: "string" },
                  },
                },
              },
            },
          },
        },
        suspectObservations: {
          type: "array",
          minItems: 8,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["suspect", "time", "location", "kind", "detail"],
            properties: {
              suspect: { type: "string", enum: suspectNames },
              time: { type: "string", enum: timeNames },
              location: { type: "string", enum: locationNames },
              kind: { type: "string", enum: ["whereabout", "witness", "constraint", "motive", "interaction"] },
              detail: { type: "string" },
            },
          },
        },
        roomEvidencePool: {
          type: "array",
          minItems: 6,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["location", "time", "kind", "detail"],
            properties: {
              location: { type: "string", enum: locationNames },
              time: { type: "string", enum: timeNames },
              kind: { type: "string", enum: ["physical", "sensory", "staff", "traffic"] },
              detail: { type: "string" },
            },
          },
        },
        neutralDetails: {
          type: "array",
          minItems: 6,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["time", "kind", "detail"],
            properties: {
              time: { type: "string", enum: timeNames },
              kind: { type: "string", enum: ["event", "movement", "object", "sound"] },
              detail: { type: "string" },
            },
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
      },
    },
  };

  const prompt = `${getNPCContext()}
${getCompactContext()}

You are generating a STORY SKELETON for a Clue DVD mystery. Output JSON only.

THEME:
- ${theme.name} (${theme.period}): ${theme.description}
- Atmosphere: ${theme.atmosphericElements.join(", ")}

SOLUTION (CONFIDENTIAL - DO NOT REVEAL IN STORY):
- WHO: ${suspect.displayName}
- WHAT: ${item.nameUS}
- WHERE: ${location.name}
- WHEN: ${time.name}

RULES:
- Crime is theft, never murder.
- Use only provided suspects, items, locations, and times.
- Every suspect is present in the story.
- Timeline beats must use the provided time names.
- Room beats must use the provided location names.
- Observations should be story flavor, not explicit alibis.
- Provide rich neutral details that avoid naming the solution elements.
- Use these kinds:
  - suspectObservations.kind: whereabout | witness | constraint | motive | interaction
  - roomEvidencePool.kind: physical | sensory | staff | traffic
  - neutralDetails.kind: event | movement | object | sound
`;

  const text = await callOpenAi(apiKey, prompt, schema);
  return parseJsonSafely<StorySkeleton>(text);
}

async function ensureSkeletonCoverage(
  apiKey: string,
  skeleton: StorySkeleton
): Promise<StorySkeleton> {
  const minNeutral = 8;
  const minEvidence = 6;
  const minObservations = 8;

  const neutralDeficit = Math.max(0, minNeutral - skeleton.neutralDetails.length);
  const evidenceDeficit = Math.max(0, minEvidence - skeleton.roomEvidencePool.length);
  const observationDeficit = Math.max(0, minObservations - skeleton.suspectObservations.length);

  if (neutralDeficit === 0 && evidenceDeficit === 0 && observationDeficit === 0) {
    return skeleton;
  }

  const suspectNames = SUSPECTS.map((s) => s.displayName);
  const locationNames = LOCATIONS.map((l) => l.name);
  const timeNames = TIME_PERIODS.map((t) => t.name);

  const schema = {
    name: "ClueSkeletonExtras",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["neutralDetails", "roomEvidencePool", "suspectObservations"],
      properties: {
        neutralDetails: {
          type: "array",
          minItems: neutralDeficit,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["time", "kind", "detail"],
            properties: {
              time: { type: "string", enum: timeNames },
              kind: { type: "string", enum: ["event", "movement", "object", "sound"] },
              detail: { type: "string" },
            },
          },
        },
        roomEvidencePool: {
          type: "array",
          minItems: evidenceDeficit,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["location", "time", "kind", "detail"],
            properties: {
              location: { type: "string", enum: locationNames },
              time: { type: "string", enum: timeNames },
              kind: { type: "string", enum: ["physical", "sensory", "staff", "traffic"] },
              detail: { type: "string" },
            },
          },
        },
        suspectObservations: {
          type: "array",
          minItems: observationDeficit,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["suspect", "time", "location", "kind", "detail"],
            properties: {
              suspect: { type: "string", enum: suspectNames },
              time: { type: "string", enum: timeNames },
              location: { type: "string", enum: locationNames },
              kind: { type: "string", enum: ["whereabout", "witness", "constraint", "motive", "interaction"] },
              detail: { type: "string" },
            },
          },
        },
      },
    },
  };

  const prompt = `${getCompactContext()}

Generate additional story details for a Clue DVD mystery.
- Provide extra neutral details, room evidence, and suspect observations.
- Avoid mentioning the solution suspect/item/location/time.
- Keep details subtle (no explicit alibis or clearance language).
- Use only provided suspects, locations, and time names.
- Use these kinds:
  - suspectObservations.kind: whereabout | witness | constraint | motive | interaction
  - roomEvidencePool.kind: physical | sensory | staff | traffic
  - neutralDetails.kind: event | movement | object | sound

Return JSON only.`;

  const text = await callOpenAi(apiKey, prompt, schema);
  const extras = parseJsonSafely<{
    neutralDetails: StorySkeleton["neutralDetails"];
    roomEvidencePool: StorySkeleton["roomEvidencePool"];
    suspectObservations: StorySkeleton["suspectObservations"];
  }>(text);

  return {
    ...skeleton,
    neutralDetails: [...skeleton.neutralDetails, ...extras.neutralDetails],
    roomEvidencePool: [...skeleton.roomEvidencePool, ...extras.roomEvidencePool],
    suspectObservations: [...skeleton.suspectObservations, ...extras.suspectObservations],
  };
}

function buildClueFacts(plan: CampaignPlan, skeleton: StorySkeleton): ClueFact[] {
  const rng = new SeededRandom(plan.seed);
  const solutionNames = {
    suspect: SUSPECTS.find((s) => s.id === plan.solution.suspectId)?.displayName ?? "",
    item: ITEMS.find((i) => i.id === plan.solution.itemId)?.nameUS ?? "",
    location: LOCATIONS.find((l) => l.id === plan.solution.locationId)?.name ?? "",
    time: TIME_PERIODS.find((t) => t.id === plan.solution.timeId)?.name ?? "",
  };
  const solutionNameList = [
    solutionNames.suspect,
    solutionNames.item,
    solutionNames.location,
    solutionNames.time,
  ].filter(Boolean);

  const timePool = Array.from(new Set([
    ...skeleton.timelineBeats.map((beat) => beat.time),
    ...TIME_PERIODS.map((t) => t.name),
  ]));
  const shuffledTimes = rng.shuffle(timePool);
  let timeIndex = 0;

  const roomBeatByLocation = new Map<string, Array<StorySkeleton["timelineBeats"][number]["roomBeats"][number]>>();
  for (const beat of skeleton.timelineBeats) {
    for (const roomBeat of beat.roomBeats) {
      const list = roomBeatByLocation.get(roomBeat.location) ?? [];
      list.push(roomBeat);
      roomBeatByLocation.set(roomBeat.location, list);
    }
  }

  const observationsBySuspect = new Map<string, Array<StorySkeleton["suspectObservations"][number]>>();
  const observationsBySuspectKind = new Map<string, Record<string, Array<StorySkeleton["suspectObservations"][number]>>>();
  for (const obs of skeleton.suspectObservations) {
    const list = observationsBySuspect.get(obs.suspect) ?? [];
    list.push(obs);
    observationsBySuspect.set(obs.suspect, list);

    const kindMap = observationsBySuspectKind.get(obs.suspect) ?? {};
    const kindList = kindMap[obs.kind] ?? [];
    kindList.push(obs);
    kindMap[obs.kind] = kindList;
    observationsBySuspectKind.set(obs.suspect, kindMap);
  }

  const evidenceByLocation = new Map<string, Array<StorySkeleton["roomEvidencePool"][number]>>();
  for (const evidence of skeleton.roomEvidencePool) {
    const list = evidenceByLocation.get(evidence.location) ?? [];
    list.push(evidence);
    evidenceByLocation.set(evidence.location, list);
  }

  const evidenceByKind = new Map<string, Array<StorySkeleton["roomEvidencePool"][number]>>();
  for (const evidence of skeleton.roomEvidencePool) {
    const list = evidenceByKind.get(evidence.kind) ?? [];
    list.push(evidence);
    evidenceByKind.set(evidence.kind, list);
  }

  const neutralByKind = new Map<string, Array<StorySkeleton["neutralDetails"][number]>>();
  for (const detail of skeleton.neutralDetails) {
    const list = neutralByKind.get(detail.kind) ?? [];
    list.push(detail);
    neutralByKind.set(detail.kind, list);
  }

  const neutralDetails = skeleton.neutralDetails;

  const fallbackDetail = `The ${skeleton.event.type} carried on with soft conversation and movement between rooms.`;
  const suspectNameList = SUSPECTS.map((s) => s.displayName);

  const facts: ClueFact[] = [];
  let noSuspectClues = 0;

  for (const plannedClue of plan.clues) {
    const elementNames = getElementNames(plannedClue.elimination.category, plannedClue.elimination.elementIds);
    const mentions = {
      suspects: plannedClue.elimination.category === "suspect" ? elementNames : [],
      items: plannedClue.elimination.category === "item" ? elementNames : [],
      locations: plannedClue.elimination.category === "location" ? elementNames : [],
      times: plannedClue.elimination.category === "time" ? elementNames : [],
    };

    let time = mentions.times[0];
    if (!time) {
      time = shuffledTimes[timeIndex % shuffledTimes.length];
      timeIndex += 1;
    }

    const contextTime = TIME_PERIODS.find((t) => t.id === plannedClue.elimination.context?.alibiTime)?.name;
    if (contextTime) {
      time = contextTime;
    }

    let locationName = mentions.locations[0];
    const contextLocation = LOCATIONS.find((l) => l.id === plannedClue.elimination.context?.alibiLocation)?.name;
    if (contextLocation) {
      locationName = contextLocation;
    }

    if (!locationName) {
      const roomBeatLocations = skeleton.timelineBeats
        .find((beat) => beat.time === time)?.roomBeats.map((beat) => beat.location) ?? [];
      locationName = pickRandom(rng, roomBeatLocations) ?? pickRandom(rng, LOCATIONS.map((l) => l.name)) ?? "";
    }

    let detail: string | null = null;
    const eliminationType = plannedClue.elimination.type;

    const pickObservation = (suspectName: string, kinds: Array<StorySkeleton["suspectObservations"][number]["kind"]>) => {
      const kindMap = observationsBySuspectKind.get(suspectName) ?? {};
      for (const kind of kinds) {
        const list = kindMap[kind] ?? [];
        const candidate = pickRandom(rng, list);
        if (candidate) return candidate;
      }
      const fallbackList = observationsBySuspect.get(suspectName) ?? [];
      return pickRandom(rng, fallbackList) ?? null;
    };

    const pickNeutral = (kinds: Array<StorySkeleton["neutralDetails"][number]["kind"]>) => {
      for (const kind of kinds) {
        const list = neutralByKind.get(kind) ?? [];
        const candidate = pickRandom(rng, list);
        if (candidate) return candidate;
      }
      return pickRandom(rng, neutralDetails) ?? null;
    };

    const pickEvidence = (kinds: Array<StorySkeleton["roomEvidencePool"][number]["kind"]>) => {
      for (const kind of kinds) {
        const list = evidenceByKind.get(kind) ?? [];
        const candidate = pickRandom(rng, list);
        if (candidate) return candidate;
      }
      const list = locationName ? evidenceByLocation.get(locationName) ?? [] : [];
      return pickRandom(rng, list) ?? null;
    };

    if (plannedClue.elimination.category === "suspect" && mentions.suspects.length > 0) {
      const suspectNames = mentions.suspects;
      if (eliminationType === "group_alibi") {
        const obs = pickObservation(suspectNames[0], ["interaction", "whereabout"]);
        detail = `${joinNames(suspectNames)} kept close company in ${locationName} at ${time}, ${obs?.detail ?? "absorbed in quiet conversation"}.`;
      } else if (eliminationType === "individual_alibi") {
        const obs = pickObservation(suspectNames[0], ["whereabout", "interaction"]);
        detail = `${suspectNames[0]} was observed in ${locationName} at ${time}, ${obs?.detail ?? "occupied with the evening's arrangements"}.`;
      } else if (eliminationType === "witness_testimony") {
        const obs = pickObservation(suspectNames[0], ["witness", "whereabout"]);
        detail = `A guest recalled ${suspectNames[0]} at ${locationName} around ${time}, ${obs?.detail ?? "lingering near the corridor"}.`;
      } else if (eliminationType === "physical_impossibility") {
        const obs = pickObservation(suspectNames[0], ["constraint", "whereabout"]);
        detail = `${suspectNames[0]} moved carefully at ${time} in ${locationName}, ${obs?.detail ?? "their movements noticeably restrained"}.`;
      } else if (eliminationType === "motive_cleared") {
        const obs = pickObservation(suspectNames[0], ["motive", "interaction"]);
        detail = `${suspectNames[0]} spoke earnestly in ${locationName} at ${time}, ${obs?.detail ?? "praising Mr. Boddy's collection and its stewardship"}.`;
      }
    } else if (plannedClue.elimination.category === "item" && mentions.items.length > 0) {
      const items = mentions.items;
      if (eliminationType === "category_secured") {
        const category = plannedClue.elimination.context?.itemCategory ?? "valuables";
        detail = `By ${time}, the ${category} display was secured, and staff had checked each piece.`;
      } else if (eliminationType === "item_sighting") {
        detail = `The ${joinNames(items)} were still on view at ${time} in ${locationName}, catching the candlelight.`;
      } else if (eliminationType === "item_accounted") {
        detail = `A brief ledger check at ${time} confirmed the ${joinNames(items)} had been returned to their place.`;
      } else if (eliminationType === "item_condition") {
        detail = `The display for the ${joinNames(items)} appeared undisturbed, glass unclouded and velvet smooth.`;
      }
    } else if (plannedClue.elimination.category === "location" && locationName) {
      if (eliminationType === "location_inaccessible") {
        detail = `${locationName} was roped off at ${time}, the staff directing guests elsewhere.`;
      } else if (eliminationType === "location_undisturbed") {
        const evidence = pickEvidence(["physical", "sensory"]);
        detail = `Nothing in ${locationName} appeared disturbed at ${time}; ${evidence?.detail ?? "the arrangements stayed pristine"}.`;
      } else if (eliminationType === "location_occupied") {
        detail = `${locationName} remained occupied at ${time}, with guests gathered for ${skeleton.event.type} conversation.`;
      } else if (eliminationType === "location_visibility") {
        detail = `${locationName} was busy at ${time}, the steady foot traffic leaving little privacy.`;
      }
    } else if (plannedClue.elimination.category === "time" && time) {
      if (eliminationType === "all_together") {
        const beat = skeleton.timelineBeats.find((b) => b.time === time)?.globalBeat;
        detail = `At ${time}, the guests gathered for ${beat ?? "the evening's centerpiece"}, leaving little solitude.`;
      } else if (eliminationType === "item_present") {
        detail = `At ${time}, the main display remained intact, its arrangement still carefully in place.`;
      } else if (eliminationType === "staff_activity") {
        const staffBeat = pickEvidence(["staff", "traffic"]);
        detail = `At ${time}, the staff were in constant motion, ${staffBeat?.detail ?? "circulating between rooms with trays and notes"}.`;
      } else if (eliminationType === "timeline_impossibility") {
        const beat = skeleton.timelineBeats.find((b) => b.time === time)?.globalBeat;
        detail = `The house shifted abruptly around ${time}, ${beat ?? "moving the guests toward the next engagement"}.`;
      }
    }

    if (!detail) {
      const neutral = pickNeutral(["event", "movement", "sound", "object"]);
      detail = neutral?.detail ?? fallbackDetail;
    }

    if (containsAny(detail, solutionNameList)) {
      const safeNeutral = neutralDetails.find((entry) => !containsAny(entry.detail, solutionNameList));
      detail = safeNeutral?.detail ?? fallbackDetail;
    }

    if (mentions.suspects.length === 0 && noSuspectClues < 2) {
      if (containsAny(detail, suspectNameList)) {
        const safeNeutral = neutralDetails.find((entry) => !containsAny(entry.detail, suspectNameList));
        detail = safeNeutral?.detail ?? fallbackDetail;
      }
      noSuspectClues += 1;
    }

    facts.push({
      position: plannedClue.position,
      speaker: plannedClue.delivery.speaker,
      time,
      location: locationName,
      mentions: {
        suspects: mentions.suspects,
        items: mentions.items,
        locations: locationName ? [locationName, ...mentions.locations.filter((l) => l !== locationName)] : mentions.locations,
        times: time ? [time, ...mentions.times.filter((t) => t !== time)] : mentions.times,
      },
      detail,
      eliminationType,
    });
  }

  return facts;
}

async function rewriteClues(
  apiKey: string,
  plan: CampaignPlan,
  skeleton: StorySkeleton,
  facts: ClueFact[]
): Promise<RewriteOutput> {
  const noteFacts: NoteFact[] = [
    {
      id: "N1",
      relatedClues: facts.filter((fact) => fact.mentions.suspects.length > 0).slice(0, 2).map((fact) => fact.position),
      focus: "Connections between guest movements and the main display",
      mentions: {
        suspects: facts.flatMap((fact) => fact.mentions.suspects).slice(0, 2),
        items: facts.flatMap((fact) => fact.mentions.items).slice(0, 1),
        locations: facts.flatMap((fact) => fact.mentions.locations).slice(0, 2),
        times: facts.flatMap((fact) => fact.mentions.times).slice(0, 2),
      },
      detail: "Note the overlap between where guests gathered and when attention drifted from the display.",
    },
    {
      id: "N2",
      relatedClues: facts.filter((fact) => fact.mentions.locations.length > 0).slice(0, 2).map((fact) => fact.position),
      focus: "Room conditions and staff movements",
      mentions: {
        suspects: facts.flatMap((fact) => fact.mentions.suspects).slice(2, 4),
        items: facts.flatMap((fact) => fact.mentions.items).slice(0, 1),
        locations: facts.flatMap((fact) => fact.mentions.locations).slice(2, 4),
        times: facts.flatMap((fact) => fact.mentions.times).slice(2, 4),
      },
      detail: "Cross-reference which rooms were occupied or monitored when the house shifted.",
    },
  ];

  const schema = {
    name: "ClueRewrite",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["clues", "inspectorNotes"],
      properties: {
        clues: {
          type: "array",
          minItems: plan.clues.length,
          maxItems: plan.clues.length,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["position", "text"],
            properties: {
              position: { type: "integer", minimum: 1, maximum: plan.clues.length },
              text: { type: "string" },
            },
          },
        },
        inspectorNotes: {
          type: "array",
          minItems: 2,
          maxItems: 2,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "text", "relatedClues"],
            properties: {
              id: { type: "string", enum: ["N1", "N2"] },
              text: { type: "string" },
              relatedClues: {
                type: "array",
                items: { type: "integer", minimum: 1, maximum: plan.clues.length },
              },
            },
          },
        },
      },
    },
  };

  const prompt = `${getNPCContext()}
${getCompactContext()}

You are rewriting clue facts into subtle, story-driven clues for a Clue DVD mystery.
Use only the provided names. Do not introduce new suspects, items, rooms, or times.
Do not use alibi/clearance language (innocent, ruled out, couldn't have, never left, etc.).
Clues should feel like observations from the event "${skeleton.event.name}".
Do not mention the solution suspect/item/location/time unless they appear in the mentions lists.

For each clue fact:
- Mention all listed names in the mentions fields.
- Use the provided time/location/detail as context.
- Keep clues 1-5 sentences, narrative tone.

Clue Facts:
${JSON.stringify(facts, null, 2)}

Inspector Note Facts (make these slightly more helpful and connective than public clues):
${JSON.stringify(noteFacts, null, 2)}
`;

  const text = await callOpenAi(apiKey, prompt, schema);
  return parseJsonSafely<RewriteOutput>(text);
}

async function callOpenAi(
  apiKey: string,
  prompt: string,
  schema: Record<string, unknown>
): Promise<string> {
  console.log("AI scenario generation: OpenAI model", OPENAI_MODEL);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: prompt,
      max_output_tokens: 1800,
      temperature: 0.9,
      text: {
        format: {
          type: "json_schema",
          name: schema.name,
          schema: schema.schema,
          strict: true,
        },
      },
    }),
  });

  const payload = await response.json().catch(() => ({})) as {
    error?: { message?: string };
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };

  if (!response.ok) {
    const message = payload?.error?.message || "OpenAI request failed.";
    throw new Error(message);
  }

  const text = payload?.output_text
    ?? payload?.output?.[0]?.content?.[0]?.text;
  if (!text || !text.trim()) {
    throw new Error("OpenAI response was empty.");
  }
  return text;
}

export async function generateAiScenarioText(
  apiKey: string,
  plan: CampaignPlan
): Promise<AiScenarioOutput> {
  const skeletonBase = await generateStorySkeleton(apiKey, plan);
  const skeleton = await ensureSkeletonCoverage(apiKey, skeletonBase);
  const facts = buildClueFacts(plan, skeleton);
  const rewrite = await rewriteClues(apiKey, plan, skeleton, facts);

  const solution = {
    suspect: SUSPECTS.find((s) => s.id === plan.solution.suspectId)?.displayName ?? "",
    item: ITEMS.find((i) => i.id === plan.solution.itemId)?.nameUS ?? "",
    location: LOCATIONS.find((l) => l.id === plan.solution.locationId)?.name ?? "",
    time: TIME_PERIODS.find((t) => t.id === plan.solution.timeId)?.name ?? "",
  };

  const output: AiScenarioOutput = {
    event: {
      name: skeleton.event.name,
      purpose: skeleton.event.purpose,
    },
    intro: skeleton.intro,
    narrative: skeleton.narrative,
    solution,
    clues: rewrite.clues,
    inspectorNotes: rewrite.inspectorNotes,
  };

  validateAiOutput(plan, output);
  lastAiScenarioOutput = output;
  return output;
}

export function getLastAiScenarioOutput(): AiScenarioOutput | null {
  return lastAiScenarioOutput;
}

export function applyAiScenarioText(
  base: GeneratedScenario,
  aiText: AiScenarioOutput
): GeneratedScenario {
  const clueTextByPosition = new Map<number, string>(
    aiText.clues.map((clue) => [clue.position, clue.text])
  );

  const clues = base.clues.map((clue) => ({
    ...clue,
    text: clueTextByPosition.get(clue.position) ?? clue.text,
  }));

  return {
    ...base,
    clues,
    inspectorNotes: aiText.inspectorNotes,
    narrative: {
      ...base.narrative,
      opening: `${aiText.intro.trim()}\n\n${aiText.narrative.opening}`,
      setting: aiText.narrative.setting,
      atmosphere: aiText.narrative.atmosphere,
      closing: aiText.narrative.closing,
    },
  };
}
