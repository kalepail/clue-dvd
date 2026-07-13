/**
 * V3 prompt builders.
 *
 * The single most important property of this engine: the prose model that
 * writes player-facing clues NEVER sees the answer, never sees candidate
 * counts, and never sees "this clue eliminates X". It receives neutral world
 * events (story seeds) and dresses them in Ashe's voice. It cannot telegraph
 * what it does not know — which is what finally fixes the "clues single out
 * the answer by their wording" problem of every earlier iteration.
 *
 * Only the closing prompt is answer-aware, exactly like the DVD's final
 * reveal narration.
 */

import type { SeededRandom } from "../services/seeded-random";
import { ORIGINAL_MYSTERIES } from "./original-mysteries";
import { ORIGINAL_MYSTERY_STYLE_GUIDE } from "./original-mystery-style";
import { SUSPECTS } from "./game-elements";
import type { OccasionSpine } from "./occasion-catalog";

export type StorySeed = {
  /** 1..12 reveal position. */
  position: number;
  deliverAs: "butler" | "note1" | "note2";
  clueNumber: number | null;
  /** Neutral description of the world event, no elimination language. */
  brief: string;
  /** Card names this clue is allowed to say out loud. */
  allowedNames: string[];
  /** Deterministic episode linkage. This is narrative continuity only and
   * carries no solution or elimination metadata. */
  episodeId?: string;
  episodeRole?: "setup" | "continuation" | "excuse" | "witness" | "claim" | "fused";
  /** Earlier Butler testimony whose lived scene this fragment continues. */
  continuesClueNumber?: number;
  /** Exact human-presence scope supplied by deterministic movement truth. */
  scopeMode?: "whole_household" | "named_only";
  /** The named people are continuously witnessed for the stated scene. */
  mustRemainPresent?: boolean;
  /** Spatial noun guard for a clue whose licensed settings are all outdoors. */
  locationSetting?: "indoor" | "outdoor" | "mixed";
};

export type DossierInput = {
  occasionFamily: string;
  occasionSpine: OccasionSpine;
  recentSignatures: string[];
  cast: Array<{ name: string; role: string; traits: string[] }>;
  colorNotes: string[]; // gathering labels, closures, repairs, thread causes
};

const CAST_WHITELIST_NOTE = `People who exist: the ten suspects, Mr. Boddy (the host and victim of the theft), Ashe the butler, and Inspector Brown. Mrs. White is the housekeeper and Rusty the gardener, and both are suspects. Never invent maids, footmen, valets, cooks, drivers, visitors, or named outsiders. In player-facing prose, never call anyone "staff"; name Mrs. White and Rusty or say "the household." Lore pronouns: Miss Scarlet, Mrs. White, Mrs. Peacock, Mrs. Meadow-Brook, and Lady Lavender use she/her; Colonel Mustard, Mr. Green, Professor Plum, Prince Azure, and Rusty use he/him.`;

/**
 * A per-game voice for Ashe — same butler, different mood, so ten mysteries
 * feel like ten evenings rather than one script re-run.
 */
const NARRATIVE_REGISTERS = [
  "fond and unhurried — a butler who has served this family thirty years and forgives them everything",
  "clipped and precise — a butler who notices everything and editorializes nothing",
  "gently wry — a butler whose every observation carries one raised eyebrow",
  "slightly hurried but dutiful — a butler still rattled by the whole affair, yet exact about what he observed",
  "confiding — a butler who leans in slightly, as if each testimony were between friends",
];

export function pickFewshots(rng: SeededRandom): { openings: string[]; clues: string[]; notes: string[]; closings: string[]; register: string } {
  // Draw example lines from across ALL ten original mysteries — a wider
  // stylistic gene pool per game — and pick a narrative register that
  // colors this case's whole telling.
  const allClues = rng.shuffle(ORIGINAL_MYSTERIES.flatMap((mystery) => mystery.butlerClues));
  const allNotes = rng.shuffle(ORIGINAL_MYSTERIES.flatMap((mystery) => mystery.inspectorNotes));
  return {
    openings: rng.pickMultiple(ORIGINAL_MYSTERIES, 2).map((mystery) => mystery.opening),
    clues: allClues.slice(0, 12),
    notes: allNotes.slice(0, 4),
    closings: rng.pickMultiple(ORIGINAL_MYSTERIES, 2).map((mystery) => mystery.closing),
    register: rng.pick(NARRATIVE_REGISTERS),
  };
}

