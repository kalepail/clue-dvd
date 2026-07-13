import { describe, expect, it } from "vitest";
import { ITEMS, LOCATIONS, SUSPECTS, TIME_PERIODS } from "../data/game-elements";
import { OCCASION_FAMILIES } from "../data/occasion-catalog";
import type { Answer } from "./ai-mystery-schemas";
import { harvestFacts } from "./fact-harvest";
import { SeededRandom } from "./seeded-random";
import { simulateWorld } from "./world-sim";

function randomAnswer(seed: number): Answer {
  const rng = new SeededRandom(seed * 7_919 + 13);
  return {
    suspectId: rng.pick(SUSPECTS).id,
    itemId: rng.pick(ITEMS).id,
    locationId: rng.pick(LOCATIONS).id,
    timeId: rng.pick(TIME_PERIODS).id,
  };
}

describe("questioned-suspect metadata", () => {
  const worlds = Array.from({ length: 24 }, (_, index) => {
    const seed = index + 1;
    return simulateWorld({
      seed,
      attempt: 1,
      answer: randomAnswer(seed),
      occasionFamily: OCCASION_FAMILIES[index % OCCASION_FAMILIES.length],
    });
  });
  const facts = worlds.flatMap(harvestFacts);

  it("keeps the forced theft cell out of social departure evidence", () => {
    for (const world of worlds) {
      expect(world.transitionRemarks).not.toContainEqual(expect.objectContaining({
        suspectId: world.answer.suspectId,
        toTimeId: world.answer.timeId,
      }));

      const worldFacts = harvestFacts(world);
      const forcedBoundaryFacts = worldFacts.filter((fact) =>
        fact.episodeRole === "fused" &&
        fact.questionedMovementPairs?.some((pair) =>
          pair.suspectId === world.answer.suspectId && pair.timeId === world.answer.timeId
        )
      );
      expect(forcedBoundaryFacts).toEqual([]);
    }
  });

  it("identifies the exact person receiving uncertain-movement attention", () => {
    const solos = facts.filter((fact) => fact.kind === "solo_presence");
    const excuses = facts.filter((fact) => fact.kind === "excuse_given");
    const witnesses = facts.filter((fact) => fact.kind === "witness_account");
    const handoffs = facts.filter((fact) => fact.episodeRole === "fused" && fact.questionedSuspectIds?.length);

    expect(solos.length).toBeGreaterThan(0);
    expect(excuses.length).toBeGreaterThan(0);
    expect(witnesses.length).toBeGreaterThan(0);
    expect(handoffs.length).toBeGreaterThan(0);
    for (const fact of [...solos, ...excuses]) {
      expect(fact.questionedSuspectIds).toEqual(fact.suspectIds);
    }
    for (const fact of witnesses) {
      expect(fact.questionedSuspectIds).toBeUndefined();
    }
    for (const fact of handoffs) {
      expect(fact.questionedSuspectIds!.length).toBeLessThan(fact.suspectIds.length);
      expect(fact.questionedSuspectIds!.every((id) => fact.suspectIds.includes(id))).toBe(true);
      expect(fact.continuousSuspectIds?.length).toBeGreaterThanOrEqual(2);
      expect(fact.continuousSuspectIds?.every((id) => fact.suspectIds.includes(id))).toBe(true);
    }
  });

  it("preserves the scene's precise attention target through a composite", () => {
    const composites = facts.filter((fact) =>
      fact.kind === "scene_evidence" && fact.components?.[0]?.questionedSuspectIds?.length
    );
    expect(composites.length).toBeGreaterThan(0);
    for (const fact of composites) {
      expect(fact.questionedSuspectIds).toEqual(fact.components![0].questionedSuspectIds);
      expect(fact.continuousSuspectIds).toEqual(fact.components![0].continuousSuspectIds);
    }
  });
});
