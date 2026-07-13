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
import type { EvidenceCapsule } from "../shared/evidence";
import { ORIGINAL_MYSTERIES } from "./original-mysteries";
import { ORIGINAL_MYSTERY_STYLE_GUIDE } from "./original-mystery-style";
import { SUSPECTS } from "./game-elements";

export type StorySeed = {
  /** 1..12 reveal position. */
  position: number;
  deliverAs: "butler" | "note1" | "note2";
  clueNumber: number | null;
  /** Neutral description of the world event, no elimination language. */
  brief: string;
  /** Card names this clue is allowed to say out loud. */
  allowedNames: string[];
  /** Deterministic fact the generated prose must faithfully convey. */
  evidence: EvidenceCapsule;
};

export type DossierInput = {
  occasionFamily: string;
  recentSignatures: string[];
  cast: Array<{ name: string; role: string; traits: string[] }>;
  colorNotes: string[]; // gathering labels, closures, repairs, thread causes
};

const CAST_WHITELIST_NOTE = `People who exist: the ten suspects, Mr. Boddy (the host and victim of the theft), Ashe the butler, and Inspector Brown. Mrs. White is the housekeeper and Rusty the gardener — they are suspects and the ONLY household staff. Never invent maids, footmen, valets, cooks, drivers, visitors, or named outsiders.`;

export function pickFewshots(rng: SeededRandom): { openings: string[]; clues: string[]; notes: string[]; closings: string[] } {
  const picks = rng.pickMultiple(ORIGINAL_MYSTERIES, 3);
  const clues: string[] = [];
  for (const mystery of picks) {
    for (const clue of rng.pickMultiple(mystery.butlerClues, Math.min(3, mystery.butlerClues.length))) {
      clues.push(clue);
    }
  }
  return {
    openings: picks.slice(0, 2).map((mystery) => mystery.opening),
    clues,
    notes: picks.flatMap((mystery) => mystery.inspectorNotes.slice(0, 2)).slice(0, 4),
    closings: picks.slice(0, 2).map((mystery) => mystery.closing),
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

The cast (all present):
${input.cast.map((member) => `- ${member.name}, ${member.role} (${member.traits.join(", ")})`).join("\n")}

${CAST_WHITELIST_NOTE}

True background details of the day you may weave in:
${input.colorNotes.map((note) => `- ${note}`).join("\n")}

Recent case signatures — make this occasion clearly different from all of them:
${input.recentSignatures.length > 0 ? input.recentSignatures.map((signature) => `- ${signature}`).join("\n") : "- None"}

Produce:
- title: an evocative case title (like "The Monte Carlo Affair").
- occasionName: what the day is called in conversation (e.g. "the subscription committee luncheon").
- occasionSummary: 2-3 sentences on why Mr. Boddy has gathered everyone and what the mood is.
- hostReason: one sentence on what Mr. Boddy personally hopes the day achieves.
- mysterySignature: a compact fingerprint of this case, pipe-separated (occasion | social tension | texture), used to avoid repeats in future games.`,
  };
}

// ---------------------------------------------------------------------------
// Stage 2: Render (answer-blind)
// ---------------------------------------------------------------------------

export function buildRenderPrompt(params: {
  dossier: { title: string; occasionName: string; occasionSummary: string; hostReason: string };
  seeds: StorySeed[];
  fewshots: { openings: string[]; clues: string[]; notes: string[] };
}): { system: string; prompt: string } {
  const butlerSeeds = params.seeds.filter((seed) => seed.deliverAs === "butler");
  const note1 = params.seeds.find((seed) => seed.deliverAs === "note1");
  const note2 = params.seeds.find((seed) => seed.deliverAs === "note2");
  return {
    system: `You are Ashe, butler of Tudor Mansion, giving testimony after a theft — and the Inspector's clerk recording two case notes. You do NOT know who the thief is, what was taken, from where, or at what hour; you only recount what you and the household actually observed. Never speculate about guilt, never say a fact "rules out" or "clears" anyone, never address the players or the puzzle. Return structured data only.`,
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

Write the opening: 2-4 sentences introducing the occasion (use the summary above) and ending on the discovery that something has been stolen. Do not name any suspect, valuable, room, or time-of-day card in the opening.

Then write exactly ${butlerSeeds.length} butler testimonies, one per event below, in this order. Each is 1-3 sentences of concrete, first-hand household recollection — like the examples, they may open with a small greeting ("Coming --", "Hello --", "Good day --") on some but not all. Each testimony must faithfully convey its event, including exactly which people it covers; do not drop, soften, or extend the stated scope (if everyone was present, say so plainly).

${butlerSeeds.map((seed) => `Testimony ${seed.clueNumber}: ${seed.brief}\n  Card names you may use in this testimony: ${seed.allowedNames.length > 0 ? seed.allowedNames.join(", ") : "none — keep it generic"}.`).join("\n\n")}

The deterministic fact printed beside each testimony is authoritative. Your prose may add voice, but must not contradict or broaden it:
${butlerSeeds.map((seed) => `Testimony ${seed.clueNumber}: ${seed.evidence.statement}`).join("\n")}

Then the two Inspector notes — one dry factual sentence each, no greetings, no first person:

Note 1: ${note1?.brief ?? ""}
  Card names allowed: ${note1 && note1.allowedNames.length > 0 ? note1.allowedNames.join(", ") : "none"}.
  Job: a cross-index note. State the exact fact so a player can connect it to the public testimony numbered in the case file; do not speculate.

Note 2: ${note2?.brief ?? ""}
  Card names allowed: ${note2 && note2.allowedNames.length > 0 ? note2.allowedNames.join(", ") : "none"}.
  Job: a late discriminator or reconciliation. State the exact fact crisply; if it resolves suspicious behavior, make the innocent explanation explicit.

Construction habits from the original cases:
${ORIGINAL_MYSTERY_STYLE_GUIDE.map((rule) => `- ${rule}`).join("\n")}

Card-name discipline is absolute: each testimony may name ONLY the card names listed for it (other proper names allowed: Mr. Boddy, Ashe, Inspector Brown, Dr. Black). Vary sentence shapes and greetings across testimonies so no two feel stamped from one mould.`,
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
}): { system: string; prompt: string } {
  const isNote = params.seed.deliverAs !== "butler";
  return {
    system: `You are rewriting one ${isNote ? "Inspector's note" : "butler testimony"} for the 2006 Clue DVD Game. You do NOT know the case's answer. Return structured data only.`,
    prompt: `The event to convey:
${params.seed.brief}

Authoritative fact (do not contradict or broaden it):
${params.seed.evidence.statement}

Card names you may use: ${params.seed.allowedNames.length > 0 ? params.seed.allowedNames.join(", ") : "none — keep it generic"}.
Other names allowed: Mr. Boddy, Ashe, Inspector Brown, Dr. Black. ${CAST_WHITELIST_NOTE}

The previous version:
"${params.previousText}"

Problems to fix:
${params.problems.map((problem) => `- ${problem}`).join("\n")}

Register examples from the original game:
${params.fewshotClues.map((clue) => `"${clue}"`).join("\n")}

Rewrite it: ${isNote ? "one dry factual sentence, third person" : "1-3 sentences of first-hand butler recollection"}, faithfully conveying the event and its exact scope, using only the allowed names.`,
  };
}

