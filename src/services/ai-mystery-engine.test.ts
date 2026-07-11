import { describe, expect, it, vi } from "vitest";
import {
  buildMysteryWorld,
  generateMysteryV2,
  getLastMysteryEngineDebug,
} from "./ai-mystery-engine";
import {
  BlindAuditSchema,
  CausalTimelineSchema,
  CaseBibleSchema,
  CluePlanSchema,
  EvidenceDesignSchema,
  InspectorPackageSchema,
  RenderedMysterySchema,
  StoryFoundationSchema,
  toToolInputSchema,
  type Answer,
  type BlindAudit,
  type CaseBible,
  type InspectorPackage,
  type RenderedMystery,
} from "./ai-mystery-schemas";
import { selectTrackedItemIds } from "./ai-mystery-assembler";
import type { StructuredCallResult } from "./ai-mystery-provider";
import type { callStructured } from "./ai-mystery-provider";
import {
  evaluateBlindAudit,
  validateCaseBible,
  validatePublicPackage,
} from "./ai-mystery-validator";
import { buildRendererPrompt } from "../data/ai-mystery-prompts";
import originalMysteries from "../../data/mysteries.json";
import type { MysterySetup } from "./ai-mystery-setup";

function buildFixtures() {
  const setup: MysterySetup = {
    seed: 32,
    themeId: "AI01",
    difficulty: "expert",
    solution: { suspectId: "S05", itemId: "I07", locationId: "L07", timeId: "T09" },
  };
  const world = buildMysteryWorld();
  const answer: Answer = { ...setup.solution };
  const nonSuspects = world.suspects.map(({ id }) => id).filter((id) => id !== answer.suspectId);
  const nonItems = world.items.map(({ id }) => id).filter((id) => id !== answer.itemId);
  const nonLocations = world.locations.map(({ id }) => id).filter((id) => id !== answer.locationId);
  const nonTimes = world.times.map(({ id }) => id).filter((id) => id !== answer.timeId);
  const theftIndex = world.times.findIndex((time) => time.id === answer.timeId);
  const afterTheftIndex = Math.min(theftIndex + 1, world.times.length - 1);
  const afterTheftLocation = nonLocations[nonLocations.length - 1];

  const timeline: CaseBible["timeline"] = world.times.map((time, index) => {
    const isTheft = index === theftIndex;
    const isAfterTheft = index === afterTheftIndex;
    const itemIds = isTheft || isAfterTheft ? [answer.itemId] : [];
    if (index === 1) itemIds.push(nonItems[0]);
    if (index === 2) itemIds.push(nonItems[1]);
    if (index === 3) itemIds.push(nonItems[2]);
    return {
      id: `E${String(index + 1).padStart(2, "0")}`,
      timeId: time.id,
      locationId: isTheft ? answer.locationId : isAfterTheft ? afterTheftLocation : nonLocations[index % nonLocations.length],
      participantIds: [world.suspects[index].id, ...(isTheft || isAfterTheft ? [answer.suspectId] : [])],
      itemIds: [...new Set(itemIds)],
      actualEvent: isTheft ? "The culprit privately removes the selected valuable." : `The occasion advances through scheduled episode ${index + 1}.`,
      witnessIds: [world.suspects[(index + 1) % world.suspects.length].id],
    };
  });

  const effectsByPosition: Record<number, CaseBible["clueBlueprints"][number]["rulesOut"]> = {
    1: [{ category: "suspect", ids: nonSuspects.slice(0, 2), reason: "They are jointly accounted for." }],
    2: [{ category: "item", ids: nonItems.slice(0, 3), reason: "Their movements continue after the theft." }],
    3: [{ category: "location", ids: nonLocations.slice(0, 3), reason: "These places remained occupied." }],
    4: [{ category: "time", ids: nonTimes.slice(0, 3), reason: "The complete company was together." }],
    5: [{ category: "suspect", ids: nonSuspects.slice(2, 4), reason: "A shared errand accounts for them." }],
    6: [{ category: "location", ids: nonLocations.slice(3, 7), reason: "Independent activity accounts for them." }],
    7: [
      { category: "time", ids: nonTimes.slice(3, 6), reason: "The object history crosses these periods." },
      { category: "item", ids: nonItems.slice(5, 7), reason: "Two later sightings account for them." },
    ],
    8: [{ category: "suspect", ids: nonSuspects.slice(6, 7), reason: "A contradiction resolves innocently." }],
    9: [
      { category: "item", ids: nonItems.slice(7, 8), reason: "Its owner produces it." },
      { category: "location", ids: nonLocations.slice(7, 8), reason: "Its seal was intact." },
    ],
    10: [{ category: "time", ids: nonTimes.slice(6, 7), reason: "The sequence makes this period impossible." }],
  };

  const bible = CaseBibleSchema.parse({
    version: "2.0",
    occasion: {
      family: "charitable benefit",
      title: "The Village Memorial Subscription",
      purpose: "Raise restoration funds while settling control of the committee.",
      schedule: world.times.slice(0, 5).map((time, index) => ({ timeId: time.id, activity: `Scheduled activity ${index + 1}` })),
    },
    answer,
    centralTension: "Two committee factions both expect Mr. Boddy's endorsement.",
    theft: {
      theftEventId: timeline[theftIndex].id,
      discoveryEventId: timeline[afterTheftIndex].id,
      motive: "The culprit needs leverage over a private debt.",
      opportunity: "A scheduled diversion briefly leaves the display unwatched.",
      access: "The culprit has a legitimate committee errand.",
      method: "The valuable is slipped into a document case.",
      concealment: "It travels beneath corrected subscription papers.",
      coverStory: "The culprit claims to be correcting a donor total.",
      discovery: "A later inventory exposes the substitution.",
    },
    cast: world.suspects.map((suspect, index) => ({
      suspectId: suspect.id,
      eventRole: `Committee role ${index + 1}`,
      privateGoal: `Private objective ${index + 1}`,
      relationships: [{ suspectId: world.suspects[(index + 1) % world.suspects.length].id, nature: "A strained obligation" }],
      trueActionEventIds: [...new Set([
        `E${String(index + 1).padStart(2, "0")}`,
        ...(suspect.id === answer.suspectId ? [timeline[theftIndex].id] : []),
      ])],
    })),
    timeline,
    movements: [{
      id: "M01",
      eventId: timeline[afterTheftIndex].id,
      actorId: answer.suspectId,
      fromLocationId: answer.locationId,
      toLocationId: afterTheftLocation,
      method: "ordinary",
      itemIds: [answer.itemId],
    }],
    itemThreads: [
      { itemId: answer.itemId, eventIds: [timeline[theftIndex].id, timeline[afterTheftIndex].id], storyFunction: "The stolen object and its concealed transfer" },
      { itemId: nonItems[0], eventIds: ["E02"], storyFunction: "An innocent comparison object" },
      { itemId: nonItems[1], eventIds: ["E03"], storyFunction: "A donor's distracting concern" },
      { itemId: nonItems[2], eventIds: ["E04"], storyFunction: "A documented red herring" },
    ],
    deceptions: [
      { id: "D01", suspectId: answer.suspectId, kind: "lie", publicClaim: "The papers were never opened.", truth: "The papers concealed the valuable.", reason: "To hide the theft route.", contradictionEvidenceIds: ["A02"] },
      { id: "D02", suspectId: nonSuspects[0], kind: "omission", publicClaim: "Nothing personal was discussed.", truth: "A private debt was discussed.", reason: "To protect a friend from embarrassment.", contradictionEvidenceIds: ["A03"] },
    ],
    innocentThreads: [
      { id: "R01", suspectIds: [nonSuspects[0]], suspiciousAppearance: "A torn donor list looks like concealment.", innocentTruth: "It hides a modest anonymous gift.", evidenceIds: ["A04"] },
      { id: "R02", suspectIds: [nonSuspects[1]], suspiciousAppearance: "A private meeting appears conspiratorial.", innocentTruth: "The meeting settles an engagement concern.", evidenceIds: ["A05"] },
    ],
    evidenceAtoms: Array.from({ length: 12 }, (_, index) => ({
      id: `A${String(index + 1).padStart(2, "0")}`,
      eventId: `E${String((index % 10) + 1).padStart(2, "0")}`,
      publicFact: `Publicly discoverable fact ${index + 1}.`,
    })),
    inferences: [
      { id: "F01", evidenceIds: ["A01", "A02"], conclusion: "One account cannot be literal.", category: "suspect", importance: "important" },
      { id: "F02", evidenceIds: ["A03", "A04"], conclusion: "Several objects retain continuous histories.", category: "item", importance: "important" },
      { id: "F03", evidenceIds: ["A05", "A06"], conclusion: "The public schedule accounts for several rooms.", category: "location", importance: "important" },
      { id: "F04", evidenceIds: ["A07", "A08"], conclusion: "Two events must occur in that order.", category: "time", importance: "important" },
    ],
    clueBlueprints: Array.from({ length: 10 }, (_, index) => ({
      position: index + 1,
      source: index % 2 === 0 ? "Ashe's observation" : "A named guest's account relayed by Ashe",
      evidenceIds: [`A${String(index + 1).padStart(2, "0")}`],
      threadId: "committee-ledger",
      purpose: index === 0 ? "setup" : index === 9 ? "payoff" : index % 3 === 0 ? "contradiction" : "testimony",
      rulesOut: effectsByPosition[index + 1],
      supports: [],
      answerDimensions: [...new Set(effectsByPosition[index + 1].map((effect) => effect.category))],
    })),
    inspectorEvidence: [
      {
        id: "N1",
        availableAfterClue: 5,
        fact: "A numbered receipt proves two valuables remained in circulation.",
        evidenceIds: ["A11"],
        relatedCluePositions: [2, 5],
        rulesOut: [{ category: "item", ids: nonItems.slice(3, 5), reason: "The receipt accounts for them." }],
      },
      {
        id: "N2",
        availableAfterClue: 7,
        fact: "A corrected seating list independently resolves two apparent absences.",
        evidenceIds: ["A12"],
        relatedCluePositions: [4, 7],
        rulesOut: [
          { category: "suspect", ids: nonSuspects.slice(4, 6), reason: "The correction accounts for them." },
        ],
      },
    ],
    closingEvidenceIds: ["A01", "A06", "A09", "A10"],
    noveltySignature: {
      occasion: "village memorial subscription",
      motive: "private debt leverage",
      relationship: "strained committee obligation",
      deception: "valuable hidden beneath corrected accounts",
    },
  });

  const answerNames = [
    world.suspects.find(({ id }) => id === answer.suspectId)!.name,
    world.items.find(({ id }) => id === answer.itemId)!.name,
    world.locations.find(({ id }) => id === answer.locationId)!.name,
    world.times.find(({ id }) => id === answer.timeId)!.name,
  ];
  const clueTexts = [
    "A folded invitation carried a pencilled alteration that only two committee members had seen.",
    "Beside the display, one numbered receipt bore a donor's unmistakable correction.",
    "Across the central argument, a private promise explained why one guest withheld a meeting.",
    "Before the speeches concluded, the public schedule placed several companions together.",
    "Under a blotting sheet lay the second half of an apparently torn subscription list.",
    "From the sealed cabinets came a sequence of labels whose order could still be checked.",
    "During a quiet exchange, two accounts disagreed about which document case had been opened.",
    "Later examination resolved an innocent secret but left the altered total unexplained.",
    "Careful comparison joined the receipt number to a route through the gathering.",
    "Finally, the corrected ledger made the concealment possible without changing the public total.",
  ];
  const mystery = RenderedMysterySchema.parse({
    opening: "Mr. Boddy welcomed a broad circle of acquaintances for a charitable exhibition. The gathering was intended to fund restoration of the village memorial.",
    clues: clueTexts.map((text, index) => ({ position: index + 1, text, evidenceIds: [`A${String(index + 1).padStart(2, "0")}`] })),
    closing: `${answerNames[0]} took the ${answerNames[1]} from the ${answerNames[2]} at ${answerNames[3]}, carrying it beneath the corrected subscription papers. The numbered receipt, altered ledger, and ordered labels exposed the route without requiring a confession.`,
    closingEvidenceIds: bible.closingEvidenceIds,
  });
  const inspector = InspectorPackageSchema.parse({
    notes: [
      { id: "N1", text: "A numbered receipt establishes that two catalogued valuables continued to circulate after the first discrepancy.", relatedClues: [2, 5], evidenceIds: ["A11"] },
      { id: "N2", text: "The corrected seating list independently accounts for two apparent absences in the public schedule.", relatedClues: [4, 7], evidenceIds: ["A12"] },
    ],
  });

  const candidatesAt = (stage: 5 | 7 | 10) => {
    if (stage === 5) return {
      suspects: [answer.suspectId, ...nonSuspects.slice(4)],
      items: [answer.itemId, ...nonItems.slice(5)],
      locations: [answer.locationId, ...nonLocations.slice(3)],
      times: [answer.timeId, ...nonTimes.slice(3)],
    };
    if (stage === 7) return {
      suspects: [answer.suspectId, ...nonSuspects.slice(6)],
      items: [answer.itemId, ...nonItems.slice(7)],
      locations: [answer.locationId, ...nonLocations.slice(7)],
      times: [answer.timeId, ...nonTimes.slice(6)],
    };
    return {
      suspects: [answer.suspectId, ...nonSuspects.slice(7)],
      items: [answer.itemId, ...nonItems.slice(8)],
      locations: [answer.locationId, ...nonLocations.slice(8)],
      times: [answer.timeId, ...nonTimes.slice(7)],
    };
  };
  const audit = BlindAuditSchema.parse({
    snapshots: ([5, 7, 10] as const).map((afterClue) => ({
      afterClue,
      candidates: candidatesAt(afterClue),
      leadingTheory: "The corrected accounts connect an object route to a concealed obligation.",
      singleSolutionApparent: false,
    })),
    reconstructedTimeline: ["The benefit opens with competing committee expectations.", "Corrections to the accounts create a brief opportunity.", "Later records expose a concealed transfer."],
    detectedDeceptions: ["One account hides the document case.", "An innocent omission protects a friend."],
    disconnectedCluePositions: [],
    repeatedLanguage: [],
    coherentStory: true,
    fairMystery: true,
    revisionNeeded: false,
    reasons: [],
  });

  const foundation = StoryFoundationSchema.parse({
    occasion: {
      title: bible.occasion.title,
      purpose: bible.occasion.purpose,
      schedule: bible.occasion.schedule,
    },
    centralTension: bible.centralTension,
    theft: {
      motive: bible.theft.motive,
      opportunity: bible.theft.opportunity,
      access: bible.theft.access,
      method: bible.theft.method,
      concealment: bible.theft.concealment,
      coverStory: bible.theft.coverStory,
      discovery: bible.theft.discovery,
    },
    cast: bible.cast.map(({ trueActionEventIds: _actions, ...member }) => member),
    noveltySignature: bible.noveltySignature,
  });
  const trackedItemIds = selectTrackedItemIds(setup.seed, answer, world);
  const regularEvent = (
    index: number,
    timeId: string,
    phase: "before_theft" | "theft" | "between" | "discovery" | "after_discovery",
    itemIds: string[] = []
  ) => ({
    phase,
    timeId,
    locationId: nonLocations[index % nonLocations.length],
    participantIds: [world.suspects[index].id],
    itemIds,
    actualEvent: `Causal timeline episode ${index + 1}.`,
    witnessIds: [world.suspects[(index + 1) % world.suspects.length].id],
    arrivals: index === 0 ? [{
      actorId: world.suspects[index].id,
      fromLocationId: nonLocations[1],
      method: "ordinary" as const,
      itemIds: [],
    }] : [],
  });
  const extraTrackedItems = trackedItemIds.filter((id) => id !== answer.itemId);
  const timelineDraft = CausalTimelineSchema.parse({
    events: [
      regularEvent(0, "T01", "before_theft", extraTrackedItems[0] ? [extraTrackedItems[0]] : []),
      regularEvent(1, "T02", "before_theft", extraTrackedItems[1] ? [extraTrackedItems[1]] : []),
      regularEvent(2, "T03", "before_theft", extraTrackedItems[2] ? [extraTrackedItems[2]] : []),
      regularEvent(3, "T04", "before_theft", extraTrackedItems.slice(3)),
      {
        ...regularEvent(4, "T09", "theft", [answer.itemId]),
        participantIds: [answer.suspectId],
        actualEvent: "The culprit removes the valuable during the planned diversion.",
        witnessIds: [],
      },
      regularEvent(5, "T09", "between"),
      regularEvent(6, "T09", "between"),
      regularEvent(7, "T10", "discovery"),
      regularEvent(8, "T10", "after_discovery"),
      regularEvent(9, "T10", "after_discovery"),
    ],
    itemRoles: trackedItemIds.map((itemId, index) => ({
      itemId,
      storyFunction: index === 0 ? "The stolen and concealed valuable" : `Innocent object thread ${index}`,
    })),
  });
  const evidenceDesign = EvidenceDesignSchema.parse({
    evidenceAtoms: Array.from({ length: 14 }, (_, index) => ({
      key: `fact_${index + 1}`,
      eventId: `E${String((index % 10) + 1).padStart(2, "0")}`,
      publicFact: `Publicly discoverable fact ${index + 1}.`,
      surface: index === 10 ? "inspector_1" : index === 11 ? "inspector_2" : "clue",
    })),
    deceptions: [
      { suspectId: answer.suspectId, kind: "lie", publicClaim: "The papers were never opened.", truth: "The papers concealed the valuable.", reason: "To hide the theft route.", contradictionEvidenceKeys: ["fact_2"] },
      { suspectId: nonSuspects[0], kind: "omission", publicClaim: "Nothing personal was discussed.", truth: "A private debt was discussed.", reason: "To protect a friend.", contradictionEvidenceKeys: ["fact_3"] },
    ],
    innocentThreads: [
      { suspectIds: [nonSuspects[0]], suspiciousAppearance: "A torn list appears concealed.", innocentTruth: "It hides an anonymous gift.", evidenceKeys: ["fact_4"] },
      { suspectIds: [nonSuspects[1]], suspiciousAppearance: "A private meeting looks conspiratorial.", innocentTruth: "It settles a personal concern.", evidenceKeys: ["fact_5"] },
    ],
    inferences: [
      { evidenceKeys: ["fact_1", "fact_2"], conclusion: "One account cannot be literal.", category: "suspect", importance: "important" },
      { evidenceKeys: ["fact_3", "fact_4"], conclusion: "Several objects retain continuous histories.", category: "item", importance: "important" },
      { evidenceKeys: ["fact_5", "fact_6"], conclusion: "The schedule accounts for several rooms.", category: "location", importance: "important" },
      { evidenceKeys: ["fact_7", "fact_8"], conclusion: "Two events must occur in that order.", category: "time", importance: "important" },
    ],
  });
  const clueAssignments = Array.from({ length: 10 }, (_, index) => ({
      source: index % 2 === 0 ? "Ashe's observation" : "A named guest's account",
      evidenceKeys: [`fact_${index + 1}`],
      threadId: "committee-ledger",
      purpose: index === 0 ? "setup" : index === 9 ? "payoff" : index % 3 === 0 ? "contradiction" : "testimony",
  }));
  const cluePlan = CluePlanSchema.parse({
    clues: clueAssignments,
    inspectorNotes: [
      { fact: bible.inspectorEvidence[0].fact, evidenceKeys: ["fact_11"], relatedCluePositions: [2, 5] },
      { fact: bible.inspectorEvidence[1].fact, evidenceKeys: ["fact_12"], relatedCluePositions: [4, 7] },
    ],
    closingEvidenceKeys: ["fact_1", "fact_6", "fact_9", "fact_10"],
  });

  return { setup, world, answer, bible, mystery, inspector, audit, foundation, timelineDraft, evidenceDesign, cluePlan };
}

