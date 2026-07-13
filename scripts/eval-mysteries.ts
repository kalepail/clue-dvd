/**
 * V3.1 Scene & Occasion evaluation harness.
 *
 * Deterministic (no API key):
 *   npm run eval:mysteries -- 120
 * Inspect one deterministic slate and save its JSON:
 *   npm run eval:mysteries -- --inspect-seed 942027
 * Full prose sampling (Unified Billing gateway-first, direct Opus compatible):
 *   npm run eval:mysteries -- 120 --ai 3
 * Select a configured catalog model for an A/B run:
 *   npm run eval:mysteries -- --ai-only --ai 3 --ai-model openai/gpt-5.4
 *
 * Full-game provider settings are read from .dev.vars without printing
 * credentials. Non-default models require Cloudflare REST credentials.
 *
 * The deterministic sweep is the release gate. It exercises real occasion
 * families, world retries, story recipes, the 12,100-cell solver, episode
 * ordering, answer-hour discretion, and anti-meta-gaming symmetry.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { SUSPECTS, ITEMS, LOCATIONS, TIME_PERIODS } from "../src/data/game-elements";
import { OCCASION_FAMILIES } from "../src/data/occasion-catalog";
import { SeededRandom } from "../src/services/seeded-random";
import { requireItem, requireLocation, requireSuspect, requireTime, simulateWorld, type WorldState } from "../src/services/world-sim";
import { harvestFacts, type Fact } from "../src/services/fact-harvest";
import { isNarrativeFact, locationsMaxFor, questionedAttentionSuspectIds, scheduleMystery, timesMaxFor, type Schedule } from "../src/services/clue-scheduler";
import { generateMysteryV2, getLastMysteryEngineDebug } from "../src/services/ai-mystery-engine";
import { parseEvalProviderVars, resolveEvalProviderConfig } from "../src/services/ai-mystery-eval-config";
import { ORIGINAL_MYSTERIES } from "../src/data/original-mysteries";
import type { Answer } from "../src/services/ai-mystery-schemas";

const cliArgs = process.argv.slice(2);
const numericFlags = new Set(["--ai", "--seed-start", "--seed-base", "--inspect-seed", "--world-attempts"]);
const stringFlags = new Set(["--ai-model"]);
const booleanFlags = new Set(["--ai-only", "--world-only"]);
const positionalArgs: string[] = [];

for (let index = 0; index < cliArgs.length; index += 1) {
  const argument = cliArgs[index];
  if (!argument.startsWith("--")) {
    positionalArgs.push(argument);
    continue;
  }
  if (booleanFlags.has(argument)) continue;
  if (!numericFlags.has(argument) && !stringFlags.has(argument)) {
    throw new Error(`Unknown evaluation option: ${argument}`);
  }
  const value = cliArgs[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${argument} requires ${numericFlags.has(argument) ? "a numeric" : "a string"} value.`);
  }
  index += 1;
}

if (positionalArgs.length > 1) {
  throw new Error(`Expected at most one positional seed count, received: ${positionalArgs.join(", ")}`);
}

function numericOption(flag: string, fallback: number, minimum: number): number {
  const index = cliArgs.indexOf(flag);
  if (index < 0) return fallback;
  const value = Number(cliArgs[index + 1]);
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${flag} must be an integer of at least ${minimum}.`);
  }
  return value;
}

function stringOption(flag: string): string | undefined {
  const index = cliArgs.indexOf(flag);
  if (index < 0) return undefined;
  const value = cliArgs[index + 1]?.trim();
  if (!value) throw new Error(`${flag} requires a non-empty string value.`);
  return value;
}

const inspectSeedFlagIndex = cliArgs.indexOf("--inspect-seed");
const inspectSeed = inspectSeedFlagIndex >= 0 ? numericOption("--inspect-seed", 1, 1) : null;
const explicitSeedCount = positionalArgs[0] === undefined ? null : Number(positionalArgs[0]);
if (explicitSeedCount !== null && (!Number.isSafeInteger(explicitSeedCount) || explicitSeedCount < 1)) {
  throw new Error("The deterministic seed count must be a positive integer.");
}
const seedCount = explicitSeedCount ?? (inspectSeed === null ? 120 : 1);
const aiCount = cliArgs.includes("--ai") ? numericOption("--ai", 2, 0) : 0;
const aiModelOverride = stringOption("--ai-model");
const aiOnly = cliArgs.includes("--ai-only");
const worldOnly = cliArgs.includes("--world-only");
const deterministicSeedStart = cliArgs.includes("--seed-start")
  ? numericOption("--seed-start", 1, 1)
  : inspectSeed ?? 1;
const aiSeedBase = numericOption("--seed-base", 900_000, 1);
const evalOutputDir = process.env.CLUE_DVD_EVAL_OUTPUT;
const MAX_WORLD_ATTEMPTS = numericOption("--world-attempts", 240, 1);

function randomAnswer(seed: number): Answer {
  const rng = new SeededRandom(seed * 7_919 + 13);
  return {
    suspectId: rng.pick(SUSPECTS).id,
    itemId: rng.pick(ITEMS).id,
    locationId: rng.pick(LOCATIONS).id,
    timeId: rng.pick(TIME_PERIODS).id,
  };
}

const bump = <K>(map: Map<K, number>, key: K): void => map.set(key, (map.get(key) ?? 0) + 1);
const show = (map: Map<number, number>): string =>
  [...map.entries()].sort((a, b) => a[0] - b[0]).map(([key, count]) => `${key}:${count}`).join(" ");
const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);

function selectedFacts(schedule: Schedule, facts: Fact[]): Fact[] {
  const byId = new Map(facts.map((fact) => [fact.id, fact]));
  return schedule.reveals.map((reveal) => byId.get(reveal.factId)!);
}

function spineTerms(world: WorldState): string[] {
  return [...new Set([
    world.occasionSpine.mainEvent,
    ...world.occasionSpine.beats.map((beat) => beat.name),
    ...world.occasionSpine.groupActivities,
    ...world.occasionSpine.soloActivities,
    ...world.occasionSpine.setDressing,
  ].flatMap((phrase) => phrase.toLowerCase().match(/[a-z]{4,}/g) ?? []))];
}

function containsCardName(text: string, cardName: string): boolean {
  const escaped = cardName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

function phraseOccurrences(text: string, phrase: string): number {
  if (!phrase.trim()) return 0;
  const haystack = text.toLowerCase();
  const needle = phrase.toLowerCase();
  let count = 0;
  let from = 0;
  while ((from = haystack.indexOf(needle, from)) >= 0) {
    count += 1;
    from += Math.max(1, needle.length);
  }
  return count;
}

/** Catch broken deterministic input at its source instead of hoping the prose
 * model silently repairs it. These checks are grammatical/world-language
 * invariants, not restrictions on clue style or ordering. */
