/**
 * V3 Clue Scheduler
 *
 * Chooses WHICH harvested facts become the 10 Butler clues and 2 Inspector
 * notes, and in WHAT order, by simulating a rational player over the joint
 * (suspect × item × location × time) space — 12,100 cells.
 *
 * Reveal order: C1..C5, N1, C6, C7, N2, C8, C9, C10  (positions 1..12)
 *
 * Pass 1 samples an answer-blind story recipe and reserves 3-5 connected
 * Butler fragments. Pass 2 fills the remaining clues and two notes around
 * that skeleton until the hard fair-play checkpoints and final candidate
 * windows are satisfied. Reveal order has no clue-kind gates; only setup →
 * continuation dependencies within one episode are chronological.
 */

import { SeededRandom } from "./seeded-random";
import type { Answer } from "./ai-mystery-schemas";
import {
  DIMS,
  factKillsCell,
  isMentionOnly,
  type Fact,
} from "./fact-harvest";
import { requireItem, requireLocation, requireSuspect, requireTime } from "./world-sim";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RevealSlot = "clue" | "note1" | "note2";

export type ScheduledReveal = {
  position: number; // 1..12 in reveal order
  slot: RevealSlot;
  clueNumber: number | null; // 1..10 for butler clues
  factId: string;
};

export type CategoryCounts = { suspects: number; items: number; locations: number; times: number };

export type TrajectoryPoint = {
  position: number;
  factId: string;
  counts: CategoryCounts;
  /** Remaining joint WHO × WHAT × WHERE × WHEN possibilities. Diagnostic
   * only; it is never compared with a generation target. */
  remainingSolutions: number;
  newlyEliminated: { suspects: string[]; items: string[]; locations: string[]; times: string[] };
};

export type Schedule = {
  reveals: ScheduledReveal[];
  trajectory: TrajectoryPoint[];
  finalCounts: CategoryCounts;
  /** Card names still standing after all public evidence — what the dealt
   * physical cards must settle. Lets the closing stay honest about how much
   * the clues alone proved. */
  finalCandidates: { suspects: string[]; items: string[]; locations: string[]; times: string[] };
  noteRelatedClues: { note1: number[]; note2: number[] };
  softScore: number;
  attempts: number;
  storyRecipe: StoryRecipe;
  skeletonFactIds: string[];
  structuralPatternSignature: string;
};

export type StoryRecipe = "witness-centric" | "statement-driven" | "motive-and-fog" | "continuing-scene";

const REVEAL_COUNT = 12;
const NOTE1_POSITION = 6;
const NOTE2_POSITION = 9;
const CHECKPOINT_A = { position: NOTE1_POSITION, min: 4 } as const;
const CHECKPOINT_B = { position: NOTE2_POSITION, min: 3 } as const;
const MIN_NARRATIVE_BUTLER_CLUES = 5;

export const FINAL_TARGET = {
  suspects: { min: 3, max: 7 },
  items: { min: 4, max: 7 },
  locations: { min: 3 },
  times: { min: 1 },
} as const;

export function timesMaxFor(answer: Answer): 3 | 4 {
  const order = requireTime(answer.timeId).order;
  return order <= 2 || order >= 9 ? 4 : 3;
}

export function locationsMaxFor(answer: Answer): 6 | 7 {
  const order = requireTime(answer.timeId).order;
  return order <= 2 || order >= 9 ? 7 : 6;
}

// ---------------------------------------------------------------------------
// Joint grid with precomputed kill lists
// ---------------------------------------------------------------------------

const S_COUNT = DIMS.suspects.length; // 10
const I_COUNT = DIMS.items.length; // 11
const L_COUNT = DIMS.locations.length; // 11
const T_COUNT = DIMS.times.length; // 10
const CELL_COUNT = S_COUNT * I_COUNT * L_COUNT * T_COUNT; // 12,100

function cellIndex(s: number, i: number, l: number, t: number): number {
  return ((s * I_COUNT + i) * L_COUNT + l) * T_COUNT + t;
}

/** Precompute, for each fact, the list of cell indices it rules out. */
export function buildKillLists(facts: Fact[]): Map<string, Uint32Array> {
  const map = new Map<string, Uint32Array>();
  for (const fact of facts) {
    if (isMentionOnly(fact)) {
      map.set(fact.id, new Uint32Array(0));
      continue;
    }
    const kills: number[] = [];
    for (let s = 0; s < S_COUNT; s += 1) {
      for (let i = 0; i < I_COUNT; i += 1) {
        for (let l = 0; l < L_COUNT; l += 1) {
          for (let t = 0; t < T_COUNT; t += 1) {
            if (factKillsCell(fact, DIMS.suspects[s], DIMS.items[i], DIMS.locations[l], DIMS.times[t])) {
              kills.push(cellIndex(s, i, l, t));
            }
          }
        }
      }
    }
    map.set(fact.id, Uint32Array.from(kills));
  }
  return map;
}

export class JointGrid {
  alive: Uint8Array;
  aliveCount: number;
  suspectCells: Uint32Array;
  itemCells: Uint32Array;
  locationCells: Uint32Array;
  timeCells: Uint32Array;
  /** Alive-cell counts per (suspect, time) pair — the chain currency for
   * killing a time (cover every suspect at it) or a suspect (cover them at
   * every surviving time). */
  stPairs: Uint32Array;
  /** Alive-cell counts per (item, time) pair. */
  itPairs: Uint32Array;
  /** Alive-cell counts per (location, time) pair. */
  ltPairs: Uint32Array;

  constructor() {
    this.alive = new Uint8Array(CELL_COUNT);
    this.aliveCount = CELL_COUNT;
    this.suspectCells = new Uint32Array(S_COUNT);
    this.itemCells = new Uint32Array(I_COUNT);
    this.locationCells = new Uint32Array(L_COUNT);
    this.timeCells = new Uint32Array(T_COUNT);
    this.stPairs = new Uint32Array(S_COUNT * T_COUNT);
    this.itPairs = new Uint32Array(I_COUNT * T_COUNT);
    this.ltPairs = new Uint32Array(L_COUNT * T_COUNT);
    this.reset();
  }

