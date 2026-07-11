import type { MysteryWorld } from "../data/ai-mystery-prompts";
import type {
  Answer,
  BlindAudit,
  CaseBible,
  InspectorPackage,
  RenderedMystery,
} from "./ai-mystery-schemas";

type CategoryKey = "suspects" | "items" | "locations" | "times";

const REPETITION_LIMITS = {
  phraseWordCount: 4,
  phraseAcrossClues: 3,
  repeatedSentenceOpenings: 3,
  reportingVerbClues: 4,
} as const;

export function validateCaseBible(
  bible: CaseBible,
  answer: Answer,
  world: MysteryWorld,
  expectations?: { occasionFamily?: string; recentSignatures?: string[] }
): string[] {
  const issues: string[] = [];
  if (
    bible.answer.suspectId !== answer.suspectId ||
    bible.answer.itemId !== answer.itemId ||
    bible.answer.locationId !== answer.locationId ||
    bible.answer.timeId !== answer.timeId
  ) {
    issues.push("Case bible changed the immutable answer.");
  }
  if (expectations?.occasionFamily && bible.occasion.family.trim().toLowerCase() !== expectations.occasionFamily.trim().toLowerCase()) {
    issues.push("Case bible changed the code-selected occasion family.");
  }
  const noveltySignature = Object.values(bible.noveltySignature).join(" | ").trim().toLowerCase();
  if (expectations?.recentSignatures?.some((signature) => signature.trim().toLowerCase() === noveltySignature)) {
    issues.push("Case bible exactly repeats a recent mystery signature.");
  }

  const suspectIds = new Set(world.suspects.map((entry) => entry.id));
  const itemIds = new Set(world.items.map((entry) => entry.id));
  const locationIds = new Set(world.locations.map((entry) => entry.id));
  const timeOrder = new Map(world.times.map((entry) => [entry.id, entry.order]));
  const castIds = bible.cast.map((entry) => entry.suspectId);
  if (new Set(castIds).size !== world.suspects.length || world.suspects.some((entry) => !castIds.includes(entry.id))) {
    issues.push("Case bible cast must contain every verified suspect exactly once.");
  }

  const eventIds = new Set(bible.timeline.map((event) => event.id));
  const evidenceIds = new Set(bible.evidenceAtoms.map((atom) => atom.id));
  if (eventIds.size !== bible.timeline.length) issues.push("Timeline event IDs must be unique.");
  if (evidenceIds.size !== bible.evidenceAtoms.length) issues.push("Evidence atom IDs must be unique.");

  let previousOrder = 0;
  for (const event of bible.timeline) {
    const order = timeOrder.get(event.timeId);
    if (!order) issues.push(`Timeline event ${event.id} has unknown time ${event.timeId}.`);
    if (order && order < previousOrder) issues.push("Timeline must be ordered chronologically.");
    if (order) previousOrder = order;
    if (!locationIds.has(event.locationId)) issues.push(`Timeline event ${event.id} has unknown location.`);
    event.participantIds.forEach((id) => {
      if (!suspectIds.has(id)) issues.push(`Timeline event ${event.id} has unknown participant ${id}.`);
    });
    event.witnessIds.forEach((id) => {
      if (!suspectIds.has(id)) issues.push(`Timeline event ${event.id} has unknown witness ${id}.`);
    });
    event.itemIds.forEach((id) => {
      if (!itemIds.has(id)) issues.push(`Timeline event ${event.id} has unknown item ${id}.`);
    });
    if (new Set(event.participantIds).size !== event.participantIds.length) {
      issues.push(`Timeline event ${event.id} repeats a participant.`);
    }
  }

  let previousScheduleOrder = 0;
  bible.occasion.schedule.forEach((entry) => {
    const order = timeOrder.get(entry.timeId);
    if (!order) issues.push(`Occasion schedule has unknown time ${entry.timeId}.`);
    if (order && order < previousScheduleOrder) issues.push("Occasion schedule must be chronological.");
    if (order) previousScheduleOrder = order;
  });

  const theftEvent = bible.timeline.find((event) => event.id === bible.theft.theftEventId);
  const discoveryEvent = bible.timeline.find((event) => event.id === bible.theft.discoveryEventId);
  if (!theftEvent) {
    issues.push("Theft references an unknown timeline event.");
  } else {
    if (theftEvent.timeId !== answer.timeId || theftEvent.locationId !== answer.locationId) {
      issues.push("Theft event must occur at the immutable answer time and location.");
    }
    if (!theftEvent.participantIds.includes(answer.suspectId)) issues.push("Theft event must include the culprit.");
    if (!theftEvent.itemIds.includes(answer.itemId)) issues.push("Theft event must include the stolen item.");
  }
  if (!discoveryEvent) {
    issues.push("Discovery references an unknown timeline event.");
  } else if (theftEvent && bible.timeline.indexOf(discoveryEvent) < bible.timeline.indexOf(theftEvent)) {
    issues.push("Discovery cannot precede the theft.");
  }

  for (const castMember of bible.cast) {
    castMember.relationships.forEach((relationship) => {
      if (!suspectIds.has(relationship.suspectId) || relationship.suspectId === castMember.suspectId) {
        issues.push(`Cast member ${castMember.suspectId} has an invalid relationship target.`);
      }
    });
    castMember.trueActionEventIds.forEach((id) => {
      if (!eventIds.has(id)) issues.push(`Cast member ${castMember.suspectId} references unknown action ${id}.`);
      const event = bible.timeline.find((entry) => entry.id === id);
      if (event && !event.participantIds.includes(castMember.suspectId)) {
        issues.push(`Cast member ${castMember.suspectId} is absent from claimed action ${id}.`);
      }
    });
  }
  const culpritCast = bible.cast.find((entry) => entry.suspectId === answer.suspectId);
  if (culpritCast && !culpritCast.trueActionEventIds.includes(bible.theft.theftEventId)) {
    issues.push("The culprit's true actions must include the theft event.");
  }

  const movementIds = new Set<string>();
  for (const movement of bible.movements) {
    if (movementIds.has(movement.id)) issues.push(`Movement ID ${movement.id} is duplicated.`);
    movementIds.add(movement.id);
    if (!eventIds.has(movement.eventId)) issues.push(`Movement ${movement.id} references unknown event ${movement.eventId}.`);
    if (!suspectIds.has(movement.actorId)) issues.push(`Movement ${movement.id} has unknown actor ${movement.actorId}.`);
    if (!locationIds.has(movement.fromLocationId) || !locationIds.has(movement.toLocationId)) {
      issues.push(`Movement ${movement.id} uses an unknown location.`);
    }
    movement.itemIds.forEach((id) => {
      if (!itemIds.has(id)) issues.push(`Movement ${movement.id} has unknown item ${id}.`);
    });
    if (movement.method === "secret_passage") {
      const origin = world.locations.find((entry) => entry.id === movement.fromLocationId);
      const destination = world.locations.find((entry) => entry.id === movement.toLocationId);
      const isVerifiedPair = origin?.secretPassageTo === destination?.id || destination?.secretPassageTo === origin?.id;
      if (!isVerifiedPair) issues.push(`Movement ${movement.id} uses a nonexistent secret passage.`);
    }
    const destinationEvent = bible.timeline.find((event) => event.id === movement.eventId);
    if (destinationEvent) {
      if (destinationEvent.locationId !== movement.toLocationId) {
        issues.push(`Movement ${movement.id} does not end at its referenced event location.`);
      }
      if (!destinationEvent.participantIds.includes(movement.actorId)) {
        issues.push(`Movement ${movement.id} actor is absent from its destination event.`);
      }
      movement.itemIds.forEach((id) => {
        if (!destinationEvent.itemIds.includes(id)) {
          issues.push(`Movement ${movement.id} item ${id} is absent from its destination event.`);
        }
      });
    }
  }

  for (const atom of bible.evidenceAtoms) {
    if (!eventIds.has(atom.eventId)) issues.push(`Evidence ${atom.id} references unknown event ${atom.eventId}.`);
  }
  for (const inference of bible.inferences) {
    inference.evidenceIds.forEach((id) => {
      if (!evidenceIds.has(id)) issues.push(`Inference ${inference.id} references unknown evidence ${id}.`);
    });
  }

  if (!bible.itemThreads.some((thread) => thread.itemId === answer.itemId)) {
    issues.push("The stolen item must have a complete item thread.");
  }
  bible.itemThreads.forEach((thread) => {
    if (!itemIds.has(thread.itemId)) issues.push(`Unknown item thread ${thread.itemId}.`);
    thread.eventIds.forEach((id) => {
      if (!eventIds.has(id)) issues.push(`Item thread ${thread.itemId} references unknown event ${id}.`);
      const event = bible.timeline.find((entry) => entry.id === id);
      if (event && !event.itemIds.includes(thread.itemId)) {
        issues.push(`Item thread ${thread.itemId} is absent from event ${id}.`);
      }
    });
    const threadEvents = thread.eventIds
      .map((id) => bible.timeline.find((event) => event.id === id))
      .filter((event): event is CaseBible["timeline"][number] => Boolean(event));
    for (let index = 1; index < threadEvents.length; index += 1) {
      const previous = threadEvents[index - 1];
      const current = threadEvents[index];
      if (bible.timeline.indexOf(current) < bible.timeline.indexOf(previous)) {
        issues.push(`Item thread ${thread.itemId} is not chronological.`);
      }
      if (previous.locationId === current.locationId) continue;
      const tracked = bible.movements.some((movement) =>
        movement.eventId === current.id &&
        movement.fromLocationId === previous.locationId &&
        movement.toLocationId === current.locationId &&
        movement.itemIds.includes(thread.itemId)
      );
      if (!tracked) {
        issues.push(`Item ${thread.itemId} changes location before ${current.id} without a movement record.`);
      }
    }
  });
  if (new Set(bible.itemThreads.map((thread) => thread.itemId)).size !== bible.itemThreads.length) {
    issues.push("Item threads must track distinct card items.");
  }

  validateUniqueIds(bible.deceptions, "Deception", issues);
  validateUniqueIds(bible.innocentThreads, "Innocent thread", issues);
  validateUniqueIds(bible.inferences, "Inference", issues);

  if (!bible.deceptions.some((entry) => entry.suspectId === answer.suspectId)) {
    issues.push("At least one deception must belong to the culprit.");
  }
  if (!bible.deceptions.some((entry) => entry.suspectId !== answer.suspectId)) {
    issues.push("At least one deception must belong to an innocent suspect.");
  }
  bible.deceptions.forEach((entry) => {
    if (!suspectIds.has(entry.suspectId)) issues.push(`Deception ${entry.id} has unknown suspect.`);
    entry.contradictionEvidenceIds.forEach((id) => {
      if (!evidenceIds.has(id)) issues.push(`Deception ${entry.id} lacks accessible contradiction evidence.`);
    });
  });
  bible.innocentThreads.forEach((thread) => {
    thread.suspectIds.forEach((id) => {
      if (!suspectIds.has(id)) issues.push(`Innocent thread ${thread.id} has unknown suspect ${id}.`);
    });
    thread.evidenceIds.forEach((id) => {
      if (!evidenceIds.has(id)) issues.push(`Innocent thread ${thread.id} references unknown evidence ${id}.`);
    });
  });

  const positions = bible.clueBlueprints.map((entry) => entry.position).sort((a, b) => a - b);
  if (positions.join(",") !== "1,2,3,4,5,6,7,8,9,10") {
    issues.push("Clue blueprints must contain positions 1 through 10 exactly once.");
  }
  bible.clueBlueprints.forEach((clue) => {
    clue.evidenceIds.forEach((id) => {
      if (!evidenceIds.has(id)) issues.push(`Clue ${clue.position} references unknown evidence ${id}.`);
    });
    clue.supports.forEach((support) => {
      const valid = support.category === "suspect" ? suspectIds.has(support.id) :
        support.category === "item" ? itemIds.has(support.id) :
        support.category === "location" ? locationIds.has(support.id) :
        timeOrder.has(support.id);
      if (!valid) issues.push(`Clue ${clue.position} supports unknown ${support.category} ${support.id}.`);
    });
    const actualDimensions = new Set([
      ...clue.rulesOut.map((effect) => effect.category),
      ...clue.supports.map((support) => support.category),
    ]);
    if (actualDimensions.size > 2 || [...actualDimensions].some((category) => !clue.answerDimensions.includes(category))) {
      issues.push(`Clue ${clue.position} has candidate effects outside its declared answer dimensions.`);
    }
    validateEffects(clue.rulesOut, answer, world, issues, `Clue ${clue.position}`);
  });

  const connectedThreadPositions = new Map<string, number>();
  bible.clueBlueprints.forEach((clue) => {
    connectedThreadPositions.set(clue.threadId, (connectedThreadPositions.get(clue.threadId) ?? 0) + 1);
  });
  const connectedCount = bible.clueBlueprints.filter(
    (clue) => (connectedThreadPositions.get(clue.threadId) ?? 0) >= 2
  ).length;
  if (connectedCount < 8) issues.push("At least eight clues must belong to multi-clue story threads.");
  for (const [threadId] of connectedThreadPositions) {
    const threadClues = bible.clueBlueprints.filter((clue) => clue.threadId === threadId);
    for (const payoff of threadClues.filter((clue) => clue.purpose === "payoff")) {
      if (!threadClues.some((clue) => clue.purpose === "setup" && clue.position < payoff.position)) {
        issues.push(`Thread ${threadId} has a payoff without an earlier setup.`);
      }
    }
  }

  const notesById = new Map(bible.inspectorEvidence.map((note) => [note.id, note]));
  if (notesById.get("N1")?.availableAfterClue !== 5 || notesById.get("N2")?.availableAfterClue !== 7) {
    issues.push("Inspector evidence must reserve N1 after clue 5 and N2 after clue 7.");
  }
  bible.inspectorEvidence.forEach((note) => {
    note.evidenceIds.forEach((id) => {
      if (!evidenceIds.has(id)) issues.push(`${note.id} references unknown evidence ${id}.`);
    });
    if (note.relatedCluePositions.some((position) => position > note.availableAfterClue)) {
      issues.push(`${note.id} references a clue unavailable at its reveal point.`);
    }
    const clueEvidence = new Set(bible.clueBlueprints.flatMap((clue) => clue.evidenceIds));
    if (note.evidenceIds.some((id) => clueEvidence.has(id))) {
      issues.push(`${note.id} must contribute new evidence rather than repeat a clue atom.`);
    }
    if (new Set(note.rulesOut.map((effect) => effect.category)).size > 1) {
      issues.push(`${note.id} combines multiple answer dimensions.`);
    }
    validateEffects(note.rulesOut, answer, world, issues, note.id);
  });

  const publicSurfaces = new Map<string, Set<string>>();
  const addSurface = (evidenceId: string, surface: string) => {
    const surfaces = publicSurfaces.get(evidenceId) ?? new Set<string>();
    surfaces.add(surface);
    publicSurfaces.set(evidenceId, surfaces);
  };
  bible.clueBlueprints.forEach((clue) => clue.evidenceIds.forEach((id) => addSurface(id, `C${clue.position}`)));
  bible.inspectorEvidence.forEach((note) => note.evidenceIds.forEach((id) => addSurface(id, note.id)));
  bible.inferences.filter((inference) => inference.importance === "important").forEach((inference) => {
    const surfaces = new Set(inference.evidenceIds.flatMap((id) => [...(publicSurfaces.get(id) ?? [])]));
    if (surfaces.size < 2) issues.push(`Important inference ${inference.id} needs evidence from at least two public pieces.`);
  });
  bible.deceptions.forEach((deception) => {
    if (deception.contradictionEvidenceIds.some((id) => !publicSurfaces.has(id))) {
      issues.push(`Deception ${deception.id} has no publicly accessible contradiction.`);
    }
  });

  const availableEvidence = new Set(publicSurfaces.keys());
  bible.closingEvidenceIds.forEach((id) => {
    if (!evidenceIds.has(id)) issues.push(`Closing references unknown evidence ${id}.`);
    if (!availableEvidence.has(id)) issues.push(`Closing evidence ${id} is not available to players.`);
  });

  const afterFive = collectEffects(bible, 5, true, false);
  const afterSeven = collectEffects(bible, 7, true, true);
  const finalEffects = collectEffects(bible, 10, true, true);
  const earlyRemaining = remainingCounts(afterFive, world);
  const middleRemaining = remainingCounts(afterSeven, world);
  const finalRemaining = remainingCounts(finalEffects, world);
  for (const category of Object.keys(finalRemaining) as CategoryKey[]) {
    if (earlyRemaining[category] < 4) issues.push(`Too few ${category} remain plausible after clue 5.`);
    if (middleRemaining[category] < 3 || middleRemaining[category] > 4) {
      issues.push(`After clue 7, ${category} field must contain 3–4 candidates, found ${middleRemaining[category]}.`);
    }
    if (finalRemaining[category] < 2 || finalRemaining[category] > 3) {
      issues.push(`Final ${category} field must contain 2–3 candidates, found ${finalRemaining[category]}.`);
    }
  }

  return unique(issues);
}

