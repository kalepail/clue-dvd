import { describe, expect, it } from "vitest";
import { ITEMS, LOCATIONS, SUSPECTS, TIME_PERIODS } from "../data/game-elements";
import { OCCASION_FAMILIES } from "../data/occasion-catalog";
import type { Answer } from "./ai-mystery-schemas";
import { harvestFacts } from "./fact-harvest";
import { SeededRandom } from "./seeded-random";
import { simulateWorld, STAFF_SUSPECT_IDS } from "./world-sim";

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

  it("keeps the hidden answer hour out of singled-out movement evidence", () => {
    for (const world of worlds) {
      expect(world.transitionRemarks).not.toContainEqual(expect.objectContaining({
        suspectId: world.answer.suspectId,
        toTimeId: world.answer.timeId,
      }));

      const worldFacts = harvestFacts(world);
      const answerBoundaryFacts = worldFacts.filter((fact) =>
        ["solo_presence", "group_presence", "scene_evidence", "excuse_given"].includes(fact.kind) &&
        fact.questionedMovementPairs?.some((pair) => pair.timeId === world.answer.timeId)
      );
      expect(answerBoundaryFacts).toEqual([]);
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

  it("does not create culprit attention asymmetry across suspect counterfactuals", () => {
    let culpritQuestioned = 0;
    let innocentQuestioned = 0;
    let comparisons = 0;
    const culpritWitnessById = new Map(SUSPECTS.map((suspect) => [suspect.id, 0]));
    const innocentWitnessById = new Map(SUSPECTS.map((suspect) => [suspect.id, 0]));
    for (let seed = 1; seed <= 60; seed += 1) {
      const baseAnswer = randomAnswer(seed);
      for (const suspect of SUSPECTS) {
        const answer = { ...baseAnswer, suspectId: suspect.id };
        const world = simulateWorld({
          seed,
          attempt: 1,
          answer,
          occasionFamily: OCCASION_FAMILIES[(seed - 1) % OCCASION_FAMILIES.length],
        });
        const questioned = harvestFacts(world).flatMap((fact) => fact.questionedSuspectIds ?? []);
        const countFor = (suspectId: string) => questioned.filter((id) => id === suspectId).length;
        culpritQuestioned += countFor(answer.suspectId);
        innocentQuestioned += SUSPECTS
          .filter((candidate) => candidate.id !== answer.suspectId)
          .reduce((sum, candidate) => sum + countFor(candidate.id), 0) / (SUSPECTS.length - 1);
        for (const candidate of SUSPECTS) {
          const spoken = world.witnessAccounts.filter((account) => account.witnessId === candidate.id).length;
          const target = candidate.id === answer.suspectId ? culpritWitnessById : innocentWitnessById;
          target.set(candidate.id, target.get(candidate.id)! + spoken);
        }
        comparisons += 1;
      }
    }
    const ratio = culpritQuestioned / innocentQuestioned;
    expect(comparisons).toBe(600);
    // The hidden answer hour is uniformly excluded from singled-out movement
    // provenance. Lawson's unmodified branch measured 0.657; the release band
    // rejects either positive spotlighting or reverse-tell pressure.
    expect(ratio).toBeGreaterThanOrEqual(0.9);
    expect(ratio).toBeLessThanOrEqual(1.1);

    const witnessRatio = (suspectIds: string[]): number => {
      const culprit = suspectIds.reduce((sum, id) => sum + culpritWitnessById.get(id)!, 0);
      // Within every seed, each identity is innocent in the other nine
      // counterfactual worlds. Normalize to the same 60-world exposure.
      const innocent = suspectIds.reduce((sum, id) => sum + innocentWitnessById.get(id)! / 9, 0);
      return culprit / innocent;
    };
    const staffIds = [...STAFF_SUSPECT_IDS];
    const guestIds = SUSPECTS.map((suspect) => suspect.id).filter((id) => !staffIds.includes(id as typeof staffIds[number]));
    // A culprit is truthfully unavailable for one of ten hours, so named
    // witness eligibility cannot be exactly one. Reject large narrative
    // gravity in either direction while preserving physical truth.
    expect(witnessRatio(SUSPECTS.map((suspect) => suspect.id))).toBeGreaterThanOrEqual(0.8);
    expect(witnessRatio(SUSPECTS.map((suspect) => suspect.id))).toBeLessThanOrEqual(1.25);
    expect(witnessRatio(guestIds)).toBeGreaterThanOrEqual(0.75);
    expect(witnessRatio(guestIds)).toBeLessThanOrEqual(1.33);
    expect(witnessRatio(staffIds)).toBeGreaterThanOrEqual(0.75);
    expect(witnessRatio(staffIds)).toBeLessThanOrEqual(1.33);
  });
});
