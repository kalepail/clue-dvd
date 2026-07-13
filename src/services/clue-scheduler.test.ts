import { describe, expect, it } from "vitest";
import { SeededRandom } from "./seeded-random";
import { ITEMS, LOCATIONS, SUSPECTS, TIME_PERIODS } from "../data/game-elements";
import { applyOccasionTexture, requireTime, simulateWorld, STAFF_SUSPECT_IDS } from "./world-sim";
import { DIMS, factKillsCell, harvestFacts, isMentionOnly } from "./fact-harvest";
import { scheduleMystery, type Schedule } from "./clue-scheduler";
import type { Answer } from "./ai-mystery-schemas";

const SWEEP_SEEDS = 120;
const MAX_WORLD_ATTEMPTS = 30;

function randomAnswer(seed: number): Answer {
  const rng = new SeededRandom(seed * 7_919 + 13);
  return {
    suspectId: rng.pick(SUSPECTS).id,
    itemId: rng.pick(ITEMS).id,
    locationId: rng.pick(LOCATIONS).id,
    timeId: rng.pick(TIME_PERIODS).id,
  };
}

function scheduleFor(seed: number): {
  schedule: Schedule;
  answer: Answer;
  world: ReturnType<typeof simulateWorld>;
  factIds: Map<string, ReturnType<typeof harvestFacts>[number]>;
} {
  const answer = randomAnswer(seed);
  for (let attempt = 1; attempt <= MAX_WORLD_ATTEMPTS; attempt += 1) {
    const world = simulateWorld({ seed, attempt, answer, occasionFamily: "test occasion" });
    const facts = harvestFacts(world);
    const schedule = scheduleMystery({ facts, answer, seed: seed * 31 + attempt });
    if (schedule) {
      return { schedule, answer, world, factIds: new Map(facts.map((fact) => [fact.id, fact])) };
    }
  }
  throw new Error(`No schedule for seed ${seed} within ${MAX_WORLD_ATTEMPTS} world attempts`);
}