export function validatePublicPackage(params: {
  bible: CaseBible;
  mystery: RenderedMystery;
  inspector: InspectorPackage;
  world: MysteryWorld;
}): string[] {
  const { bible, mystery, inspector, world } = params;
  const issues: string[] = [];
  const positions = mystery.clues.map((clue) => clue.position).sort((a, b) => a - b);
  if (positions.join(",") !== "1,2,3,4,5,6,7,8,9,10") issues.push("Rendered clues must use positions 1–10.");

  if (containsOpeningLeak(mystery.opening, world)) {
    issues.push("Opening contains mystery details, card names, a meal, or a time of day.");
  }
  if (wordCount(mystery.opening) < 12 || wordCount(mystery.opening) > 110) {
    issues.push("Opening must remain a brief 2–4 sentence occasion introduction.");
  }

  mystery.clues.forEach((clue) => {
    const blueprint = bible.clueBlueprints.find((entry) => entry.position === clue.position);
    if (!blueprint) return;
    if (!sameSet(clue.evidenceIds, blueprint.evidenceIds)) {
      issues.push(`Clue ${clue.position} changed its case-bible evidence provenance.`);
    }
    const words = wordCount(clue.text);
    if (words < 8 || words > 140) issues.push(`Clue ${clue.position} must be a concise story fragment.`);
  });
  if (!sameSet(mystery.closingEvidenceIds, bible.closingEvidenceIds)) {
    issues.push("Closing changed its case-bible evidence provenance.");
  }

  const closingAnswerNames = answerNamesFromIds(bible.answer, world);
  if (closingAnswerNames.some((name) => !containsExactTerm(mystery.closing, name))) {
    issues.push("Closing does not explicitly reveal all four answer cards.");
  }

  const allText = [mystery.opening, ...mystery.clues.map((clue) => clue.text), mystery.closing].join(" ");
  if (/\b(murder|killed|corpse|body of the victim)\b/i.test(allText)) issues.push("Mystery violates theft-only lore.");
  if (/\b(staff|servants?|housemaid|footman|cook|scullery|maid)\b/i.test(allText)) {
    issues.push("Mystery invents or generically references unnamed household workers.");
  }
  if (/\ball (?:three|four|five|six|seven|eight|nine) guests\b/i.test(allText)) {
    issues.push("Mystery implies that a small named subset constitutes all guests.");
  }

  const answerNames = answerNamesFromIds(bible.answer, world);
  inspector.notes.forEach((note) => {
    if (answerNames.some((name) => containsExactTerm(note.text, name))) {
      issues.push(`${note.id} states an answer card.`);
    }
    const reserved = bible.inspectorEvidence.find((entry) => entry.id === note.id);
    if (!reserved) issues.push(`${note.id} has no reserved evidence.`);
    if (reserved && note.relatedClues.join(",") !== reserved.relatedCluePositions.join(",")) {
      issues.push(`${note.id} changed its related clue positions.`);
    }
    if (reserved && !sameSet(note.evidenceIds, reserved.evidenceIds)) {
      issues.push(`${note.id} changed its reserved evidence provenance.`);
    }
    if (wordCount(note.text) < 6 || wordCount(note.text) > 75) issues.push(`${note.id} must remain a short factual note.`);
  });
  if (inspector.notes.map((note) => note.id).sort().join(",") !== "N1,N2") {
    issues.push("Inspector package must contain N1 and N2 exactly once.");
  }

  const repeated = repeatedFourWordPhrases(mystery.clues.map((clue) => clue.text));
  if (repeated.length > 0) issues.push(`Repeated clue phrasing: ${repeated.slice(0, 3).join("; ")}`);

  const starts = new Map<string, number>();
  mystery.clues.forEach((clue) => {
    const start = clue.text.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).slice(0, 3).join(" ");
    starts.set(start, (starts.get(start) ?? 0) + 1);
  });
  if ([...starts.values()].some((count) => count >= REPETITION_LIMITS.repeatedSentenceOpenings)) {
    issues.push("Three or more clues reuse the same sentence opening.");
  }

  const reportingVerbs = ["said", "told", "recalled", "reported", "noticed", "observed", "mentioned", "claimed"];
  for (const verb of reportingVerbs) {
    const count = mystery.clues.filter((clue) => new RegExp(`\\b${verb}\\b`, "i").test(clue.text)).length;
    if (count >= REPETITION_LIMITS.reportingVerbClues) issues.push(`Reporting verb \"${verb}\" appears in ${count} clues.`);
  }

  return unique(issues);
}