function sequenceProvider(values: unknown[]): typeof callStructured {
  const queue = [...values];
  const mock = vi.fn(async (): Promise<StructuredCallResult<unknown>> => ({
    value: queue.shift(),
    raw: "{}",
    durationMs: 1,
    usage: { inputTokens: 10, outputTokens: 10 },
    stopReason: "tool_use",
  }));
  return mock as unknown as typeof callStructured;
}

function architectureValues(fixture: ReturnType<typeof buildFixtures>): unknown[] {
  return [fixture.foundation, fixture.timelineDraft, fixture.evidenceDesign, fixture.cluePlan];
}

describe("AI Mystery Engine V2 validation", () => {
  it("keeps strict architecture grammars small and fixed mechanics out of model outputs", () => {
    const schemas = [StoryFoundationSchema, CausalTimelineSchema, EvidenceDesignSchema, CluePlanSchema]
      .map((schema) => JSON.stringify(toToolInputSchema(schema)));
    expect(Math.max(...schemas.map((schema) => schema.length))).toBeLessThan(2_000);
    expect(schemas.join(" ")).not.toContain("availableAfterClue");
    expect(schemas.join(" ")).not.toContain("answerDimensions");
    expect(schemas.join(" ")).not.toContain("caseBibleJson");
  });

  it("accepts a connected, fair-play case bible and public package", () => {
    const fixture = buildFixtures();
    expect(validateCaseBible(fixture.bible, fixture.answer, fixture.world)).toEqual([]);
    expect(validatePublicPackage({
      bible: fixture.bible,
      mystery: fixture.mystery,
      inspector: fixture.inspector,
      world: fixture.world,
    })).toEqual([]);
    expect(evaluateBlindAudit(fixture.audit, fixture.answer, fixture.world)).toEqual([]);
  });

  it("rejects answer elimination, opening leakage, and Inspector answer leakage", () => {
    const fixture = buildFixtures();
    const compromisedBible = structuredClone(fixture.bible);
    compromisedBible.clueBlueprints[0].rulesOut[0].ids.push(fixture.answer.suspectId);
    expect(validateCaseBible(compromisedBible, fixture.answer, fixture.world).join(" ")).toContain("rules out the answer");

    const compromisedMystery = structuredClone(fixture.mystery);
    compromisedMystery.opening += ` ${fixture.world.locations.find(({ id }) => id === fixture.answer.locationId)!.name}.`;
    const compromisedInspector = structuredClone(fixture.inspector);
    compromisedInspector.notes[0].text += ` ${fixture.world.items.find(({ id }) => id === fixture.answer.itemId)!.name}.`;
    const issues = validatePublicPackage({
      bible: fixture.bible,
      mystery: compromisedMystery,
      inspector: compromisedInspector,
      world: fixture.world,
    }).join(" ");
    expect(issues).toContain("Opening contains mystery details");
    expect(issues).toContain("states an answer card");
  });

  it("rejects broken movement, setup/payoff, and evidence provenance", () => {
    const fixture = buildFixtures();
    const brokenBible = structuredClone(fixture.bible);
    brokenBible.movements[0].method = "secret_passage";
    brokenBible.clueBlueprints[0].purpose = "testimony";
    const bibleIssues = validateCaseBible(brokenBible, fixture.answer, fixture.world).join(" ");
    expect(bibleIssues).toContain("nonexistent secret passage");
    expect(bibleIssues).toContain("payoff without an earlier setup");

    const brokenMystery = structuredClone(fixture.mystery);
    brokenMystery.clues[0].evidenceIds = ["A02"];
    brokenMystery.closingEvidenceIds = ["A01", "A02", "A03", "A04"];
    const publicIssues = validatePublicPackage({
      bible: fixture.bible,
      mystery: brokenMystery,
      inspector: fixture.inspector,
      world: fixture.world,
    }).join(" ");
    expect(publicIssues).toContain("changed its case-bible evidence provenance");
    expect(publicIssues).toContain("Closing changed its case-bible evidence provenance");
  });

  it("rejects an audit that narrows too early or loses the hidden answer", () => {
    const fixture = buildFixtures();
    const brokenAudit = structuredClone(fixture.audit);
    brokenAudit.snapshots[0].singleSolutionApparent = true;
    brokenAudit.snapshots[2].candidates.items = [fixture.answer.itemId];
    brokenAudit.snapshots[2].candidates.suspects = brokenAudit.snapshots[2].candidates.suspects.filter(
      (id) => id !== fixture.answer.suspectId
    );
    const issues = evaluateBlindAudit(brokenAudit, fixture.answer, fixture.world).join(" ");
    expect(issues).toContain("single solution appears too early");
    expect(issues).toContain("Answer suspect is not plausible");
    expect(issues).toContain("final candidate fields should contain 2–3");
  });

  it("uses original cases only as distilled principles, never prompt examples", () => {
    const fixture = buildFixtures();
    const prompt = buildRendererPrompt({ bible: fixture.bible, world: fixture.world }).prompt;
    const sourceClues = originalMysteries.flatMap((mystery) => mystery.butler_clues);
    expect(prompt).toContain("principles only; never copy source wording");
    expect(sourceClues.some((clue) => prompt.includes(clue))).toBe(false);
  });
});