// ---------------------------------------------------------------------------
// Stage 1: Dossier (answer-blind)
// ---------------------------------------------------------------------------

export function buildDossierPrompt(input: DossierInput): { system: string; prompt: string } {
  return {
    system: `You are the story editor for a new case of the 2006 Clue DVD Game, set at Tudor Mansion in the 1920s. You do NOT know who the thief is, what was stolen, where, or when — you only set the social stage. Return structured data only.`,
    prompt: `Invent the occasion that brings everyone to Tudor Mansion.

Occasion family to build on: ${input.occasionFamily}

The occasion spine below is FIXED WORLD TRUTH, authored before this call. Do
not replace it with a different event. Build the social mood and opening around
its main event, and reuse several of its activity and set-dressing nouns so the
opening belongs to the same lived day as the later testimony.
- Main event: ${input.occasionSpine.mainEvent}
- Day beats: ${input.occasionSpine.beats.map((beat) => beat.name).join(" -> ")}
- Activities already happening: ${input.occasionSpine.groupActivities.slice(0, 6).join(", ")}
- Props and set dressing already present: ${input.occasionSpine.setDressing.slice(0, 6).join(", ")}

The cast (all present):
${input.cast.map((member) => `- ${member.name}, ${member.role} (${member.traits.join(", ")})`).join("\n")}

${CAST_WHITELIST_NOTE}

True background details of the day you may weave in:
${input.colorNotes.map((note) => `- ${note}`).join("\n")}

Recent case signatures — make this occasion clearly different from all of them:
${input.recentSignatures.length > 0 ? input.recentSignatures.map((signature) => `- ${signature}`).join("\n") : "- None"}

Produce:
- title: an evocative case title (like "The Monte Carlo Affair").
- occasionName: what the fixed day is called in conversation.
- occasionSummary: 2-3 sentences on why Mr. Boddy has gathered everyone and what the mood is.
- hostReason: one sentence on what Mr. Boddy personally hopes the day achieves.
- mysterySignature: a compact fingerprint of this case, pipe-separated (occasion | social tension | texture), used to avoid repeats in future games.
- occasionTexture: a small cosmetic vocabulary derived from the fixed spine:
  - gatheringDetails: exactly one lowercase gerund phrase for EACH day beat listed above, in that exact order. Each phrase describes only what the company is doing inside its own beat; it must not look backward to a completed later event or forward to another beat. Keep the phrase local (for example, "comparing the newly drawn pairings"), with no day-part words.
  - inspectionContexts: 3-4 lowercase gerund phrases Ashe might be doing while checking rooms afterward.
  - observationContexts: 3-4 lowercase gerund phrases Ashe or Mrs. White might be doing when noticing valuables still in place. These must work at ANY point in the day: do not use "after," "back," "returned," "last," "final," "finished," or anything implying the occasion or a beat has ended.

The texture entries are reusable prose ingredients, NOT new world facts and NOT finished clues. Derive them from the fixed activities, props, and beats above rather than inventing a second theme. Include no suspect names, card valuables, room names, or printed time names. Every occasionTexture array must contain the requested material; never return an empty array.`,
  };
}

// ---------------------------------------------------------------------------
// Stage 2: Render (answer-blind)
// ---------------------------------------------------------------------------

