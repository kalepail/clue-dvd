/**
 * V3 Clue Scheduler
 *
 * Chooses WHICH harvested facts become the 10 Butler clues and 2 Inspector
 * notes, and in WHAT order, by simulating a rational player over the joint
 * (suspect × item × location × time) space — 12,100 cells.
 *
 * Reveal order: C1..C5, N1, C6, C7, N2, C8, C9, C10  (positions 1..12)
 *
 * Hard fair-play targets (per-category candidate projections):
 *  - after position 6  (5 clues + Note 1): every category has ≥ 4 candidates
 *  - after position 9  (7 clues + both notes): every category has ≥ 3
 *  - after position 12: suspects 2–4, items 2–3, locations 2–3, times 2–3
 *  - the answer cell is alive at every step (asserted; true facts cannot kill it)
 *  - constraining facts that mention an answer card appear at position ≥ 7
 *  - a solo sighting of the answer suspect at the answer time appears only as
 *    one of the last two clues, at most once
 *
 * Because candidate counts only ever decrease, the checkpoint rules bound all
 * earlier positions too — early clues cannot converge on the answer.
 *
 * Selection is a coverage-driven greedy (not blind sampling): kill times to
 * the target window first, then cover suspects at the surviving times, then
 * items, then locations, padding with color facts. Ordering is a greedy that
 * keeps every checkpoint satisfiable, with randomization for variety.
 */

import { SeededRandom } from "./seeded-random";
import type { Answer } from "./ai-mystery-schemas";
import {
  DIMS,
  factKillsCell,
  factMentionsAnswer,
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
  /** Soft preference for leaving useful work to physical cards (lower wins). */
  physicalFinishPenalty: number;
  /** Number of hard-valid alternatives compared before selecting this one. */
  candidatesConsidered: number;
  attempts: number;
};

const REVEAL_COUNT = 12;
const NOTE1_POSITION = 6;
const NOTE2_POSITION = 9;
const CHECKPOINT_A = { position: NOTE1_POSITION, min: 4 };
const CHECKPOINT_B = { position: NOTE2_POSITION, min: 3 };
/**
 * Final candidate windows after all public evidence.
 *
 * The original mysteries never squeeze all four categories at once: each case
 * converges hard on two or three dimensions (a time pinned by a key gone
 * missing, an item pinned by "the piece displayed in the Hall…") and leaves
 * the rest honestly open for the dealt physical cards to close. We encode the
 * same shape: every category lands inside its window, and at least TWO of
 * items/locations/times converge to ≤ 3 candidates (which two varies with the
 * seed and the theft hour — that variety is part of replayability).
 * Times may collapse to a single hour, as the originals do ("all of the
 * Jewelry had been locked up by Midnight…").
 */
export const FINAL_TARGET = {
  suspects: { min: 3, max: 6 },
  items: { min: 2, max: 5 },
  locations: { min: 2, max: 6 },
  times: { min: 1, max: 4 },
} as const;

/** At least this many of items/locations/times must end at ≤ 3 candidates. */
export const CONVERGED_AXES_REQUIRED = 2;
const CONVERGED_MAX = 3;

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

type GridSnapshot = {
  alive: Uint8Array;
  s: Uint32Array;
  i: Uint32Array;
  l: Uint32Array;
  t: Uint32Array;
  st: Uint32Array;
  it: Uint32Array;
  lt: Uint32Array;
};

