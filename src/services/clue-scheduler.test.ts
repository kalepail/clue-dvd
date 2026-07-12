import { describe, expect, it } from "vitest";
import { SeededRandom } from "./seeded-random";
import { ITEMS, LOCATIONS, SUSPECTS, TIME_PERIODS } from "../data/game-elements";
import { requireTime, simulateWorld, STAFF_SUSPECT_IDS } from "./world-sim";
import { factSpotlightsAnswer, harvestFacts, isMentionOnly } from "./fact-harvest";
import { FINAL_TARGET, scheduleMystery, type Schedule } from "./clue-scheduler";
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

function scheduleFor(seed: number): { schedule: Schedule; answer: Answer; factIds: Map<string, ReturnType<typeof harvestFacts>[number]> } {
  const answer = randomAnswer(seed);
  for (let attempt = 1; attempt <= MAX_WORLD_ATTEMPTS; attempt += 1) {
    const world = simulateWorld({ seed, attempt, answer, occasionFamily: "test occasion" });
    const facts = harvestFacts(world);
    const schedule = scheduleMystery({ facts, answer, seed: seed * 31 + attempt });
    if (schedule) {
      return { schedule, answer, factIds: new Map(facts.map((fact) => [fact.id, fact])) };
    }
  }
  throw new Error(`No schedule for seed ${seed} within ${MAX_WORLD_ATTEMPTS} world attempts`);
}

describe("clue scheduler fair-play guarantees (seed sweep)", () => {
  const results = Array.from({ length: SWEEP_SEEDS }, (_, index) => scheduleFor(index + 1));

  it("schedules every seed within the world-attempt budget", () => {
    expect(results).toHaveLength(SWEEP_SEEDS);
  });

  it("holds checkpoint A: at least 4 candidates everywhere after clue 5 + Note 1", () => {
    for (const { schedule } of results) {
      const counts = schedule.trajectory[5].counts;
      expect(Math.min(counts.suspects, counts.items, counts.locations, counts.times)).toBeGreaterThanOrEqual(4);
    }
  });

  it("holds checkpoint B: at least 3 candidates everywhere after clue 7 + Note 2", () => {
    for (const { schedule } of results) {
      const counts = schedule.trajectory[8].counts;
      expect(Math.min(counts.suspects, counts.items, counts.locations, counts.times)).toBeGreaterThanOrEqual(3);
    }
  });

  it("lands every category inside its final window with two converged axes", () => {
    for (const { schedule } of results) {
      const final = schedule.finalCounts;
      expect(final.suspects).toBeGreaterThanOrEqual(FINAL_TARGET.suspects.min);
      expect(final.suspects).toBeLessThanOrEqual(FINAL_TARGET.suspects.max);
      expect(final.items).toBeGreaterThanOrEqual(FINAL_TARGET.items.min);
      expect(final.items).toBeLessThanOrEqual(FINAL_TARGET.items.max);
      expect(final.locations).toBeGreaterThanOrEqual(FINAL_TARGET.locations.min);
      expect(final.locations).toBeLessThanOrEqual(FINAL_TARGET.locations.max);
      expect(final.times).toBeGreaterThanOrEqual(FINAL_TARGET.times.min);
      expect(final.times).toBeLessThanOrEqual(FINAL_TARGET.times.max);
      const converged =
        (final.items <= 3 ? 1 : 0) + (final.locations <= 3 ? 1 : 0) + (final.times <= 3 ? 1 : 0);
      expect(converged).toBeGreaterThanOrEqual(2);
    }
  });

  it("never lets a constraining answer-SPOTLIGHT appear before position 7", () => {
    // Spotlight = names the answer item/location/hour, or the answer suspect
    // alone or in a pair. Naming the culprit among 3+ others is chorus and
    // may appear early — that is where the people-texture comes from.
    for (const { schedule, answer, factIds } of results) {
      for (const reveal of schedule.reveals) {
        const fact = factIds.get(reveal.factId)!;
        if (!isMentionOnly(fact) && factSpotlightsAnswer(fact, answer)) {
          expect(reveal.position).toBeGreaterThanOrEqual(7);
        }
      }
    }
  });

  it("emits 12 reveals with notes at positions 6 and 9 and clues numbered 1-10", () => {
    for (const { schedule, factIds } of results) {
      expect(schedule.reveals).toHaveLength(12);
      const note1 = schedule.reveals.find((reveal) => reveal.slot === "note1")!;
      const note2 = schedule.reveals.find((reveal) => reveal.slot === "note2")!;
      expect(note1.position).toBe(6);
      expect(note2.position).toBe(9);
      expect(factIds.get(note1.factId)!.noteSuitable).toBe(true);
      expect(factIds.get(note2.factId)!.noteSuitable).toBe(true);
      const clueNumbers = schedule.reveals
        .filter((reveal) => reveal.slot === "clue")
        .map((reveal) => reveal.clueNumber);
      expect(clueNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    }
  });
});

describe("world simulation invariants (seed sweep)", () => {
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
      expect(() => harvestFacts(world)).not.toThrow();
    }
  });
});
