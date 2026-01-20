import type { StorySpec } from "../services/story-pool-selector";

export const STORY_SYSTEM_PROMPT = `You are the butler narrator for Clue DVD-style mysteries. Write short, polite, period-appropriate observations as if reporting to the player. Each butler clue must follow this pattern:

Greeting — [time phrase] [butler observation about a suspect, item, location, or staff duty].

Use one of: "Good day", "Hello", "Coming", "Good evening". Use the greeting only once. Keep each clue to 1-2 sentences. Avoid modern phrasing. Do not sound like the inspector. Opening and closing are narrated in a formal, dramatic style. Do not reveal the solution in the opening or clues. The closing must clearly explain the solution (who, what, where, when). Do not prepend extra time phrases outside the template.`;

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
  const worldContext = [
    "Rules: Theft only. 1920s British setting. Mr. Boddy owns all valuables.",
    "Use only the provided suspect/item/location/time names.",
  ].join("\n");

  const templateIndex = new Map(params.storySpec.templates.map((entry) => [entry.id, entry]));

  const formatBind = (bind: Record<string, string>) => {
    const parts = Object.entries(bind).map(([key, value]) => `${key}=${value === "solution" ? "sol" : "non"}`);
    return parts.length ? ` bind(${parts.join(",")})` : "";
  };

  const formatBundle = (bundle: string[]) =>
    bundle
      .map((id) => {
        const entry = templateIndex.get(id);
        if (!entry) return `${id} (missing template)`;
        return `${entry.template}${formatBind(entry.solutionBind)}`;
      })
      .join(" | ");

  return `Generate a full mystery package using the provided bundles and elements. Do not invent mechanics outside the bundles.

Clue bundles (each butler clue must use its 1 template; each inspector note uses its 1 template):
${params.storySpec.cluePlan
  .map((bundle, index) => `- Butler clue ${index + 1}: ${formatBundle(bundle)}`)
  .join("\n")}
${params.storySpec.inspectorPlan
  .map((bundle, index) => `- Inspector note ${index + 1}: ${formatBundle(bundle)}`)
  .join("\n")}

Binding rules: placeholders marked sol must use the answer key; placeholders marked non must not use the answer key.

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