// ---------------------------------------------------------------------------
// Closing (the ONLY answer-aware prose)
// ---------------------------------------------------------------------------

export function buildClosingPrompt(params: {
  answerNames: { suspect: string; item: string; location: string; time: string };
  dossierTitle: string;
  /** Complete public Butler record, in clue order. Never private notes. */
  publicEvidence: EvidenceCapsule[];
  fewshotClosings: string[];
}): { system: string; prompt: string } {
  return {
    system: `You are selecting the tone and two citations for the reveal of a solved 2006 Clue DVD Game case. Deterministic code will write every factual sentence. Return structured data only.`,
    prompt: `The case ("${params.dossierTitle}") is solved. The truth:
WHO: ${params.answerNames.suspect}
WHAT: the ${params.answerNames.item}
WHERE: the ${params.answerNames.location}
WHEN: ${params.answerNames.time}

Closing narrations from the original disc:
${params.fewshotClosings.map((closing) => `"${closing}"`).join("\n\n")}

The complete public Butler record, in clue order:
${params.publicEvidence.map((entry, index) => `${index + 1}. ${entry.factId}: ${entry.statement}`).join("\n")}

This is a post-solve reconstruction from the complete public Butler record. A correct accusation may have happened before every Butler clue was summoned, so never claim that every statement was heard at the table. Private Inspector notes are not included and must not be quoted or implied.

Return:
- salute: one short, fact-free congratulatory sentence in the register of the examples (for example, "Splendid work, detectives."). Do not name a person, item, room, or hour and do not make an evidence claim.
- citedFactIds: exactly two fact IDs copied from the public record above. Prefer formal facts that create useful boundaries around the solution; never invent an ID.

Do not write the factual closing itself. Deterministic code will quote the selected facts verbatim, credit the detectives' dealt cards, suggestions, and deduction, and state that ${params.answerNames.suspect} took the ${params.answerNames.item} from the ${params.answerNames.location} at ${params.answerNames.time}.`,
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