export function evaluateBlindAudit(
  audit: BlindAudit,
  answer: Answer,
  world: MysteryWorld
): string[] {
  const issues = [...audit.reasons];
  const snapshots = new Map(audit.snapshots.map((snapshot) => [snapshot.afterClue, snapshot]));
  for (const checkpoint of [5, 7, 10] as const) {
    const snapshot = snapshots.get(checkpoint);
    if (!snapshot) {
      issues.push(`Blind audit omitted checkpoint ${checkpoint}.`);
      continue;
    }
    if (!snapshot.candidates.suspects.includes(answer.suspectId)) issues.push(`Answer suspect is not plausible after clue ${checkpoint}.`);
    if (!snapshot.candidates.items.includes(answer.itemId)) issues.push(`Answer item is not plausible after clue ${checkpoint}.`);
    if (!snapshot.candidates.locations.includes(answer.locationId)) issues.push(`Answer location is not plausible after clue ${checkpoint}.`);
    if (!snapshot.candidates.times.includes(answer.timeId)) issues.push(`Answer time is not plausible after clue ${checkpoint}.`);
    if (checkpoint < 10 && snapshot.singleSolutionApparent) issues.push(`A single solution appears too early after clue ${checkpoint}.`);
  }

  const earlySnapshot = snapshots.get(5);
  if (earlySnapshot && Object.values(earlySnapshot.candidates).some((candidates) => candidates.length < 4)) {
    issues.push("Blind audit field is too narrow after clue 5.");
  }
  const middleSnapshot = snapshots.get(7);
  if (middleSnapshot && Object.values(middleSnapshot.candidates).some((candidates) => candidates.length < 3 || candidates.length > 4)) {
    issues.push("Blind audit fields after clue 7 should contain 3–4 options.");
  }
  const finalSnapshot = snapshots.get(10);
  if (finalSnapshot && Object.values(finalSnapshot.candidates).some((candidates) => candidates.length < 2 || candidates.length > 3)) {
    issues.push("Blind audit final candidate fields should contain 2–3 options.");
  }
  if (!audit.coherentStory) issues.push("Blind playtester could not reconstruct a coherent shared story.");
  if (!audit.fairMystery) issues.push("Blind playtester judged the mystery unfair.");
  if (audit.disconnectedCluePositions.length > 1) issues.push("Too many clues appear disconnected from the central story.");
  if (audit.repeatedLanguage.length > 2) issues.push("Blind playtester found excessive repeated language.");
  if (audit.revisionNeeded) issues.push("Blind playtester requested revision.");

  const validByCategory: Record<CategoryKey, Set<string>> = {
    suspects: new Set(world.suspects.map((entry) => entry.id)),
    items: new Set(world.items.map((entry) => entry.id)),
    locations: new Set(world.locations.map((entry) => entry.id)),
    times: new Set(world.times.map((entry) => entry.id)),
  };
  audit.snapshots.forEach((snapshot) => {
    (Object.entries(snapshot.candidates) as Array<[CategoryKey, string[]]>).forEach(([category, candidates]) => {
      if (new Set(candidates).size !== candidates.length) {
        issues.push(`Blind audit duplicates ${category} after clue ${snapshot.afterClue}.`);
      }
      candidates.forEach((id) => {
        if (!validByCategory[category].has(id)) issues.push(`Blind audit returned invalid ${category} candidate ${id}.`);
      });
    });
  });
  return unique(issues);
}

