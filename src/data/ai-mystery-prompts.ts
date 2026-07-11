import type {
  Answer,
  BlindAudit,
  CausalTimeline,
  CaseBible,
  EvidenceDesign,
  InspectorPackage,
  RenderedMystery,
  StoryFoundation,
} from "../services/ai-mystery-schemas";
import { ORIGINAL_MYSTERY_STYLE_GUIDE } from "./original-mystery-style";

export type MysteryWorld = {
  suspects: Array<{ id: string; name: string; role: string; traits: string[] }>;
  items: Array<{ id: string; name: string; category: string; description: string }>;
  locations: Array<{ id: string; name: string; adjacentRooms: string[]; secretPassageTo: string | null }>;
  times: Array<{ id: string; name: string; order: number; activities: string[] }>;
};

function compactWorld(world: MysteryWorld) {
  return {
    suspects: world.suspects.map(({ id, name, role }) => ({ id, name, role })),
    items: world.items.map(({ id, name, category }) => ({ id, name, category })),
    locations: world.locations.map(({ id, name }) => ({ id, name })),
    times: world.times.map(({ id, name, order }) => ({ id, name, order })),
  };
}

export type CandidateEffectPlan = {
  clues: Array<{ position: number; rulesOut: CaseBible["clueBlueprints"][number]["rulesOut"] }>;
  inspector: Array<{ id: "N1" | "N2"; availableAfterClue: 5 | 7; rulesOut: CaseBible["inspectorEvidence"][number]["rulesOut"] }>;
};

export function buildFoundationPrompt(params: {
  answer: Answer;
  world: MysteryWorld;
  occasionFamily: string;
  recentSignatures: string[];
}): { system: string; prompt: string } {
  return {
    system: `You are the story architect for a fair-play 2006 Clue DVD Game theft mystery. Design only the social and emotional foundation. Do not design clue mechanics, evidence IDs, or timeline event IDs. Use the structured tool directly.`,
    prompt: `Design the foundation of one original theft mystery.

Immutable answer:
${JSON.stringify(params.answer, null, 2)}

Occasion family selected independently from the answer:
${params.occasionFamily}

Verified world:
${JSON.stringify(params.world, null, 2)}

Recent signatures to avoid:
${params.recentSignatures.length ? params.recentSignatures.join("\n") : "None"}

Requirements:
- Theft only. Mr. Boddy owns the valuables. Ashe and Inspector Brown are non-suspect investigators.
- All ten suspects are present. Mrs. White is the housekeeper; Rusty is the gardener. Invent no unnamed workers.
- Use the selected occasion family exactly as the basis of the gathering, but provide only its title, purpose, and social schedule; application code supplies the family field.
- Give each verified suspect exactly one cast entry, a meaningful event role, a private goal, and at least one relationship to another verified suspect.
- Build one central social tension that naturally connects several guests. The culprit's motive must be specific and human, while innocent goals should be capable of creating believable suspicion later.
- Explain the theft's motive, access, opportunity, physical method, concealment, cover story, and eventual discovery as one causal chain.
- Do not write clues, evidence, event IDs, card eliminations, Inspector timing, or prose for players. Those belong to later stages.`,
  };
}

