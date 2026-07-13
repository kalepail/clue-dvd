import { describe, expect, it } from "vitest";
import { SeededRandom } from "./seeded-random";
import { ITEMS, LOCATIONS, SUSPECTS, TIME_PERIODS } from "../data/game-elements";
import { OCCASION_FAMILIES } from "../data/occasion-catalog";
import { applyOccasionTexture, requireSuspect, requireTime, simulateWorld, STAFF_SUSPECT_IDS } from "./world-sim";
import { DIMS, factKillsCell, harvestFacts, isMentionOnly } from "./fact-harvest";
import { isNarrativeFact, locationsMaxFor, scheduleMystery, timesMaxFor, type Schedule } from "./clue-scheduler";
import type { Answer } from "./ai-mystery-schemas";

const SWEEP_SEEDS = 120;
const MAX_WORLD_ATTEMPTS = 240;

function randomAnswer(seed: number): Answer {
  const rng = new SeededRandom(seed * 7_919 + 13);
  return {
    suspectId: rng.pick(SUSPECTS).id,
    itemId: rng.pick(ITEMS).id,
    locationId: rng.pick(LOCATIONS).id,
    timeId: rng.pick(TIME_PERIODS).id,
  };
}

function scheduleFor(seed: number, recentCluePatternSignatures: string[] = []): {
  schedule: Schedule;
  answer: Answer;
  world: ReturnType<typeof simulateWorld>;
  factIds: Map<string, ReturnType<typeof harvestFacts>[number]>;
} {
  const answer = randomAnswer(seed);
  for (let attempt = 1; attempt <= MAX_WORLD_ATTEMPTS; attempt += 1) {
    const world = simulateWorld({
      seed,
      attempt,
      answer,
      occasionFamily: OCCASION_FAMILIES[(seed - 1) % OCCASION_FAMILIES.length],
    });
    const facts = harvestFacts(world);
    const schedule = scheduleMystery({
      facts,
      answer,
      seed: seed * 31 + attempt,
      featuredSuspectIds: world.featuredCast.map((entry) => entry.suspectId),
      recentCluePatternSignatures,
    });
    if (schedule) {
      return { schedule, answer, world, factIds: new Map(facts.map((fact) => [fact.id, fact])) };
    }
  }
  throw new Error(`No schedule for seed ${seed} within ${MAX_WORLD_ATTEMPTS} world attempts`);
}

