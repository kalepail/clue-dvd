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
- Do not reveal the answer until the closing.

You are writing a small, human mystery story first, and a logic puzzle second.`;

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

  return `Assume the role of a classic British mystery novelist in the style of Agatha Christie.

Before thinking about puzzles or clues, imagine you are writing a short chapter of a country-house mystery:

- The house, the guests, and the servants are your cast.
- The evening is defined by small social tensions, quiet motives, mild embarrassments, polite rivalries, and unspoken intentions.
- People wait for one another, avoid one another, misinterpret one another, or use small social moments as excuses.
- Ordinary routines (tea, lamps, staff duties) continue while something subtle and improper occurs.

Think like a novelist:
- What does each person want?
- Who is irritated, curious, jealous, embarrassed, or impatient?
- What small, human moment creates the opportunity?
- What is seen, what is half-seen, and what is merely assumed?

You may draw inspiration from the style and narrative thinking of classic Christie-era mysteries (without copying any specific story).

Write this scene fully in your head. Do NOT output it.

Now imagine you are also the editor adapting that chapter into a fair-play mystery puzzle.

Guiding principle:
This is not a puzzle about floorplans. It is a story about people. The puzzle must emerge from the social drama, not the other way around.

Tone:
Polite, restrained, civilized — with quiet tensions, small vanities, and unspoken motives underneath.

How to choose what each clue is about:
Prefer:
- overheard or reported conversations
- awkward encounters
- social avoidance or social pursuit
- small favors, borrowings, or obligations
- someone waiting for a moment, or for a room to clear
- someone being flustered, annoyed, embarrassed, or too curious

Use rooms and times only when they naturally arise from these human situations, not as the main point of the clue.

Structure:
Do not try to account for everyone’s entire evening. Most of it was dull.
Focus only on the handful of moments that created:
- misunderstandings
- cover stories
- mistaken assumptions
- or quiet opportunities

One or two early clues may clear away a large group of suspects at once (a shared event, staff routine, or public moment).
After that, the narrative should naturally narrow to 3–4 plausible people.

Item handling:
Do not explicitly state in any clue that a specific item is missing or stolen.
Clues may describe disturbed displays, absences, or unease, but the exact stolen item should only be confirmed in the opening or the closing.

Subtle inconsistency:
Include one quiet, easy-to-miss inconsistency or mistaken assumption that points to the truth.
Prefer a social or conversational inconsistency over a purely physical one.
Hide it in someone else’s remark or a staff observation, not in the culprit’s own statement.
When a character tells an important lie, do not reveal the contradiction in the same clue. Let the lie stand on its own. The conflicting fact must appear in a different, later clue, in a different voice, without explicitly referencing the lie.

Inspector notes:
The inspector is not explaining the genre.
The inspector is summarizing patterns of behavior, social friction, or timeline oddities specific to this household and this night.

They must never talk about:
- “no forced entry”
- “no tools”
- “someone familiar with the house”
or any other generic mystery-novel assumptions.

They should talk only about what is peculiar in THIS case.

Anti-mechanical principle:
No single clue should, by itself, identify the culprit, the item, or the room. The truth should only become clear when several human details are considered together.
Imagine these statements were written down before anyone knew what detail would prove important. People are not defending places or objects; they are simply recounting their own small, human concerns of the evening. Any importance a room or object has should only become clear in hindsight.

After writing, do a silent editor’s pass to ensure:
- No clue explicitly states which item is missing.
- only reference a room,item,suspect,or time that is relevant - not considered only because its the answer
- The solution is not given away by any single line.

Available elements:
Suspects: ${params.suspectList.join(", ")}
Items: ${params.itemList.join(", ")}
Locations: ${params.locationList.join(", ")}
Times: ${params.timeList.join(", ")}

World reference (do not contradict):
- Theft only.
- 1920s British setting.
- Mr. Boddy owns all valuables.
- Use only the provided suspect/item/location/time names.
- Mrs. White and Rusty are staff; all others are guests.

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
