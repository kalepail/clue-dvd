import { describe, expect, it } from "vitest";
import { ITEMS, LOCATIONS, SUSPECTS, TIME_PERIODS } from "../data/game-elements";
import type { Answer } from "./ai-mystery-schemas";
import { harvestFacts } from "./fact-harvest";
import { SeededRandom } from "./seeded-random";
import { applyOccasionTexture, simulateWorld } from "./world-sim";

function randomAnswer(seed: number): Answer {
  const rng = new SeededRandom(seed * 7_919 + 13);
  return {
    suspectId: rng.pick(SUSPECTS).id,
    itemId: rng.pick(ITEMS).id,
    locationId: rng.pick(LOCATIONS).id,
    timeId: rng.pick(TIME_PERIODS).id,
  };
}

describe("occasion texture isolation", () => {
  it("keeps model-supplied texture cosmetic and never rewrites spine truth", () => {
    const answer = randomAnswer(41);
    const world = simulateWorld({ seed: 41, attempt: 1, answer, occasionFamily: "costume fete" });
    const before = harvestFacts(world);
    const movementBefore = structuredClone(world.movement);
    const remarksBefore = structuredClone(world.transitionRemarks);
    applyOccasionTexture(world, {
      gatheringDetails: ["judging the most ingenious disguises"],
      inspectionContexts: ["collecting discarded costume ribbons"],
      observationContexts: ["putting abandoned dance cards in order"],
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
    expect(world.movement).toEqual(movementBefore);
    expect(world.transitionRemarks).toEqual(remarksBefore);
    expect(world.occasionTexture?.inspectionContexts).toHaveLength(6);
    expect(new Set(world.occasionTexture?.inspectionContexts).size).toBe(6);
    expect(world.occasionTexture?.observationContexts).toHaveLength(6);
    expect(new Set(world.occasionTexture?.observationContexts).size).toBe(6);
    expect(after.some((fact, index) => fact.writerBrief !== before[index].writerBrief)).toBe(true);
    expect(before.some((fact) => /mask|costume|ribbon|disguise/i.test(fact.writerBrief))).toBe(true);
    expect(() => harvestFacts(world)).not.toThrow();
  });
});
