/**
 * V3 Mystery Engine — evaluation harness.
 *
 * Deterministic mode (default, no API key needed):
 *   npx tsx scripts/eval-mysteries.ts 500
 * Full mode (adds real prose generation; needs ANTHROPIC_API_KEY in .dev.vars):
 *   npx tsx scripts/eval-mysteries.ts 500 --ai 3
 *
 * Reports, per seed: schedule success + world attempts, the candidate-count
 * trajectory (fair-play curve), final windows, converged axes, answer-mention
 * positions; and in full mode: license violations before repair, repair
 * counts, clue length stats vs the original corpus, signature diversity.
 */

import { readFileSync } from "node:fs";
import { SUSPECTS, ITEMS, LOCATIONS, TIME_PERIODS } from "../src/data/game-elements";
import { SeededRandom } from "../src/services/seeded-random";
import { simulateWorld } from "../src/services/world-sim";
import { harvestFacts } from "../src/services/fact-harvest";
import { scheduleMystery, type Schedule } from "../src/services/clue-scheduler";
import { generateMysteryV2, getLastMysteryEngineDebug } from "../src/services/ai-mystery-engine";
import { ORIGINAL_MYSTERIES } from "../src/data/original-mysteries";
import type { Answer } from "../src/services/ai-mystery-schemas";

const seedCount = Number(process.argv[2] ?? 200);
const aiFlagIndex = process.argv.indexOf("--ai");
const aiCount = aiFlagIndex >= 0 ? Number(process.argv[aiFlagIndex + 1] ?? 2) : 0;

function randomAnswer(seed: number): Answer {
  const rng = new SeededRandom(seed * 7_919 + 13);
  return {
    suspectId: rng.pick(SUSPECTS).id,
    itemId: rng.pick(ITEMS).id,
    locationId: rng.pick(LOCATIONS).id,
    timeId: rng.pick(TIME_PERIODS).id,
  };
}

// ---------------------------------------------------------------------------
// Deterministic sweep
// ---------------------------------------------------------------------------

console.log(`\n=== Deterministic sweep: ${seedCount} seeds ===`);
const t0 = Date.now();
let ok = 0;
const worldAttemptsHist = new Map<number, number>();
const finals = { suspects: new Map<number, number>(), items: new Map<number, number>(), locations: new Map<number, number>(), times: new Map<number, number>() };
const failures: number[] = [];

const bump = (map: Map<number, number>, key: number) => map.set(key, (map.get(key) ?? 0) + 1);

for (let seed = 1; seed <= seedCount; seed += 1) {
  const answer = randomAnswer(seed);
  let schedule: Schedule | null = null;
  let attempts = 0;
  for (attempts = 1; attempts <= 30 && !schedule; attempts += 1) {
    const world = simulateWorld({ seed, attempt: attempts, answer, occasionFamily: "eval occasion" });
    schedule = scheduleMystery({ facts: harvestFacts(world), answer, seed: seed * 31 + attempts });
  }
  if (!schedule) {
    failures.push(seed);
    continue;
  }
  ok += 1;
  bump(worldAttemptsHist, attempts - 1);
  bump(finals.suspects, schedule.finalCounts.suspects);
  bump(finals.items, schedule.finalCounts.items);
  bump(finals.locations, schedule.finalCounts.locations);
  bump(finals.times, schedule.finalCounts.times);
}

const show = (map: Map<number, number>) =>
  [...map.entries()].sort((a, b) => a[0] - b[0]).map(([key, count]) => `${key}:${count}`).join(" ");

console.log(`success: ${ok}/${seedCount} (${((ok / seedCount) * 100).toFixed(1)}%)  |  ${((Date.now() - t0) / seedCount).toFixed(1)} ms/mystery`);
console.log(`world attempts: ${show(worldAttemptsHist)}`);
console.log(`final suspects: ${show(finals.suspects)}`);
console.log(`final items:    ${show(finals.items)}`);
console.log(`final locations:${show(finals.locations)}`);
console.log(`final times:    ${show(finals.times)}`);
if (failures.length > 0) console.log(`FAILED seeds: ${failures.join(", ")}`);

// ---------------------------------------------------------------------------
// Corpus style baseline
// ---------------------------------------------------------------------------

const corpusClueWords = ORIGINAL_MYSTERIES.flatMap((mystery) => mystery.butlerClues).map((clue) => clue.split(/\s+/).length);
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
console.log(`\ncorpus clue length: mean ${mean(corpusClueWords).toFixed(1)} words (min ${Math.min(...corpusClueWords)}, max ${Math.max(...corpusClueWords)})`);

// ---------------------------------------------------------------------------
// Optional: full AI generations
// ---------------------------------------------------------------------------

if (aiCount > 0) {
  const vars = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
  const apiKey = vars.match(/ANTHROPIC_API_KEY=(.+)/)?.[1]?.trim();
  if (!apiKey) {
    console.error("No ANTHROPIC_API_KEY in .dev.vars — skipping AI evaluation.");
    process.exit(1);
  }
  console.log(`\n=== Full AI generations: ${aiCount} seeds ===`);
  const signatures: string[] = [];
  for (let index = 0; index < aiCount; index += 1) {
    const seed = 900_000 + index * 1_013;
    const answer = randomAnswer(seed);
    const setup = { seed, themeId: "AI01" as const, difficulty: "expert" as const, solution: answer };
    const started = Date.now();
    try {
      const result = await generateMysteryV2(apiKey, { setup, recentSignatures: signatures });
      const debug = getLastMysteryEngineDebug()!;
      signatures.push(result.mysterySignature);
      const clueWords = result.butlerClues.map((clue) => clue.split(/\s+/).length);
      console.log(`\n--- seed ${seed} (${((Date.now() - started) / 1000).toFixed(1)}s) ---`);
      console.log(`answer: ${JSON.stringify(answer)}  worldAttempts: ${debug.schedule?.worldAttempts}`);
      console.log(`repairs: ${debug.repairs?.length ?? 0}  unresolved: ${debug.unresolvedProblems?.length ?? 0}`);
      console.log(`clue length: mean ${mean(clueWords).toFixed(1)} words`);
      console.log(`signature: ${result.mysterySignature}`);
      console.log(`opening: ${result.opening}`);
      result.butlerClues.forEach((clue, clueIndex) => console.log(`  C${clueIndex + 1}: ${clue}`));
      console.log(`  N1: ${result.inspectorNotes[0].text}`);
      console.log(`  N2: ${result.inspectorNotes[1].text}`);
      console.log(`closing: ${result.closing}`);
    } catch (error) {
      console.error(`seed ${seed} FAILED:`, error instanceof Error ? error.message : error);
    }
  }
}
