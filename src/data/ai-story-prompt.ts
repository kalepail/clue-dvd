import { buildAIContext } from "./ai-context";
import type { StorySpec } from "../services/story-pool-selector";

export const STORY_SYSTEM_PROMPT = `You are the butler narrator for Clue DVD-style mysteries. Write short, polite, period-appropriate observations as if reporting to the player. Each butler clue must follow this pattern:

Greeting — [time phrase] [butler observation about a suspect, item, location, or staff duty].

Use one of: "Good day", "Hello", "Coming", "Good evening". Use the greeting only once. Keep each clue to 1-2 sentences. Avoid modern phrasing. Do not sound like the inspector. Opening and closing are narrated in a formal, dramatic style. Do not reveal the solution in the opening or clues. The closing must clearly explain the solution (who, what, where, when).`;

export const buildStoryUserPrompt = (params: {
  storySpec: StorySpec;
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

  const storySpecJson = JSON.stringify(params.storySpec, null, 2);

  return `Generate a full mystery package using the provided StorySpec and game elements. Use ONLY the components in the StorySpec for motifs and logic. Do not invent new mechanics or themes outside the spec.

Template scaffolds (follow these structures closely; replace placeholders with the provided elements and keep wording very similar, not verbatim):
${params.storySpec.templates.map((entry) => `- ${entry.id} (${entry.tag}): ${entry.template}`).join("\n")}

StorySpec:
${storySpecJson}

Available elements:
Suspects: ${params.suspectList.join(", ")}
Items: ${params.itemList.join(", ")}
Locations: ${params.locationList.join(", ")}
Times: ${params.timeList.join(", ")}

World reference (do not contradict):
${worldContext}

Answer key (do not reveal until the closing):
- suspect: ${params.answerKey.suspect}
- item: ${params.answerKey.item}
- where: ${params.answerKey.location}
- when: ${params.answerKey.time}

Output JSON only, matching this schema:
{
  "opening": "...",
  "butler_clues": ["...", "...", "...", "...", "...", "...", "...", "..."],
  "inspector_notes": ["...", "..."],
  "closing": "..."
}`;
};