export function buildTimelinePrompt(params: {
  foundation: StoryFoundation;
  answer: Answer;
  world: MysteryWorld;
  trackedItemIds: string[];
}): { system: string; prompt: string } {
  return {
    system: `You are the causal simulator for a fair-play theft mystery. Convert the supplied story foundation into a physically coherent day. Do not design clues or candidate eliminations. Use the structured tool directly.`,
    prompt: `Simulate the hidden timeline for this mystery.

Immutable answer:
${JSON.stringify(params.answer, null, 2)}

Story foundation:
${JSON.stringify(params.foundation, null, 2)}

Verified world:
${JSON.stringify(params.world, null, 2)}

Tracked items selected by application code (use every one, invent no others):
${params.trackedItemIds.join(", ")}

Requirements:
- Events are divided into explicit phases. Keep every event in chronological printed-time order within and across phases.
- Application code fixes the theft event at ${params.answer.timeId} in ${params.answer.locationId} and automatically includes culprit ${params.answer.suspectId} and item ${params.answer.itemId}; do not repeat those two fixed fields in the theft object.
- The discovery event must occur later than the theft. The between and after phases must use times at or after ${params.answer.timeId}.
- Make every suspect participate in at least one event. Witnesses must truly be able to observe the stated event.
- An arrival means its actor ends at that event's location. List the actor among participants and every carried item among event items; code reinforces those memberships.
- Whenever a tracked item next appears in a different location, include an arrival at that destination carrying it from its previous location. Use secret_passage only for a verified pair.
- Give each tracked item exactly one item role. Build all events from the supplied foundation rather than adding unrelated incidents.
- Do not create event IDs, movement IDs, cast action lists, or item-thread event lists. Application code derives them from this structure.`,
  };
}

export function buildEvidencePrompt(params: {
  foundation: StoryFoundation;
  bibleContext: Pick<CaseBible, "answer" | "theft" | "cast" | "timeline" | "movements" | "itemThreads">;
  candidatePlan: CandidateEffectPlan;
  world: MysteryWorld;
}): { system: string; prompt: string } {
  return {
    system: `You are the evidence designer for a fair-play theft mystery. Derive truthful evidence, motivated deception, and multi-piece deductions only from the supplied hidden reality. Use the structured tool directly.`,
    prompt: `Design the evidence layer for this already-simulated mystery.

Story foundation:
${JSON.stringify(params.foundation, null, 2)}

Hidden reality:
${JSON.stringify(params.bibleContext, null, 2)}

Verified card reference:
${JSON.stringify(compactWorld(params.world), null, 2)}

Code-selected candidate-accounting targets:
${JSON.stringify(params.candidatePlan, null, 2)}

Requirements:
- Create at least fourteen evidence atoms with unique short keys. Every atom must cite a real event ID and state one specific, publicly discoverable fact.
- Mark each atom for exactly one surface: clue, inspector_1, or inspector_2. Reserve genuinely new facts for both Inspector surfaces.
- Create two to four motivated lies or omissions: at least one by the culprit and one by an innocent suspect. Every contradiction key must identify a real public evidence atom.
- Create two or three innocent suspicious threads that resolve through real evidence.
- Important inferences must combine at least two evidence keys and must be revealable on at least two separate public pieces later.
- Categories are only suspect, item, location, or time.
- The candidate targets are private balancing constraints. Evidence must make those accounts logically defensible within the story; do not turn the mystery into a list of eliminations.
- Do not assign clues, Inspector timing, final IDs, or player-facing prose.`,
  };
}

export function buildCluePlanPrompt(params: {
  foundation: StoryFoundation;
  bibleContext: Pick<CaseBible, "answer" | "theft" | "cast" | "timeline" | "itemThreads">;
  evidence: EvidenceDesign;
  candidatePlan: CandidateEffectPlan;
  world: MysteryWorld;
}): { system: string; prompt: string } {
  return {
    system: `You are the deduction editor for a fair-play theft mystery. Arrange existing evidence into one reconstructable ten-piece story. Do not invent facts or alter the hidden reality. Use the structured tool directly.`,
    prompt: `Map the evidence into ten clue slots, two Inspector evidence slots, and an evidence-grounded closing.

Story foundation:
${JSON.stringify(params.foundation, null, 2)}

Hidden reality:
${JSON.stringify(params.bibleContext, null, 2)}

Evidence design:
${JSON.stringify(params.evidence, null, 2)}

Verified card reference:
${JSON.stringify(compactWorld(params.world), null, 2)}

Code-selected candidate-accounting targets:
${JSON.stringify(params.candidatePlan, null, 2)}

Requirements:
- Fill clue1 through clue10 exactly. Use only evidence marked surface=clue in clue slots.
- Most clues must belong to a thread used by another clue. Every payoff needs an earlier setup. Spread important-inference evidence across different slots.
- Each clue should expose one useful story fragment and should naturally support its assigned candidate targets without naming mechanical eliminations.
- note1 may use only inspector_1 evidence and relate only to clues 1–5. note2 may use only inspector_2 evidence and relate only to clues 1–7.
- Inspector evidence must be new, factual, and connected to already available clues; it must not announce a theory.
- Closing keys must all be exposed by a clue or Inspector slot and collectively support WHO, WHAT, WHERE, and WHEN without introducing new facts.
- Do not output clue numbers, note IDs, reveal timing, rulesOut arrays, answerDimensions, or final evidence IDs. Application code owns those mechanics.`,
  };
}