describe("AI Mystery Engine V2 orchestration", () => {
  it("uses schema-enforced architecture stages before rendering", async () => {
    const fixture = buildFixtures();
    const provider = sequenceProvider([...architectureValues(fixture), fixture.mystery, fixture.inspector, fixture.audit]);
    const progress: string[] = [];
    const result = await generateMysteryV2("test-key", {
      setup: fixture.setup,
      provider,
      onProgress: (event) => {
        progress.push(event.stage);
      },
    });

    expect(provider).toHaveBeenCalledTimes(7);
    expect(result.butlerClues).toHaveLength(10);
    expect(result.inspectorNotes).toHaveLength(2);
    expect(result.mysterySignature).toContain("village memorial subscription");
    expect(progress.at(-1)).toBe("complete");
  });

  it("keeps fixed CaseBible mechanics under application ownership", async () => {
    const fixture = buildFixtures();
    const provider = sequenceProvider([
      ...architectureValues(fixture),
      fixture.mystery,
      fixture.inspector,
      fixture.audit,
    ]);
    await expect(generateMysteryV2("test-key", { setup: fixture.setup, provider })).resolves.toBeDefined();
    const bible = getLastMysteryEngineDebug()?.caseBible;
    expect(bible?.version).toBe("2.0");
    expect(bible?.answer).toEqual(fixture.answer);
    expect(bible?.clueBlueprints.map(({ position }) => position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(bible?.clueBlueprints.every((clue) => clue.answerDimensions.length <= 2)).toBe(true);
    expect(bible?.inspectorEvidence.map(({ id, availableAfterClue }) => [id, availableAfterClue])).toEqual([
      ["N1", 5],
      ["N2", 7],
    ]);
  });

  it("discards routine arrival noise and guarantees every code-selected item a baseline appearance", async () => {
    const fixture = buildFixtures();
    const noisyTimeline = structuredClone(fixture.timelineDraft);
    const omittedItemId = noisyTimeline.itemRoles[2].itemId;
    noisyTimeline.events.forEach((event, eventIndex) => {
      event.itemIds = event.itemIds.filter((id) => id !== omittedItemId);
      event.arrivals.push(...Array.from({ length: 3 }, (_, arrivalIndex) => ({
        actorId: fixture.world.suspects[(eventIndex + arrivalIndex) % fixture.world.suspects.length].id,
        fromLocationId: fixture.world.locations[(eventIndex + arrivalIndex + 1) % fixture.world.locations.length].id,
        method: "ordinary" as const,
        itemIds: [],
      })));
    });
    const provider = sequenceProvider([
      fixture.foundation,
      noisyTimeline,
      fixture.evidenceDesign,
      fixture.cluePlan,
      fixture.mystery,
      fixture.inspector,
      fixture.audit,
    ]);

    await expect(generateMysteryV2("test-key", { setup: fixture.setup, provider })).resolves.toBeDefined();
    const bible = getLastMysteryEngineDebug()?.caseBible;
    expect(bible?.movements.length).toBeLessThanOrEqual(20);
    expect(bible?.itemThreads.find(({ itemId }) => itemId === omittedItemId)?.eventIds.length).toBeGreaterThan(0);
  });

  it("revises once and performs a second blind audit", async () => {
    const fixture = buildFixtures();
    const failedAudit: BlindAudit = {
      ...fixture.audit,
      revisionNeeded: true,
      reasons: ["One clue needs a clearer link to the shared ledger."],
    };
    const revised = { ...fixture.mystery, notes: fixture.inspector.notes };
    const provider = sequenceProvider([
      ...architectureValues(fixture),
      fixture.mystery,
      fixture.inspector,
      failedAudit,
      revised,
      fixture.audit,
    ]);

    await expect(generateMysteryV2("test-key", { setup: fixture.setup, provider })).resolves.toBeDefined();
    expect(provider).toHaveBeenCalledTimes(9);
  });

  it("fails clearly when the final blind audit still rejects the package", async () => {
    const fixture = buildFixtures();
    const failedAudit: BlindAudit = {
      ...fixture.audit,
      revisionNeeded: true,
      reasons: ["The answer dominates before the final clue."],
    };
    const revised = { ...fixture.mystery, notes: fixture.inspector.notes };
    const provider = sequenceProvider([
      ...architectureValues(fixture),
      fixture.mystery,
      fixture.inspector,
      failedAudit,
      revised,
      failedAudit,
    ]);

    await expect(generateMysteryV2("test-key", { setup: fixture.setup, provider }))
      .rejects.toThrow("Final blind audit rejected the mystery");
    expect(provider).toHaveBeenCalledTimes(9);
  });
});
