import type {
  Answer,
  BlindAudit,
  CaseBible,
  InspectorPackage,
  RenderedMystery,
} from "../services/ai-mystery-schemas";
import { ORIGINAL_MYSTERY_STYLE_GUIDE } from "./original-mystery-style";

export type MysteryWorld = {
  suspects: Array<{ id: string; name: string; role: string; traits: string[] }>;
  items: Array<{ id: string; name: string; category: string; description: string }>;
  locations: Array<{ id: string; name: string; adjacentRooms: string[]; secretPassageTo: string | null }>;
  times: Array<{ id: string; name: string; order: number; activities: string[] }>;
};

const CASE_BIBLE_CONTRACT = `{
  "version":"2.0",
  "occasion":{"family":"...","title":"...","purpose":"...","schedule":[{"timeId":"T01","activity":"..."}]},
  "answer":{"suspectId":"S01","itemId":"I01","locationId":"L01","timeId":"T01"},
  "centralTension":"...",
  "theft":{"theftEventId":"E06","discoveryEventId":"E09","motive":"...","opportunity":"...","access":"...","method":"...","concealment":"...","coverStory":"...","discovery":"..."},
  "cast":[{"suspectId":"S01","eventRole":"...","privateGoal":"...","relationships":[{"suspectId":"S02","nature":"..."}],"trueActionEventIds":["E01"]}],
  "timeline":[{"id":"E01","timeId":"T01","locationId":"L01","participantIds":["S01"],"itemIds":["I01"],"actualEvent":"...","witnessIds":["S02"]}],
  "movements":[{"id":"M01","eventId":"E02","actorId":"S01","fromLocationId":"L01","toLocationId":"L02","method":"ordinary","itemIds":["I01"]}],
  "itemThreads":[{"itemId":"I01","eventIds":["E01"],"storyFunction":"..."}],
  "deceptions":[{"id":"D01","suspectId":"S01","kind":"lie","publicClaim":"...","truth":"...","reason":"...","contradictionEvidenceIds":["A01"]}],
  "innocentThreads":[{"id":"R01","suspectIds":["S02"],"suspiciousAppearance":"...","innocentTruth":"...","evidenceIds":["A02"]}],
  "evidenceAtoms":[{"id":"A01","eventId":"E01","publicFact":"..."}],
  "inferences":[{"id":"F01","evidenceIds":["A01","A02"],"conclusion":"...","category":"suspect","importance":"important"}],
  "clueBlueprints":[{"position":1,"source":"Ashe or a named suspect","evidenceIds":["A01"],"threadId":"core","purpose":"setup","rulesOut":[{"category":"item","ids":["I02"],"reason":"..."}],"supports":[{"category":"suspect","id":"S01"}],"answerDimensions":["suspect"]}],
  "inspectorEvidence":[{"id":"N1","availableAfterClue":5,"fact":"...","evidenceIds":["A03"],"relatedCluePositions":[2,5],"rulesOut":[{"category":"time","ids":["T10"],"reason":"..."}]}],
  "closingEvidenceIds":["A01","A02","A03","A04"],
  "noveltySignature":{"occasion":"...","motive":"...","relationship":"...","deception":"..."}
}`;

export function buildArchitectPrompt(params: {
  answer: Answer;
  world: MysteryWorld;
  occasionFamily: string;
  recentSignatures: string[];
}): { system: string; prompt: string } {
  return {
    system: `You are the case architect for the 2006 Clue DVD Game. Design a fair-play THEFT mystery as a complete hidden reality before any prose clues are written. Character goals cause actions; relationships cause lies and omissions; all red herrings have innocent explanations. Use only supplied IDs and lore. Return the required serialized CaseBible tool envelope only.`,
    prompt: `Build one original case bible. The tool arguments must be exactly one property named caseBibleJson. Put the complete CaseBible JSON serialized as the value of that string property. Do not add any other outer property. The application will parse and validate the serialized CaseBible after receiving it.

Immutable answer:
${JSON.stringify(params.answer, null, 2)}

Occasion family selected independently from the answer:
${params.occasionFamily}

Verified world:
${JSON.stringify(params.world, null, 2)}

Recent signatures to avoid:
${params.recentSignatures.length ? params.recentSignatures.join("\n") : "None"}

Design requirements:
- Theft only. Mr. Boddy owns the valuables. Ashe and Inspector Brown are non-suspect investigators.
- All ten suspects are present. Mrs. White is the housekeeper; Rusty is the gardener. Invent no unnamed workers.
- Create a coherent social occasion, central tension, complete chronological day, and a theft that is physically and emotionally motivated.
- Identify the exact theft and discovery timeline events. The theft event must use the immutable answer time and location and include the answer suspect and item; discovery must not precede it.
- Give all ten suspects a role and private goal. Every trueActionEventId must name an event in which that suspect participates. Use two to four motivated lies or omissions; at least one belongs to the culprit and at least one to an innocent suspect.
- Create two or three innocent suspicious threads that resolve through evidence rather than coincidence.
- Track four to six items, including the answer item, through actual events.
- Record meaningful character and object movements. A movement ends at its referenced event, where its actor and carried items must be present. Use secret_passage only for a verified passage pair; whenever a tracked item changes locations between its listed events, include the carrying movement.
- Build evidence atoms first, then multi-piece inferences. No important inference may rest on one atom.
- Blueprint exactly ten connected clue fragments. Setup and payoff must occur in different positions. No clue may carry more than two answer dimensions.
- Reserve N1 as genuinely new evidence after clue 5 and N2 after clue 7. Their evidence atoms must not also appear in clue blueprints. Each note may concern only one answer category; its fact may rule out non-answers but may not state an answer card.
- Private rulesOut effects must leave the true answer untouched, leave at least 4 candidates after clue 5 plus N1, leave 3–4 after clue 7 plus both notes, and leave 2–3 after everything.
- Every important inference must combine evidence exposed on at least two different clues or notes.
- Closing evidence must already exist in evidenceAtoms and every closing evidence atom must be exposed by a clue or Inspector note.

The serialized caseBibleJson must contain exactly this inner shape (with complete arrays, not the abbreviated sample):
${CASE_BIBLE_CONTRACT}`,
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