export function buildRenderPrompt(params: {
  dossier: { title: string; occasionName: string; occasionSummary: string; hostReason: string };
  seeds: StorySeed[];
  fewshots: { openings: string[]; clues: string[]; notes: string[]; register: string };
}): { system: string; prompt: string } {
  const butlerSeeds = params.seeds.filter((seed) => seed.deliverAs === "butler");
  const note1 = params.seeds.find((seed) => seed.deliverAs === "note1");
  const note2 = params.seeds.find((seed) => seed.deliverAs === "note2");
  return {
    system: `You are Ashe, butler of Tudor Mansion, giving testimony after a theft — and the Inspector's clerk recording two case notes. You do NOT know who the thief is, what was taken, from where, or at what hour; you only recount what you and the household actually observed. Never speculate about guilt, never say a fact "rules out" or "clears" anyone, never address the players or the puzzle. Tonight your manner is ${params.fewshots.register}. Return structured data only.`,
    prompt: `A theft was discovered at Mr. Boddy's gathering: ${params.dossier.occasionName}.
${params.dossier.occasionSummary}

${CAST_WHITELIST_NOTE}

=== HOW THE ORIGINAL GAME SOUNDS (match this register exactly) ===

Openings from the original disc:
${params.fewshots.openings.map((opening) => `"${opening}"`).join("\n\n")}

Butler testimony from the original disc:
${params.fewshots.clues.map((clue) => `"${clue}"`).join("\n")}

Inspector's notes from the original disc:
${params.fewshots.notes.map((note) => `"${note}"`).join("\n")}

=== YOUR MATERIAL ===

Write the opening: 2-3 sentences devoted ONLY to why everyone has gathered and the social mood of the occasion. Do not mention a theft, anything missing, a discovery, an investigation, or any other mystery detail. Do not name any suspect, valuable, room, or time-of-day card in the opening.

Then write exactly ${butlerSeeds.length} butler testimonies, one per event below, in this order. Each is 1-2 sentences of concrete, first-hand household recollection. Aim for 22-38 words; a genuinely complex changing or scene-plus-evidence testimony may reach 60. Treat each event as evidence to dramatize, not a sentence template to paraphrase: rebuild its syntax around the lived action. Begin every testimony inside the remembered action, object, person, place, or time. Do not use the canned greetings "Coming --", "Hello --", or "Good day --" in this case, and do not begin more than two testimonies with the same first word. Each testimony must faithfully convey its event, including exactly which people it covers; do not drop, soften, or extend the stated scope (if everyone was present, say so plainly).

${butlerSeeds.map((seed) => `Testimony ${seed.clueNumber}: ${seed.brief}\n  Card names you may use in this testimony: ${seed.allowedNames.length > 0 ? seed.allowedNames.join(", ") : "none — keep it generic"}.${seed.scopeMode === "whole_household"
    ? `\n  Scope lock: this observation covers every suspect—the guests, Mrs. White, and Rusty. Preserve that whole-household scope explicitly.`
    : seed.scopeMode === "named_only"
      ? `\n  Scope lock: this observation covers only the people named in the event. Do not broaden them into "everyone," "the whole company," or any unnamed guests.`
      : ""}${seed.mustRemainPresent ? `\n  Movement lock: the covered people stayed in the stated scene. Do not say or imply that any of them slipped off, stepped out, broke away, or left.` : ""}${seed.locationSetting === "outdoor" ? `\n  Setting lock: every named location here is outdoors. Call it the garden, grounds, place, fountain, or scene—never a room or indoors.` : ""}${seed.continuesClueNumber ? seed.episodeRole === "claim"
    ? `\n  This attributed statement refers back to the lived scene in Testimony ${seed.continuesClueNumber}. Let the speaker's answer or the later questioning make that relationship clear. Do not force a "that same..." bridge, turn an activity into the sentence's subject, recap the earlier clue, or imply the statement is verified.`
    : `\n  This continues the lived scene in Testimony ${seed.continuesClueNumber}. Use one natural callback to its shared activity, prop, or interruption; do not force a "that same..." bridge, recap, or restart the scene.` : ""}`).join("\n\n")}

Then the two Inspector notes — one concise case-file sentence each, no greetings, no first person. Use "Ashe" if the source needs attribution; never write "the Butler," "Butler reports," or "per the butler." A note may record a guest's statement or uncertain recollection; in that case preserve the attribution and uncertainty exactly. The fact that a claim was made is factual, but its contents must never be promoted into verified truth:

Note 1: ${note1?.brief ?? ""}
  Card names allowed: ${note1 && note1.allowedNames.length > 0 ? note1.allowedNames.join(", ") : "none"}.

Note 2: ${note2?.brief ?? ""}
  Card names allowed: ${note2 && note2.allowedNames.length > 0 ? note2.allowedNames.join(", ") : "none"}.

Construction habits from the original cases:
${ORIGINAL_MYSTERY_STYLE_GUIDE.map((rule) => `- ${rule}`).join("\n")}

Card-name discipline is absolute: each testimony may name ONLY the card names listed for it (other proper names allowed: Mr. Boddy, Ashe, Inspector Brown, Dr. Black).

Rules of craft, strictly:
- Across the ten Butler testimonies, use no opening first word more than twice and no greeting-style openers.
- No two testimonies in this case may share a sentence skeleton. If one opens "During X, so-and-so were together in the Y…", no other may. Recast lists, vary openings, move the time to the middle or end of the sentence.
- When the same character concern or occasion motif recurs in multiple events, use it as connective tissue but describe it from a new observational angle each time. Never copy five consecutive words merely because the underlying thread is the same.
- Do not manufacture variety with empty interjections such as "Indeed --", "Quiet --", or "Well --". Begin with substance from the event.
- Occasion detail should make a fact feel lived, not padded. Use any one prop, decoration, or activity phrase at most twice across the whole case; never begin several inventory clues with the same thematic chore.
- A simple object-location or room-check event must still sound like recollection rather than a database entry: use the occasion task already supplied in its brief as the setting for Ashe's observation. Never invent another person, room, item, or printed hour to decorate it.
- Do not add apologies, asides, or self-commentary merely to lengthen a clue. Preserve Ashe's character through precise observation and restrained wit.
- When an event says someone slipped off, was evasive, was seen with something, or was heard arguing, report it and STOP. Never supply their innocent explanation, never soften it with "it turned out…" — suspicion is the point, and the reveal at game's end settles it.
- Some events describe an hour by the day's rhythm ("the lull after lunch", "the tail of the evening"). Keep that rhythm — do NOT sharpen it into a named hour.
- Some events are STATEMENTS — what a guest says or half-remembers, not what you saw. Keep them attributed and exactly as uncertain as given ("she says…", "he thinks he heard…"). You report the claim; you do not vouch for it.`,
  };
}

