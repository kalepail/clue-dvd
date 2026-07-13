/**
 * V3 Clue Scheduler
 *
 * Chooses WHICH harvested facts become the 10 Butler clues and 2 Inspector
 * notes, and in WHAT order, by simulating a rational player over the joint
 * (suspect × item × location × time) space — 12,100 cells.
 *
 * Reveal order: C1..C5, N1, C6, C7, N2, C8, C9, C10  (positions 1..12)
 *
 * Candidate counts are diagnostic only. The scheduler does NOT require an
 * arbitrary number of suspects, items, rooms, or times to remain. It ranks
 * facts by a soft blend of narrative richness, genuine deduction value,
 * novelty, and non-repetition. Thus a movement can beat an inventory line
 * without either clue family being mandatory.
 *
 * The hard rules are structural rather than numerical: the immutable answer
 * must remain possible, the same source fact cannot be dealt twice, twelve
 * distinct reveals must exist, and the public package cannot collapse the
 * entire joint mystery to one literal solution cell. Reveal order has no
 * clue-kind or information-kind gates.
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
};

const REVEAL_COUNT = 12;
const NOTE1_POSITION = 6;
const NOTE2_POSITION = 9;

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

  evaluate(kills: Uint32Array): { killedCells: number; pairProgress: number; deaths: CategoryCounts } {
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
    const pairProgress =
      pairDeaths(this.grid.stPairs, this.stDec) +
      pairDeaths(this.grid.itPairs, this.itDec) +
      pairDeaths(this.grid.ltPairs, this.ltDec);

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
  /** Retained for call-site compatibility; selection no longer retries until
   * an arbitrary candidate-count window happens to pass. */
  maxAttempts?: number;
}): Schedule | null {
  const { facts, answer } = params;
  const rng = new SeededRandom((params.seed ^ 0x5f3759df) >>> 1);
  if (facts.length < REVEAL_COUNT) return null;
  const killLists = buildKillLists(facts);
  const factById = new Map(facts.map((fact) => [fact.id, fact]));
  const answerCell = cellIndex(
    DIMS.suspects.indexOf(answer.suspectId),
    DIMS.items.indexOf(answer.itemId),
    DIMS.locations.indexOf(answer.locationId),
    DIMS.times.indexOf(answer.timeId)
  );
  const selection = selectFacts(rng, facts, killLists);
  if (!selection) return null;
  const orderedFacts = orderFacts(rng, selection.facts, answer);
  const reveals: ScheduledReveal[] = [];
  let clueNumber = 0;
  for (let index = 0; index < orderedFacts.length; index += 1) {
    const position = index + 1;
    const slot: RevealSlot = position === NOTE1_POSITION ? "note1" : position === NOTE2_POSITION ? "note2" : "clue";
    if (slot === "clue") clueNumber += 1;
    reveals.push({ position, slot, clueNumber: slot === "clue" ? clueNumber : null, factId: orderedFacts[index].id });
  }

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
  if (grid.aliveCount <= 1) return null;

  const aliveNames = (cells: Uint32Array, ids: readonly string[], toName: (id: string) => string): string[] =>
    ids.filter((_, index) => cells[index] > 0).map(toName);
  return {
    reveals,
    trajectory,
    finalCounts: grid.counts(),
    finalCandidates: {
      suspects: aliveNames(grid.suspectCells, DIMS.suspects, (id) => requireSuspect(id).displayName),
      items: aliveNames(grid.itemCells, DIMS.items, (id) => requireItem(id).nameUS),
      locations: aliveNames(grid.locationCells, DIMS.locations, (id) => requireLocation(id).name),
      times: aliveNames(grid.timeCells, DIMS.times, (id) => requireTime(id).name),
    },
    noteRelatedClues: relatedClues(reveals, factById),
    softScore: selection.score - softPenalty(orderedFacts, answer),
    attempts: 1,
  };
}

// ---------------------------------------------------------------------------
// Quality-ranked selection
// ---------------------------------------------------------------------------

function licensedNames(fact: Fact): string[] {
  return [...new Set([
    ...fact.mentions.suspects,
    ...fact.mentions.items,
    ...fact.mentions.locations,
    ...fact.mentions.times,
  ])];
}

/** Narrative value comes from the fact's actual structure, not a whitelist
 * or rank of clue kinds. People situated in a time and place naturally carry
 * more story than a bare ledger entry; uncertain/threaded facts gain context
 * without becoming mandatory. */
function narrativeValue(fact: Fact, dimensions: number): number {
  return 10 +
    (fact.suspectIds.length > 0 ? 14 : 0) +
    (fact.locationIds.length > 0 ? 5 : 0) +
    (fact.timeIds.length > 0 ? 5 : 0) +
    (fact.itemIds.length > 0 ? 3 : 0) +
    (dimensions >= 3 ? 5 : 0) +
    (isMentionOnly(fact) ? 7 : 0) +
    (fact.threadId ? 5 : 0) +
    (fact.suspectTimePairs && fact.suspectTimePairs.length > fact.suspectIds.length ? 3 : 0);
}

