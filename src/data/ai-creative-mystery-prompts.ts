import type { Answer, CreativeAudit, CreativeMystery } from "../services/ai-mystery-schemas";

export type MysteryWorld = {
  suspects: Array<{ id: string; name: string; role: string; traits: string[] }>;
  items: Array<{ id: string; name: string; category: string; description: string }>;
  locations: Array<{ id: string; name: string; adjacentRooms: string[]; secretPassageTo: string | null }>;
  times: Array<{ id: string; name: string; order: number; activities: string[] }>;
};

export function buildCreativeMysteryPrompt(params: {
  answer: Answer;
  world: MysteryWorld;
  occasionFamily: string;
  recentSignatures: string[];
}): { system: string; prompt: string } {
  const answerNames = resolveAnswerNames(params.answer, params.world);
  return {
    system: `You are a gifted mystery writer creating a new case for the 2006 Clue DVD Game. Write an original, entertaining, fair-play THEFT mystery set at Tudor Mansion. You have broad creative freedom. Think through the hidden truth first, then tell it through natural story fragments rather than mechanical elimination statements. Return structured data only.`,
    prompt: `Create one complete mystery using this verified game world.

The immutable solution selected by the application:
WHO: ${params.answer.suspectId} — ${answerNames.suspect}
WHAT: ${params.answer.itemId} — ${answerNames.item}
WHERE: ${params.answer.locationId} — ${answerNames.location}
WHEN: ${params.answer.timeId} — ${answerNames.time}

Suggested occasion family: ${params.occasionFamily}

Complete verified world data:
${JSON.stringify(params.world, null, 2)}

Recent mystery signatures to avoid repeating:
${params.recentSignatures.length ? params.recentSignatures.join("\n") : "None"}

Nonnegotiables only:
- This is theft, never murder. The solution is exactly the supplied WHO, WHAT, WHERE, and WHEN.
- Use only the supplied suspects, valuables, locations, times, roles, traits, and Tudor Mansion geography. All ten suspects are at the gathering. Inspector Brown and Ashe are non-suspect investigators. Do not invent housemaids, servants, or unnamed witnesses; Mrs. White and Rusty already fill the household roles in this cast.
- Invent a compelling reason everyone is together and a coherent hidden truth: what happened, why it happened, how it was done, and what innocent or dishonest behavior complicated the investigation.
- The opening is a brief two-to-four-sentence introduction establishing why everyone gathered and the social atmosphere. Do not name any card item, printed game time, or game location, and do not foreground the culprit.
- Write exactly ten clues as varied story excerpts from this one mystery. Testimony, observations, misunderstandings, lies, relationships, object history, and contradictions are all available to you.
- Pace suspicion like a good mystery: the first half should open several credible interpretations, not assemble the solution. Separate facts about the true suspect, item, place, and time across the case; do not stack motive, opportunity, possession, and answer details in consecutive clues. Let two or more innocent stories temporarily feel important. Convergence belongs mainly in the final three clues, and even then players must connect the facts themselves.
- Write two useful Inspector notes that add overlooked facts or connections. They must not dismiss a suspect, identify the most important thread, or interpret the evidence for the player.
- The closing reveals the exact solution and explains it using information already present in the clues and notes.
- The mystery should be reasonably solvable, but it does not need artificial candidate quotas or equal category coverage. Physical cards can help make the final distinction.

Everything else is your creative decision. Do not produce evidence IDs, elimination metadata, timelines, graphs, movement records, clue classifications, or rule commentary. The privateCaseSummary is hidden from players and should plainly describe the true case so the public pieces remain coherent.`,
  };
}