  reset(): void {
    this.alive.fill(1);
    this.aliveCount = CELL_COUNT;
    this.suspectCells.fill(I_COUNT * L_COUNT * T_COUNT);
    this.itemCells.fill(S_COUNT * L_COUNT * T_COUNT);
    this.locationCells.fill(S_COUNT * I_COUNT * T_COUNT);
    this.timeCells.fill(S_COUNT * I_COUNT * L_COUNT);
    this.stPairs.fill(I_COUNT * L_COUNT);
    this.itPairs.fill(S_COUNT * L_COUNT);
    this.ltPairs.fill(S_COUNT * I_COUNT);
  }

  /** Applies a kill list; returns indices newly eliminated per category. */
  apply(kills: Uint32Array): { suspects: number[]; items: number[]; locations: number[]; times: number[] } {
    const newly = { suspects: [] as number[], items: [] as number[], locations: [] as number[], times: [] as number[] };
    for (let k = 0; k < kills.length; k += 1) {
      const cell = kills[k];
      if (this.alive[cell] === 0) continue;
      this.alive[cell] = 0;
      this.aliveCount -= 1;
      const t = cell % T_COUNT;
      const rest1 = (cell - t) / T_COUNT;
      const l = rest1 % L_COUNT;
      const rest2 = (rest1 - l) / L_COUNT;
      const i = rest2 % I_COUNT;
      const s = (rest2 - i) / I_COUNT;
      if ((this.suspectCells[s] -= 1) === 0) newly.suspects.push(s);
      if ((this.itemCells[i] -= 1) === 0) newly.items.push(i);
      if ((this.locationCells[l] -= 1) === 0) newly.locations.push(l);
      if ((this.timeCells[t] -= 1) === 0) newly.times.push(t);
      this.stPairs[s * T_COUNT + t] -= 1;
      this.itPairs[i * T_COUNT + t] -= 1;
      this.ltPairs[l * T_COUNT + t] -= 1;
    }
    return newly;
  }

  counts(): CategoryCounts {
    return {
      suspects: countPositive(this.suspectCells),
      items: countPositive(this.itemCells),
      locations: countPositive(this.locationCells),
      times: countPositive(this.timeCells),
    };
  }

  isCellAlive(index: number): boolean {
    return this.alive[index] === 1;
  }
}

function countPositive(arr: Uint32Array): number {
  let n = 0;
  for (let idx = 0; idx < arr.length; idx += 1) if (arr[idx] > 0) n += 1;
  return n;
}

/**
 * Evaluates the effect of a kill list against the live grid WITHOUT mutating
 * it: virtual decrements into small scratch arrays, then compares. Orders of
 * magnitude cheaper than snapshot/apply/restore over 12,100 cells.
 */
class VirtualEvaluator {
  private grid: JointGrid;
  private sDec = new Int32Array(S_COUNT);
  private iDec = new Int32Array(I_COUNT);
  private lDec = new Int32Array(L_COUNT);
  private tDec = new Int32Array(T_COUNT);
  private stDec = new Int32Array(S_COUNT * T_COUNT);
  private itDec = new Int32Array(I_COUNT * T_COUNT);
  private ltDec = new Int32Array(L_COUNT * T_COUNT);

  constructor(grid: JointGrid) {
    this.grid = grid;
  }