function briefLanguageProblems(fact: Fact): string[] {
  const problems: string[] = [];
  if (/\bstaff\b/i.test(fact.writerBrief)) problems.push("public use of 'staff'");
  if (fact.kind === "claim" && /[“\"]I was the\b/i.test(fact.writerBrief)) {
    problems.push("gathering label used as an activity after 'I was'");
  }
  if (
    (fact.kind === "group_presence" || fact.kind === "scene_continuation") &&
    /^The\s+[a-z]+ing\b/.test(fact.writerBrief)
  ) {
    problems.push("gerund activity incorrectly treated as a noun phrase");
  }
  if (
    fact.kind === "item_intact" && fact.itemIds.length === 1 &&
    /\b(?:were each|their usual spots|where they belonged|all present and in their places|as they had all day)\b/i.test(fact.writerBrief)
  ) {
    problems.push("plural grammar used for one item");
  }
  if (fact.kind !== "retired_gathering" && /after everyone retired/i.test(fact.writerBrief)) {
    problems.push("active event placed after an unsupported whole-house retirement");
  }
  return problems;
}

if (worldOnly) {
  const variants = new Map<string, number>();
  let witnessTotal = 0;
  let fabricated = 0;
  let thiefWitness = 0;
  let zeroEpisodes = 0;
  let zeroStepAways = 0;
  const zeroStepAwaySeeds: number[] = [];
  const zeroStepAwayDetails: string[] = [];
  let answerThreadAppearances = 0;
  let expectedAnswerThreadAppearances = 0;
  let fogThreads = 0;
  let fogAtAnswerHour = 0;
  let malformedBriefs = 0;

  for (let offset = 0; offset < seedCount; offset += 1) {
    const seed = deterministicSeedStart + offset;
    const answer = randomAnswer(seed);
    const world = simulateWorld({
      seed,
      attempt: 1,
      answer,
      occasionFamily: OCCASION_FAMILIES[(seed - 1) % OCCASION_FAMILIES.length],
    });
    const facts = harvestFacts(world);
    if (world.episodes.length === 0) zeroEpisodes += 1;
    if (!world.episodes.some((episode) => episode.stepAway)) {
      zeroStepAways += 1;
      zeroStepAwaySeeds.push(seed);
      const groupTrace = world.slots.map((slot) => {
        const groups = new Set(
          Object.values(world.movement[slot.id] ?? {})
            .filter((placement) => placement.social === "group")
            .map((placement) => placement.companions.slice().sort().join("+"))
        );
        return `${slot.id}:${[...groups].join("/") || "-"}`;
      }).join(",");
      zeroStepAwayDetails.push(
        `${seed}: gatherings=${world.gatherings.map((entry) => entry.timeId).join("+")}; ` +
        `remarks=${world.transitionRemarks.length}; episodes=${world.episodes.map((entry) => entry.timeIds.join("-")).join(",")}; ` +
        `groups=${groupTrace}`
      );
    }
    for (const account of world.witnessAccounts) {
      witnessTotal += 1;
      bump(variants, account.variant);
      if (!account.truthful) fabricated += 1;
      if (account.witnessId === answer.suspectId) thiefWitness += 1;
    }
    for (const thread of world.threads) {
      if (thread.suspectIds.includes(answer.suspectId)) answerThreadAppearances += 1;
      const answerUnavailable = thread.kind !== "foggy_memory" && thread.timeId === answer.timeId;
      expectedAnswerThreadAppearances += answerUnavailable ? 0 : thread.suspectIds.length / SUSPECTS.length;
      if (thread.kind === "foggy_memory") {
        fogThreads += 1;
        if (thread.timeId === answer.timeId) fogAtAnswerHour += 1;
      }
    }
    malformedBriefs += facts.filter((fact) => briefLanguageProblems(fact).length > 0).length;
  }

  console.log(`\n=== Raw V3.1 world audit: ${seedCount} attempt-one worlds ===`);
  console.log(`episodes absent: ${zeroEpisodes}; step-away episodes absent: ${zeroStepAways}`);
  if (zeroStepAwaySeeds.length > 0) console.log(`zero-step-away seeds: ${zeroStepAwaySeeds.join(", ")}`);
  if (zeroStepAwayDetails.length > 0) console.log(`zero-step-away details: ${zeroStepAwayDetails.join(" | ")}`);
  console.log(`witness variants: ${[...variants.entries()].map(([key, value]) => `${key}:${value}`).join(" ") || "none"}`);
  console.log(`fabricated witnesses: ${fabricated}/${witnessTotal} (${((fabricated / Math.max(1, witnessTotal)) * 100).toFixed(1)}%)`);
  console.log(`thief as witness: ${thiefWitness}/${witnessTotal} (${((thiefWitness / Math.max(1, witnessTotal)) * 100).toFixed(1)}%)`);
  console.log(`answer in suspicious side threads: ${answerThreadAppearances}; answer-blind expectation: ${expectedAnswerThreadAppearances.toFixed(1)}`);
  console.log(`fog at answer hour: ${fogAtAnswerHour}/${fogThreads} (${((fogAtAnswerHour / Math.max(1, fogThreads)) * 100).toFixed(1)}%)`);
  console.log(`malformed deterministic briefs: ${malformedBriefs}`);
  process.exit(0);
}

console.log(`\n=== Deterministic V3.1 sweep: ${aiOnly ? 0 : seedCount} seeds ===`);
const started = Date.now();
const failures: number[] = [];
const worldAttemptsHist = new Map<number, number>();
const recipeCounts = new Map<string, number>();
const statementByRecipe = new Map<string, number>();
const finals = {
  suspects: new Map<number, number>(),
  items: new Map<number, number>(),
  locations: new Map<number, number>(),
  times: new Map<number, number>(),
};
const witnessVariants = new Map<string, number>();
const textureKinds = new Set<string>();
const recentPatterns: string[] = [];
const hourAuditByAnswer = new Map<string, number>();
const hourAuditExamples: string[] = [];
let statementGames = 0;
let linkedEpisodeGames = 0;
let storyFloorFailures = 0;
let spineOverlapFailures = 0;
let hourAuditFailures = 0;
let featuredThief = 0;
let expectedFeaturedThief = 0;
let clearedMotiveGames = 0;
let wideButlerListFailures = 0;
let answerThreadAppearances = 0;
let expectedAnswerThreadAppearances = 0;
let fogThreads = 0;
let fogAtAnswerHour = 0;
let thiefWitnessSpeakers = 0;
let briefLanguageFailures = 0;
const briefLanguageExamples: string[] = [];
const missingStatementExamples: string[] = [];
let questionedAttentionGames = 0;
let multiSuspectQuestionedGames = 0;
let loneQuestionedAttentionGames = 0;
let answerInQuestionedField = 0;
let expectedAnswerInQuestionedField = 0;
let personCenteredButlerTotal = 0;
let distinctButlerSuspectTotal = 0;
const personCenteredButlerHist = new Map<number, number>();
const distinctButlerSuspectHist = new Map<number, number>();
const loneQuestionedExamples: string[] = [];
const answerQuestionedExamples: string[] = [];
const questionedKindCounts = new Map<string, number>();
const answerQuestionedKindCounts = new Map<string, number>();
let propDominanceGames = 0;
let selectedPropVarietyTotal = 0;
const maxSelectedPropUseHist = new Map<number, number>();
const propDominanceExamples: string[] = [];

for (let offset = 0; offset < (aiOnly ? 0 : seedCount); offset += 1) {
  const seed = deterministicSeedStart + offset;
  const answer = randomAnswer(seed);
  let world: WorldState | null = null;
  let facts: Fact[] = [];
  let schedule: Schedule | null = null;
  let usedAttempt = 0;
  for (let attempt = 1; attempt <= MAX_WORLD_ATTEMPTS && !schedule; attempt += 1) {
    const candidateWorld = simulateWorld({
      seed,
      attempt,
      answer,
      occasionFamily: OCCASION_FAMILIES[(seed - 1) % OCCASION_FAMILIES.length],
    });
    const candidateFacts = harvestFacts(candidateWorld);
    const candidateSchedule = scheduleMystery({
      facts: candidateFacts,
      answer,
      seed: seed * 31 + attempt,
      featuredSuspectIds: candidateWorld.featuredCast.map((entry) => entry.suspectId),
      recentCluePatternSignatures: recentPatterns,
    });
    if (candidateSchedule) {
      world = candidateWorld;
      facts = candidateFacts;
      schedule = candidateSchedule;
      usedAttempt = attempt;
    }
  }
  if (!world || !schedule) {
    failures.push(seed);
    continue;
  }

  bump(worldAttemptsHist, usedAttempt);
  bump(recipeCounts, schedule.storyRecipe);
  bump(finals.suspects, schedule.finalCounts.suspects);
  bump(finals.items, schedule.finalCounts.items);
  bump(finals.locations, schedule.finalCounts.locations);
  bump(finals.times, schedule.finalCounts.times);
  recentPatterns.unshift(schedule.structuralPatternSignature);
  recentPatterns.splice(5);

  const selected = selectedFacts(schedule, facts);
  const factById = new Map(facts.map((fact) => [fact.id, fact]));
  for (const thread of world.threads) {
    if (thread.suspectIds.includes(answer.suspectId)) answerThreadAppearances += 1;
    const answerUnavailable =
      thread.kind !== "foggy_memory" &&
      thread.timeId === answer.timeId;
    expectedAnswerThreadAppearances += answerUnavailable ? 0 : thread.suspectIds.length / SUSPECTS.length;
    if (thread.kind === "foggy_memory") {
      fogThreads += 1;
      if (thread.timeId === answer.timeId) fogAtAnswerHour += 1;
    }
  }
  for (const fact of facts) {
    const problems = briefLanguageProblems(fact);
    if (problems.length === 0) continue;
    briefLanguageFailures += 1;
    if (briefLanguageExamples.length < 8) {
      briefLanguageExamples.push(`${seed}/${fact.kind}/${problems.join("+")}: ${fact.writerBrief}`);
    }
  }
  if (inspectSeed === seed && evalOutputDir) {
    mkdirSync(evalOutputDir, { recursive: true });
    const precedingClueByEpisode = new Map<string, number>();
    const reveals = schedule.reveals.map((reveal) => {
      const fact = factById.get(reveal.factId)!;
      const precedingClue = fact.episodeId ? precedingClueByEpisode.get(fact.episodeId) : undefined;
      const firstButlerFragment = reveal.slot === "clue" && Boolean(fact.episodeId) && !precedingClue;
      const renderedBrief = firstButlerFragment && fact.sceneTexture
        ? `${fact.writerBrief} Additional truth within that same scene: ${fact.sceneTexture}`
        : fact.writerBrief;
      if (reveal.slot === "clue" && fact.episodeId && reveal.clueNumber) {
        precedingClueByEpisode.set(fact.episodeId, reveal.clueNumber);
      }
      return {
        ...reveal,
        kind: fact.kind,
        episodeId: fact.episodeId ?? null,
        episodeRole: fact.episodeRole ?? null,
        sceneEvidenceMode: fact.sceneEvidenceMode ?? null,
        continuesClueNumber: precedingClue ?? null,
        brief: renderedBrief,
        allowedNames: [
          ...fact.mentions.suspects,
          ...fact.mentions.items,
          ...fact.mentions.locations,
          ...fact.mentions.times,
        ],
      };
    });
    const inspection = {
      seed,
      answer: {
        suspect: requireSuspect(answer.suspectId).displayName,
        item: requireItem(answer.itemId).nameUS,
        location: requireLocation(answer.locationId).name,
        time: requireTime(answer.timeId).name,
      },
      occasion: world.occasionSpine,
      featuredCast: world.featuredCast,
      episodes: world.episodes,
      storyRecipe: schedule.storyRecipe,
      finalCandidates: schedule.finalCandidates,
      reveals,
    };
    const outputPath = `${evalOutputDir}/deterministic-eval-${seed}.json`;
    writeFileSync(outputPath, JSON.stringify(inspection, null, 2));
    console.log(`saved deterministic inspection: ${outputPath}`);
  }
  const narrativeButlerCount = schedule.reveals
    .filter((reveal) => reveal.slot === "clue")
    .map((reveal) => factById.get(reveal.factId)!)
    .filter(isNarrativeFact).length;
  const butlerFacts = schedule.reveals
    .filter((reveal) => reveal.slot === "clue")
    .map((reveal) => factById.get(reveal.factId)!);
  const personCentered = butlerFacts.filter((fact) => fact.suspectIds.length > 0 && fact.suspectIds.length <= 5);
  const coveredSuspects = new Set(personCentered.flatMap((fact) => fact.suspectIds));
  personCenteredButlerTotal += personCentered.length;
  distinctButlerSuspectTotal += coveredSuspects.size;
  bump(personCenteredButlerHist, personCentered.length);
  bump(distinctButlerSuspectHist, coveredSuspects.size);

  const questionedFacts = butlerFacts.filter((fact) => questionedAttentionSuspectIds(fact).length > 0);
  const questionedPeople = new Set(questionedFacts.flatMap(questionedAttentionSuspectIds));
  for (const fact of questionedFacts) {
    bump(questionedKindCounts, fact.kind);
    if (questionedAttentionSuspectIds(fact).includes(answer.suspectId)) bump(answerQuestionedKindCounts, fact.kind);
  }
  if (questionedPeople.size > 0) {
    questionedAttentionGames += 1;
    expectedAnswerInQuestionedField += questionedPeople.size / SUSPECTS.length;
    if (questionedPeople.has(answer.suspectId)) {
      answerInQuestionedField += 1;
      if (answerQuestionedExamples.length < 8) {
        const matchingFacts = questionedFacts.filter((fact) =>
          questionedAttentionSuspectIds(fact).includes(answer.suspectId)
        );
        answerQuestionedExamples.push(
          `${seed}:${requireSuspect(answer.suspectId).displayName} ` +
          `[${matchingFacts.map((fact) => `${fact.kind}/${fact.id}`).join(", ")}]`
        );
      }
    }
    if (questionedPeople.size >= 2) multiSuspectQuestionedGames += 1;
    else {
      loneQuestionedAttentionGames += 1;
      if (loneQuestionedExamples.length < 8) {
        loneQuestionedExamples.push(`${seed}:${[...questionedPeople].map((id) => requireSuspect(id).displayName).join("+")} [${questionedFacts.map((fact) => `${fact.kind}/${fact.id}`).join(", ")}]`);
      }
    }
  }

  const seenEpisodeTexture = new Set<string>();
  const selectedButlerText = schedule.reveals
    .filter((reveal) => reveal.slot === "clue")
    .map((reveal) => {
      const fact = factById.get(reveal.factId)!;
      const firstEpisodeUse = fact.episodeId && !seenEpisodeTexture.has(fact.episodeId);
      if (fact.episodeId) seenEpisodeTexture.add(fact.episodeId);
      return `${fact.writerBrief}${firstEpisodeUse && fact.sceneTexture ? ` ${fact.sceneTexture}` : ""}`;
    })
    .join("\n");
  const selectedPropCounts = world.occasionSpine.setDressing
    .map((prop) => ({ prop, count: phraseOccurrences(selectedButlerText, prop) }))
    .filter((entry) => entry.count > 0);
  const maxSelectedPropUse = Math.max(0, ...selectedPropCounts.map((entry) => entry.count));
  selectedPropVarietyTotal += selectedPropCounts.length;
  bump(maxSelectedPropUseHist, maxSelectedPropUse);
  if (maxSelectedPropUse > 2) {
    propDominanceGames += 1;
    if (propDominanceExamples.length < 8) {
      propDominanceExamples.push(`${seed}:${selectedPropCounts.map(({ prop, count }) => `${prop}=${count}`).join(",")}`);
    }
  }
  if (schedule.skeletonFactIds.length < 3 || narrativeButlerCount < 5) storyFloorFailures += 1;
  if (schedule.reveals
    .filter((reveal) => reveal.slot === "clue")
    .map((reveal) => factById.get(reveal.factId)!)
    .some((fact) => ["item_intact", "items_secured"].includes(fact.kind) && fact.itemIds.length > 2)
  ) wideButlerListFailures += 1;
  if (selected.some((fact) => fact.kind === "claim" || fact.kind === "witness_account")) {
    statementGames += 1;
    bump(statementByRecipe, schedule.storyRecipe);
  } else if (missingStatementExamples.length < 8) {
    const skeletonSet = new Set(schedule.skeletonFactIds);
    missingStatementExamples.push(`${seed}:${schedule.storyRecipe} [${selected.filter((fact) => skeletonSet.has(fact.id)).map((fact) => `${fact.kind}/${fact.episodeRole ?? fact.threadId ?? "plain"}`).join(", ")}]`);
  }
  const episodeCounts = new Map<string, number>();
  for (const fact of selected) {
    if (fact.episodeId) bump(episodeCounts, fact.episodeId);
    if (fact.witnessVariant) bump(witnessVariants, fact.witnessVariant);
    if (fact.kind === "witness_account" && fact.suspectIds.includes(answer.suspectId)) thiefWitnessSpeakers += 1;
    if (["claim", "witness_account", "excuse_given"].includes(fact.kind)) textureKinds.add(fact.kind);
    if (fact.threadId === "FOG" || fact.threadId === "MOTIVE") textureKinds.add(fact.threadId);
  }
  if ([...episodeCounts.values()].some((count) => count >= 2)) linkedEpisodeGames += 1;

  const survivingSuspects = new Set(schedule.finalCandidates.suspects);
  if (selected.some((fact) =>
    fact.threadId === "MOTIVE" && fact.suspectIds.some((id) => !survivingSuspects.has(requireSuspect(id).displayName))
  )) clearedMotiveGames += 1;

  if (world.featuredCast.some((entry) => entry.suspectId === answer.suspectId)) featuredThief += 1;
  expectedFeaturedThief += world.featuredCast.length / SUSPECTS.length;

  const terms = spineTerms(world);
  const overlap = selected.filter((fact) => terms.some((term) => fact.writerBrief.toLowerCase().includes(term))).length;
  if (overlap < 3) spineOverlapFailures += 1;

  const answerHour = requireTime(answer.timeId).name;
  const leakingHourFact = selected.find((fact) =>
    containsCardName(fact.writerBrief, answerHour) && !fact.mentions.times.some((name) => name.toLowerCase() === answerHour.toLowerCase())
  );
  if (leakingHourFact) {
    hourAuditFailures += 1;
    bump(hourAuditByAnswer, answerHour);
    if (hourAuditExamples.length < 5) hourAuditExamples.push(`${seed}/${answerHour}/${leakingHourFact.kind}: ${leakingHourFact.writerBrief}`);
  }

  const cp6 = Math.min(...Object.values(schedule.trajectory[5].counts));
  const cp9 = Math.min(...Object.values(schedule.trajectory[8].counts));
  if (cp6 < 4 || cp9 < 3 ||
      schedule.finalCounts.locations > locationsMaxFor(answer) ||
      schedule.finalCounts.times > timesMaxFor(answer)) {
    failures.push(seed);
  }
}

if (!aiOnly) {
const ok = seedCount - new Set(failures).size;
const maxRecipeShare = Math.max(0, ...recipeCounts.values()) / Math.max(1, ok);
console.log(`success: ${ok}/${seedCount} (${((ok / seedCount) * 100).toFixed(1)}%) | ${((Date.now() - started) / seedCount).toFixed(1)} ms/mystery`);
console.log(`world attempts: ${show(worldAttemptsHist)}`);
console.log(`recipes: ${[...recipeCounts.entries()].map(([key, value]) => `${key}:${value}`).join(" ")}`);
console.log(`statement games by recipe: ${[...statementByRecipe.entries()].map(([key, value]) => `${key}:${value}`).join(" ")}`);
if (missingStatementExamples.length > 0) console.log(`missing-statement examples: ${missingStatementExamples.join(" | ")}`);
console.log(`statement-shaped games: ${statementGames}/${ok} (${((statementGames / Math.max(1, ok)) * 100).toFixed(1)}%)`);
console.log(`multi-fragment episode games: ${linkedEpisodeGames}/${ok} (${((linkedEpisodeGames / Math.max(1, ok)) * 100).toFixed(1)}%)`);
console.log(`person-centered Butler clues: mean ${(personCenteredButlerTotal / Math.max(1, ok)).toFixed(1)}/10; histogram ${show(personCenteredButlerHist)}`);
console.log(`distinct named suspects in Butler clues: mean ${(distinctButlerSuspectTotal / Math.max(1, ok)).toFixed(1)}/10; histogram ${show(distinctButlerSuspectHist)}`);
console.log(`questioned-attention games: ${questionedAttentionGames}/${ok}; 2+ different suspects: ${multiSuspectQuestionedGames}/${questionedAttentionGames}; lone suspect: ${loneQuestionedAttentionGames}`);
console.log(`answer in questioned-attention field: ${answerInQuestionedField}; answer-blind expectation: ${expectedAnswerInQuestionedField.toFixed(1)}`);
console.log(`questioned fact kinds: ${[...questionedKindCounts.entries()].map(([kind, count]) => `${kind}:${count}`).join(" ") || "none"}; answer matches: ${[...answerQuestionedKindCounts.entries()].map(([kind, count]) => `${kind}:${count}`).join(" ") || "none"}`);
if (answerQuestionedExamples.length > 0) console.log(`answer-questioned examples: ${answerQuestionedExamples.join(" | ")}`);
if (loneQuestionedExamples.length > 0) console.log(`lone-questioned examples: ${loneQuestionedExamples.join(" | ")}`);
console.log(`selected set-dressing variety: mean ${(selectedPropVarietyTotal / Math.max(1, ok)).toFixed(1)} props; max-use histogram ${show(maxSelectedPropUseHist)}; >2-use games: ${propDominanceGames}`);
if (propDominanceExamples.length > 0) console.log(`prop-dominance examples: ${propDominanceExamples.join(" | ")}`);
console.log(`witness variants dealt: ${[...witnessVariants.entries()].map(([key, value]) => `${key}:${value}`).join(" ") || "none"}`);
console.log(`thief as witness speaker: ${thiefWitnessSpeakers}/${[...witnessVariants.values()].reduce((sum, count) => sum + count, 0)}`);
console.log(`featured thief: ${featuredThief}; answer-blind expectation: ${expectedFeaturedThief.toFixed(1)}`);
console.log(`answer in suspicious side threads: ${answerThreadAppearances}; answer-blind expectation: ${expectedAnswerThreadAppearances.toFixed(1)}`);
console.log(`fog at answer hour: ${fogAtAnswerHour}/${fogThreads} (${((fogAtAnswerHour / Math.max(1, fogThreads)) * 100).toFixed(1)}%)`);
console.log(`cleared-with-motive games: ${clearedMotiveGames}`);
console.log(`texture kinds seen: ${[...textureKinds].sort().join(", ")}`);
console.log(`story-floor failures: ${storyFloorFailures}; spine-overlap failures: ${spineOverlapFailures}; houraudit failures: ${hourAuditFailures}`);
console.log(`wide Butler inventory failures: ${wideButlerListFailures}; malformed deterministic briefs: ${briefLanguageFailures}`);
if (briefLanguageExamples.length > 0) console.log(`brief-language examples: ${briefLanguageExamples.join(" | ")}`);
if (hourAuditFailures > 0) console.log(`houraudit by answer: ${[...hourAuditByAnswer.entries()].map(([key, value]) => `${key}:${value}`).join(" ")}`);
if (hourAuditExamples.length > 0) console.log(`houraudit examples: ${hourAuditExamples.join(" | ")}`);
console.log(`final suspects: ${show(finals.suspects)}`);
console.log(`final items: ${show(finals.items)}`);
console.log(`final locations: ${show(finals.locations)}`);
console.log(`final times: ${show(finals.times)}`);

const expectedTextures = ["claim", "witness_account", "excuse_given", "FOG", "MOTIVE"];
const witnessTotal = [...witnessVariants.values()].reduce((sum, count) => sum + count, 0);
const fabricatedWitnesses = (witnessVariants.get("fabricated_innocent_witness") ?? 0) +
  (witnessVariants.get("fabricated_thief_witness") ?? 0);
const perSeedGateFailed = failures.length > 0 || storyFloorFailures > 0 || spineOverlapFailures > 0 ||
  hourAuditFailures > 0 || wideButlerListFailures > 0 || briefLanguageFailures > 0;
// Recipe balance, anti-meta symmetry, and texture/variant coverage are
// population properties. A one-seed inspection cannot meaningfully pass or
// fail them, so reserve those release gates for a substantial sweep.
const populationGateEnabled = seedCount >= 80;
const populationGateFailed = maxRecipeShare > 0.4 || statementGames / Math.max(1, ok) < 0.8 ||
  linkedEpisodeGames / Math.max(1, ok) < 0.6 || expectedTextures.some((kind) => !textureKinds.has(kind)) ||
  Math.abs(featuredThief - expectedFeaturedThief) > seedCount * 0.12 || clearedMotiveGames === 0 ||
  Math.abs(answerThreadAppearances - expectedAnswerThreadAppearances) > seedCount * 0.12 ||
  fogAtAnswerHour / Math.max(1, fogThreads) > 0.22 ||
  witnessVariants.size < 4 || fabricatedWitnesses / Math.max(1, witnessTotal) < 0.3 ||
  fabricatedWitnesses / Math.max(1, witnessTotal) > 0.42 || thiefWitnessSpeakers / Math.max(1, witnessTotal) < 0.25 ||
  thiefWitnessSpeakers / Math.max(1, witnessTotal) > 0.38;
const deterministicGateFailed = perSeedGateFailed || (populationGateEnabled && populationGateFailed);
if (deterministicGateFailed) {
  console.error(`DETERMINISTIC ACCEPTANCE FAILED${failures.length > 0 ? ` (seeds: ${[...new Set(failures)].join(", ")})` : ""}`);
  process.exitCode = 1;
} else if (!populationGateEnabled) {
  console.log("DETERMINISTIC PER-SEED CHECK PASSED (population distribution gates require at least 80 seeds)");
} else {
  console.log("DETERMINISTIC ACCEPTANCE PASSED");
}

const corpusClueWords = ORIGINAL_MYSTERIES.flatMap((mystery) => mystery.butlerClues).map((clue) => clue.split(/\s+/).length);
console.log(`\ncorpus clue length: mean ${mean(corpusClueWords).toFixed(1)} words (min ${Math.min(...corpusClueWords)}, max ${Math.max(...corpusClueWords)})`);
}

if (aiCount > 0) {
  const varsSource = readFileSync(
    process.env.CLUE_DVD_VARS_PATH ?? new URL("../.dev.vars", import.meta.url),
    "utf8"
  );
  const providerConfig = resolveEvalProviderConfig(
    parseEvalProviderVars(varsSource),
    aiModelOverride
  );
  console.log(`\n=== Full AI generations: ${aiCount} seeds ===`);
  console.log(`configured model: ${providerConfig.configuredModel}`);
  console.log(`initial transport: ${providerConfig.initialTransport}`);
  if (evalOutputDir) mkdirSync(evalOutputDir, { recursive: true });
  const mysterySignatures: string[] = [];
  const cluePatterns: string[] = [];
  for (let index = 0; index < aiCount; index += 1) {
    const seed = aiSeedBase + index * 1_013;
    const answer = randomAnswer(seed);
    const setup = { seed, themeId: "AI01" as const, difficulty: "expert" as const, solution: answer };
    const aiStarted = Date.now();
    try {
      const result = await generateMysteryV2(providerConfig.runtime, {
        setup,
        recentSignatures: mysterySignatures,
        recentCluePatternSignatures: cluePatterns,
      });
      const debug = getLastMysteryEngineDebug()!;
      if (evalOutputDir) {
        const outputPath = `${evalOutputDir}/ai-eval-${seed}.json`;
        writeFileSync(outputPath, JSON.stringify({ seed, setup, result, debug }, null, 2));
        console.log(`saved diagnostic: ${outputPath}`);
      }
      mysterySignatures.unshift(result.mysterySignature);
      cluePatterns.unshift(result.cluePatternSignature);
      const clueWords = result.butlerClues.map((clue) => clue.split(/\s+/).length);
      const factById = new Map((debug.facts ?? []).map((fact) => [fact.id, fact]));
      const butlerFacts = (debug.schedule?.reveals ?? [])
        .filter((reveal) => reveal.slot === "clue")
        .map((reveal) => factById.get(reveal.factId))
        .filter((fact): fact is Fact => Boolean(fact));
      const narrativeButler = butlerFacts.filter(isNarrativeFact).length;
      const kindCounts = new Map<string, number>();
      for (const fact of butlerFacts) bump(kindCounts, fact.kind);
      const questionedPeople = [...new Set(butlerFacts.flatMap(questionedAttentionSuspectIds))];
      const publicText = [
        result.opening,
        ...result.butlerClues,
        ...result.inspectorNotes.map((note) => note.text),
      ].join("\n");
      const propCounts = (debug.world?.occasionSpine.setDressing ?? [])
        .map((prop) => ({ prop, count: phraseOccurrences(publicText, prop) }))
        .filter((entry) => entry.count > 0);
      const contextCounts = debug.world?.occasionTexture
        ? [...debug.world.occasionTexture.inspectionContexts, ...debug.world.occasionTexture.observationContexts]
          .map((context) => ({ context, count: phraseOccurrences(publicText, context) }))
          .filter((entry) => entry.count > 0)
        : [];
      console.log(`\n--- seed ${seed} (${((Date.now() - aiStarted) / 1000).toFixed(1)}s) ---`);
      console.log(`answer: ${JSON.stringify(answer)} worldAttempts: ${debug.schedule?.worldAttempts}`);
      console.log(`provider stages: ${([
        ["dossier", debug.dossier],
        ["render", debug.render],
        ["closing", debug.closing],
      ] as const).map(([stage, provider]) => {
        return `${stage}=${provider?.model ?? "unknown"}/${provider?.transport ?? "unknown"}`;
      }).join(" ")}`);
      console.log(`repairs: ${debug.repairs?.length ?? 0} unresolved: ${debug.unresolvedProblems?.length ?? 0}`);
      console.log(`clue length mean: ${mean(clueWords).toFixed(1)} words`);
      console.log(`narrative Butler clues: ${narrativeButler}/10; kinds: ${[...kindCounts.entries()].map(([kind, count]) => `${kind}:${count}`).join(" ")}`);
      console.log(`questioned suspects: ${questionedPeople.length > 0 ? questionedPeople.map((id) => requireSuspect(id).displayName).join(", ") : "none"}`);
      console.log(`occasion prop use: ${propCounts.map(({ prop, count }) => `${prop}:${count}`).join(" ") || "none"}`);
      console.log(`exact dossier-context use: ${contextCounts.map(({ context, count }) => `\"${context}\":${count}`).join(" | ") || "none"}`);
      console.log(`mystery signature: ${result.mysterySignature}`);
      console.log(`clue pattern: ${result.cluePatternSignature}`);
      console.log(`opening: ${result.opening}`);
      result.butlerClues.forEach((clue, clueIndex) => console.log(`  C${clueIndex + 1}: ${clue}`));
      console.log(`  N1: ${result.inspectorNotes[0].text}`);
      console.log(`  N2: ${result.inspectorNotes[1].text}`);
      console.log(`closing: ${result.closing}`);
    } catch (error) {
      if (evalOutputDir) {
        const outputPath = `${evalOutputDir}/ai-eval-${seed}-failed.json`;
        writeFileSync(outputPath, JSON.stringify({ seed, setup, error: error instanceof Error ? error.message : error, debug: getLastMysteryEngineDebug() }, null, 2));
        console.error(`saved failed diagnostic: ${outputPath}`);
      }
      console.error(`seed ${seed} FAILED:`, error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  }
}