// ---------------------------------------------------------------------------
// Repair: re-render a single clue
// ---------------------------------------------------------------------------

export function buildClueRepairPrompt(params: {
  seed: StorySeed;
  previousText: string;
  problems: string[];
  fewshotClues: string[];
  earlierSceneText?: string;
  /** Another testimony whose phrasing this repair must not echo. */
  comparisonText?: string;
}): { system: string; prompt: string } {
  const isNote = params.seed.deliverAs !== "butler";
  return {
    system: `You are rewriting one ${isNote ? "Inspector's note" : "butler testimony"} for the 2006 Clue DVD Game. You do NOT know the case's answer. Return structured data only.`,
    prompt: `The event to convey:
${params.seed.brief}

Card names you may use: ${params.seed.allowedNames.length > 0 ? params.seed.allowedNames.join(", ") : "none — keep it generic"}.
Other names allowed: Mr. Boddy, Ashe, Inspector Brown, Dr. Black. ${CAST_WHITELIST_NOTE}
${params.seed.scopeMode === "whole_household"
  ? "Scope lock: preserve explicitly that every suspect—the guests, Mrs. White, and Rusty—was covered."
  : params.seed.scopeMode === "named_only"
    ? "Scope lock: only the people named in the event are covered. Do not broaden them into everyone, the whole company, or unnamed guests."
    : ""}
${params.seed.mustRemainPresent ? "Movement lock: the covered people remained in this scene. Do not say or imply that any of them slipped off, stepped out, broke away, or left." : ""}
${params.seed.locationSetting === "outdoor" ? "Setting lock: every named location here is outdoors. Call it the garden, grounds, place, fountain, or scene—never a room or indoors." : ""}

The previous version:
"${params.previousText}"
${params.seed.continuesClueNumber ? `\nThis fragment refers back to Testimony ${params.seed.continuesClueNumber}${params.earlierSceneText ? `, which read:\n"${params.earlierSceneText}"` : ""}. ${params.seed.episodeRole === "claim" ? "Let the speaker's answer or the later questioning carry the connection; do not force a 'that same...' bridge or imply the claim is verified." : "Connect through one shared action, prop, or interruption without repeating the setup or forcing a 'that same...' bridge."}` : ""}
${params.comparisonText ? `\nA different testimony already says:\n"${params.comparisonText}"\nThe recurring fact may remain, but rebuild its wording and sentence movement so these clues share no five-word run.` : ""}

Problems to fix:
${params.problems.map((problem) => `- ${problem}`).join("\n")}

Register examples from the original game:
${params.fewshotClues.map((clue) => `"${clue}"`).join("\n")}

Rewrite it: ${isNote ? "one concise case-file sentence in third person; preserve any attribution or uncertainty in the seed" : "1-2 sentences and preferably 22-38 words (60 maximum for a changing or scene-plus-evidence testimony) of first-hand butler recollection"}, faithfully conveying the event and its exact scope, using only the allowed names. The event is evidence, not a prose template; reconstruct the sentence rather than tracing its wording. Never begin with Hello, Coming, Good day, or an empty interjection—even when the reported problem concerns something else. If the problems mention its opener, begin with a genuinely different substantive first word. If a repeated phrase is a vague occasion-time expression from the event brief, paraphrase it with equally broad timing rather than copying it or sharpening it into a printed time card.`,
  };
}