  evaluate(kills: Uint32Array): {
    killedCells: number;
    pairProgress: CategoryCounts;
    deaths: CategoryCounts;
  } {
    const grid = this.grid;
    this.sDec.fill(0);
    this.iDec.fill(0);
    this.lDec.fill(0);
    this.tDec.fill(0);
    this.stDec.fill(0);
    this.itDec.fill(0);
    this.ltDec.fill(0);

    let killedCells = 0;
    for (let k = 0; k < kills.length; k += 1) {
      const cell = kills[k];
      if (grid.alive[cell] === 0) continue;
      killedCells += 1;
      const t = cell % T_COUNT;
      const rest1 = (cell - t) / T_COUNT;
      const l = rest1 % L_COUNT;
      const rest2 = (rest1 - l) / L_COUNT;
      const i = rest2 % I_COUNT;
      const s = (rest2 - i) / I_COUNT;
      this.sDec[s] += 1;
      this.iDec[i] += 1;
      this.lDec[l] += 1;
      this.tDec[t] += 1;
      this.stDec[s * T_COUNT + t] += 1;
      this.itDec[i * T_COUNT + t] += 1;
      this.ltDec[l * T_COUNT + t] += 1;
    }

    const deathsIn = (cells: Uint32Array, dec: Int32Array): number => {
      let deaths = 0;
      for (let idx = 0; idx < cells.length; idx += 1) {
        if (cells[idx] > 0 && cells[idx] - dec[idx] === 0) deaths += 1;
      }
      return deaths;
    };
    const deaths: CategoryCounts = {
      suspects: deathsIn(this.grid.suspectCells, this.sDec),
      items: deathsIn(this.grid.itemCells, this.iDec),
      locations: deathsIn(this.grid.locationCells, this.lDec),
      times: deathsIn(this.grid.timeCells, this.tDec),
    };
    const pairDeaths = (pairs: Uint32Array, dec: Int32Array): number => {
      let progress = 0;
      for (let idx = 0; idx < pairs.length; idx += 1) {
        if (pairs[idx] > 0 && pairs[idx] - dec[idx] === 0) progress += 1;
      }
      return progress;
    };
    const suspectTimeProgress = pairDeaths(this.grid.stPairs, this.stDec);
    const itemTimeProgress = pairDeaths(this.grid.itPairs, this.itDec);
    const locationTimeProgress = pairDeaths(this.grid.ltPairs, this.ltDec);
    const pairProgress: CategoryCounts = {
      suspects: suspectTimeProgress,
      items: itemTimeProgress,
      locations: locationTimeProgress,
      times: suspectTimeProgress + itemTimeProgress,
    };

    return { killedCells, pairProgress, deaths };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function scheduleMystery(params: {
  facts: Fact[];
  answer: Answer;
  seed: number;
  maxAttempts?: number;
  featuredSuspectIds?: string[];
  recentCluePatternSignatures?: string[];
}): Schedule | null {
  const { facts, answer } = params;
  const rng = new SeededRandom((params.seed ^ 0x5f3759df) >>> 1);
  if (facts.length < REVEAL_COUNT) return null;
  const killLists = buildKillLists(facts);
  const factById = new Map(facts.map((fact) => [fact.id, fact]));
  const maxAttempts = params.maxAttempts ?? 32;
  const recentPatterns = (params.recentCluePatternSignatures ?? []).slice(0, 5);
  const availableRecipes = RECIPES.filter((recipe) => recipeHasSupply(recipe, facts));
  if (availableRecipes.length === 0) return null;
  const recentRecipes = new Set(recentPatterns.flatMap((signature) =>
    RECIPES.filter((recipe) => signature.startsWith(recipe))
  ));
  const freshRecipes = availableRecipes.filter((recipe) => !recentRecipes.has(recipe));
  const recipePool = freshRecipes.length > 0 ? freshRecipes : availableRecipes;
  const preferredRecipe = recipePool[Math.abs(Math.trunc(params.seed)) % recipePool.length];
  const answerCell = cellIndex(
    DIMS.suspects.indexOf(answer.suspectId),
    DIMS.items.indexOf(answer.itemId),
    DIMS.locations.indexOf(answer.locationId),
    DIMS.times.indexOf(answer.timeId)
  );
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    // Hold the answer-blind recipe stable through most retries. Otherwise the
    // easiest-to-fit recipe quietly dominates the corpus even when recipe
    // sampling itself is uniform. The latter half may fall back to another
    // supplied recipe rather than rejecting an otherwise excellent world.
    const preferenceRounds = Math.ceil(maxAttempts * 0.5);
    const explorationRounds = Math.floor(maxAttempts * 0.25);
    const lockedRecipe = attempt <= preferenceRounds
      ? preferredRecipe
      : attempt <= preferenceRounds + explorationRounds
        ? undefined
        // Variety is a nudge, never a feasibility veto. The final quarter
        // cycles every supplied recipe explicitly so recent-pattern memory
        // cannot strand an otherwise valid world.
        : availableRecipes[(attempt - preferenceRounds - explorationRounds - 1) % availableRecipes.length];
    const skeletonPackage = buildStorySkeleton(rng, facts, recentPatterns, lockedRecipe);
    if (!skeletonPackage) continue;
    let skeleton = [...skeletonPackage.facts];
    while (skeleton.length >= 3) {
      const selected = fillAroundSkeleton(rng, facts, skeleton, killLists, answer);
      if (selected) {
        const reveals = orderReveals(rng, selected, killLists, new Set(skeleton.map((fact) => fact.id)));
        if (reveals) {
          const grid = new JointGrid();
          const trajectory: TrajectoryPoint[] = [];
          for (const reveal of reveals) {
            const newly = grid.apply(killLists.get(reveal.factId)!);
            if (!grid.isCellAlive(answerCell)) {
              throw new Error(`Schedule killed the answer cell via fact ${reveal.factId} — harvest bug.`);
            }
            trajectory.push({
              position: reveal.position,
              factId: reveal.factId,
              counts: grid.counts(),
              remainingSolutions: grid.aliveCount,
              newlyEliminated: {
                suspects: newly.suspects.map((index) => requireSuspect(DIMS.suspects[index]).displayName),
                items: newly.items.map((index) => requireItem(DIMS.items[index]).nameUS),
                locations: newly.locations.map((index) => requireLocation(DIMS.locations[index]).name),
                times: newly.times.map((index) => requireTime(DIMS.times[index]).name),
              },
            });
          }
          const finalCounts = grid.counts();
          const cpA = trajectory[CHECKPOINT_A.position - 1]?.counts;
          const cpB = trajectory[CHECKPOINT_B.position - 1]?.counts;
          if (
            grid.aliveCount > 1 &&
            cpA && cpB &&
            minCount(cpA) >= CHECKPOINT_A.min &&
            minCount(cpB) >= CHECKPOINT_B.min &&
            meetsFinalTarget(finalCounts, answer)
          ) {
            const aliveNames = (cells: Uint32Array, ids: readonly string[], toName: (id: string) => string): string[] =>
              ids.filter((_, index) => cells[index] > 0).map(toName);
            const structuralPatternSignature = patternSignature(skeletonPackage.recipe, selected, skeleton);
            return {
              reveals,
              trajectory,
              finalCounts,
              finalCandidates: {
                suspects: aliveNames(grid.suspectCells, DIMS.suspects, (id) => requireSuspect(id).displayName),
                items: aliveNames(grid.itemCells, DIMS.items, (id) => requireItem(id).nameUS),
                locations: aliveNames(grid.locationCells, DIMS.locations, (id) => requireLocation(id).name),
                times: aliveNames(grid.timeCells, DIMS.times, (id) => requireTime(id).name),
              },
              noteRelatedClues: relatedClues(reveals, factById),
              softScore: -orderingPenalty(reveals.map((reveal) => factById.get(reveal.factId)!)),
              attempts: attempt,
              storyRecipe: skeletonPackage.recipe,
              skeletonFactIds: skeleton.map((fact) => fact.id),
              structuralPatternSignature,
            };
          }
        }
      }
      if (skeleton.length === 3) break;
      skeleton = dropLeastConnected(skeleton);
    }
  }
  // Recent pattern memory is cosmetic variety, never a feasibility rule. Its
  // preferred-recipe attempts consume a different deterministic RNG path and
  // can very rarely strand an otherwise schedulable world even though the
  // final quarter visits every recipe. Before rejecting the world, retry with
  // no history and a bounded half-budget. The answer, facts, fairness windows,
  // and story floor are unchanged.
  if (recentPatterns.length > 0) {
    return scheduleMystery({
      ...params,
      maxAttempts: Math.max(1, Math.ceil(maxAttempts / 2)),
      recentCluePatternSignatures: [],
    });
  }
  return null;
}

type SkeletonPackage = { recipe: StoryRecipe; facts: Fact[] };
type Axis = keyof CategoryCounts;

const RECIPES: StoryRecipe[] = ["witness-centric", "statement-driven", "motive-and-fog", "continuing-scene"];

const BOOKKEEPING_KINDS = new Set<Fact["kind"]>([
  "item_intact",
  "item_offsite",
  "items_secured",
  "item_home",
  "room_closed",
  "room_undisturbed",
  "retired_gathering",
  "discovery",
]);

export function isNarrativeFact(fact: Fact): boolean {
  return !BOOKKEEPING_KINDS.has(fact.kind);
}

function sameSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((id, index) => id === sortedRight[index]);
}

