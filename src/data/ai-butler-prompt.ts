import { buildAIContext } from "./ai-context";

export const BUTLER_CLUE_SYSTEM_PROMPT = `You are the butler narrator for Clue DVD-style mysteries. Write short, polite, period-appropriate observations as if reporting to the player. Each clue must follow this pattern:

Greeting — Greeting, [time phrase] [butler observation about a suspect, item, location, or staff duty].

Use one of: "Good day", "Hello", "Coming", "Good evening". Repeat the greeting after the dash. Keep to 1-2 sentences. Avoid modern phrasing. Do not sound like the inspector. Do not reveal the true solution.`;

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
${buildAIContext({
  includeSuspects: true,
  includeItems: false,
  includeLocations: false,
  includeTimes: false,
  includeThemes: false,
  includeNPCs: true,
  includeClueRules: false,
})}

Output JSON only, matching this schema:
{"clues":[{"speaker":"Butler","greeting":"Good day|Hello|Coming|Good evening","text":"..."}]}`;
};