export function containsOpeningLeak(opening: string, world: MysteryWorld): boolean {
  const cardNames = [
    ...world.suspects.map((entry) => entry.name),
    ...world.items.map((entry) => entry.name),
    ...world.locations.map((entry) => entry.name),
    ...world.times.map((entry) => entry.name),
  ];
  return cardNames.some((name) => containsExactTerm(opening, name)) ||
    /\b(theft|stol(?:e|en)|robbed|robbery|missing|disappeared?|crime|mystery|investigat(?:e|ed|ion)|suspic(?:ion|ious)|accus(?:e|ed|ation)|clue|evidence|thief|culprit|valuable|morning|afternoon|evening|luncheon|supper|teatime|meal)\b/i.test(opening);
}

function collectEffects(bible: CaseBible, throughClue: number, note1: boolean, note2: boolean) {
  const effects = bible.clueBlueprints
    .filter((clue) => clue.position <= throughClue)
    .flatMap((clue) => clue.rulesOut);
  if (note1) effects.push(...(bible.inspectorEvidence.find((note) => note.id === "N1")?.rulesOut ?? []));
  if (note2) effects.push(...(bible.inspectorEvidence.find((note) => note.id === "N2")?.rulesOut ?? []));
  return effects;
}

function remainingCounts(effects: Array<{ category: string; ids: string[] }>, world: MysteryWorld): Record<CategoryKey, number> {
  const eliminated = {
    suspects: new Set<string>(),
    items: new Set<string>(),
    locations: new Set<string>(),
    times: new Set<string>(),
  };
  effects.forEach((effect) => {
    const key = `${effect.category}s` as CategoryKey;
    effect.ids.forEach((id) => eliminated[key].add(id));
  });
  return {
    suspects: world.suspects.length - eliminated.suspects.size,
    items: world.items.length - eliminated.items.size,
    locations: world.locations.length - eliminated.locations.size,
    times: world.times.length - eliminated.times.size,
  };
}