export function buildRendererPrompt(params: {
  bible: CaseBible;
  world: MysteryWorld;
}): { system: string; prompt: string } {
  return {
    system: `You are the narrator for an original 1920s British Clue DVD-style theft mystery. Render the supplied case bible faithfully. Do not redesign the case. The clues are fragments of one causal story, not ten unrelated suspicious anecdotes. Return structured data only.`,
    prompt: `Render this private case bible into the player-facing mystery.

Case bible:
${JSON.stringify(params.bible, null, 2)}

Name reference:
${JSON.stringify(params.world, null, 2)}

Original-game construction style (principles only; never copy source wording):
${ORIGINAL_MYSTERY_STYLE_GUIDE.map((principle) => `- ${principle}`).join("\n")}

Requirements:
- Opening: 2–4 sentences explaining only why Mr. Boddy gathered everyone. No theft, investigation, suspect name, card item, game location, meal, or printed time.
- Clues: exactly ten concise, one-to-three-sentence entries matching clueBlueprint positions. Each clue must express its assigned evidence naturally through testimony, observation, behavior, or an object in use.
- Preserve each blueprint's evidenceIds exactly in its rendered clue. These IDs are private provenance, not prose.
- Preserve every lie, innocent secret, setup, payoff, and timeline fact from the bible. Do not add unrelated incidents.
- When one fragment recalls multiple events, preserve their printed-time chronology even if clue positions reveal the day out of order.
- Vary source, syntax, rhythm, and dramatic function. Avoid repeated reporting verbs, mannered adverbs, and sentence frames.
- Do not call any item missing or stolen in a clue. Do not combine culprit, answer location, answer time, and concealment in one clue.
- Closing: reveal WHO/WHAT/WHERE/WHEN and explain the method using only closingEvidenceIds and facts already available to players. Add no evidence, confession, recovery location, pawnshop, or motive not in the bible.
- Preserve the case bible's closingEvidenceIds exactly.

Return:
{
  "opening":"...",
  "clues":[{"position":1,"text":"...","evidenceIds":["A01"]} ... through 10],
  "closing":"...",
  "closingEvidenceIds":["A01","A02","A03","A04"]
}`,
  };
}

export function buildInspectorPrompt(params: {
  bible: CaseBible;
  mystery: RenderedMystery;
  world: MysteryWorld;
}): { system: string; prompt: string } {
  return {
    system: `You write Inspector Brown's factual case notes for the 2006 Clue DVD Game. The notes add true evidence from the private case bible; they are not theories, summaries, or generic advice. Return structured data only.`,
    prompt: `Render the two reserved Inspector evidence records.

Reserved evidence:
${JSON.stringify(params.bible.inspectorEvidence, null, 2)}

Clues already available:
${JSON.stringify(params.mystery.clues, null, 2)}

Answer values that must never be written in either note:
${JSON.stringify(params.bible.answer, null, 2)}

Name reference:
${JSON.stringify(params.world, null, 2)}

Requirements:
- N1 is factual new evidence available after clue 5; N2 is factual new evidence available after clue 7.
- Express only the reserved fact in one or two short sentences. Do not add a theory, conclusion, or facts absent from the bible.
- Never write an answer card or combine multiple answer dimensions.
- Non-answer cards may be named when the reserved evidence legitimately accounts for them.
- Preserve relatedCluePositions and evidenceIds exactly.

Return:
{"notes":[{"id":"N1","text":"...","relatedClues":[1,5],"evidenceIds":["A03"]},{"id":"N2","text":"...","relatedClues":[3,7],"evidenceIds":["A08"]}]}`,
  };
}

