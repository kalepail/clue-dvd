/**
 * V3 Mystery Engine — evaluation harness.
 *
 * Deterministic mode (default, no API key needed):
 *   npx tsx scripts/eval-mysteries.ts 500
 * Full mode (adds real prose generation; needs Cloudflare vars in .dev.vars):
 *   npx tsx scripts/eval-mysteries.ts 500 --ai 3 --model xai/grok-4.3
 * A/B matrix (runs the same seeds across the qualified live models):
 *   npx tsx scripts/eval-mysteries.ts 500 --ai 2 --matrix
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
import {
  AI_MYSTERY_AB_MODELS,
  DEFAULT_AI_MYSTERY_MODEL,
  type MysteryProviderRuntime,
} from "../src/services/ai-mystery-provider";
import { ORIGINAL_MYSTERIES } from "../src/data/original-mysteries";
import type { Answer } from "../src/services/ai-mystery-schemas";

const seedCount = Number(process.argv[2] ?? 200);
const aiFlagIndex = process.argv.indexOf("--ai");
const aiCount = aiFlagIndex >= 0 ? Number(process.argv[aiFlagIndex + 1] ?? 2) : 0;
const modelFlagIndex = process.argv.indexOf("--model");
const requestedModel = modelFlagIndex >= 0 ? process.argv[modelFlagIndex + 1] : undefined;
const modelsFlagIndex = process.argv.indexOf("--models");
const requestedModels = modelsFlagIndex >= 0
  ? (process.argv[modelsFlagIndex + 1] ?? "").split(",").map((model) => model.trim()).filter(Boolean)
  : [];
const matrixMode = process.argv.includes("--matrix");

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
const selectedKinds = new Map<string, number>();
let selectedStaticAccounting = 0;
let selectedRevealCount = 0;

const bump = <T>(map: Map<T, number>, key: T) => map.set(key, (map.get(key) ?? 0) + 1);

for (let seed = 1; seed <= seedCount; seed += 1) {
  const answer = randomAnswer(seed);
  let schedule: Schedule | null = null;
  let scheduledFacts: ReturnType<typeof harvestFacts> = [];
  let attempts = 0;
  for (attempts = 1; attempts <= 30 && !schedule; attempts += 1) {
    const world = simulateWorld({ seed, attempt: attempts, answer, occasionFamily: "eval occasion" });
    const facts = harvestFacts(world);
    schedule = scheduleMystery({ facts, answer, seed: seed * 31 + attempts });
    if (schedule) scheduledFacts = facts;
  }
  if (!schedule) {
    failures.push(seed);
    continue;
  }
  ok += 1;
  const factById = new Map(scheduledFacts.map((fact) => [fact.id, fact]));
  for (const reveal of schedule.reveals) {
    const kind = factById.get(reveal.factId)?.kind ?? "unknown";
    bump(selectedKinds, kind);
    selectedRevealCount += 1;
    if (kind === "item_intact" || kind === "room_undisturbed") selectedStaticAccounting += 1;
  }
  bump(worldAttemptsHist, attempts - 1);
  bump(finals.suspects, schedule.finalCounts.suspects);
  bump(finals.items, schedule.finalCounts.items);
  bump(finals.locations, schedule.finalCounts.locations);
  bump(finals.times, schedule.finalCounts.times);
}

const show = (map: Map<number, number>) =>
  [...map.entries()].sort((a, b) => a[0] - b[0]).map(([key, count]) => `${key}:${count}`).join(" ");
const showStringMap = (map: Map<string, number>) =>
  [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, count]) => `${key}:${count}`).join(" ");

console.log(`success: ${ok}/${seedCount} (${((ok / seedCount) * 100).toFixed(1)}%)  |  ${((Date.now() - t0) / seedCount).toFixed(1)} ms/mystery`);
console.log(`world attempts: ${show(worldAttemptsHist)}`);
console.log(`final suspects: ${show(finals.suspects)}`);
console.log(`final items:    ${show(finals.items)}`);
console.log(`final locations:${show(finals.locations)}`);
console.log(`final times:    ${show(finals.times)}`);
console.log(`selected kinds: ${showStringMap(selectedKinds)}`);
console.log(`static accounting: ${selectedStaticAccounting}/${selectedRevealCount} (${((selectedStaticAccounting / Math.max(1, selectedRevealCount)) * 100).toFixed(1)}%)`);
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
  const env = parseEnvFile(vars);
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.AI_GATEWAY_TOKEN) {
    console.error("Cloudflare AI credentials are missing from .dev.vars — skipping AI evaluation.");
    process.exit(1);
  }
  const models = matrixMode
    ? [...AI_MYSTERY_AB_MODELS]
    : requestedModels.length > 0
      ? requestedModels
      : [requestedModel ?? env.AI_MYSTERY_MODEL ?? DEFAULT_AI_MYSTERY_MODEL];
  console.log(`\n=== Full AI generations: ${aiCount} seeds x ${models.length} models ===`);
  for (const model of models) {
    const runtime: MysteryProviderRuntime = {
      model,
      gatewayId: env.AI_GATEWAY_ID || "default",
      gatewayToken: env.AI_GATEWAY_TOKEN,
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
      reasoningEffort: parseReasoningEffort(env.AI_MYSTERY_REASONING_EFFORT),
    };
    const signatures: string[] = [];
    let modelSuccesses = 0;
    let totalDurationMs = 0;
    let totalRepairs = 0;
    let closingRepairs = 0;
    let totalUnresolved = 0;
    let repeatedOpeners = 0;
    let genericFlags = 0;
    let stagedThreadGames = 0;
    let continuityLinks = 0;
    console.log(`\n### ${model} ###`);
    for (let index = 0; index < aiCount; index += 1) {
      const seed = 900_000 + index * 1_013;
      const answer = randomAnswer(seed);
      const setup = { seed, themeId: "AI01" as const, difficulty: "expert" as const, solution: answer };
      const started = Date.now();
      try {
        const result = await generateMysteryV2(runtime, { setup, recentSignatures: signatures });
        const durationMs = Date.now() - started;
        const debug = getLastMysteryEngineDebug()!;
        signatures.push(result.mysterySignature);
        modelSuccesses += 1;
        totalDurationMs += durationMs;
        totalRepairs += debug.repairs?.length ?? 0;
        closingRepairs += debug.repairs?.filter((repair) => repair.target === "closing").length ?? 0;
        totalUnresolved += debug.unresolvedProblems?.length ?? 0;
        const clueWords = result.butlerClues.map((clue) => clue.split(/\s+/).length);
        const openerKeys = result.butlerClues.map(clueOpenerKey);
        repeatedOpeners += openerKeys.length - new Set(openerKeys).size;
        genericFlags += result.butlerClues.filter(isGenericClue).length;
        if (
          result.butlerEvidence.some((evidence) => evidence.kind === "thread_setup") &&
          result.butlerEvidence.some((evidence) => evidence.kind === "thread_resolution")
        ) stagedThreadGames += 1;
        continuityLinks += debug.continuity?.beats.reduce(
          (count, beat) => count + beat.earlierPublicRelations.length,
          0
        ) ?? 0;
        console.log(`\n--- seed ${seed} (${(durationMs / 1000).toFixed(1)}s) ---`);
        console.log(`answer: ${JSON.stringify(answer)}  worldAttempts: ${debug.schedule?.worldAttempts}  schedulesCompared: ${debug.schedule?.candidatesConsidered}`);
        console.log(`repairs: ${debug.repairs?.length ?? 0}  unresolved: ${debug.unresolvedProblems?.length ?? 0}`);
        console.log(`clue length: mean ${mean(clueWords).toFixed(1)} words`);
        console.log(`stage latency ms: dossier=${debug.dossier?.durationMs} render=${debug.render?.durationMs} closing=${debug.closing?.durationMs}`);
        console.log(`stage transport: ${debug.render?.transport ?? "unknown"}`);
        console.log(`signature: ${result.mysterySignature}`);
        console.log(`opening: ${result.opening}`);
        result.butlerClues.forEach((clue, clueIndex) => {
          console.log(`  C${clueIndex + 1}: ${clue}`);
          console.log(`      FACT: ${result.butlerEvidence[clueIndex].statement}`);
        });
        console.log(`  N1 (${result.inspectorNotes[0].role}): ${result.inspectorNotes[0].text}`);
        console.log(`      FACT: ${result.inspectorNotes[0].evidence.statement}`);
        console.log(`  N2 (${result.inspectorNotes[1].role}): ${result.inspectorNotes[1].text}`);
        console.log(`      FACT: ${result.inspectorNotes[1].evidence.statement}`);
        console.log(`closing: ${result.closing}`);
      } catch (error) {
        console.error(`seed ${seed} FAILED:`, error instanceof Error ? error.message : error);
      }
    }
    console.log(`\nSUMMARY ${model}: ${modelSuccesses}/${aiCount} succeeded; mean ${(totalDurationMs / Math.max(1, modelSuccesses) / 1000).toFixed(1)}s; repairs ${totalRepairs} (closing ${closingRepairs}); unresolved ${totalUnresolved}; repeated opener keys ${repeatedOpeners}; generic flags ${genericFlags}; staged-thread games ${stagedThreadGames}; validated continuity links ${continuityLinks}`);
  }
}

function clueOpenerKey(clue: string): string {
  return clue
    .toLowerCase()
    .replace(/^(coming|hello|good day)\s*[-—,:]*\s*/i, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join(" ");
}

function isGenericClue(clue: string): boolean {
  return /figured in (?:the )?day|little events|something happened|went about (?:the|their) day|quite ordinarily|in the case file/i.test(clue);
}

function parseEnvFile(contents: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return env;
}

function parseReasoningEffort(value: string | undefined): MysteryProviderRuntime["reasoningEffort"] {
  return value === "none" || value === "low" || value === "medium" || value === "high" ? value : undefined;
}