function presenceCoverage(fact: Fact): string[] {
  if (fact.components) return fact.components.flatMap(presenceCoverage);
  if (fact.kind !== "group_presence" && fact.kind !== "scene_continuation") return [];
  const pairs = fact.suspectTimePairs ?? fact.suspectIds.flatMap((suspectId) =>
    fact.timeIds.map((timeId) => ({ suspectId, timeId }))
  );
  return pairs.map((pair) => `${pair.suspectId}@${pair.timeId}`);
}

function quotedStatements(fact: Fact): string[] {
  return [...fact.writerBrief.matchAll(/[“"]([^”"]+)[”"]/g)]
    .map((match) => match[1].trim().toLowerCase())
    .filter((value) => value.length > 0);
}

function sourceFactIds(fact: Fact): Set<string> {
  return new Set(fact.componentFactIds ?? [fact.id]);
}

/** Reject semantic repeats, not clue styles. A later sighting of the exact
 * same item bundle subsumes the earlier one; a fused episode already tells
 * its whole handoff; and two departure wrappers from one episode would repeat
 * the same exit/excuse in different words. */
function conflictsWithChosen(chosen: Fact[], candidate: Fact): boolean {
  const candidateQuotes = quotedStatements(candidate);
  const candidateSources = sourceFactIds(candidate);
  for (const fact of chosen) {
    if ([...sourceFactIds(fact)].some((id) => candidateSources.has(id))) return true;
    if (
      (fact.kind === "retired_gathering" && candidate.kind === "guests_arrived") ||
      (fact.kind === "guests_arrived" && candidate.kind === "retired_gathering")
    ) return true;
    if (fact.kind === "item_intact" && candidate.kind === "item_intact" && sameSet(fact.itemIds, candidate.itemIds)) return true;
    if (fact.kind === "room_undisturbed" && candidate.kind === "room_undisturbed" && sameSet(fact.locationIds, candidate.locationIds)) return true;
    // Two anonymous-departure reports from the same speaker make that person
    // dominate the case and repeat one testimony wrapper, even when the
    // reports concern different scenes. Other clue shapes may still feature
    // the same person naturally.
    if (
      fact.kind === "witness_account" && candidate.kind === "witness_account" &&
      sameSet(fact.suspectIds, candidate.suspectIds)
    ) return true;
    if (candidateQuotes.some((quote) => quotedStatements(fact).includes(quote))) return true;
    if (!fact.episodeId || fact.episodeId !== candidate.episodeId) continue;
    if (
      (fact.episodeRole === "fused" || candidate.episodeRole === "fused") &&
      fact.kind !== "claim" && candidate.kind !== "claim"
    ) return true;
    const factCoverage = presenceCoverage(fact);
    const candidateCoverage = presenceCoverage(candidate);
    if (factCoverage.length > 0 && candidateCoverage.length > 0 && sameSet(factCoverage, candidateCoverage)) return true;
    const factDeparture = fact.episodeRole === "excuse" || fact.episodeRole === "witness";
    const candidateDeparture = candidate.episodeRole === "excuse" || candidate.episodeRole === "witness";
    if (factDeparture && candidateDeparture) return true;
    if (chosen.filter((entry) => entry.episodeId === candidate.episodeId).length >= 2) return true;
  }
  return false;
}

function buildStorySkeleton(
  rng: SeededRandom,
  facts: Fact[],
  recentPatterns: string[],
  lockedRecipe?: StoryRecipe
): SkeletonPackage | null {
  const recentlyUsed = new Set(
    recentPatterns.map((signature) => RECIPES.find((recipe) => signature.startsWith(recipe))).filter(Boolean)
  );
  const rotated = rng.shuffle([...RECIPES]).sort((a, b) =>
    Number(recentlyUsed.has(a)) - Number(recentlyUsed.has(b))
  );
  const recipes = lockedRecipe ? [lockedRecipe] : rotated;
  for (const recipe of recipes) {
    // All recipes except witness-led (whose witness is already a statement)
    // need room for human texture as well as a physical two-part episode.
    const target = recipe === "witness-centric" ? rng.nextInt(3, 5) : rng.nextInt(4, 5);
    const selected: Fact[] = [];
    const episodeCounts = new Map<string, number>();
    const add = (fact: Fact | undefined): boolean => {
      if (!fact || selected.length >= target || selected.some((candidate) => candidate.id === fact.id)) return false;
      if (conflictsWithChosen(selected, fact)) return false;
      selected.push(fact);
      if (fact.episodeId) episodeCounts.set(fact.episodeId, (episodeCounts.get(fact.episodeId) ?? 0) + 1);
      return true;
    };
    const preferred = (candidates: Fact[]): Fact | undefined => candidates
      .map((fact) => ({
        fact,
        score:
          (fact.kind === "scene_evidence" ? 30 : 0) +
          (fact.episodeId ? 5 : 0) +
          compositionVariety(fact, selected) +
          rng.next(),
      }))
      .sort((a, b) => b.score - a.score)[0]?.fact;
    const episodeFacts = (episodeId: string): Fact[] => facts.filter((fact) => fact.episodeId === episodeId);
    const statementTexture = (): Fact | undefined => preferred(
      facts.filter((fact) => fact.kind === "claim" || fact.kind === "witness_account")
    );
    const addArc = (episodeId?: string): void => {
      const candidates = episodeId
        ? episodeFacts(episodeId)
        : facts.filter((fact) => fact.episodeId);
      const byEpisode = new Map<string, Fact[]>();
      for (const fact of candidates) {
        if (!fact.episodeId) continue;
        const group = byEpisode.get(fact.episodeId) ?? [];
        group.push(fact);
        byEpisode.set(fact.episodeId, group);
      }
      const bestEpisode = [...byEpisode.entries()]
        .map(([id, group]) => ({
          id,
          group,
          score: group.length + rng.next(),
        }))
        .sort((a, b) => b.score - a.score)[0];
      if (!bestEpisode) return;
      add(preferred(bestEpisode.group.filter((fact) => fact.episodeRole === "setup")));
      add(preferred(bestEpisode.group.filter((fact) => fact.episodeRole === "continuation")));
      add(preferred(bestEpisode.group.filter((fact) => fact.episodeRole === "excuse" || fact.episodeRole === "witness")));
    };

    if (recipe === "witness-centric") {
      const witness = preferred(facts.filter((fact) => fact.kind === "witness_account"));
      if (!witness) continue;
      add(witness);
      addArc(witness.episodeId);
    } else if (recipe === "statement-driven") {
      const statement = preferred(facts.filter((fact) => fact.kind === "claim"));
      if (!statement) continue;
      add(statement);
      const matchingMotive = preferred(facts.filter((fact) =>
        fact.threadId === "MOTIVE" && fact.suspectIds.some((id) => statement.suspectIds.includes(id))
      ));
      // A statement-led case needs a human pressure point as well as the
      // claimed whereabouts. Prefer one concerning the speaker when supply
      // naturally permits it, otherwise keep an unrelated red-herring motive
      // rather than letting a third physical scene consume the story slot.
      add(matchingMotive ?? preferred(facts.filter((fact) => fact.threadId === "MOTIVE")));
      const relatedEpisode = statement.episodeId ?? facts.find((fact) =>
        fact.episodeId && fact.suspectIds.some((id) => statement.suspectIds.includes(id))
      )?.episodeId;
      addArc(relatedEpisode);
    } else if (recipe === "motive-and-fog") {
      const motive = preferred(facts.filter((fact) => fact.threadId === "MOTIVE"));
      const fog = preferred(facts.filter((fact) => fact.threadId === "FOG"));
      if (!motive || !fog) continue;
      add(motive);
      add(fog);
      const statement = rng.nextBool(0.82) ? statementTexture() : undefined;
      add(statement);
      addArc(statement?.episodeId);
    } else {
      const statement = rng.nextBool(0.82) ? statementTexture() : undefined;
      add(statement);
      addArc(statement?.episodeId);
      if (selected.filter((fact) => fact.episodeId).length < 2) continue;
    }

    const narrativePool = facts.filter((fact) =>
      fact.episodeId || isMentionOnly(fact)
    );
    while (selected.length < target) {
      const next = preferred(narrativePool.filter((fact) =>
        !selected.some((candidate) => candidate.id === fact.id) &&
        !conflictsWithChosen(selected, fact)
      ));
      if (!next || !add(next)) break;
    }
    if (selected.length >= 3) return { recipe, facts: selected };
  }
  return null;
}

function recipeHasSupply(recipe: StoryRecipe, facts: Fact[]): boolean {
  const episodeIds = new Set(facts.map((fact) => fact.episodeId).filter(Boolean));
  if (recipe === "witness-centric") return facts.some((fact) => fact.kind === "witness_account");
  if (recipe === "statement-driven") return facts.some((fact) => fact.kind === "claim") && episodeIds.size > 0;
  if (recipe === "motive-and-fog") {
    return facts.some((fact) => fact.threadId === "MOTIVE") && facts.some((fact) => fact.threadId === "FOG") && episodeIds.size > 0;
  }
  return episodeIds.size > 0;
}

function fillAroundSkeleton(
  rng: SeededRandom,
  facts: Fact[],
  skeleton: Fact[],
  killLists: Map<string, Uint32Array>,
  answer: Answer
): Fact[] | null {
  const grid = new JointGrid();
  const evaluator = new VirtualEvaluator(grid);
  const chosen: Fact[] = [];
  const used = new Set<string>();
  const episodeCounts = new Map<string, number>();

  const finalMinSafe = (deaths: CategoryCounts): boolean => {
    const counts = grid.counts();
    return (
      counts.suspects - deaths.suspects >= FINAL_TARGET.suspects.min &&
      counts.items - deaths.items >= FINAL_TARGET.items.min &&
      counts.locations - deaths.locations >= FINAL_TARGET.locations.min &&
      counts.times - deaths.times >= FINAL_TARGET.times.min
    );
  };
  const add = (fact: Fact): boolean => {
    if (used.has(fact.id)) return false;
    if (conflictsWithChosen(chosen, fact)) return false;
    const evaluated = evaluator.evaluate(killLists.get(fact.id)!);
    if (!finalMinSafe(evaluated.deaths) || grid.aliveCount - evaluated.killedCells <= 1) return false;
    chosen.push(fact);
    used.add(fact.id);
    if (fact.episodeId) episodeCounts.set(fact.episodeId, (episodeCounts.get(fact.episodeId) ?? 0) + 1);
    grid.apply(killLists.get(fact.id)!);
    return true;
  };
  for (const fact of skeleton) if (!add(fact)) return null;

  // Complete the narrative reservation NOW, before convergence. Merely
  // keeping empty slots in reserve made the axis loops reach a point where
  // they demanded a story fact that also happened to advance the current
  // category — usually impossible for motives, claims, or witness accounts.
  // This is the actual story-first inversion: five human/scene facts are in
  // the slate before bookkeeping is allowed to spend the remaining space.
  while (chosen.filter(isNarrativeFact).length < MIN_NARRATIVE_BUTLER_CLUES) {
    const candidates = facts
      .filter((fact) => isNarrativeFact(fact) && !used.has(fact.id))
      .filter((fact) => !conflictsWithChosen(chosen, fact))
      .map((fact) => ({
        fact,
        evaluated: evaluator.evaluate(killLists.get(fact.id)!),
        score:
          storyValue(fact) +
          compositionVariety(fact, chosen) +
          (fact.episodeId ? (episodeCounts.get(fact.episodeId) ?? 0) * 8 : 0) +
          rng.next(),
      }))
      .map((entry) => ({
        ...entry,
        score:
          entry.score +
          Object.values(entry.evaluated.deaths).reduce((sum, value) => sum + value, 0) * 18 +
          Object.values(entry.evaluated.pairProgress).reduce((sum, value) => sum + value, 0) * 0.2,
      }))
      .sort((a, b) => b.score - a.score);
    let added = false;
    for (const candidate of candidates) {
      if (add(candidate.fact)) {
        added = true;
        break;
      }
    }
    if (!added) return null;
  }

  // Late thefts need a complete item-history chain to retire the earlier
  // hours. Individual members of that chain often score almost nothing until
  // the final member lands, so a purely myopic greedy never assembles it.
  // This is not a clue-type quota: it is a feasibility basket made from the
  // same truthful facts the old fair-play scheduler used, and it competes
  // only when the answer hour is late enough to require that chain.
  const answerOrder = requireTime(answer.timeId).order;
  if (answerOrder >= 6) {
    const anchorCutoff = answerOrder - 1;
    const basket = facts
      .filter((fact) => !isMentionOnly(fact) && !used.has(fact.id))
      .filter((fact) => {
        if (fact.kind === "item_offsite") return true;
        if (fact.kind === "items_secured" && fact.itemIds.length >= 6) return true;
        if (fact.kind !== "item_intact") return false;
        if (fact.itemIds.includes(answer.itemId)) return (fact.cutoffOrder ?? 0) === anchorCutoff;
        return fact.itemIds.length >= 2 && (fact.cutoffOrder ?? 0) >= Math.min(anchorCutoff, 9);
      })
      .sort((a, b) => b.itemIds.length - a.itemIds.length);
    for (const fact of basket) {
      if (chosen.length >= 7) break;
      const evaluated = evaluator.evaluate(killLists.get(fact.id)!);
      if (evaluated.pairProgress.items === 0 && evaluated.deaths.items === 0) continue;
      add(fact);
    }
  }

  const targetMax = (axis: Axis): number =>
    axis === "suspects" ? FINAL_TARGET.suspects.max :
    axis === "items" ? FINAL_TARGET.items.max :
    axis === "locations" ? locationsMaxFor(answer) : timesMaxFor(answer);
  const runAxis = (axis: Axis): boolean => {
    let stalls = 0;
    while (grid.counts()[axis] > targetMax(axis)) {
      if (chosen.length >= REVEAL_COUNT || stalls++ > 16) return false;
      const scored = facts
        .filter((fact) => !used.has(fact.id))
        .filter((fact) => !conflictsWithChosen(chosen, fact))
        .filter((fact) => {
          const slotsLeft = REVEAL_COUNT - chosen.length;
          const narrativeNeeded = Math.max(0, MIN_NARRATIVE_BUTLER_CLUES - chosen.filter(isNarrativeFact).length);
          return slotsLeft > narrativeNeeded || isNarrativeFact(fact);
        })
        .map((fact) => {
          const evaluated = evaluator.evaluate(killLists.get(fact.id)!);
          if (!finalMinSafe(evaluated.deaths) || grid.aliveCount - evaluated.killedCells <= 1) return null;
          const direct = evaluated.deaths[axis];
          const pair = evaluated.pairProgress[axis];
          if (direct === 0 && pair === 0) return null;
          const episodeConnection = fact.episodeId ? (episodeCounts.get(fact.episodeId) ?? 0) * 12 : 0;
          return {
            fact,
            score: direct * 120 + pair * 10 + storyValue(fact) * 0.35 + compositionVariety(fact, chosen) + episodeConnection,
          };
        })
        .filter((entry): entry is { fact: Fact; score: number } => Boolean(entry))
        .sort((a, b) => b.score - a.score);
      if (scored.length === 0) return false;
      const finalists = scored.slice(0, Math.min(3, scored.length));
      if (!add(rng.pickWeighted(finalists, [7, 2.5, 0.75].slice(0, finalists.length)).fact)) return false;
    }
    return true;
  };

  for (const axis of ["times", "suspects", "items", "locations"] as const) {
    if (!runAxis(axis)) return null;
  }

  while (chosen.length < REVEAL_COUNT) {
    const candidates = facts
      .filter((fact) => !used.has(fact.id))
      .filter((fact) => !conflictsWithChosen(chosen, fact))
      .map((fact) => {
        const evaluated = evaluator.evaluate(killLists.get(fact.id)!);
        if (!finalMinSafe(evaluated.deaths) || grid.aliveCount - evaluated.killedCells <= 1) return null;
        const episodeConnection = fact.episodeId ? (episodeCounts.get(fact.episodeId) ?? 0) * 10 : 0;
        return { fact, score: storyValue(fact) + compositionVariety(fact, chosen) + episodeConnection + rng.next() };
      })
      .filter((entry): entry is { fact: Fact; score: number } => Boolean(entry))
      .sort((a, b) => b.score - a.score);
    if (candidates.length === 0 || !add(candidates[0].fact)) return null;
  }
  return meetsFinalTarget(grid.counts(), answer) && chosen.filter(isNarrativeFact).length >= MIN_NARRATIVE_BUTLER_CLUES
    ? chosen
    : null;
}

function orderReveals(
  rng: SeededRandom,
  selected: Fact[],
  killLists: Map<string, Uint32Array>,
  skeletonIds: Set<string>
): ScheduledReveal[] | null {
  // Inspector notes are delivery slots, not a fact-kind caste. Any selected
  // non-skeleton fact may be rendered as a concise factual note; suitability
  // remains useful prompt texture, but never blocks a clue shape from a
  // position in the game.
  const noteCandidates = selected.filter((fact) => !skeletonIds.has(fact.id));
  if (noteCandidates.length < 2) return null;
  let best: Fact[] | null = null;
  let bestPenalty = Number.POSITIVE_INFINITY;
  for (let round = 0; round < 480; round += 1) {
    const notes = rng.pickMultiple(noteCandidates, 2);
    const noteIds = new Set(notes.map((fact) => fact.id));
    const clues = rng.shuffle(selected.filter((fact) => !noteIds.has(fact.id)));
    const ordered: Fact[] = [];
    let clueIndex = 0;
    for (let position = 1; position <= REVEAL_COUNT; position += 1) {
      if (position === NOTE1_POSITION) ordered.push(notes[0]);
      else if (position === NOTE2_POSITION) ordered.push(notes[1]);
      else ordered.push(clues[clueIndex++]);
    }
    if (!episodeOrderIsValid(ordered)) continue;
    const butlerNarrativeCount = ordered.filter((fact, index) =>
      index !== NOTE1_POSITION - 1 && index !== NOTE2_POSITION - 1 && isNarrativeFact(fact)
    ).length;
    if (butlerNarrativeCount < MIN_NARRATIVE_BUTLER_CLUES) continue;
    const grid = new JointGrid();
    let checkpointAOk = false;
    let checkpointBOk = false;
    ordered.forEach((fact, index) => {
      grid.apply(killLists.get(fact.id)!);
      if (index + 1 === CHECKPOINT_A.position) checkpointAOk = minCount(grid.counts()) >= CHECKPOINT_A.min;
      if (index + 1 === CHECKPOINT_B.position) checkpointBOk = minCount(grid.counts()) >= CHECKPOINT_B.min;
    });
    if (!checkpointAOk || !checkpointBOk) continue;
    const penalty = orderingPenalty(ordered);
    if (penalty < bestPenalty) {
      best = ordered;
      bestPenalty = penalty;
    }
  }
  if (!best) return null;
  let clueNumber = 0;
  return best.map((fact, index) => {
    const position = index + 1;
    const slot: RevealSlot = position === NOTE1_POSITION ? "note1" : position === NOTE2_POSITION ? "note2" : "clue";
    if (slot === "clue") clueNumber += 1;
    return { position, slot, clueNumber: slot === "clue" ? clueNumber : null, factId: fact.id };
  });
}

function episodeOrderIsValid(ordered: Fact[]): boolean {
  const positionById = new Map(ordered.map((fact, index) => [fact.id, index]));
  const episodeIds = [...new Set(ordered.map((fact) => fact.episodeId).filter((id): id is string => Boolean(id)))];
  for (const episodeId of episodeIds) {
    const facts = ordered.filter((fact) => fact.episodeId === episodeId);
    const primaryAnchors = facts.filter((fact) => fact.episodeRole === "setup" || fact.episodeRole === "fused");
    const testimony = facts.filter((fact) =>
      fact.episodeRole === "excuse" || fact.episodeRole === "witness" || fact.episodeRole === "claim"
    );
    if (primaryAnchors.length > 0) {
      const firstAnchor = Math.min(...primaryAnchors.map((fact) => positionById.get(fact.id)!));
      const later = facts.filter((fact) => !primaryAnchors.includes(fact));
      if (later.some((fact) => positionById.get(fact.id)! < firstAnchor)) return false;
      continue;
    }
    // A continuous-presence recollection can establish the scene when no
    // separate setup was dealt; testimony about that scene should follow it.
    const continuations = facts.filter((fact) => fact.episodeRole === "continuation");
    if (continuations.length > 0 && testimony.length > 0) {
      const firstContinuation = Math.min(...continuations.map((fact) => positionById.get(fact.id)!));
      if (testimony.some((fact) => positionById.get(fact.id)! < firstContinuation)) return false;
    }
  }
  return true;
}

function storyValue(fact: Fact): number {
  return (
    (isNarrativeFact(fact) ? 35 : 0) +
    (fact.kind === "scene_evidence" ? 28 : 0) +
    (fact.episodeId ? 22 : 0) +
    (isMentionOnly(fact) ? 14 : 0) +
    (fact.suspectIds.length > 0 ? 8 : 0) +
    (fact.locationIds.length > 0 ? 3 : 0) +
    (fact.timeIds.length > 0 ? 3 : 0) +
    (fact.threadId ? 4 : 0)
  );
}

/**
 * A clue about a handful of named people gives the player characters to keep
 * track of. Whole-house gatherings do useful deduction work, but they do not
 * create that same character-level attention and therefore do not count here.
 */
function isPersonCentered(fact: Fact): boolean {
  return fact.suspectIds.length > 0 && fact.suspectIds.length <= 5;
}

/**
 * Moments that make a particular person's movements genuinely worth
 * discussing: a step-away, an unwitnessed errand, private exchange, or other
 * named suspicious action. Anonymous-departure testimony does not count its
 * witness as the person who moved. This is intentionally semantic rather than
 * tied to one FactKind because fused scenes can carry the same human beat as a
 * standalone excuse. It never reads the answer.
 */
export function questionedAttentionSuspectIds(fact: Fact): string[] {
  return fact.questionedSuspectIds ?? [];
}

function hasQuestionedAttention(fact: Fact): boolean {
  return questionedAttentionSuspectIds(fact).length > 0;
}

/** A soft composition nudge, never a type cap. The first scene/evidence
 * fusion is especially valuable; later fusions must beat increasingly fresh
 * material on merit, and repeating the same coda shape costs a little more. */
function compositionVariety(fact: Fact, chosen: Fact[]): number {
  const sameKind = chosen.filter((candidate) => candidate.kind === fact.kind).length;
  let score = 0;

  // This is deliberately soft: a repeated shape may still win when it is the
  // truthful fact that makes a fair schedule possible. When several facts do
  // equivalent work, however, a third whole-company gathering or inventory
  // sweep should lose to a fresh form of testimony.
  if (sameKind > 0) score -= sameKind * (fact.kind === "gathering" ? 22 : isNarrativeFact(fact) ? 5 : 9);
  if (BOOKKEEPING_KINDS.has(fact.kind)) {
    const sameAxisBookkeeping = chosen.filter((candidate) =>
      BOOKKEEPING_KINDS.has(candidate.kind) && candidate.primaryAxis === fact.primaryAxis
    ).length;
    score -= sameAxisBookkeeping * 5;
    if (fact.kind === "item_home") score -= 8;
  }
  if (fact.kind === "scene_evidence") {
    const existing = chosen.filter((candidate) => candidate.kind === "scene_evidence");
    const sameMode = existing.filter((candidate) =>
      candidate.sceneEvidenceMode && candidate.sceneEvidenceMode === fact.sceneEvidenceMode
    ).length;
    score -= existing.length * 8 + sameMode * 12;
  }

  // Reward a fresh part of the cast instead of repeatedly spending narrative
  // attention on the same one or two people. This is a preference, not a
  // quota: a mechanically necessary repeated-person fact can still win.
  if (isPersonCentered(fact)) {
    const alreadyFeatured = new Set(
      chosen.filter(isPersonCentered).flatMap((candidate) => candidate.suspectIds)
    );
    const freshPeople = fact.suspectIds.filter((suspectId) => !alreadyFeatured.has(suspectId)).length;
    score += freshPeople * 7;
    if (alreadyFeatured.size === 0) score += 8;
  }

  // A single conspicuous departure is an accidental structural finger-point:
  // players quite reasonably assume the only person given that treatment is
  // special. Once one such beat enters the slate, strongly prefer a different
  // person's equally plausible errand or uncertain movement. Both beats come
  // from the answer-blind world; nothing is reserved for the thief, and no
  // reveal position or clue kind is mandated.
  if (hasQuestionedAttention(fact)) {
    const existing = chosen.filter(hasQuestionedAttention);
    const existingPeople = new Set(existing.flatMap(questionedAttentionSuspectIds));
    const bringsAnotherPerson = questionedAttentionSuspectIds(fact)
      .some((suspectId) => !existingPeople.has(suspectId));
    if (existing.length === 0) score += 14;
    else if (existing.length === 1 && bringsAnotherPerson) score += 44;
    else if (!bringsAnotherPerson) score -= existing.length * 8;
  }
  return score;
}

function orderingPenalty(ordered: Fact[]): number {
  let penalty = 0;
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index].primaryAxis !== "color" && ordered[index].primaryAxis === ordered[index - 1].primaryAxis) penalty += 2;
    if (ordered[index].kind === ordered[index - 1].kind) penalty += 3;
  }
  for (const fact of ordered) {
    if (!fact.episodeId) continue;
    const peers = ordered.filter((candidate) => candidate.id !== fact.id && candidate.episodeId === fact.episodeId);
    if (peers.length > 0) {
      const index = ordered.indexOf(fact);
      const distance = Math.min(...peers.map((peer) => Math.abs(index - ordered.indexOf(peer))));
      penalty += Math.max(0, distance - 4);
    }
  }
  for (const noteIndex of [NOTE1_POSITION - 1, NOTE2_POSITION - 1]) {
    if (isNarrativeFact(ordered[noteIndex])) penalty += 8;
  }
  const noteIndexes = new Set([NOTE1_POSITION - 1, NOTE2_POSITION - 1]);
  const butlerFacts = ordered.filter((_, index) => !noteIndexes.has(index));
  const bookkeepingCounts = new Map<Fact["kind"], number>();
  const bookkeepingAxes = new Map<Fact["primaryAxis"], number>();
  for (const fact of butlerFacts) {
    if (fact.itemIds.length > 2 && ["item_intact", "items_secured"].includes(fact.kind)) penalty += 40;
    if (isNarrativeFact(fact)) continue;
    bookkeepingCounts.set(fact.kind, (bookkeepingCounts.get(fact.kind) ?? 0) + 1);
    bookkeepingAxes.set(fact.primaryAxis, (bookkeepingAxes.get(fact.primaryAxis) ?? 0) + 1);
  }
  for (const count of bookkeepingCounts.values()) penalty += Math.max(0, count - 1) * 12;
  for (const [axis, count] of bookkeepingAxes) {
    if (axis === "item" || axis === "location") penalty += Math.max(0, count - 2) * 5;
  }
  const noteFacts = [ordered[NOTE1_POSITION - 1], ordered[NOTE2_POSITION - 1]];
  if (
    noteFacts[0].primaryAxis === noteFacts[1].primaryAxis &&
    (noteFacts[0].primaryAxis === "item" || noteFacts[0].primaryAxis === "location")
  ) penalty += 5;
  return penalty;
}