export function buildCreativeAuditPrompt(params: {
  mystery: CreativeMystery;
  world: MysteryWorld;
}): { system: string; prompt: string } {
  return {
    system: `You are playtesting a theft mystery without access to its answer or private case summary. Experience it in reveal order. Commit to what a real player would currently suspect rather than trusting the writer's intended difficulty. Return structured data only.`,
    prompt: `Read this player-facing mystery in reveal order.

Opening:
${params.mystery.opening}

First-half clues — form earlyTheory from these five alone:
${params.mystery.clues.slice(0, 5).map((clue, index) => `${index + 1}. ${clue}`).join("\n")}

Inspector Note 1, available after clue 5:
${params.mystery.inspectorNotes[0]?.text ?? "None"}

Remaining clues — read only after committing to earlyTheory:
${params.mystery.clues.slice(5).map((clue, index) => `${index + 6}. ${clue}`).join("\n")}

Inspector Note 2, available later:
${params.mystery.inspectorNotes[1]?.text ?? "None"}

Closing:
${params.mystery.closing}

Verified card names:
${JSON.stringify(compactWorld(params.world), null, 2)}

First, stop after clue 5. Without reading clues 6–10, choose the single WHO, WHAT, WHERE, and WHEN theory you would currently bet on using the supplied card IDs, and report your confidence. Then read the remainder and judge these questions:
- Do the fragments feel like parts of one coherent mystery?
- Could players form and defend a reasonable solution from what they receive?
- Is the answer avoided as an obvious conclusion during the first half?
- Does the closing rely on facts that were actually available?

Do not demand equal mentions, exact candidate counts, formal evidence graphs, or a particular clue style. Give concise feedback only when a rewrite would materially improve playability.`,
  };
}

export function buildCreativeRevisionPrompt(params: {
  answer: Answer;
  world: MysteryWorld;
  mystery: CreativeMystery;
  audit: CreativeAudit;
}): { system: string; prompt: string } {
  const answerNames = resolveAnswerNames(params.answer, params.world);
  return {
    system: `You are revising an original 2006 Clue DVD theft mystery. Preserve its strongest creative ideas and rewrite only as much as needed to make it coherent, playable, and fairly solvable without becoming mechanical. Return the complete structured mystery.`,
    prompt: `Revise this mystery once using the blind playtest feedback.

Immutable solution:
WHO: ${params.answer.suspectId} — ${answerNames.suspect}
WHAT: ${params.answer.itemId} — ${answerNames.item}
WHERE: ${params.answer.locationId} — ${answerNames.location}
WHEN: ${params.answer.timeId} — ${answerNames.time}

Blind feedback:
${JSON.stringify(params.audit, null, 2)}

Current mystery:
${JSON.stringify(params.mystery, null, 2)}

Verified world:
${JSON.stringify(params.world, null, 2)}

Keep exactly ten clues and two Inspector notes. Keep the opening free of card items, printed times, game locations, theft details, and culprit emphasis. If the early theory converged on the true answer, rewrite the first seven clues using narrative misdirection: separate true facts, shift consecutive attention to other guests and objects, and strengthen innocent explanations without inserting false evidence. Inspector notes should add facts, not tell players which thread matters. Keep the closing grounded in earlier information. Do not add evidence IDs, elimination quotas, graphs, or mechanical clue labels.`,
  };
}

function resolveAnswerNames(answer: Answer, world: MysteryWorld) {
  return {
    suspect: world.suspects.find(({ id }) => id === answer.suspectId)?.name ?? answer.suspectId,
    item: world.items.find(({ id }) => id === answer.itemId)?.name ?? answer.itemId,
    location: world.locations.find(({ id }) => id === answer.locationId)?.name ?? answer.locationId,
    time: world.times.find(({ id }) => id === answer.timeId)?.name ?? answer.timeId,
  };
}

function compactWorld(world: MysteryWorld) {
  return {
    suspects: world.suspects.map(({ id, name }) => ({ id, name })),
    items: world.items.map(({ id, name }) => ({ id, name })),
    locations: world.locations.map(({ id, name }) => ({ id, name })),
    times: world.times.map(({ id, name }) => ({ id, name })),
  };
}
