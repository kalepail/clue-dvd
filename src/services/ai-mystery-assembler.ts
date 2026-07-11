import type { CandidateEffectPlan, MysteryWorld } from "../data/ai-mystery-prompts";
import {
  CaseBibleSchema,
  type Answer,
  type CaseBible,
  type CausalTimeline,
  type CluePlan,
  type EvidenceDesign,
  type StoryFoundation,
} from "./ai-mystery-schemas";
import { SeededRandom } from "./seeded-random";

export type CaseNarrative = Pick<
  CaseBible,
  "occasion" | "answer" | "centralTension" | "theft" | "cast" | "timeline" | "movements" | "itemThreads" | "noveltySignature"
>;

type Category = "suspect" | "item" | "location" | "time";
type CandidateEffect = CaseBible["clueBlueprints"][number]["rulesOut"][number];

export function selectTrackedItemIds(seed: number, answer: Answer, world: MysteryWorld): string[] {
  const rng = new SeededRandom(seed ^ 0x4d595354);
  const otherItems = rng.shuffle(world.items.map(({ id }) => id).filter((id) => id !== answer.itemId));
  const count = rng.nextInt(4, 6);
  return [answer.itemId, ...otherItems.slice(0, count - 1)];
}

/**
 * Candidate-field pacing is a game mechanic, so code owns it. Sonnet receives
 * these targets and makes them narratively meaningful; it cannot accidentally
 * over-narrow the hidden answer or miss an entire category.
 */
export function buildCandidateEffectPlan(seed: number, answer: Answer, world: MysteryWorld): CandidateEffectPlan {
  const rng = new SeededRandom(seed ^ 0x434c5545);
  const categories: Array<{ category: Category; ids: string[]; answerId: string }> = [
    { category: "suspect", ids: world.suspects.map(({ id }) => id), answerId: answer.suspectId },
    { category: "item", ids: world.items.map(({ id }) => id), answerId: answer.itemId },
    { category: "location", ids: world.locations.map(({ id }) => id), answerId: answer.locationId },
    { category: "time", ids: world.times.map(({ id }) => id), answerId: answer.timeId },
  ];

  const phases = categories.map(({ category, ids, answerId }) => {
    const nonAnswers = rng.shuffle(ids.filter((id) => id !== answerId));
    const earlyCount = Math.max(0, ids.length - 6);
    const middleCount = 2;
    const lateCount = 1;
    const earlyIds = nonAnswers.slice(0, earlyCount);
    const splitAt = Math.ceil(earlyIds.length / 2);
    return {
      category,
      early: [earlyIds.slice(0, splitAt), earlyIds.slice(splitAt)].filter((group) => group.length > 0),
      middle: [nonAnswers.slice(earlyCount, earlyCount + middleCount)],
      late: [nonAnswers.slice(earlyCount + middleCount, earlyCount + middleCount + lateCount)],
    };
  });

  const clueEffects = new Map<number, CandidateEffect[]>();
  for (let position = 1; position <= 10; position += 1) clueEffects.set(position, []);

  const noteOneCategory = rng.nextInt(0, phases.length - 1);
  const noteTwoCategory = (noteOneCategory + 1 + rng.nextInt(0, phases.length - 2)) % phases.length;
  const noteOneEffects: CandidateEffect[] = [];
  const noteTwoEffects: CandidateEffect[] = [];

  let earlySlot = 1;
  phases.forEach((phase, categoryIndex) => {
    phase.early.forEach((ids, groupIndex) => {
      const effect = makeEffect(phase.category, ids);
      if (categoryIndex === noteOneCategory && groupIndex === phase.early.length - 1) {
        noteOneEffects.push(effect);
      } else {
        placeEffect(clueEffects, [1, 2, 3, 4, 5], effect, earlySlot);
        earlySlot += 1;
      }
    });
  });

  let middleSlot = 0;
  phases.forEach((phase, categoryIndex) => {
    const effect = makeEffect(phase.category, phase.middle[0]);
    if (categoryIndex === noteTwoCategory) {
      noteTwoEffects.push(effect);
    } else {
      placeEffect(clueEffects, [6, 7], effect, middleSlot);
      middleSlot += 1;
    }
  });

  phases.forEach((phase, index) => {
    placeEffect(clueEffects, [8, 9, 10], makeEffect(phase.category, phase.late[0]), index);
  });

  return {
    clues: Array.from({ length: 10 }, (_, index) => ({
      position: index + 1,
      rulesOut: clueEffects.get(index + 1) ?? [],
    })),
    inspector: [
      { id: "N1", availableAfterClue: 5, rulesOut: noteOneEffects },
      { id: "N2", availableAfterClue: 7, rulesOut: noteTwoEffects },
    ],
  };
}