/**
 * Picks twelve facts by quality. Deduction helps a candidate's score, but no
 * suspect/item/location/time count is a target or a pass/fail condition.
 * Repetition is a soft cost; source reuse and a one-cell public solution are
 * the only exclusions.
 */
function selectFacts(
  rng: SeededRandom,
  facts: Fact[],
  killLists: Map<string, Uint32Array>
): { facts: Fact[]; score: number } | null {
  const grid = new JointGrid();
  const evaluator = new VirtualEvaluator(grid);
  const chosen: Fact[] = [];
  const usedSources = new Set<string>();
  const seenNames = new Set<string>();
  const shapeCounts = new Map<string, number>();
  const axisCounts = new Map<Fact["primaryAxis"], number>();
  const threadCounts = new Map<string, number>();
  const shuffled = rng.shuffle([...facts]);
  let packageScore = 0;

  while (chosen.length < REVEAL_COUNT) {
    const scored: Array<{ fact: Fact; score: number }> = [];
    for (const fact of shuffled) {
      if (usedSources.has(fact.id)) continue;
      const evaluated = evaluator.evaluate(killLists.get(fact.id)!);
      if (grid.aliveCount - evaluated.killedCells <= 1) continue;

      const names = licensedNames(fact);
      const newNames = names.filter((name) => !seenNames.has(name)).length;
      const dimensions = [fact.suspectIds, fact.itemIds, fact.locationIds, fact.timeIds]
        .filter((ids) => ids.length > 0).length;
      const shape = fact.kind;
      const deaths = evaluated.deaths.suspects + evaluated.deaths.items + evaluated.deaths.locations + evaluated.deaths.times;
      const existingThreadCount = fact.threadId ? (threadCounts.get(fact.threadId) ?? 0) : 0;
      const deductionValue =
        Math.log2(evaluated.killedCells + 1) * 1.25 +
        deaths * 3.5 +
        Math.log2(evaluated.pairProgress + 1) * 1.25;
      const noveltyValue = Math.min(newNames, 8) * 0.8 + dimensions * 1.5;
      // A false statement and the separately observed contradiction form a
      // genuine mystery thread, not repetition. Reward that second half
      // softly; unrelated recurring labels remain a repetition cost.
      const threadConnectionValue = fact.threadId === "LIE" && existingThreadCount === 1 ? 8 : 0;
      const repetitionCost =
        (shapeCounts.get(shape) ?? 0) * 7 +
        (axisCounts.get(fact.primaryAxis) ?? 0) * 1.5 +
        (fact.threadId && fact.threadId !== "LIE" ? existingThreadCount * 5 : Math.max(0, existingThreadCount - 1) * 5) +
        Math.max(0, names.length - 8) * 2;
      scored.push({
        fact,
        score: narrativeValue(fact, dimensions) + deductionValue + noveltyValue + threadConnectionValue - repetitionCost,
      });
    }
    if (scored.length === 0) return null;
    scored.sort((a, b) => b.score - a.score);
    const finalists = scored.slice(0, Math.min(4, scored.length));
    const picked = rng.pickWeighted(finalists, [7, 3, 1.5, 0.5].slice(0, finalists.length));
    const fact = picked.fact;
    chosen.push(fact);
    packageScore += picked.score;
    usedSources.add(fact.id);
    for (const name of licensedNames(fact)) seenNames.add(name);
    const shape = fact.kind;
    shapeCounts.set(shape, (shapeCounts.get(shape) ?? 0) + 1);
    axisCounts.set(fact.primaryAxis, (axisCounts.get(fact.primaryAxis) ?? 0) + 1);
    if (fact.threadId) {
      threadCounts.set(fact.threadId, (threadCounts.get(fact.threadId) ?? 0) + 1);
    }
    grid.apply(killLists.get(fact.id)!);
  }

  return { facts: chosen, score: packageScore };
}

/** Every selected fact can occupy every reveal position. We sample several
 * unrestricted shuffles and use only a soft adjacent-repetition preference. */
function orderFacts(rng: SeededRandom, selected: Fact[], answer: Answer): Fact[] {
  let best = rng.shuffle([...selected]);
  let bestPenalty = softPenalty(best, answer);
  for (let round = 1; round < 24; round += 1) {
    const candidate = rng.shuffle([...selected]);
    const penalty = softPenalty(candidate, answer);
    if (penalty < bestPenalty) {
      best = candidate;
      bestPenalty = penalty;
    }
  }
  return best;
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
