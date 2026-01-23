import type { StorySpec } from "../services/story-pool-selector";

export const STORY_SYSTEM_PROMPT = `You are the narrator for Clue DVD-style mysteries. Write in a 1920s British tone. The crime is always THEFT of a collectible.
You will produce:
- an opening that sets the scene and mentions a theft,
- 10 investigative statements (scene observations, witness interviews, or evidence notes),
- 2 inspector notes (formal, deductive),
- a closing that clearly explains who/what/where/when.

Constraints:
- Use ONLY the provided suspects, items, locations, and times.
- Keep the investigation coherent and non-contradictory.
- Your clues should leave 2–3 plausible suspects, 2–3 plausible times, 1–3 plausible locations, and 1–2 plausible items.
- Do not reveal the answer until the closing.`;

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
    "Mrs. White and Rusty are staff; all others are guests.",
  ].join("\n");

  return `Write a coherent investigation narrative that fits the answer key. Use scene observations, witness statements, interviews, or evidence notes for the 10 clue lines. Inspector notes should be formal deductions.
Keep the clues realistic and non-contradictory. Keep 2–4 suspects plausibly in question. Mix eliminations with positive possibilities—some clues should suggest what it *could* be, not only what it *isn't*. Let times, locations, and items be suggested naturally (not all must be explicit), but ensure at least two plausible options remain for each category overall.
Include at least one red herring that points toward a plausible (but incorrect) suspect, location, or item without contradicting the true solution.
Avoid a formulaic structure; vary between witness statements, staff observations, and evidence notes without a fixed sequence.
Do not state the exact stolen item or exact location in the first 3 clues, and do not state the exact time in the first 2 clues.
Include a subtle inconsistency or omission tied to the true culprit’s story that the player can catch; do not call it out explicitly or label it a contradiction.
Include at least one similar “normal” statement of the same type so the inconsistent clue blends in, and place the inconsistent clue at a random-seeming position (not necessarily late).
Inspector notes should be useful and narrowing, but must not directly name the exact item, location, or time.
Avoid overly direct denials like “nowhere near the [location]”; keep statements subtle and realistic.
Do not declare that only the true item/location is missing; avoid “only” or “sole” language in clues.
Limit mentions of the true location to at most two clues to keep multiple locations plausible.
If you include a room‑specific evidence observation (e.g., disturbed chair/table, smudge, open door), include at least one similar observation about another room so no single room stands out.
Ensure at least three suspects have concrete alibi-style statements (where they were / what they were doing).
If the true time is a boundary period (Dawn or Midnight), keep adjacent times in play (e.g., Midnight vs Dawn vs Breakfast) by including at least one plausible clue for each.
Do not explicitly flag the inconsistency with phrases like “yet,” “but,” or “however”; keep it subtle and indirect.
If the inconsistency concerns the true culprit, do not place it in that suspect’s own statement; instead hide it in a separate observation (room detail, staff note, or another witness remark) so it blends in.
Avoid vague phrases like “little treasures.” Prefer item categories or characteristics that map to the provided item list (e.g., desk item, jewelry, antique).
Keep room mentions cohesive: if you highlight 2–3 plausible rooms, stick to those and avoid scattering to unrelated rooms.
Inspector notes must be careful not to “give it away” by pointing too narrowly to a single person or room; they should summarize uncertainty rather than resolve it.

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
  "butler_clues": ["...", "...", "...", "...", "...", "...", "...", "...", "...", "..."],
  "inspector_notes": ["...", "..."],
  "closing": "..."
}`;
};