export function buildAuditPrompt(params: {
  mystery: RenderedMystery;
  inspector: InspectorPackage;
  world: MysteryWorld;
}): { system: string; prompt: string } {
  return {
    system: `You are a blind playtester for a fair-play theft mystery. You do not know the answer and must reason only from player-visible text. Be conservative: list every genuinely plausible card ID, flag disconnected fragments, and identify whether one solution is being telegraphed too early. Return structured data only.`,
    prompt: `Playtest three progressive snapshots of this mystery.

Card reference:
${JSON.stringify(params.world, null, 2)}

Opening:
${params.mystery.opening}

Clues:
${JSON.stringify(params.mystery.clues.map(({ position, text }) => ({ position, text })), null, 2)}

Inspector notes:
${JSON.stringify(params.inspector.notes.map(({ id, text, relatedClues }) => ({ id, text, relatedClues })), null, 2)}

For snapshots after clues 5, 7, and 10, return plausible candidate IDs in all four categories, a brief leading theory, and whether a single complete solution is apparent. Also reconstruct the shared timeline, identify likely deceptions, disconnected clue positions, and repeated language.
The reasons array must contain only concrete defects that require revision; return an empty array when the package passes.

Return:
{
  "snapshots":[{"afterClue":5,"candidates":{"suspects":["S01"],"items":["I01"],"locations":["L01"],"times":["T01"]},"leadingTheory":"...","singleSolutionApparent":false}, {"afterClue":7,...}, {"afterClue":10,...}],
  "reconstructedTimeline":["..."],
  "detectedDeceptions":["..."],
  "disconnectedCluePositions":[],
  "repeatedLanguage":[],
  "coherentStory":true,
  "fairMystery":true,
  "revisionNeeded":false,
  "reasons":[]
}`,
  };
}

export function buildRevisionPrompt(params: {
  bible: CaseBible;
  mystery: RenderedMystery;
  inspector: InspectorPackage;
  audit: BlindAudit;
  deterministicIssues: string[];
}): { system: string; prompt: string } {
  return {
    system: `You are a senior fair-play mystery editor. Revise player-facing prose only. Preserve the supplied case bible, answer, evidence IDs, clue positions, and Inspector evidence. Repair pacing, cohesion, leakage, ambiguity, or repetition without redesigning the case. Return structured data only.`,
    prompt: `Revise this public package once.

Case bible:
${JSON.stringify(params.bible, null, 2)}

Current mystery:
${JSON.stringify(params.mystery, null, 2)}

Current Inspector notes:
${JSON.stringify(params.inspector, null, 2)}

Blind audit:
${JSON.stringify(params.audit, null, 2)}

Deterministic issues:
${params.deterministicIssues.length ? params.deterministicIssues.join("\n") : "None"}

Return the complete corrected package:
{
  "opening":"...",
  "clues":[{"position":1,"text":"...","evidenceIds":["A01"]} ... through 10],
  "closing":"...",
  "closingEvidenceIds":["A01","A02","A03","A04"],
  "notes":[{"id":"N1","text":"...","relatedClues":[...],"evidenceIds":["A03"]},{"id":"N2","text":"...","relatedClues":[...],"evidenceIds":["A08"]}]
}`,
  };
}