export function assembleCaseNarrative(params: {
  foundation: StoryFoundation;
  timelineDraft: CausalTimeline;
  answer: Answer;
  world: MysteryWorld;
  occasionFamily: string;
  trackedItemIds: string[];
}): CaseNarrative {
  const { foundation, timelineDraft, answer, world, occasionFamily, trackedItemIds } = params;
  const timeOrder = new Map(world.times.map(({ id, order }) => [id, order]));

  const theftEvents = timelineDraft.events.filter(({ phase }) => phase === "theft");
  const discoveryEvents = timelineDraft.events.filter(({ phase }) => phase === "discovery");
  if (theftEvents.length !== 1) throw new Error(`Timeline must contain exactly one theft event; found ${theftEvents.length}.`);
  if (discoveryEvents.length !== 1) throw new Error(`Timeline must contain exactly one discovery event; found ${discoveryEvents.length}.`);
  const phaseOrder = new Map([
    ["before_theft", 0],
    ["theft", 1],
    ["between", 2],
    ["discovery", 3],
    ["after_discovery", 4],
  ]);
  const marked = timelineDraft.events.map((event) => event.phase === "theft"
    ? { ...event, timeId: answer.timeId, locationId: answer.locationId }
    : event);

  const ordered = marked
    .map((event, originalIndex) => ({ event, originalIndex }))
    .sort((left, right) => {
      const timeDifference = (timeOrder.get(left.event.timeId) ?? 999) - (timeOrder.get(right.event.timeId) ?? 999);
      if (timeDifference !== 0) return timeDifference;
      const phaseDifference = (phaseOrder.get(left.event.phase) ?? 99) - (phaseOrder.get(right.event.phase) ?? 99);
      return phaseDifference !== 0 ? phaseDifference : left.originalIndex - right.originalIndex;
    });

  const theftIndex = ordered.findIndex(({ event }) => event.phase === "theft");
  const discoveryIndex = ordered.findIndex(({ event }) => event.phase === "discovery");

  const timeline = ordered.map(({ event }, index) => {
    const fixedParticipants = event.phase === "theft" ? [answer.suspectId] : [];
    const fixedItems = event.phase === "theft" ? [answer.itemId] : [];
    return {
      id: eventId(index),
      timeId: event.timeId,
      locationId: event.locationId,
      participantIds: unique([...event.participantIds, ...event.arrivals.map(({ actorId }) => actorId), ...fixedParticipants]),
      itemIds: unique([...event.itemIds, ...event.arrivals.flatMap(({ itemIds }) => itemIds), ...fixedItems]),
      actualEvent: event.actualEvent,
      witnessIds: unique(event.witnessIds),
    };
  });

  // The tracked set is selected by code, so code guarantees its baseline
  // presence. A baseline appearance means the object is simply present at an
  // event; it does not invent testimony or a new public clue.
  const baselineIndexes = ordered
    .map(({ event }, index) => ({ phase: event.phase, index }))
    .filter(({ phase }) => phase === "before_theft")
    .map(({ index }) => index);
  trackedItemIds.forEach((itemId, index) => {
    if (timeline.some((event) => event.itemIds.includes(itemId))) return;
    const baselineIndex = itemId === answer.itemId
      ? theftIndex
      : baselineIndexes[index % Math.max(1, baselineIndexes.length)] ?? theftIndex;
    timeline[baselineIndex].itemIds = unique([...timeline[baselineIndex].itemIds, itemId]);
  });

  const movementCandidates: CaseBible["movements"] = [];
  ordered.forEach(({ event }, eventIndex) => {
    event.arrivals.forEach((arrival) => {
      movementCandidates.push({
        id: "pending",
        eventId: eventId(eventIndex),
        actorId: arrival.actorId,
        fromLocationId: arrival.fromLocationId,
        toLocationId: event.locationId,
        method: arrival.method === "secret_passage" && isVerifiedPassage(
          arrival.fromLocationId,
          event.locationId,
          world
        ) ? "secret_passage" : "ordinary",
        itemIds: unique(arrival.itemIds),
      });
    });
  });
  const trackedItems = new Set(trackedItemIds);
  const deduplicatedMovements = uniqueBy(
    movementCandidates,
    (movement) => [
      movement.eventId,
      movement.actorId,
      movement.fromLocationId,
      movement.toLocationId,
      movement.method,
      movement.itemIds.slice().sort().join(","),
    ].join("|")
  );
  const consequential = deduplicatedMovements.filter((movement) =>
    movement.method === "secret_passage" || movement.itemIds.some((itemId) => trackedItems.has(itemId))
  );
  const movements = consequential.slice(0, 20)
    .map((movement, index) => ({ ...movement, id: `M${String(index + 1).padStart(2, "0")}` }));

  const roleByItem = new Map(timelineDraft.itemRoles.map((role) => [role.itemId, role.storyFunction]));
  const itemThreads = trackedItemIds.map((itemId) => ({
    itemId,
    eventIds: coherentItemEvents(itemId, timeline, movements),
    storyFunction: roleByItem.get(itemId) ?? "A tracked object in the shared mystery.",
  }));

  const schedule = foundation.occasion.schedule
    .slice()
    .sort((left, right) => (timeOrder.get(left.timeId) ?? 999) - (timeOrder.get(right.timeId) ?? 999));

  return {
    occasion: { family: occasionFamily, ...foundation.occasion, schedule },
    answer: { ...answer },
    centralTension: foundation.centralTension,
    theft: {
      theftEventId: eventId(theftIndex),
      discoveryEventId: eventId(discoveryIndex),
      ...foundation.theft,
    },
    cast: foundation.cast.map((member) => ({
      ...member,
      trueActionEventIds: timeline
        .filter((event) => event.participantIds.includes(member.suspectId))
        .map((event) => event.id),
    })),
    timeline,
    movements,
    itemThreads,
    noveltySignature: foundation.noveltySignature,
  };
}