export class JointGrid {
  alive: Uint8Array;
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
    this.suspectCells.fill(I_COUNT * L_COUNT * T_COUNT);
    this.itemCells.fill(S_COUNT * L_COUNT * T_COUNT);
    this.locationCells.fill(S_COUNT * I_COUNT * T_COUNT);
    this.timeCells.fill(S_COUNT * I_COUNT * L_COUNT);
    this.stPairs.fill(I_COUNT * L_COUNT);
    this.itPairs.fill(S_COUNT * L_COUNT);
    this.ltPairs.fill(S_COUNT * I_COUNT);
  }

  snapshot(): GridSnapshot {
    return {
      alive: this.alive.slice(),
      s: this.suspectCells.slice(),
      i: this.itemCells.slice(),
      l: this.locationCells.slice(),
      t: this.timeCells.slice(),
      st: this.stPairs.slice(),
      it: this.itPairs.slice(),
      lt: this.ltPairs.slice(),
    };
  }

  restore(snap: GridSnapshot): void {
    this.alive.set(snap.alive);
    this.suspectCells.set(snap.s);
    this.itemCells.set(snap.i);
    this.locationCells.set(snap.l);
    this.timeCells.set(snap.t);
    this.stPairs.set(snap.st);
    this.itPairs.set(snap.it);
    this.ltPairs.set(snap.lt);
  }

  /** Applies a kill list; returns indices newly eliminated per category. */
  apply(kills: Uint32Array): { suspects: number[]; items: number[]; locations: number[]; times: number[] } {
    const newly = { suspects: [] as number[], items: [] as number[], locations: [] as number[], times: [] as number[] };
    for (let k = 0; k < kills.length; k += 1) {
      const cell = kills[k];
      if (this.alive[cell] === 0) continue;
      this.alive[cell] = 0;
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

  evaluate(
    kills: Uint32Array,
    axis: "times" | "suspects" | "items" | "locations"
  ): { axisDeaths: number; pairProgress: number; belowMin: boolean; deaths: CategoryCounts } {
    const grid = this.grid;
    this.sDec.fill(0);
    this.iDec.fill(0);
    this.lDec.fill(0);
    this.tDec.fill(0);
    this.stDec.fill(0);
    this.itDec.fill(0);
    this.ltDec.fill(0);

    for (let k = 0; k < kills.length; k += 1) {
      const cell = kills[k];
      if (grid.alive[cell] === 0) continue;
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
    const counts = grid.counts();
    const belowMin =
      counts.suspects - deaths.suspects < FINAL_TARGET.suspects.min ||
      counts.items - deaths.items < FINAL_TARGET.items.min ||
      counts.locations - deaths.locations < FINAL_TARGET.locations.min ||
      counts.times - deaths.times < FINAL_TARGET.times.min;

    const pairDeaths = (pairs: Uint32Array, dec: Int32Array): number => {
      let progress = 0;
      for (let idx = 0; idx < pairs.length; idx += 1) {
        if (pairs[idx] > 0 && pairs[idx] - dec[idx] === 0) progress += 1;
      }
      return progress;
    };
    // A time dies when every suspect OR every item is accounted for at it,
    // so the times phase credits both chains. Location pairs are excluded:
    // whole-location kills can never complete a time (two locations always
    // survive), so counting them would bait the greedy into wasted picks.
    const pairProgress =
      axis === "times"
        ? pairDeaths(this.grid.stPairs, this.stDec) + pairDeaths(this.grid.itPairs, this.itDec)
        : axis === "suspects"
          ? pairDeaths(this.grid.stPairs, this.stDec)
          : axis === "items"
            ? pairDeaths(this.grid.itPairs, this.itDec)
            : pairDeaths(this.grid.ltPairs, this.ltDec);

    const axisDeaths =
      axis === "times" ? deaths.times :
      axis === "suspects" ? deaths.suspects :
      axis === "items" ? deaths.items : deaths.locations;

    return { axisDeaths, pairProgress, belowMin, deaths };
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
  candidateCount?: number;
}): Schedule | null {
  const { facts, answer } = params;
  const rng = new SeededRandom((params.seed ^ 0x5f3759df) >>> 1);
  const maxAttempts = params.maxAttempts ?? 40;
  const candidateCount = Math.max(1, Math.trunc(params.candidateCount ?? 8));
  const killLists = buildKillLists(facts);
  const factById = new Map(facts.map((fact) => [fact.id, fact]));
  const answerCell = cellIndex(
    DIMS.suspects.indexOf(answer.suspectId),
    DIMS.items.indexOf(answer.itemId),
    DIMS.locations.indexOf(answer.locationId),
    DIMS.times.indexOf(answer.timeId)
  );

  const candidates: Schedule[] = [];
  for (let attempt = 1; attempt <= maxAttempts && candidates.length < candidateCount; attempt += 1) {
    // Prefer keeping a slot for one pure-color clue; late attempts may spend
    // all twelve reveals on constraining facts if the world demands it.
    const allowedConstraining = attempt <= Math.ceil(maxAttempts * 0.6) ? REVEAL_COUNT - 1 : REVEAL_COUNT;
    const selected = selectFacts(rng, facts, killLists, answer, allowedConstraining);
    if (!selected) continue;
    const ordered = orderReveals(rng, selected, killLists, factById, answer);
    if (!ordered) continue;

    // Final full simulation for the trajectory + invariant assertions.
    const grid = new JointGrid();
    const trajectory: TrajectoryPoint[] = [];
    for (const reveal of ordered) {
      const newly = grid.apply(killLists.get(reveal.factId)!);
      if (!grid.isCellAlive(answerCell)) {
        throw new Error(`Schedule killed the answer cell via fact ${reveal.factId} — harvest bug.`);
      }
      trajectory.push({
        position: reveal.position,
        factId: reveal.factId,
        counts: grid.counts(),
        newlyEliminated: {
          suspects: newly.suspects.map((index) => requireSuspect(DIMS.suspects[index]).displayName),
          items: newly.items.map((index) => requireItem(DIMS.items[index]).nameUS),
          locations: newly.locations.map((index) => requireLocation(DIMS.locations[index]).name),
          times: newly.times.map((index) => requireTime(DIMS.times[index]).name),
        },
      });
    }
    const finalCounts = trajectory[trajectory.length - 1].counts;
    if (!meetsFinalTarget(finalCounts)) continue;
    const cpA = trajectory[CHECKPOINT_A.position - 1].counts;
    const cpB = trajectory[CHECKPOINT_B.position - 1].counts;
    if (minCount(cpA) < CHECKPOINT_A.min || minCount(cpB) < CHECKPOINT_B.min) continue;

    const aliveNames = (cells: Uint32Array, ids: readonly string[], toName: (id: string) => string): string[] =>
      ids.filter((_, index) => cells[index] > 0).map(toName);
    candidates.push({
      reveals: ordered,
      trajectory,
      finalCounts,
      finalCandidates: {
        suspects: aliveNames(grid.suspectCells, DIMS.suspects, (id) => requireSuspect(id).displayName),
        items: aliveNames(grid.itemCells, DIMS.items, (id) => requireItem(id).nameUS),
        locations: aliveNames(grid.locationCells, DIMS.locations, (id) => requireLocation(id).name),
        times: aliveNames(grid.timeCells, DIMS.times, (id) => requireTime(id).name),
      },
      noteRelatedClues: relatedClues(ordered, factById),
      softScore: softPenalty(ordered.map((reveal) => factById.get(reveal.factId)!), answer),
      physicalFinishPenalty: physicalFinishPenalty(finalCounts),
      candidatesConsidered: 0,
      attempts: attempt,
    });
  }
  if (candidates.length === 0) return null;
  candidates.sort((left, right) =>
    left.physicalFinishPenalty - right.physicalFinishPenalty ||
    left.softScore - right.softScore ||
    scheduleSignature(left).localeCompare(scheduleSignature(right))
  );
  return { ...candidates[0], candidatesConsidered: candidates.length };
}

function scheduleSignature(schedule: Schedule): string {
  return schedule.reveals.map((reveal) => `${reveal.factId}@${reveal.position}`).join("|");
}

function physicalFinishPenalty(counts: CategoryCounts): number {
  // Fully solving an axis publicly makes that category's dealt cards inert.
  // Within the already-proven final windows, prefer converged axes to retain
  // two or three candidates rather than collapse to one. This is deliberately
  // soft: hard fairness and feasibility remain the only acceptance gates.
  return ([counts.items, counts.locations, counts.times] as number[])
    .reduce((penalty, count) => penalty + (count <= CONVERGED_MAX ? CONVERGED_MAX - count : 0), 0);
}

function meetsFinalTarget(counts: CategoryCounts): boolean {
  return (
    counts.suspects >= FINAL_TARGET.suspects.min && counts.suspects <= FINAL_TARGET.suspects.max &&
    counts.items >= FINAL_TARGET.items.min && counts.items <= FINAL_TARGET.items.max &&
    counts.locations >= FINAL_TARGET.locations.min && counts.locations <= FINAL_TARGET.locations.max &&
    counts.times >= FINAL_TARGET.times.min && counts.times <= FINAL_TARGET.times.max &&
    convergedAxes(counts) >= CONVERGED_AXES_REQUIRED
  );
}

function convergedAxes(counts: CategoryCounts): number {
  return (
    (counts.items <= CONVERGED_MAX ? 1 : 0) +
    (counts.locations <= CONVERGED_MAX ? 1 : 0) +
    (counts.times <= CONVERGED_MAX ? 1 : 0)
  );
}

function minCount(counts: CategoryCounts): number {
  return Math.min(counts.suspects, counts.items, counts.locations, counts.times);
}

// ---------------------------------------------------------------------------
// Coverage-driven selection
// ---------------------------------------------------------------------------

/**
 * Greedily assembles exactly 12 facts whose combined effect lands every
 * category inside the final target window. Order does not matter here; the
 * grid state after applying all selected facts is order-independent.
 *
 * The greedy is need-weighted and counts PARTIAL progress: killing joint
 * cells at a still-alive time/suspect/item/location scores even when no
 * category candidate dies outright, so multi-fact chains (e.g. covering all
 * ten suspects at Dawn across two clues to rule Dawn out) emerge naturally.
 */
function selectFacts(
  rng: SeededRandom,
  facts: Fact[],
  killLists: Map<string, Uint32Array>,
  answer: Answer,
  maxConstraining: number
): Fact[] | null {
  const grid = new JointGrid();
  const chosen: Fact[] = [];
  const used = new Set<string>();
  const constraining = facts.filter((fact) => !isMentionOnly(fact));
  const colorFacts = facts.filter((fact) => isMentionOnly(fact));

  const needs = (counts: CategoryCounts): CategoryCounts => ({
    suspects: Math.max(0, counts.suspects - FINAL_TARGET.suspects.max),
    items: Math.max(0, counts.items - FINAL_TARGET.items.max),
    locations: Math.max(0, counts.locations - FINAL_TARGET.locations.max),
    times: Math.max(0, counts.times - FINAL_TARGET.times.max),
  });

  const add = (fact: Fact): void => {
    used.add(fact.id);
    chosen.push(fact);
    grid.apply(killLists.get(fact.id)!);
  };

  /**
   * One selection phase for a single category. Scores candidates by direct
   * candidate-deaths in that category, plus pair progress toward this axis's
   * chains (covering every suspect at a time kills the time; covering a
   * suspect at every surviving time kills the suspect), so multi-fact chains
   * build up naturally. Facts picked in an earlier phase count toward later
   * phases automatically — a staff round serves both times and items.
   *
   * Candidate evaluation is virtual — it walks the kill list against the
   * current grid without mutating it, which keeps the search fast.
   */
  const evaluator = new VirtualEvaluator(grid);
  const runPhase = (axis: "times" | "suspects" | "items" | "locations", maxOverride?: number): boolean => {
    const targetMax = maxOverride ?? FINAL_TARGET[axis].max;
    let stall = 0;
    while (grid.counts()[axis] > targetMax) {
      if (chosen.length >= maxConstraining || stall++ > 12) return false;
      const scored: Array<{ fact: Fact; score: number }> = [];
      for (const fact of constraining) {
        if (used.has(fact.id)) continue;
        const evaluated = evaluator.evaluate(killLists.get(fact.id)!, axis);
        if (evaluated.belowMin) continue;
        // Exchange rate: one direct candidate-death ≈ twelve pair-deaths.
        // A heavy sweep laying 30+ pairs of groundwork legitimately outbids
        // a redundant single-death fact — this is what lets three staff
        // rounds quietly account for most of the day.
        const score = evaluated.axisDeaths * 120 + evaluated.pairProgress * 10;
        if (score > 0) scored.push({ fact, score });
      }
      if (scored.length === 0) return false;
      scored.sort((a, b) => b.score - a.score);
      const top = scored.slice(0, Math.min(3, scored.length));
      add(rng.pick(top).fact);
    }
    return true;
  };

  // Late-theft closure basket: when the theft happens in the evening, the
  // item chain is THE mechanism that retires the earlier hours, and it only
  // works as a complete set — every item must be accounted for late. The
  // basket: night-round sweeps, the offsite item, the last-seen-together
  // anchor (answer item + decoys), and for Midnight the grand lockup. The
  // myopic greedy cannot assemble this on its own because each piece scores
  // nothing until the set completes.
  const answerOrder = requireTime(answer.timeId).order;
  if (answerOrder >= 6) {
    const anchorCutoff = answerOrder - 1;
    const basket = constraining
      .filter((fact) => {
        if (fact.kind === "item_offsite") return true;
        if (fact.kind === "items_secured" && fact.itemIds.length >= 6) return true; // grand lockup
        if (fact.kind !== "item_intact") return false;
        if (fact.itemIds.includes(answer.itemId)) return (fact.cutoffOrder ?? 0) === anchorCutoff;
        return fact.itemIds.length >= 2 && (fact.cutoffOrder ?? 0) >= Math.min(anchorCutoff, 9);
      })
      .sort((a, b) => b.itemIds.length - a.itemIds.length);
    for (const fact of basket) {
      if (chosen.length >= Math.min(maxConstraining - 4, 7)) break;
      if (used.has(fact.id)) continue;
      const evaluated = evaluator.evaluate(killLists.get(fact.id)!, "items");
      if (evaluated.belowMin) continue;
      if (evaluated.pairProgress === 0 && evaluated.axisDeaths === 0) continue; // redundant
      add(fact);
    }
  }

  // Times first (they gate everything), then suspects (need coverage at the
  // surviving times), then items and locations (cheap, bundle-served).
  if (!runPhase("times")) return null;
  if (!runPhase("suspects")) return null;
  if (!runPhase("items")) return null;
  if (!runPhase("locations")) return null;

  // Convergence top-up: drive the two most tractable of items/locations/times
  // down to ≤ 3 candidates — every original mystery pins two or three
  // dimensions hard and leaves the rest to the dealt cards.
  // Try different convergence shapes across search attempts. Best-of-K later
  // chooses on physical-card usefulness and prose rhythm; no mutable recent-
  // history target is injected into truth or fairness.
  const convergeOrder = rng.shuffle(["items", "locations", "times"] as const)
    .map((axis) => ({ axis, count: grid.counts()[axis] }));
  let converged = convergeOrder.filter((entry) => entry.count <= CONVERGED_MAX).length;
  for (const entry of convergeOrder) {
    if (converged >= CONVERGED_AXES_REQUIRED) break;
    if (entry.count <= CONVERGED_MAX) continue;
    if (runPhase(entry.axis, CONVERGED_MAX)) converged += 1;
    else if (grid.counts()[entry.axis] <= CONVERGED_MAX) converged += 1;
  }
  if (converged < CONVERGED_AXES_REQUIRED) return null;

  const finalNeed = needs(grid.counts());
  if (finalNeed.suspects + finalNeed.items + finalNeed.locations + finalNeed.times > 0) return null;
  if (chosen.length > maxConstraining) return null;

  // When two texture slots are available, prefer a complete innocent thread
  // (suspicious setup, later payoff) over two unrelated one-line anecdotes.
  // Both beats are mention-only, so this changes rhythm without changing the
  // proven candidate trajectory.
  const remainingSlots = REVEAL_COUNT - chosen.length;
  if (remainingSlots >= 2) {
    const completeThreads = [...new Set(colorFacts.map((fact) => fact.threadId).filter((id): id is string => Boolean(id)))]
      .map((threadId) => colorFacts.filter((fact) => fact.threadId === threadId))
      .filter((pair) => pair.some((fact) => fact.kind === "thread_setup") && pair.some((fact) => fact.kind === "thread_resolution"));
    if (completeThreads.length > 0) {
      const pair = rng.pick(completeThreads);
      const setup = pair.find((fact) => fact.kind === "thread_setup")!;
      const resolution = pair.find((fact) => fact.kind === "thread_resolution")!;
      if (!used.has(setup.id)) add(setup);
      if (!used.has(resolution.id) && chosen.length < REVEAL_COUNT) add(resolution);
    }
  }

  // Pad to 12 with color facts (pure narrative texture; they kill nothing).
  // A resolution is never admitted without its matching setup.
  const selectedThreadIds = new Set(chosen.filter((fact) => fact.kind === "thread_setup").map((fact) => fact.threadId));
  const pads = rng.shuffle(colorFacts.filter((fact) =>
    !used.has(fact.id) && (fact.kind !== "thread_resolution" || selectedThreadIds.has(fact.threadId))
  ));
  while (chosen.length < REVEAL_COUNT && pads.length > 0) add(pads.shift()!);
  if (chosen.length < REVEAL_COUNT) {
    // Not enough color facts: fill with harmless leftovers that stay in range.
    const leftovers = rng.shuffle(constraining.filter((fact) => !used.has(fact.id)));
    for (const fact of leftovers) {
      if (chosen.length >= REVEAL_COUNT) break;
      const snapshot = grid.snapshot();
      grid.apply(killLists.get(fact.id)!);
      const after = grid.counts();
      const ok =
        after.suspects >= FINAL_TARGET.suspects.min &&
        after.items >= FINAL_TARGET.items.min &&
        after.locations >= FINAL_TARGET.locations.min &&
        after.times >= FINAL_TARGET.times.min;
      if (ok) {
        used.add(fact.id);
        chosen.push(fact);
      } else {
        grid.restore(snapshot);
      }
    }
  }
  if (chosen.length !== REVEAL_COUNT) return null;

  // Need at least two note-suitable facts for N1/N2.
  if (chosen.filter((fact) => fact.noteSuitable).length < 2) return null;
  return chosen;
}

// ---------------------------------------------------------------------------
// Checkpoint-aware ordering
// ---------------------------------------------------------------------------

/**
 * Places the 12 selected facts into the reveal sequence so both checkpoints
 * hold, answer-mentioning facts sit at position ≥ 7, and the answer-solo fact
 * (if selected) lands in the last two clues. Greedy with randomized tie-breaks;
 * retries internally a few times.
 */
function orderReveals(
  rng: SeededRandom,
  selected: Fact[],
  killLists: Map<string, Uint32Array>,
  factById: Map<string, Fact>,
  answer: Answer
): ScheduledReveal[] | null {
  const isAnswerSolo = (fact: Fact): boolean =>
    fact.kind === "solo_presence" && fact.suspectIds[0] === answer.suspectId && fact.timeIds[0] === answer.timeId;
  const needsLate = (fact: Fact): boolean => !isMentionOnly(fact) && factMentionsAnswer(fact, answer);

  outer: for (let round = 0; round < 40; round += 1) {
    const remaining = rng.shuffle([...selected]);
    const grid = new JointGrid();
    const evaluator = new VirtualEvaluator(grid);
    const reveals: ScheduledReveal[] = [];
    let noteAssigned = 0;

    for (let position = 1; position <= REVEAL_COUNT; position += 1) {
      const isNote = position === NOTE1_POSITION || position === NOTE2_POSITION;
      const afterCheckpoints = position > CHECKPOINT_B.position;
      const bound = position <= CHECKPOINT_A.position ? CHECKPOINT_A.min : CHECKPOINT_B.min;

      const legal = remaining.filter((fact) => {
        if (isNote && !fact.noteSuitable) return false;
        if (!isNote && needsNoteSlot(remaining, fact, position, noteAssigned)) return false;
        if (needsLate(fact) && position < 7) return false;
        if (isAnswerSolo(fact) && position < 11) return false;
        if (
          fact.kind === "thread_resolution" &&
          remaining.some((candidate) => candidate.kind === "thread_setup" && candidate.threadId === fact.threadId)
        ) return false;
        // Late-only facts must still fit in remaining legal slots.
        const lateOnly = remaining.filter((candidate) => candidate.id !== fact.id && isAnswerSolo(candidate)).length;
        if (lateOnly > Math.max(0, 12 - Math.max(position, 10))) return false;
        return true;
      });
      if (legal.length === 0) continue outer;

      // Keep the current checkpoint bound satisfied; after both checkpoints
      // no bound applies (the selection already guarantees the final window,
      // and counts can only decrease toward it). Prefer gentle facts early
      // and heavy facts late so convergence lands in the last three clues.
      const counts = grid.counts();
      const viable: Array<{ fact: Fact; kills: number }> = [];
      for (const fact of legal) {
        const evaluated = evaluator.evaluate(killLists.get(fact.id)!, "times");
        if (!afterCheckpoints) {
          const after = {
            suspects: counts.suspects - evaluated.deaths.suspects,
            items: counts.items - evaluated.deaths.items,
            locations: counts.locations - evaluated.deaths.locations,
            times: counts.times - evaluated.deaths.times,
          };
          if (minCount(after) < bound) continue;
        }
        const kills =
          evaluated.deaths.suspects + evaluated.deaths.items + evaluated.deaths.locations + evaluated.deaths.times;
        viable.push({ fact, kills });
      }
      if (viable.length === 0) continue outer;
      viable.sort((a, b) => (afterCheckpoints ? b.kills - a.kills : a.kills - b.kills));
      const pickWindow = Math.min(3, viable.length);
      const fact = viable[rng.nextInt(0, pickWindow - 1)].fact;

      grid.apply(killLists.get(fact.id)!);
      remaining.splice(remaining.findIndex((candidate) => candidate.id === fact.id), 1);
      if (isNote) noteAssigned += 1;
      reveals.push({
        position,
        slot: position === NOTE1_POSITION ? "note1" : position === NOTE2_POSITION ? "note2" : "clue",
        clueNumber: null,
        factId: fact.id,
      });
    }

    // Assign clue numbers 1..10 in order.
    let clueNumber = 0;
    for (const reveal of reveals) {
      if (reveal.slot === "clue") {
        clueNumber += 1;
        reveal.clueNumber = clueNumber;
      }
    }
    return reveals;
  }
  return null;
}

/**
 * Reserve note-suitable facts when only just enough remain to fill N1/N2.
 */
function needsNoteSlot(remaining: Fact[], fact: Fact, position: number, notesAssigned: number): boolean {
  if (!fact.noteSuitable) return false;
  const notesLeft = 2 - notesAssigned;
  if (notesLeft <= 0) return false;
  const suitableLeft = remaining.filter((candidate) => candidate.noteSuitable).length;
  return suitableLeft <= notesLeft;
}

// ---------------------------------------------------------------------------
// Scoring + note links
// ---------------------------------------------------------------------------

function softPenalty(orderedFacts: Fact[], answer: Answer): number {
  let penalty = 0;
  for (let index = 1; index < orderedFacts.length; index += 1) {
    if (
      orderedFacts[index].primaryAxis !== "color" &&
      orderedFacts[index].primaryAxis === orderedFacts[index - 1].primaryAxis
    ) {
      penalty += 1;
    }
  }
  const mentionCounts = new Map<string, number>();
  for (const fact of orderedFacts) {
    for (const name of fact.mentions.suspects) {
      mentionCounts.set(name, (mentionCounts.get(name) ?? 0) + 1);
    }
  }
  const answerName = requireSuspect(answer.suspectId).displayName;
  for (const suspectId of DIMS.suspects) {
    const name = requireSuspect(suspectId).displayName;
    const count = mentionCounts.get(name) ?? 0;
    if (name === answerName) {
      if (count === 0) penalty += 2;
      if (count > 2) penalty += (count - 2) * 2;
    } else if (count === 0) {
      penalty += 1;
    }
  }
  return penalty;
}

function relatedClues(
  reveals: ScheduledReveal[],
  factById: Map<string, Fact>
): { note1: number[]; note2: number[] } {
  const clueReveals = reveals.filter((reveal) => reveal.slot === "clue");
  const overlap = (a: Fact, b: Fact): boolean =>
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