function dropLeastConnected(skeleton: Fact[]): Fact[] {
  const scored = skeleton.map((fact, index) => ({
    index,
    score:
      (fact.episodeRole === "setup" ? 100 : 0) +
      (fact.episodeRole === "continuation" ? 90 : 0) +
      (fact.episodeRole === "fused" ? 110 : 0) +
      // Statement wrappers are the recipe's human voice. Preserve one when
      // feasibility repair trims a four/five-piece skeleton to three; extra
      // episode setups are the expendable material, not the testimony.
      (fact.kind === "claim" || fact.kind === "witness_account" ? 200 : 0) +
      // Human uncertainty is the reason the recipe exists; preserve one of
      // these before an unpaired extra scene when feasibility repair trims.
      (fact.threadId === "MOTIVE" || fact.threadId === "FOG" ? 105 : 0) +
      (fact.episodeRole === "excuse" ? 20 : 0) +
      // A two-fragment episode is the smallest actual story arc. Preserve
      // that relationship when feasibility trims a larger skeleton; the
      // ideal three-piece remainder is the pair plus one human statement.
      skeleton.filter((candidate) => fact.episodeId && candidate.id !== fact.id && candidate.episodeId === fact.episodeId).length * 40 +
      skeleton.filter((candidate) => fact.threadId && candidate.id !== fact.id && candidate.threadId === fact.threadId).length * 2,
  }));
  scored.sort((a, b) => a.score - b.score);
  return skeleton.filter((_, index) => index !== scored[0].index);
}