describe("clue scheduler fair-play guarantees (seed sweep)", () => {
  const recentPatterns: string[] = [];
  const results = Array.from({ length: SWEEP_SEEDS }, (_, index) => {
    const result = scheduleFor(index + 1, recentPatterns);
    recentPatterns.unshift(result.schedule.structuralPatternSignature);
    recentPatterns.splice(5);
    return result;
  });

  it("schedules every seed within the shared world-attempt budget", () => {
    expect(results).toHaveLength(SWEEP_SEEDS);
    expect(results.every(({ world }) => world.attempt <= MAX_WORLD_ATTEMPTS)).toBe(true);
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

  it("preserves the hard checkpoints and the hybrid final ambiguity windows", () => {
    for (const { schedule, answer } of results) {
      expect(Math.min(...Object.values(schedule.trajectory[5].counts))).toBeGreaterThanOrEqual(4);
      expect(Math.min(...Object.values(schedule.trajectory[8].counts))).toBeGreaterThanOrEqual(3);
      expect(schedule.finalCounts.suspects).toBeGreaterThanOrEqual(3);
      expect(schedule.finalCounts.suspects).toBeLessThanOrEqual(7);
      expect(schedule.finalCounts.items).toBeGreaterThanOrEqual(4);
      expect(schedule.finalCounts.items).toBeLessThanOrEqual(7);
      expect(schedule.finalCounts.locations).toBeGreaterThanOrEqual(3);
      expect(schedule.finalCounts.locations).toBeLessThanOrEqual(locationsMaxFor(answer));
      expect(schedule.finalCounts.times).toBeGreaterThanOrEqual(1);
      expect(schedule.finalCounts.times).toBeLessThanOrEqual(timesMaxFor(answer));
    }
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
    let world: ReturnType<typeof simulateWorld> | null = null;
    let facts: ReturnType<typeof harvestFacts> = [];
    let schedule: Schedule | null = null;
    for (let attempt = 3; attempt <= MAX_WORLD_ATTEMPTS && !schedule; attempt += 1) {
      const candidateWorld = simulateWorld({ seed, attempt, answer, occasionFamily: "family commemoration" });
      const candidateFacts = harvestFacts(candidateWorld);
      const candidateSchedule = scheduleMystery({
        facts: candidateFacts,
        answer,
        seed: seed * 31 + attempt,
        featuredSuspectIds: candidateWorld.featuredCast.map((entry) => entry.suspectId),
      });
      if (candidateSchedule) {
        world = candidateWorld;
        facts = candidateFacts;
        schedule = candidateSchedule;
      }
    }
    expect(world).not.toBeNull();
    expect(schedule).not.toBeNull();

    const byId = new Map(facts.map((fact) => [fact.id, fact]));
    const selected = schedule!.reveals.map((reveal) => byId.get(reveal.factId)!);
    const pureBookkeeping = selected.filter((fact) =>
      ["item_intact", "items_secured", "item_offsite", "item_home", "room_undisturbed"].includes(fact.kind)
    );
    const sceneFacts = selected.filter(isNarrativeFact);

    // Hard windows may make a late-theft world bookkeeping-heavy; the
    // answer-independent story floor still survives instead of being padded
    // in only after convergence.
    expect(pureBookkeeping.length).toBeLessThanOrEqual(7);
    expect(sceneFacts.length).toBeGreaterThanOrEqual(5);
  }, 15_000);

  it("deals a varied, connected story skeleton before the feasibility fill", () => {
    const recipeCounts = new Map<string, number>();
    let statementGames = 0;
    let linkedEpisodeGames = 0;
    const textureKinds = new Set<string>();

    for (const { schedule, factIds } of results) {
      recipeCounts.set(schedule.storyRecipe, (recipeCounts.get(schedule.storyRecipe) ?? 0) + 1);
      expect(schedule.skeletonFactIds.length).toBeGreaterThanOrEqual(3);
      expect(schedule.skeletonFactIds.length).toBeLessThanOrEqual(5);

      const selected = schedule.reveals.map((reveal) => factIds.get(reveal.factId)!);
      const selectedIds = new Set(selected.map((fact) => fact.id));
      const witnessSpeakers = selected
        .filter((fact) => fact.kind === "witness_account")
        .map((fact) => fact.suspectIds.slice().sort().join("+"));
      expect(new Set(witnessSpeakers).size).toBe(witnessSpeakers.length);
      expect(schedule.skeletonFactIds.every((id) => selectedIds.has(id))).toBe(true);
      expect(schedule.reveals.filter((reveal) => schedule.skeletonFactIds.includes(reveal.factId)).every((reveal) => reveal.slot === "clue")).toBe(true);
      for (const fact of selected) {
        expect(fact.componentFactIds?.some((sourceId) => selectedIds.has(sourceId)) ?? false).toBe(false);
      }
      const butlerNarrative = schedule.reveals
        .filter((reveal) => reveal.slot === "clue")
        .map((reveal) => factIds.get(reveal.factId)!)
        .filter(isNarrativeFact);
      expect(butlerNarrative.length).toBeGreaterThanOrEqual(5);

      const exactBundles = (kind: "item_intact" | "room_undisturbed", field: "itemIds" | "locationIds") =>
        selected
          .filter((fact) => fact.kind === kind)
          .map((fact) => [...fact[field]].sort().join("+"));
      const itemBundles = exactBundles("item_intact", "itemIds");
      const roomBundles = exactBundles("room_undisturbed", "locationIds");
      expect(new Set(itemBundles).size).toBe(itemBundles.length);
      expect(new Set(roomBundles).size).toBe(roomBundles.length);

      if (selected.some((fact) => fact.kind === "claim" || fact.kind === "witness_account")) statementGames += 1;
      for (const fact of selected) {
        if (["claim", "witness_account", "excuse_given"].includes(fact.kind) || fact.threadId === "FOG" || fact.threadId === "MOTIVE") {
          textureKinds.add(fact.threadId === "FOG" || fact.threadId === "MOTIVE" ? fact.threadId : fact.kind);
        }
      }

      const episodeGroups = new Map<string, typeof selected>();
      for (const fact of selected) {
        if (!fact.episodeId) continue;
        const group = episodeGroups.get(fact.episodeId) ?? [];
        group.push(fact);
        episodeGroups.set(fact.episodeId, group);
      }
      if ([...episodeGroups.values()].some((group) => group.length >= 2)) linkedEpisodeGames += 1;
      for (const group of episodeGroups.values()) {
        expect(group.length).toBeLessThanOrEqual(2);
        if (group.some((fact) => fact.episodeRole === "fused") && group.length > 1) {
          expect(group.filter((fact) => fact.episodeRole !== "fused").every((fact) => fact.kind === "claim")).toBe(true);
        }
        expect(
          group.some((fact) => fact.episodeRole === "excuse") &&
          group.some((fact) => fact.episodeRole === "witness")
        ).toBe(false);
        const coverage = (fact: (typeof group)[number]): string[] => {
          if (fact.components) return fact.components.flatMap(coverage);
          if (fact.kind !== "group_presence" && fact.kind !== "scene_continuation") return [];
          return (fact.suspectTimePairs ?? fact.suspectIds.flatMap((suspectId) =>
            fact.timeIds.map((timeId) => ({ suspectId, timeId }))
          )).map((pair) => `${pair.suspectId}@${pair.timeId}`).sort();
        };
        const coverageKeys = group.map(coverage).filter((entries) => entries.length > 0).map((entries) => entries.join("+"));
        expect(new Set(coverageKeys).size).toBe(coverageKeys.length);
        const setup = group.find((fact) => fact.episodeRole === "setup");
        if (!setup) continue;
        const setupPosition = schedule.reveals.find((reveal) => reveal.factId === setup.id)!.position;
        for (const continuation of group.filter((fact) => fact.episodeRole && fact.episodeRole !== "setup")) {
          expect(schedule.reveals.find((reveal) => reveal.factId === continuation.id)!.position).toBeGreaterThan(setupPosition);
        }
      }
    }

    expect(Math.max(...recipeCounts.values()) / SWEEP_SEEDS).toBeLessThanOrEqual(0.4);
    expect(statementGames / SWEEP_SEEDS).toBeGreaterThanOrEqual(0.8);
    expect(linkedEpisodeGames / SWEEP_SEEDS).toBeGreaterThanOrEqual(0.6);
    expect(textureKinds).toEqual(new Set(["claim", "witness_account", "excuse_given", "FOG", "MOTIVE"]));
  });

  it("preserves a truthful breakaway as one continuous social episode", () => {
    let world: ReturnType<typeof simulateWorld> | undefined;
    let episode: ReturnType<typeof simulateWorld>["episodes"][number] | undefined;
    for (let seed = 1; seed <= 20 && !episode; seed += 1) {
      const candidate = simulateWorld({
        seed,
        attempt: 1,
        answer: randomAnswer(seed),
        occasionFamily: "weekend house tournament",
      });
      const found = candidate.episodes.find((entry) => entry.stepAway);
      if (found) {
        world = candidate;
        episode = found;
      }
    }
    expect(episode).toBeDefined();
    expect(world).toBeDefined();
    const step = episode!.stepAway!;
    expect(world!.occasionSpine.groupActivities).toContain(episode!.activity);
    expect(world!.occasionSpine.excuses).toContain(step.excuse);
    expect(world!.movement[step.fromTimeId][step.suspectId].locationId).toBe(episode!.locationId);
    expect(world!.movement[step.absentFromTimeId][step.suspectId].locationId).not.toBe(episode!.locationId);
  });

  it("allows clue styles and information weights to appear anywhere in the reveal order", () => {
    const positionsByKind = new Map<string, number[]>();
    let earlyConstraining = 0;
    let lateColor = 0;

    for (const { schedule, factIds } of results) {
      for (const reveal of schedule.reveals) {
        const fact = factIds.get(reveal.factId)!;
        const positions = positionsByKind.get(fact.kind) ?? [];
        positions.push(reveal.position);
        positionsByKind.set(fact.kind, positions);
        if (reveal.position <= 5 && !isMentionOnly(fact)) earlyConstraining += 1;
        if (reveal.position >= 10 && isMentionOnly(fact)) lateColor += 1;
      }
    }

    expect(earlyConstraining).toBeGreaterThan(0);
    expect(lateColor).toBeGreaterThan(0);
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
        if (/was all (?:she|he|they) said/.test(fact.writerBrief)) transitionsWithRemarks += 1;
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
  it("uses established character pronouns in singular claims and memories", () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const world = simulateWorld({
        seed,
        attempt: 1,
        answer: randomAnswer(seed),
        occasionFamily: "collector's private viewing",
      });
      const singularBriefs = harvestFacts(world).filter((fact) =>
        fact.kind === "claim" || fact.threadId === "FOG"
      );
      for (const fact of singularBriefs) {
        expect(fact.writerBrief).not.toMatch(/\b(?:they|them|their)\b/i);
      }
    }
  });

  it("harvests episode continuations, excuses, and truth-ambiguous witness accounts", () => {
    let witnessTotal = 0;
    let fabricated = 0;
    let thiefWitness = 0;
    const variants = new Map<string, number>();

    for (let seed = 1; seed <= SWEEP_SEEDS; seed += 1) {
      const answer = randomAnswer(seed);
      const world = simulateWorld({ seed, attempt: 1, answer, occasionFamily: "costume fete" });
      const facts = harvestFacts(world);
      const continuationFacts = facts.filter((fact) => fact.kind === "scene_continuation");
      const excuseFacts = facts.filter((fact) => fact.kind === "excuse_given");
      const witnessFacts = facts.filter((fact) => fact.kind === "witness_account");

      expect(continuationFacts).toHaveLength(world.episodes.length);
      expect(excuseFacts).toHaveLength(world.episodes.filter((episode) => episode.stepAway).length);
      expect(witnessFacts).toHaveLength(world.witnessAccounts.length);
      for (const fact of [...excuseFacts, ...witnessFacts]) {
        expect(isMentionOnly(fact)).toBe(true);
        expect(factKillsCell(fact, answer.suspectId, answer.itemId, answer.locationId, answer.timeId)).toBe(false);
        expect(fact.episodeId).toBeTruthy();
      }
      for (const fact of continuationFacts) {
        expect(fact.episodeId).toBeTruthy();
        for (const pair of fact.suspectTimePairs ?? []) {
          expect(factKillsCell(fact, pair.suspectId, answer.itemId, answer.locationId, pair.timeId)).toBe(true);
        }
      }

      world.witnessAccounts.forEach((account, accountIndex) => {
        witnessTotal += 1;
        if (!account.truthful) fabricated += 1;
        if (account.witnessId === answer.suspectId) thiefWitness += 1;
        variants.set(account.variant, (variants.get(account.variant) ?? 0) + 1);
        const fact = witnessFacts[accountIndex];
        expect(fact.witnessVariant).toBe(account.variant);
        expect(fact.episodeId).toBe(account.episodeId);
        expect(fact.mentions.times).toEqual([]);
        if (account.actualDeparterId) {
          expect(fact.writerBrief).not.toContain(requireSuspect(account.actualDeparterId).displayName);
        }
        expect(fact.writerBrief).not.toMatch(/whether (?:they|the guest|the figure) returned/i);
        const episode = world.episodes.find((candidate) => candidate.id === account.episodeId)!;
        if (account.truthful) {
          expect(account.actualDeparterId).toBeTruthy();
          expect(world.movement[account.timeId][account.witnessId].locationId).toBe(episode.locationId);
          expect(world.movement[account.timeId][account.actualDeparterId!].locationId).not.toBe(episode.locationId);
          expect(account.fabricationReason).toBeNull();
        } else {
          expect(account.actualDeparterId).toBeNull();
          expect(account.fabricationReason).toBeTruthy();
        }
      });
    }

    expect(fabricated / witnessTotal).toBeGreaterThanOrEqual(0.3);
    expect(fabricated / witnessTotal).toBeLessThanOrEqual(0.42);
    expect(thiefWitness / witnessTotal).toBeGreaterThanOrEqual(0.25);
    expect(thiefWitness / witnessTotal).toBeLessThanOrEqual(0.38);
    expect(variants.size).toBe(4);
  });

  it("keeps featured casting answer-blind and derives truthful scene episodes", () => {
    let thiefFeatured = 0;
    let expectedThiefFeatured = 0;
    let zeroEpisodes = 0;
    let zeroStepAways = 0;
    let answerSideThreads = 0;
    let expectedAnswerSideThreads = 0;
    let fogThreads = 0;
    let fogAtAnswerHour = 0;

    for (let seed = 1; seed <= SWEEP_SEEDS; seed += 1) {
      const answer = randomAnswer(seed);
      const world = simulateWorld({ seed, attempt: 1, answer, occasionFamily: "costume fete" });
      const stepAways = world.episodes.filter((episode) => episode.stepAway);
      if (world.episodes.length === 0) zeroEpisodes += 1;
      if (stepAways.length === 0) zeroStepAways += 1;
      if (world.featuredCast.some((entry) => entry.suspectId === answer.suspectId)) thiefFeatured += 1;
      expectedThiefFeatured += world.featuredCast.length / SUSPECTS.length;
      for (const thread of world.threads) {
        if (thread.suspectIds.includes(answer.suspectId)) answerSideThreads += 1;
        const answerUnavailable = thread.kind !== "foggy_memory" && thread.timeId === answer.timeId;
        expectedAnswerSideThreads += answerUnavailable ? 0 : thread.suspectIds.length / SUSPECTS.length;
        if (thread.kind === "foggy_memory") {
          fogThreads += 1;
          if (thread.timeId === answer.timeId) fogAtAnswerHour += 1;
        }
      }

      expect(world.featuredCast.length).toBeGreaterThanOrEqual(3);
      expect(world.featuredCast.length).toBeLessThanOrEqual(5);
      expect(new Set(world.featuredCast.map((entry) => entry.suspectId)).size).toBe(world.featuredCast.length);
      for (const featured of world.featuredCast) {
        expect(world.occasionSpine.setDressing).toContain(featured.recurringProp);
        expect([...world.occasionSpine.threadCauses, ...world.occasionSpine.soloActivities]).toContain(featured.tension);
      }
      expect(world.motives).toHaveLength(5);
      expect(world.motives.some((motive) => motive.suspectId === answer.suspectId)).toBe(true);

      expect(stepAways.length).toBeLessThanOrEqual(3);
      for (const episode of world.episodes) {
        expect(episode.timeIds.length).toBeGreaterThanOrEqual(2);
        expect(world.occasionSpine.setDressing).toContain(episode.prop);
        expect([...world.occasionSpine.threadCauses, ...world.occasionSpine.soloActivities]).toContain(episode.tension);
        for (let index = 1; index < episode.timeIds.length; index += 1) {
          expect(requireTime(episode.timeIds[index]).order - requireTime(episode.timeIds[index - 1]).order).toBe(1);
        }
        for (const suspectId of episode.continuousParticipantIds) {
          for (const timeId of episode.timeIds) {
            const placement = world.movement[timeId][suspectId];
            expect(placement.locationId).toBe(episode.locationId);
            expect(placement.social).toBe("group");
          }
        }
        if (episode.stepAway) {
          const step = episode.stepAway;
          expect(world.movement[step.fromTimeId][step.suspectId].locationId).toBe(episode.locationId);
          expect(world.movement[step.absentFromTimeId][step.suspectId].locationId).not.toBe(episode.locationId);
          expect(world.transitionRemarks).toContainEqual(expect.objectContaining({
            suspectId: step.suspectId,
            fromTimeId: step.fromTimeId,
            toTimeId: step.absentFromTimeId,
            line: step.excuse,
          }));
        }
      }
    }
    expect(zeroEpisodes).toBe(0);
    // A narrow day can leave only pairs across its consecutive free window;
    // those worlds still have truthful continuing scenes, but cannot support
    // a departure while two people remain. Keep that edge below 6%.
    expect(zeroStepAways / SWEEP_SEEDS).toBeLessThanOrEqual(0.06);
    expect(Math.abs(thiefFeatured - expectedThiefFeatured)).toBeLessThan(SWEEP_SEEDS * 0.12);
    expect(Math.abs(answerSideThreads - expectedAnswerSideThreads)).toBeLessThan(SWEEP_SEEDS * 0.12);
    expect(fogAtAnswerHour / fogThreads).toBeLessThanOrEqual(0.22);
  });

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
    expect(after.some((fact, index) => fact.writerBrief !== before[index].writerBrief)).toBe(true);
    expect(before.some((fact) => /mask|costume|ribbon|disguise/i.test(fact.writerBrief))).toBe(true);
    expect(() => harvestFacts(world)).not.toThrow();
  });

  it("binds gathering texture to its day beat and rejects cross-beat chronology", () => {
    const answer = randomAnswer(77);
    const world = simulateWorld({ seed: 77, attempt: 1, answer, occasionFamily: "weekend house tournament" });
    const beatCount = world.occasionSpine.beats.length;
    applyOccasionTexture(world, {
      gatheringDetails: [
        "comparing notes on the afternoon's closest contests",
        ...Array.from({ length: Math.max(0, beatCount - 1) }, () => "comparing the newly issued instructions"),
      ],
      inspectionContexts: ["collecting abandoned scorecards"],
      observationContexts: ["putting the match board in order"],
    });

    expect(world.occasionTexture!.gatheringDetails).toHaveLength(beatCount);
    expect(world.occasionTexture!.gatheringDetails[0]).not.toMatch(/afternoon/i);
    const firstBeatTimes = new Set(world.occasionSpine.beats[0].timeIds);
    for (const fact of harvestFacts(world).filter((candidate) => candidate.kind === "gathering")) {
      if (fact.timeIds.some((timeId) => firstBeatTimes.has(timeId))) {
        expect(fact.writerBrief).not.toMatch(/afternoon's closest contests/i);
      }
    }
  });

  it("uses the authored occasion spine when the dossier returns empty texture arrays", () => {
    const answer = randomAnswer(91);
    const world = simulateWorld({ seed: 91, attempt: 1, answer, occasionFamily: "reunion of old acquaintances" });
    applyOccasionTexture(world, {
      gatheringDetails: [],
      inspectionContexts: [],
      observationContexts: [],
    });

    expect(world.occasionTexture!.gatheringDetails).toEqual(
      world.occasionSpine.beats.map((beat) => beat.gatheringLabel)
    );
    expect(world.occasionTexture!.inspectionContexts.join(" ")).toContain(world.occasionSpine.setDressing[0]);
    expect(world.occasionTexture!.observationContexts.join(" ")).not.toMatch(/programmes|occasion's papers/i);

    const facts = harvestFacts(world);
    expect(facts.every((fact) => !/several guests (?:remember )?admir/i.test(fact.writerBrief))).toBe(true);
    expect(facts.every((fact) => !/without leaving the room/i.test(fact.sceneTexture ?? ""))).toBe(true);
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
      // Closures never cover the answer room or contradict somebody's
      // simulated presence; discovery is after the theft.
      if (world.roomClosure) {
        expect(world.roomClosure.locationId).not.toBe(answer.locationId);
        const closedTimes = world.roomClosure.timeIds === "all"
          ? world.slots.map((slot) => slot.id)
          : world.roomClosure.timeIds;
        for (const timeId of closedTimes) {
          expect(
            Object.values(world.movement[timeId]).some(
              (candidate) => candidate.locationId === world.roomClosure!.locationId
            )
          ).toBe(false);
          expect(
            world.gatherings.some(
              (gathering) => gathering.timeId === timeId && gathering.locationId === world.roomClosure!.locationId
            )
          ).toBe(false);
        }
      }
      if (world.discovery) {
        expect(requireTime(world.discovery.timeId).order).toBeGreaterThan(requireTime(answer.timeId).order);
      }
      // Harvest asserts internally that no fact can rule out the answer.
      const facts = harvestFacts(world);
      const answerHourName = requireTime(answer.timeId).name;
      const escapedHour = answerHourName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
      const answerHourPattern = new RegExp(`\\b${escapedHour}\\b`, "i");
      for (const fact of facts) {
        expect(fact.mentions.times).not.toContain(answerHourName);
        expect(answerHourPattern.test(fact.writerBrief)).toBe(false);
      }
      expect(facts.some((fact) =>
        fact.kind === "solo_presence" &&
        fact.suspectIds.includes(answer.suspectId) &&
        fact.locationIds.includes(answer.locationId) &&
        fact.timeIds.includes(answer.timeId)
      )).toBe(false);
    }
  });
});