describe("clue scheduler fair-play guarantees (seed sweep)", () => {
  const results = Array.from({ length: SWEEP_SEEDS }, (_, index) => scheduleFor(index + 1));

  it("schedules every seed from its first simulated world without target-chasing retries", () => {
    expect(results).toHaveLength(SWEEP_SEEDS);
    expect(results.every(({ world }) => world.attempt === 1)).toBe(true);
  });

  it("tracks deduction as diagnostics while preserving more than one joint solution", () => {
    for (const { schedule } of results) {
      let previousSolutions = 12_100;
      let previousCounts = { suspects: 10, items: 11, locations: 11, times: 10 };
      for (const point of schedule.trajectory) {
        expect(point.remainingSolutions).toBeLessThanOrEqual(previousSolutions);
        expect(point.remainingSolutions).toBeGreaterThan(1);
        expect(point.counts.suspects).toBeLessThanOrEqual(previousCounts.suspects);
        expect(point.counts.items).toBeLessThanOrEqual(previousCounts.items);
        expect(point.counts.locations).toBeLessThanOrEqual(previousCounts.locations);
        expect(point.counts.times).toBeLessThanOrEqual(previousCounts.times);
        previousSolutions = point.remainingSolutions;
        previousCounts = point.counts;
      }
    }
  });

  it("does not force final category projections into the former windows", () => {
    const outsideFormerWindow = results.filter(({ schedule }) => {
      const final = schedule.finalCounts;
      return final.suspects < 3 || final.suspects > 7 ||
        final.items < 4 || final.items > 7 ||
        final.locations < 3 || final.locations > 5 ||
        final.times < 1 || final.times > 3;
    });
    expect(outsideFormerWindow.length).toBeGreaterThan(0);
  });

  it("keeps every list-shaped clue to at most two eliminations", () => {
    for (const { schedule, answer, factIds } of results) {
      for (const reveal of schedule.reveals) {
        const fact = factIds.get(reveal.factId)!;
        // Item sweeps name at most two pieces (the answer-anchor bundle may
        // be wider, but it eliminates no item outright — the answer is in it).
        if (fact.kind === "item_intact" && !fact.itemIds.includes(answer.itemId)) {
          expect(fact.itemIds.length).toBeLessThanOrEqual(2);
        }
        if (fact.kind === "room_undisturbed") {
          expect(fact.locationIds.length).toBeLessThanOrEqual(2);
        }
        // Secured sets name at most two; only the Midnight grand-lockup is
        // wider, and it enumerates nothing (generic "the cases were locked").
        if (fact.kind === "items_secured" && fact.itemIds.length > 2) {
          expect(fact.locationIds.length).toBe(0);
        }
      }
    }
  });

  it("emits 12 reveals with notes at positions 6 and 9 and clues numbered 1-10", () => {
    for (const { schedule } of results) {
      expect(schedule.reveals).toHaveLength(12);
      const note1 = schedule.reveals.find((reveal) => reveal.slot === "note1")!;
      const note2 = schedule.reveals.find((reveal) => reveal.slot === "note2")!;
      expect(note1.position).toBe(6);
      expect(note2.position).toBe(9);
      const clueNumbers = schedule.reveals
        .filter((reveal) => reveal.slot === "clue")
        .map((reveal) => reveal.clueNumber);
      expect(clueNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    }
  });

  it("does not regress the bookkeeping-heavy ai-last-7 world", () => {
    const seed = 1_783_898_884_312;
    const answer: Answer = { suspectId: "S08", itemId: "I11", locationId: "L05", timeId: "T07" };
    const world = simulateWorld({ seed, attempt: 3, answer, occasionFamily: "family commemoration" });
    const facts = harvestFacts(world);
    const schedule = scheduleMystery({ facts, answer, seed: seed * 31 + 3 });
    expect(schedule).not.toBeNull();

    const byId = new Map(facts.map((fact) => [fact.id, fact]));
    const selected = schedule!.reveals.map((reveal) => byId.get(reveal.factId)!);
    const pureBookkeeping = selected.filter((fact) =>
      ["item_intact", "items_secured", "item_offsite", "item_home", "room_undisturbed"].includes(fact.kind)
    );
    const sceneFacts = selected.filter((fact) =>
      ["gathering", "group_presence", "solo_presence", "departure", "claim", "thread_color", "personal_remark"].includes(fact.kind)
    );

    expect(pureBookkeeping.length).toBeLessThanOrEqual(4);
    expect(sceneFacts.length).toBeGreaterThanOrEqual(6);
  });

  it("preserves the ai-last-8 breakaway as one continuous social episode", () => {
    const seed = 1_783_901_689_070;
    const answer: Answer = { suspectId: "S09", itemId: "I06", locationId: "L09", timeId: "T04" };
    const world = simulateWorld({ seed, attempt: 1, answer, occasionFamily: "weekend house tournament" });
    const remarks = world.transitionRemarks.filter((remark) =>
      remark.suspectId === answer.suspectId && remark.fromTimeId === "T03" && remark.toTimeId === "T04"
    );
    expect(remarks).toHaveLength(1);

    const facts = harvestFacts(world);
    const breakaway = facts.find((fact) =>
      fact.kind === "group_presence" &&
      fact.suspectIds.includes("S09") &&
      fact.suspectTimePairs?.some((pair) => pair.suspectId === "S09" && pair.timeId === "T03") &&
      fact.suspectTimePairs?.some((pair) => pair.suspectId === "S05" && pair.timeId === "T04") &&
      fact.suspectTimePairs?.some((pair) => pair.suspectId === "S08" && pair.timeId === "T04")
    );
    expect(breakaway).toBeDefined();
    expect(breakaway!.writerBrief).toContain("stepped away");

    const schedule = scheduleMystery({ facts, answer, seed: seed * 31 + 1 });
    expect(schedule).not.toBeNull();
    expect(schedule!.reveals.some((reveal) => reveal.factId === breakaway!.id)).toBe(true);
    const selectedFacts = new Map(facts.map((fact) => [fact.id, fact]));
    const selectedLieFacts = schedule!.reveals
      .map((reveal) => selectedFacts.get(reveal.factId)!)
      .filter((fact) => fact.threadId === "LIE");
    expect(selectedLieFacts.map((fact) => fact.kind).sort()).toEqual(["claim", "group_presence"]);

    applyOccasionTexture(world, {
      groupActivities: ["comparing tournament scorecards"],
      transitionRemarks: ["I left my mallet beside the lawn"],
      gatheringDetails: ["tallying the tournament standings"],
      inspectionContexts: ["collecting abandoned scorecards"],
      observationContexts: ["checking the prize display"],
      uncertainObservations: ["a scorecard being altered behind the hedge"],
    });
    const themedBreakaway = harvestFacts(world).find((fact) => fact.id === breakaway!.id)!;
    expect(themedBreakaway.writerBrief).toContain("comparing tournament scorecards");
    expect(themedBreakaway.writerBrief).toContain("I left my mallet beside the lawn");
  });

  it("allows clue styles and information weights to appear anywhere in the reveal order", () => {
    const positionsByKind = new Map<string, number[]>();
    let earlyConstraining = 0;
    let lateColor = 0;
    let formerlyRestrictedNote = 0;

    for (const { schedule, factIds } of results) {
      for (const reveal of schedule.reveals) {
        const fact = factIds.get(reveal.factId)!;
        const positions = positionsByKind.get(fact.kind) ?? [];
        positions.push(reveal.position);
        positionsByKind.set(fact.kind, positions);
        if (reveal.position <= 5 && !isMentionOnly(fact)) earlyConstraining += 1;
        if (reveal.position >= 10 && isMentionOnly(fact)) lateColor += 1;
        if (reveal.slot !== "clue" && !fact.noteSuitable) formerlyRestrictedNote += 1;
      }
    }

    expect(earlyConstraining).toBeGreaterThan(0);
    expect(lateColor).toBeGreaterThan(0);
    expect(formerlyRestrictedNote).toBeGreaterThan(0);
    const kindsSpanningTheGame = [...positionsByKind.values()].filter(
      (positions) => positions.some((position) => position <= 5) && positions.some((position) => position >= 10)
    );
    expect(kindsSpanningTheGame.length).toBeGreaterThanOrEqual(5);
  });

  it("harvests truthful group transitions and lets them compete without requiring one", () => {
    let harvestedTransitions = 0;
    let selectedTransitions = 0;
    let transitionsWithRemarks = 0;

    for (const { schedule, world, factIds } of results) {
      const selectedIds = new Set(schedule.reveals.map((reveal) => reveal.factId));
      for (const fact of factIds.values()) {
        if (fact.kind !== "group_presence" || !fact.suspectTimePairs) continue;
        harvestedTransitions += 1;
        if (selectedIds.has(fact.id)) selectedTransitions += 1;
        if (fact.writerBrief.includes("they said")) transitionsWithRemarks += 1;
        expect(fact.timeIds.length).toBeGreaterThanOrEqual(2);

        for (const pair of fact.suspectTimePairs) {
          const placement = world.movement[pair.timeId][pair.suspectId];
          expect(placement.locationId).toBe(fact.locationIds[0]);
          expect(placement.social).toBe("group");
          expect(factKillsCell(fact, pair.suspectId, DIMS.items[0], DIMS.locations[0], pair.timeId)).toBe(true);
        }

        const absentCrossPair = fact.suspectIds.flatMap((suspectId) =>
          fact.timeIds.map((timeId) => ({ suspectId, timeId }))
        ).find((candidate) => !fact.suspectTimePairs!.some(
          (pair) => pair.suspectId === candidate.suspectId && pair.timeId === candidate.timeId
        ));
        expect(absentCrossPair).toBeDefined();
        expect(factKillsCell(
          fact,
          absentCrossPair!.suspectId,
          DIMS.items[0],
          DIMS.locations[0],
          absentCrossPair!.timeId
        )).toBe(false);
      }
    }

    expect(harvestedTransitions).toBeGreaterThan(0);
    expect(selectedTransitions).toBeGreaterThan(0);
    expect(selectedTransitions).toBeLessThan(harvestedTransitions);
    expect(transitionsWithRemarks).toBeGreaterThan(0);
  });
});

describe("world simulation invariants (seed sweep)", () => {
  it("adds occasion texture without changing any fact identity or deduction semantics", () => {
    const answer = randomAnswer(41);
    const world = simulateWorld({ seed: 41, attempt: 1, answer, occasionFamily: "costume fete" });
    const before = harvestFacts(world);
    applyOccasionTexture(world, {
      groupActivities: ["comparing elaborate masks", "repairing costume ribbons"],
      transitionRemarks: ["I ought to fetch my cloak", "I promised to mend a loose mask"],
      gatheringDetails: ["judging the most ingenious disguises"],
      inspectionContexts: ["collecting discarded costume ribbons"],
      observationContexts: ["putting abandoned dance cards in order"],
      uncertainObservations: ["a masked guest hurrying away with a torn ribbon"],
    });
    const after = harvestFacts(world);
    const semantics = (fact: (typeof before)[number]) => ({
      id: fact.id,
      kind: fact.kind,
      suspectIds: fact.suspectIds,
      itemIds: fact.itemIds,
      locationIds: fact.locationIds,
      timeIds: fact.timeIds,
      suspectTimePairs: fact.suspectTimePairs,
      cutoffOrder: fact.cutoffOrder,
      mentions: fact.mentions,
    });

    expect(after.map(semantics)).toEqual(before.map(semantics));
    expect(after.some((fact, index) => fact.writerBrief !== before[index].writerBrief)).toBe(true);
    expect(after.some((fact) => /mask|costume|ribbon|dance card/i.test(fact.writerBrief))).toBe(true);
    expect(() => harvestFacts(world)).not.toThrow();
  });

  it("embeds the theft consistently and never contradicts the answer", () => {
    for (let seed = 1; seed <= SWEEP_SEEDS; seed += 1) {
      const answer = randomAnswer(seed);
      const world = simulateWorld({ seed, attempt: 1, answer, occasionFamily: "test occasion" });

      // Thief alone at the answer location at the answer time.
      const placement = world.movement[answer.timeId][answer.suspectId];
      expect(placement.locationId).toBe(answer.locationId);
      expect(placement.social).toBe("solo");
      // Nobody else in the answer room at the answer time.
      for (const [suspectId, other] of Object.entries(world.movement[answer.timeId])) {
        if (suspectId === answer.suspectId) continue;
        expect(other.locationId === answer.locationId).toBe(false);
      }
      // No gathering at the answer time; staff always present.
      expect(world.gatherings.some((gathering) => gathering.timeId === answer.timeId)).toBe(false);
      for (const slot of world.slots) {
        for (const staffId of STAFF_SUSPECT_IDS) {
          expect(world.movement[slot.id][staffId].social).not.toBe("away");
        }
      }
      // Answer item at home in the answer room and never offsite or a decoy.
      expect(world.items[answer.itemId].homeLocationId).toBe(answer.locationId);
      expect(world.items[answer.itemId].offsite).toBeNull();
      expect(world.decoyItemIds).not.toContain(answer.itemId);
      // Closures never cover the answer room; discovery is after the theft.
      if (world.roomClosure) expect(world.roomClosure.locationId).not.toBe(answer.locationId);
      if (world.discovery) {
        expect(requireTime(world.discovery.timeId).order).toBeGreaterThan(requireTime(answer.timeId).order);
      }
      // Harvest asserts internally that no fact can rule out the answer.
      const facts = harvestFacts(world);
      expect(facts.some((fact) =>
        fact.kind === "solo_presence" &&
        fact.suspectIds.includes(answer.suspectId) &&
        fact.locationIds.includes(answer.locationId) &&
        fact.timeIds.includes(answer.timeId)
      )).toBe(false);
    }
  });
});