function meetsFinalTarget(counts: CategoryCounts, answer: Answer): boolean {
  return (
    counts.suspects >= FINAL_TARGET.suspects.min && counts.suspects <= FINAL_TARGET.suspects.max &&
    counts.items >= FINAL_TARGET.items.min && counts.items <= FINAL_TARGET.items.max &&
    counts.locations >= FINAL_TARGET.locations.min && counts.locations <= locationsMaxFor(answer) &&
    counts.times >= FINAL_TARGET.times.min && counts.times <= timesMaxFor(answer)
  );
}

function minCount(counts: CategoryCounts): number {
  return Math.min(counts.suspects, counts.items, counts.locations, counts.times);
}

function patternSignature(recipe: StoryRecipe, selected: Fact[], skeleton: Fact[]): string {
  const kindCounts = new Map<string, number>();
  for (const fact of selected) kindCounts.set(fact.kind, (kindCounts.get(fact.kind) ?? 0) + 1);
  const kinds = [...kindCounts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([kind, count]) => `${kind}:${count}`).join(",");
  const episodeShapes = [...new Set(selected.map((fact) => fact.episodeRole).filter(Boolean))].sort().join(",") || "none";
  return `${recipe}|story:${skeleton.length}|kinds:${kinds}|episodes:${episodeShapes}`;
}

function relatedClues(
  reveals: ScheduledReveal[],
  factById: Map<string, Fact>
): { note1: number[]; note2: number[] } {
  const clueReveals = reveals.filter((reveal) => reveal.slot === "clue");
  const overlap = (a: Fact, b: Fact): boolean =>
    Boolean(a.episodeId && a.episodeId === b.episodeId) ||
    a.suspectIds.some((id) => b.suspectIds.includes(id)) ||
    a.itemIds.some((id) => b.itemIds.includes(id)) ||
    a.locationIds.some((id) => b.locationIds.includes(id)) ||
    a.timeIds.some((id) => b.timeIds.includes(id));

  const forNote = (slot: RevealSlot): number[] => {
    const noteReveal = reveals.find((reveal) => reveal.slot === slot);
    if (!noteReveal) return [1];
    const noteFact = factById.get(noteReveal.factId)!;
    const related = clueReveals
      .filter((reveal) => overlap(factById.get(reveal.factId)!, noteFact))
      .map((reveal) => reveal.clueNumber!)
      .slice(0, 3);
    return related.length > 0 ? related : [1];
  };

  return { note1: forNote("note1"), note2: forNote("note2") };
}
