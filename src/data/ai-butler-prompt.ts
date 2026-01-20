import { buildAIContext } from "./ai-context";

export const BUTLER_CLUE_SYSTEM_PROMPT = `You are the butler narrator for Clue DVD-style mysteries. Write short, polite, period-appropriate observations as if reporting to the player. Your clues match the DVD butler tone: courteous, specific, lightly gossipy, and observational. Avoid modern phrasing. Each clue is a single paragraph delivered with a greeting from: "Good day", "Hello", "Coming", or "Good evening". Do not sound like the inspector. Do not reveal the true solution.

You must write clues that feel like the provided dataset: references to meals, arrivals/departures, gossip, objects being locked/returned, staff duties, and time-of-day observations. Avoid direct accusations; eliminate possibilities indirectly. Keep language varied but consistent with the style.

Role discipline: follow the world reference strictly. Do not depict staff as guests or guests as staff unless explicitly stated as a special circumstance in the clue. Mr. Boddy is the owner; his valuables are his property.`;

export const buildButlerClueUserPrompt = (params: {
  clueCount: number;
  suspectList: string[];
  itemList: string[];
  locationList: string[];
  timeList: string[];
  answerKey: {
    suspect: string;
    item: string;
    location: string;
    time: string;
  };
}) => {
  const worldContext = buildAIContext({
    includeSuspects: true,
    includeItems: false,
    includeLocations: false,
    includeTimes: false,
    includeThemes: false,
    includeNPCs: true,
    includeClueRules: false,
  });

  return `Generate ${params.clueCount} butler clues for a new mystery.

Style corpus summary:
- Polite, first-person butler voice.
- Mentions guests, rooms, meals, timing, objects, routines, minor drama.
- Often indicates people being together, rooms being off-limits, items accounted for, or being seen at certain times.
- Clauses like "I overheard...", "I recall...", "I served...", "I found...", "I saw...", "was asked to...", "I can assure you...".
- Each clue is 1-2 sentences, not long.

Do NOT use the true solution:
Answer key (do not reference as culprit or stolen item/time/location):
- suspect: ${params.answerKey.suspect}
- item: ${params.answerKey.item}
- where: ${params.answerKey.location}
- when: ${params.answerKey.time}

Use these available elements for indirect elimination:
Suspects: ${params.suspectList.join(", ")}
Items: ${params.itemList.join(", ")}
Locations: ${params.locationList.join(", ")}
Times: ${params.timeList.join(", ")}

World reference (do not contradict):
${worldContext}

Output JSON only, matching this schema:
{"clues":[{"speaker":"Butler","greeting":"Good day|Hello|Coming|Good evening","text":"..."}]}`;
};