export function assembleCaseBible(params: {
  narrative: CaseNarrative;
  evidence: EvidenceDesign;
  cluePlan: CluePlan;
  candidatePlan: CandidateEffectPlan;
}): CaseBible {
  const { narrative, evidence, cluePlan, candidatePlan } = params;
  const evidenceIds = new Map<string, string>();
  evidence.evidenceAtoms.forEach((atom, index) => evidenceIds.set(atom.key, `A${String(index + 1).padStart(2, "0")}`));
  const evidenceByKey = new Map(evidence.evidenceAtoms.map((atom) => [atom.key, atom]));
  const idFor = (key: string): string => evidenceIds.get(key) ?? `UNKNOWN:${key}`;
  const clueSlots = cluePlan.clues;

  const clueBlueprints: CaseBible["clueBlueprints"] = clueSlots.map((slot, index) => {
    const position = index + 1;
    const rulesOut = candidatePlan.clues.find((entry) => entry.position === position)?.rulesOut ?? [];
    return {
      position,
      source: slot.source,
      evidenceIds: slot.evidenceKeys.map(idFor),
      threadId: slot.threadId,
      purpose: slot.purpose,
      rulesOut,
      supports: [],
      answerDimensions: unique(rulesOut.map(({ category }) => category)),
    };
  });

  const noteDrafts = cluePlan.inspectorNotes;
  const inspectorEvidence: CaseBible["inspectorEvidence"] = noteDrafts.map((note, index) => {
    const mechanical = candidatePlan.inspector[index];
    return {
      id: index === 0 ? "N1" : "N2",
      availableAfterClue: index === 0 ? 5 : 7,
      fact: note.fact,
      evidenceIds: note.evidenceKeys.map(idFor),
      relatedCluePositions: note.relatedCluePositions,
      rulesOut: mechanical?.rulesOut ?? [],
    };
  });

  // Surface ownership is checked before CaseBible validation so a malformed
  // evidence map cannot quietly reuse an Inspector fact in a Butler clue.
  clueSlots.forEach((slot) => slot.evidenceKeys.forEach((key) => {
    if (evidenceByKey.get(key)?.surface !== "clue") throw new Error(`Clue plan uses non-clue evidence key ${key}.`);
  }));
  noteDrafts.forEach((note, index) => note.evidenceKeys.forEach((key) => {
    const expected = index === 0 ? "inspector_1" : "inspector_2";
    if (evidenceByKey.get(key)?.surface !== expected) throw new Error(`Inspector note uses evidence key ${key} from the wrong surface.`);
  }));

  return CaseBibleSchema.parse({
    version: "2.0",
    ...narrative,
    deceptions: evidence.deceptions.map((entry, index) => ({
      id: `D${String(index + 1).padStart(2, "0")}`,
      suspectId: entry.suspectId,
      kind: entry.kind,
      publicClaim: entry.publicClaim,
      truth: entry.truth,
      reason: entry.reason,
      contradictionEvidenceIds: entry.contradictionEvidenceKeys.map(idFor),
    })),
    innocentThreads: evidence.innocentThreads.map((entry, index) => ({
      id: `R${String(index + 1).padStart(2, "0")}`,
      suspectIds: entry.suspectIds,
      suspiciousAppearance: entry.suspiciousAppearance,
      innocentTruth: entry.innocentTruth,
      evidenceIds: entry.evidenceKeys.map(idFor),
    })),
    evidenceAtoms: evidence.evidenceAtoms.map((atom) => ({
      id: idFor(atom.key),
      eventId: atom.eventId,
      publicFact: atom.publicFact,
    })),
    inferences: evidence.inferences.map((entry, index) => ({
      id: `F${String(index + 1).padStart(2, "0")}`,
      evidenceIds: entry.evidenceKeys.map(idFor),
      conclusion: entry.conclusion,
      category: entry.category,
      importance: entry.importance,
    })),
    clueBlueprints,
    inspectorEvidence,
    closingEvidenceIds: cluePlan.closingEvidenceKeys.map(idFor),
  });
}