// ---------------------------------------------------------------------------
// Closing (the ONLY answer-aware prose)
// ---------------------------------------------------------------------------

export function buildClosingPrompt(params: {
  answerNames: { suspect: string; item: string; location: string; time: string };
  dossierTitle: string;
  finalCandidates?: { suspects: string[]; items: string[]; locations: string[]; times: string[] };
  /** The thief's true motive — the WHY the closing finally supplies. */
  thiefMotive?: string;
  /** Private solved-world fact: the culprit occupied the answer room at the
   * answer hour. This may be narrated only after the accusation is solved. */
  opportunityReveal?: string;
  /** If the thief told a false alibi during the case, describe it here so
   * the closing can relish catching the lie. */
  lieReveal?: string;
  fewshotClosings: string[];
}): { system: string; prompt: string } {
  const field = params.finalCandidates;
  const categoryStatus = field ? [
    ["suspect", field.suspects, params.answerNames.suspect],
    ["valuable", field.items, params.answerNames.item],
    ["room", field.locations, params.answerNames.location],
    ["hour", field.times, params.answerNames.time],
  ].map(([label, candidates, answer]) => {
    const values = candidates as string[];
    return values.length === 1
      ? `- ${label}: public evidence fixed ${answer}.`
      : `- ${label}: ${values.length} possibilities remained; the dealt cards selected ${answer}.`;
  }).join("\n") : "";
  return {
    system: `You are the reveal narrator of the 2006 Clue DVD Game, congratulating the detectives and laying out the solved case. Return structured data only.`,
    prompt: `The case ("${params.dossierTitle}") is solved. The truth:
WHO: ${params.answerNames.suspect}
WHAT: the ${params.answerNames.item}
WHERE: the ${params.answerNames.location}
WHEN: ${params.answerNames.time}

Closing narrations from the original disc (match their warmth and finality,
but keep this reveal shorter and do not copy their logic):
${params.fewshotClosings.map((closing) => `"${closing}"`).join("\n\n")}
${field ? `
After all of that evidence, the field still standing was:
- suspects: ${field.suspects.join(", ")}
- valuables: ${field.items.join(", ")}
- rooms: ${field.locations.join(", ")}
- hours: ${field.times.join(", ")}
Category-by-category provenance (state this accurately):
${categoryStatus}
` : ""}
${params.opportunityReveal ? `Private solved-world fact, safe to reveal only now: ${params.opportunityReveal}.\n` : ""}${params.thiefMotive ? `The thief's true motive, revealed only now: ${params.thiefMotive}.\n` : ""}${params.lieReveal ? `A publicly exposed lie worth mentioning: ${params.lieReveal}.\n` : ""}
Write a crisp closing of 4-5 sentences, preferably under 150 words:
1. Congratulate the detectives briefly.
2. Describe the category provenance above accurately: the dealt cards resolved each category with multiple possibilities, while any one-name category was already fixed by public evidence. Never say "every category" if the statuses differ. Do not argue that a clue secretly proved one of the unresolved choices.
3. Reveal plainly that ${params.answerNames.suspect} took the ${params.answerNames.item} at the ${params.answerNames.location} at ${params.answerNames.time}, using the private opportunity fact above if supplied. Use the direct verb "took" for the theft; do not replace it with "slipped away," "made off," a route, or a motion verb.
4. Explain the supplied motive${params.lieReveal ? " and the exposed lie" : ""} without inventing any new witness, route, disguise, method, access detail, or evidence.

Do not cite or number clues. Do not connect an anonymous figure to the culprit. Do not reconstruct a proof from discovery bounds or item checks. The physical cards are intentionally part of the solution, so an honest reveal is more important than making the public testimony sound conclusive.`,
  };
}

// ---------------------------------------------------------------------------
// Shared whitelist for verification
// ---------------------------------------------------------------------------

export const NON_CARD_NAME_WHITELIST = [
  "Mr. Boddy",
  "Boddy",
  "Ashe",
  "Inspector Brown",
  "Brown",
  "Dr. Black",
  "Black",
  "Tudor Mansion",
  ...SUSPECTS.map((suspect) => suspect.displayName),
];