function validateEffects(
  effects: Array<{ category: string; ids: string[] }>,
  answer: Answer,
  world: MysteryWorld,
  issues: string[],
  label: string
) {
  const validByCategory = {
    suspect: new Set(world.suspects.map((entry) => entry.id)),
    item: new Set(world.items.map((entry) => entry.id)),
    location: new Set(world.locations.map((entry) => entry.id)),
    time: new Set(world.times.map((entry) => entry.id)),
  };
  const answerByCategory = {
    suspect: answer.suspectId,
    item: answer.itemId,
    location: answer.locationId,
    time: answer.timeId,
  };
  effects.forEach((effect) => {
    effect.ids.forEach((id) => {
      const category = effect.category as keyof typeof validByCategory;
      if (!validByCategory[category]?.has(id)) issues.push(`${label} rules out unknown ${effect.category} ${id}.`);
      if (answerByCategory[category] === id) issues.push(`${label} rules out the answer ${id}.`);
    });
  });
}

function answerNamesFromIds(answer: Answer, world: MysteryWorld): string[] {
  return [
    world.suspects.find((entry) => entry.id === answer.suspectId)?.name,
    world.items.find((entry) => entry.id === answer.itemId)?.name,
    world.locations.find((entry) => entry.id === answer.locationId)?.name,
    world.times.find((entry) => entry.id === answer.timeId)?.name,
  ].filter((value): value is string => Boolean(value));
}

function containsExactTerm(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\W)${escaped}(?=$|\\W)`, "i").test(text);
}

function repeatedFourWordPhrases(clues: string[]): string[] {
  const phraseClues = new Map<string, Set<number>>();
  clues.forEach((clue, clueIndex) => {
    const words = clue.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
    for (let index = 0; index <= words.length - REPETITION_LIMITS.phraseWordCount; index += 1) {
      const phrase = words.slice(index, index + REPETITION_LIMITS.phraseWordCount).join(" ");
      const set = phraseClues.get(phrase) ?? new Set<number>();
      set.add(clueIndex);
      phraseClues.set(phrase, set);
    }
  });
  return [...phraseClues.entries()]
    .filter(([, clueIndexes]) => clueIndexes.size >= REPETITION_LIMITS.phraseAcrossClues)
    .map(([phrase]) => phrase);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function sameSet(left: string[], right: string[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return leftSet.size === left.length && rightSet.size === right.length &&
    leftSet.size === rightSet.size && [...leftSet].every((value) => rightSet.has(value));
}

function validateUniqueIds(entries: Array<{ id: string }>, label: string, issues: string[]): void {
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) {
    issues.push(`${label} IDs must be unique.`);
  }
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