function placeEffect(
  slots: Map<number, CandidateEffect[]>,
  allowedPositions: number[],
  effect: CandidateEffect,
  offset: number
): void {
  for (let step = 0; step < allowedPositions.length; step += 1) {
    const position = allowedPositions[(offset + step) % allowedPositions.length];
    const current = slots.get(position) ?? [];
    const dimensions = new Set([...current.map(({ category }) => category), effect.category]);
    if (dimensions.size <= 2 && current.length < 2) {
      current.push(effect);
      slots.set(position, current);
      return;
    }
  }
  throw new Error("Unable to distribute candidate effects across clue slots.");
}

function makeEffect(category: Category, ids: string[]): CandidateEffect {
  return {
    category,
    ids,
    reason: "The assigned story evidence accounts for these non-answer cards.",
  };
}

function eventId(index: number): string {
  return `E${String(index + 1).padStart(2, "0")}`;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function uniqueBy<T>(values: T[], keyFor: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = keyFor(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function coherentItemEvents(
  itemId: string,
  timeline: CaseBible["timeline"],
  movements: CaseBible["movements"]
): string[] {
  const appearances = timeline.filter((event) => event.itemIds.includes(itemId));
  if (appearances.length === 0) return [];
  const coherent = [appearances[0]];
  for (const event of appearances.slice(1)) {
    const previous = coherent[coherent.length - 1];
    if (previous.locationId === event.locationId) {
      coherent.push(event);
      continue;
    }
    const hasMovement = movements.some((movement) =>
      movement.eventId === event.id &&
      movement.fromLocationId === previous.locationId &&
      movement.toLocationId === event.locationId &&
      movement.itemIds.includes(itemId)
    );
    if (hasMovement) coherent.push(event);
  }
  return coherent.map(({ id }) => id);
}

function isVerifiedPassage(fromLocationId: string, toLocationId: string, world: MysteryWorld): boolean {
  const from = world.locations.find(({ id }) => id === fromLocationId);
  const to = world.locations.find(({ id }) => id === toLocationId);
  return from?.secretPassageTo === to?.id || to?.secretPassageTo === from?.id;
}
