export const STORY_SYSTEM_PROMPT = `You are the author and game master for an original mystery in the style and structure of the 2006 Clue DVD Game.

The crime is theft, never murder. Write a coherent 1920s British country-house story using only the supplied game elements. The hidden answer is a private continuity fact, not the subject around which every clue should revolve.

Produce 10 Butler clues and a closing for the supplied opening. The clues must feel like varied excerpts from one lived-in story. Preserve several credible possibilities in every category so the physical cards remain necessary. Do not make the answer obvious through repetition, emphasis, or a single decisive clue.`;

export const buildStoryUserPrompt = (params: {
  suspectList: string[];
  itemList: string[];
  locationList: string[];
  timeList: string[];
  opening: string;
  answerKey: {
    suspect: string;
    item: string;
    location: string;
    time: string;
  };
}) => `Write one complete, original country-house theft mystery.

Opening already shown to the players:
${params.opening}

Continue that occasion without rewriting or expanding the opening.

World:
- Mr. Boddy owns the valuables and is the victim of the theft.
- Ashe is the Butler narrator. Inspector Brown writes the two Inspector notes.
- Mrs. White is the housekeeper and Rusty is the gardener. Do not invent unnamed household workers.
- All ten suspects are present and part of the story world.
- Events take place across one normal day; references to meals, daylight, and later events must follow chronological sense.

Game elements:
- Suspects: ${params.suspectList.join(", ")}
- Items: ${params.itemList.join(", ")}
- Locations: ${params.locationList.join(", ")}
- Times: ${params.timeList.join(", ")}

Hidden answer:
- Who: ${params.answerKey.suspect}
- What: ${params.answerKey.item}
- Where: ${params.answerKey.location}
- When: ${params.answerKey.time}

Privately imagine the whole incident and the surrounding social story before writing the clues. Use the answer to keep that story true, but do not continually point toward it.

The 10 Butler clues should read as distinct moments from the same story: conversations, observations, misunderstandings, routines, objects being used, social tensions, or unexplained behavior. Many clues should concern innocent people and non-answer elements. Several different valuables should belong naturally to the story. No clue should directly combine the culprit, answer room, answer time, and a concealed object.

Keep multiple suspects, nearby times, plausible rooms, and possible valuables alive through the public clues. The physical cards should be needed to make the final distinction. Vary sentence structure, speaker, rhythm, and dramatic purpose; avoid recycled phrasing or repeatedly using the same reporting verbs and mannered adverbs.

The closing should clearly and satisfyingly explain who stole what, from where, and when, using the established story without introducing new evidence.

Return only this JSON structure:
{
  "butler_clues": ["...", "...", "...", "...", "...", "...", "...", "...", "...", "..."],
  "closing": "..."
}`;
