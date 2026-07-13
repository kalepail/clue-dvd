/**
 * AI Mystery Engine V3 — "world-first"
 *
 * Pipeline (deterministic → AI → deterministic):
 *
 *   1. simulateWorld     seeded ground-truth day; theft embedded as one
 *                        thread among many (world-sim.ts)
 *   2. harvestFacts      every tellable TRUE fact, with joint-cell semantics
 *                        and mention licenses (fact-harvest.ts)
 *   3. scheduleMystery   story-first selector reserves a connected scene
 *                        skeleton, then proves the fair-play curve around it
 *                        (clue-scheduler.ts) — retries are pure computation
 *   4. dossier (AI)      answer-blind: occasion, title, signature
 *   5. render (AI)       answer-blind: opening + 10 testimonies + 2 notes in
 *                        Ashe's voice, few-shot on the original DVD corpus
 *   6. closing (AI)      the ONLY answer-aware prose, grounded in the
 *                        revealed facts
 *   7. verify + repair   deterministic card-name discipline; failures
 *                        re-render ONE clue, never the whole mystery
 *
 * The prose model never sees the answer, candidate counts, or elimination
 * data, so it cannot telegraph the solution. The puzzle's fairness was
 * proven before any prose existed and cannot be broken by the prose.
 */

import { applyOccasionTexture, requireItem, requireLocation, requireSuspect, requireTime, simulateWorld, type WorldState } from "./world-sim";
import { harvestFacts, type Fact } from "./fact-harvest";
import { scheduleMystery, type Schedule } from "./clue-scheduler";
import {
  buildClosingPrompt,
  buildClueRepairPrompt,
  buildDossierPrompt,
  buildRenderPrompt,
  pickFewshots,
  type StorySeed,
} from "../data/ai-v3-prompts";
import { instantiateOccasionSpine, OCCASION_FAMILIES, type OccasionSpine } from "../data/occasion-catalog";
import {
  ClosingSchema,
  ClueRepairSchema,
  DossierSchema,
  RenderedMysterySchema,
  toToolInputSchema,
  type Answer,
  type Closing,
  type Dossier,
  type RenderedMystery,
} from "./ai-mystery-schemas";
import { verifyClosing, verifyClueOpeningVariety, verifyClueText, verifyOpening, type TextVerification } from "./clue-verifier";
import {
  callStructured,
  MysteryStageError,
  type MysteryProviderRuntime,
  type StructuredCallResult,
} from "./ai-mystery-provider";
import type { MysterySetup } from "./ai-mystery-setup";
import { SeededRandom } from "./seeded-random";
import { SUSPECTS } from "../data/game-elements";

export const ENGINE_VERSION = "3.1-scene";
const MAX_WORLD_ATTEMPTS = 240;
const MAX_REPAIRS_PER_TEXT = 4;

export type MysteryProgressStage =
  | "occasion"
  | "relationships"
  | "timeline"
  | "rendering"
  | "inspector"
  | "audit"
  | "revision"
  | "complete";

export type MysteryProgressEvent = {
  stage: MysteryProgressStage;
  message: string;
  progress: number;
  elapsedMs: number;
};

export type MysteryEngineResult = {
  opening: string;
  butlerClues: string[];
  inspectorNotes: Array<{ id: "N1" | "N2"; text: string; relatedClues: number[] }>;
  closing: string;
  mysterySignature: string;
  cluePatternSignature: string;
};

type StageDebug<T> = {
  system: string;
  prompt: string;
  rawResponse: string;
  parsed: T;
  durationMs: number;
  usage?: { inputTokens?: number; outputTokens?: number };
  stopReason?: string;
  strictSchema?: boolean;
  model?: string;
  transport?: StructuredCallResult<T>["transport"];
};

export type MysteryEngineDebug = {
  engineVersion: typeof ENGINE_VERSION;
  startedAt: string;
  setup: {
    seed: number;
    answer: Answer;
    occasionFamily: string;
    occasionSpine: OccasionSpine;
    recentSignatures: string[];
    recentCluePatternSignatures: string[];
  };
  world?: WorldState;
  facts?: Fact[];
  schedule?: Schedule & { worldAttempts: number };
  storySeeds?: StorySeed[];
  dossier?: StageDebug<Dossier>;
  render?: StageDebug<RenderedMystery>;
  closing?: StageDebug<Closing>;
  verification?: TextVerification[];
  repairs?: Array<{ target: string; attempt: number; problems: string[]; before: string; after: string }>;
  unresolvedProblems?: TextVerification[];
  finalPackage?: MysteryEngineResult;
  failure?: { stage: string; message: string; status?: number; rawResponse?: string };
};

type StructuredCaller = typeof callStructured;

let lastMysteryEngineDebug: MysteryEngineDebug | null = null;

export function getLastMysteryEngineDebug(): MysteryEngineDebug | null {
  return lastMysteryEngineDebug;
}

export async function generateMysteryV2(providerSource: string | MysteryProviderRuntime, params: {
  setup: MysterySetup;
  recentSignatures?: string[];
  recentCluePatternSignatures?: string[];
  onProgress?: (event: MysteryProgressEvent) => void | Promise<void>;
  provider?: StructuredCaller;
}): Promise<MysteryEngineResult> {
  const startedAt = Date.now();
  const provider = params.provider ?? callStructured;
  const providerCredentials = typeof providerSource === "string"
    ? { apiKey: providerSource }
    : { runtime: providerSource };
  const answer: Answer = { ...params.setup.solution };
  const recentSignatures = (params.recentSignatures ?? []).filter(Boolean).slice(0, 5);
  const recentCluePatternSignatures = (params.recentCluePatternSignatures ?? []).filter(Boolean).slice(0, 5);
  const occasionFamily = chooseOccasionFamily(params.setup.seed, recentSignatures);
  const occasionSpine = instantiateOccasionSpine(occasionFamily, params.setup.seed);
  const debug: MysteryEngineDebug = {
    engineVersion: ENGINE_VERSION,
    startedAt: new Date(startedAt).toISOString(),
    setup: { seed: params.setup.seed, answer, occasionFamily, occasionSpine, recentSignatures, recentCluePatternSignatures },
  };
  lastMysteryEngineDebug = debug;

  const emit = async (stage: MysteryProgressStage, message: string, progress: number) => {
    await params.onProgress?.({ stage, message, progress, elapsedMs: Date.now() - startedAt });
  };

  try {
    // ---- Deterministic phase: world → facts → proven schedule ------------
    await emit("occasion", "Reconstructing the day at Tudor Mansion.", 6);
    let world: WorldState | null = null;
    let facts: Fact[] = [];
    let schedule: Schedule | null = null;
    let worldAttempts = 0;
    for (let attempt = 1; attempt <= MAX_WORLD_ATTEMPTS && !schedule; attempt += 1) {
      worldAttempts = attempt;
      const candidateWorld = simulateWorld({ seed: params.setup.seed, attempt, answer, occasionFamily, occasionSpine });
      const candidateFacts = harvestFacts(candidateWorld);
      const candidateSchedule = scheduleMystery({
        facts: candidateFacts,
        answer,
        seed: params.setup.seed * 31 + attempt,
        featuredSuspectIds: candidateWorld.featuredCast.map((entry) => entry.suspectId),
        recentCluePatternSignatures,
      });
      if (candidateSchedule) {
        world = candidateWorld;
        facts = candidateFacts;
        schedule = candidateSchedule;
      }
    }
    if (!world || !schedule) {
      throw new MysteryStageError(
        "architect",
        `No fair-play schedule found after ${MAX_WORLD_ATTEMPTS} simulated days. This should be nearly impossible — please report the seed (${params.setup.seed}).`
      );
    }
    debug.world = world;
    debug.facts = facts;
    debug.schedule = { ...schedule, worldAttempts };

    await emit("timeline", "Fair-play schedule proven against 12,100 possibilities.", 18);

    // ---- AI phase (answer-blind until the closing) ------------------------
    const fewshotRng = new SeededRandom(params.setup.seed ^ 0x2c1b3c6d);
    const fewshots = pickFewshots(fewshotRng);

    await emit("relationships", "Inventing the occasion and its tensions.", 30);
    const dossierPrompt = buildDossierPrompt({
      occasionFamily,
      occasionSpine,
      recentSignatures,
      cast: worldCast(),
      colorNotes: worldColorNotes(world),
    });
    const dossier = await provider({
      ...providerCredentials,
      stage: "architect",
      ...dossierPrompt,
      toolName: "submit_case_dossier",
      toolDescription: "Submit the occasion dossier for a new Tudor Mansion case.",
      inputSchema: toToolInputSchema(DossierSchema),
      outputSchema: DossierSchema,
      maxTokens: 1_400,
    });
    debug.dossier = toStageDebug(dossierPrompt, dossier);

    // The authored occasion spine was already true before simulation. The
    // answer-blind dossier contributes cosmetic vocabulary for room/item
    // observations only; it cannot rewrite movements, activities, or excuses.
    applyOccasionTexture(world, dossier.value.occasionTexture);
    facts = harvestFacts(world);
    const factById = new Map(facts.map((fact) => [fact.id, fact]));
    const missingFact = schedule.reveals.find((reveal) => !factById.has(reveal.factId));
    if (missingFact) {
      throw new MysteryStageError(
        "architect",
        `Occasion texture changed deterministic fact identity ${missingFact.factId}; this is a world-layer bug.`
      );
    }
    const precedingClueByEpisode = new Map<string, { clueNumber: number; brief: string }>();
    const seenSceneTextures = new Set<string>();
    const occasionContexts = createOccasionContextBalancer(world, dossier.value.occasionSummary);
    const scopedPresenceKinds = new Set<Fact["kind"]>([
      "gathering",
      "retired_gathering",
      "group_presence",
      "solo_presence",
      "scene_continuation",
      "scene_evidence",
    ]);
    const locksContinuousPresence = (fact: Fact): boolean => {
      if (["gathering", "retired_gathering", "scene_continuation"].includes(fact.kind)) return true;
      if (fact.kind === "group_presence") return !fact.suspectTimePairs;
      if (fact.kind === "scene_evidence") {
        return fact.components?.some((component) => locksContinuousPresence(component)) ?? false;
      }
      return false;
    };
    const storySeeds: StorySeed[] = schedule.reveals.map((reveal) => {
      const fact = factById.get(reveal.factId)!;
      const preceding = fact.episodeId ? precedingClueByEpisode.get(fact.episodeId) : undefined;
      const firstButlerFragment = reveal.slot === "clue" && Boolean(fact.episodeId) && !preceding;
      const appliedSceneTexture = firstButlerFragment ? fact.sceneTexture : undefined;
      const recurringSceneTexture = Boolean(appliedSceneTexture && seenSceneTextures.has(appliedSceneTexture));
      if (appliedSceneTexture) {
        seenSceneTextures.add(appliedSceneTexture);
        occasionContexts.record(appliedSceneTexture);
      }
      const balancedBrief = occasionContexts.balance(fact.writerBrief);
      const locationTypes = new Set(fact.locationIds.map((locationId) => requireLocation(locationId).type));
      const storySeed: StorySeed = {
        position: reveal.position,
        deliverAs: reveal.slot === "clue" ? "butler" : reveal.slot,
        clueNumber: reveal.clueNumber,
        brief: appliedSceneTexture
          ? recurringSceneTexture
            ? `${balancedBrief} Recurring character thread (preserve the same underlying truth, but describe it from a fresh observational angle without copying its wording from another testimony): ${appliedSceneTexture}`
            : `${balancedBrief} Additional truth within that same scene: ${appliedSceneTexture}`
          : balancedBrief,
        allowedNames: [
          ...fact.mentions.suspects,
          ...fact.mentions.items,
          ...fact.mentions.locations,
          ...fact.mentions.times,
        ],
        episodeId: fact.episodeId,
        episodeRole: fact.episodeRole,
        continuesClueNumber: reveal.slot === "clue" ? preceding?.clueNumber : undefined,
        scopeMode: scopedPresenceKinds.has(fact.kind) && fact.suspectIds.length > 0
          ? fact.suspectIds.length === SUSPECTS.length ? "whole_household" : "named_only"
          : undefined,
        mustRemainPresent: locksContinuousPresence(fact) || undefined,
        locationSetting: locationTypes.size === 1 ? [...locationTypes][0] : locationTypes.size > 1 ? "mixed" : undefined,
        questionedNames: fact.questionedSuspectIds?.map((suspectId) => requireSuspect(suspectId).displayName),
        continuationNames: fact.questionedSuspectIds?.length && fact.continuousSuspectIds?.length
          ? fact.continuousSuspectIds.map((suspectId) => requireSuspect(suspectId).displayName)
          : undefined,
      };
      if (reveal.slot === "clue" && fact.episodeId && reveal.clueNumber) {
        precedingClueByEpisode.set(fact.episodeId, { clueNumber: reveal.clueNumber, brief: fact.writerBrief });
      }
      return storySeed;
    });
    debug.world = world;
    debug.facts = facts;
    debug.storySeeds = storySeeds;

    await emit("rendering", "Ashe is recalling the day, one testimony at a time.", 48);
    const renderPrompt = buildRenderPrompt({ dossier: dossier.value, seeds: storySeeds, fewshots });
    const render = await provider({
      ...providerCredentials,
      stage: "renderer",
      ...renderPrompt,
      toolName: "submit_rendered_mystery",
      toolDescription: "Submit the opening, ten butler testimonies, and two Inspector notes.",
      inputSchema: toToolInputSchema(RenderedMysterySchema),
      outputSchema: RenderedMysterySchema,
      maxTokens: 5_000,
    });
    debug.render = toStageDebug(renderPrompt, render);

    await emit("inspector", "Writing the final reveal.", 70);
    const answerNames = {
      suspect: requireSuspect(answer.suspectId).displayName,
      item: requireItem(answer.itemId).nameUS,
      location: requireLocation(answer.locationId).name,
      time: requireTime(answer.timeId).name,
    };
    const thiefMotive = world.motives.find((entry) => entry.suspectId === answer.suspectId)?.motive;
    const opportunityReveal = `At ${answerNames.time}, ${answerNames.suspect} had an unwitnessed opportunity at the ${answerNames.location}.`;
    const lieClaimWasDealt = schedule.reveals.some((reveal) => {
      const fact = factById.get(reveal.factId);
      return fact?.kind === "claim" && fact.threadId === "LIE";
    });
    const lieContradictionWasDealt = schedule.reveals.some((reveal) => {
      const fact = factById.get(reveal.factId);
      return fact?.kind !== "claim" && fact?.threadId === "LIE";
    });
    const lieReveal = world.falseAlibi && lieClaimWasDealt && lieContradictionWasDealt
      ? `${answerNames.suspect} claimed to have been in the ${requireLocation(world.falseAlibi.claimedLocationId).name} at the hour in question — but the party actually in that room never saw them`
      : undefined;
    const closingPrompt = buildClosingPrompt({
      answerNames,
      dossierTitle: dossier.value.title,
      finalCandidates: schedule.finalCandidates,
      thiefMotive,
      opportunityReveal,
      lieReveal,
      fewshotClosings: fewshots.closings,
    });
    let closing = await provider({
      ...providerCredentials,
      stage: "inspector",
      ...closingPrompt,
      toolName: "submit_case_closing",
      toolDescription: "Submit the closing reveal narration.",
      inputSchema: toToolInputSchema(ClosingSchema),
      outputSchema: ClosingSchema,
      maxTokens: 550,
    });
    debug.closing = toStageDebug(closingPrompt, closing);

    // ---- Deterministic verification + surgical repair ---------------------
    await emit("audit", "Checking every line against the verified card world.", 82);
    const texts = {
      opening: render.value.opening,
      clues: [...render.value.clues],
      note1: render.value.note1,
      note2: render.value.note2,
      closing: closing.value.closing,
    };
    const repairs: NonNullable<MysteryEngineDebug["repairs"]> = [];
    debug.repairs = repairs;

    const seedFor = (target: string): StorySeed | undefined =>
      storySeeds.find((seed) =>
        seed.deliverAs === "butler" ? `clue-${seed.clueNumber}` === target : seed.deliverAs === target
      );

    const runVerification = (): TextVerification[] => {
      const results: TextVerification[] = [verifyOpening(texts.opening)];
      for (const seed of storySeeds) {
        const text =
          seed.deliverAs === "butler" ? texts.clues[(seed.clueNumber ?? 1) - 1] :
          seed.deliverAs === "note1" ? texts.note1 : texts.note2;
        results.push(verifyClueText(text, seed));
      }
      for (const openingProblem of verifyClueOpeningVariety(texts.clues)) {
        const target = results.find((entry) => entry.target === `clue-${openingProblem.clueNumber}`);
        target?.problems.push(openingProblem.problem);
      }
      results.push(verifyClosing(texts.closing, answer));
      return results;
    };

    let verification = runVerification();
    const problematic = () => verification.filter((entry) => entry.problems.length > 0);

    let anyRepaired = false;
    for (let round = 1; round <= MAX_REPAIRS_PER_TEXT && problematic().length > 0; round += 1) {
      if (!anyRepaired) await emit("revision", "Rewriting a line or two that broke card discipline.", 88);
      anyRepaired = true;
      for (const entry of problematic()) {
        if (entry.target === "closing") {
          const retryPrompt = buildClosingPrompt({
            answerNames,
            dossierTitle: dossier.value.title,
            finalCandidates: schedule.finalCandidates,
            thiefMotive,
            opportunityReveal,
            lieReveal,
            fewshotClosings: fewshots.closings,
          });
          retryPrompt.prompt += `\n\nThe previous attempt had problems: ${entry.problems.join(" ")} Fix them.`;
          closing = await provider({
            ...providerCredentials,
            stage: "inspector",
            ...retryPrompt,
            toolName: "submit_case_closing",
            toolDescription: "Submit the corrected closing reveal narration.",
            inputSchema: toToolInputSchema(ClosingSchema),
            outputSchema: ClosingSchema,
            maxTokens: 550,
          });
          repairs.push({ target: "closing", attempt: round, problems: entry.problems, before: texts.closing, after: closing.value.closing });
          texts.closing = closing.value.closing;
          continue;
        }
        if (entry.target === "opening") {
          // The opening has no fact seed; re-render it via a repair seed with
          // an empty license (no card names allowed at all).
          const openingSeed: StorySeed = {
            position: 0,
            deliverAs: "butler",
            clueNumber: null,
            brief: `${dossier.value.occasionSummary} Describe only why everyone gathered and the social mood. Do not mention a theft, anything missing, a discovery, or an investigation, and do not name any card.`,
            allowedNames: [],
          };
          const repaired = await repairText(
            provider,
            providerSource,
            openingSeed,
            texts.opening,
            entry.problems,
            fewshots.clues
          );
          repairs.push({ target: "opening", attempt: round, problems: entry.problems, before: texts.opening, after: repaired });
          texts.opening = repaired;
          continue;
        }
        const seed = seedFor(entry.target);
        if (!seed) continue;
        const current =
          seed.deliverAs === "butler" ? texts.clues[(seed.clueNumber ?? 1) - 1] :
          seed.deliverAs === "note1" ? texts.note1 : texts.note2;
        const earlierSceneText = seed.continuesClueNumber
          ? texts.clues[seed.continuesClueNumber - 1]
          : undefined;
        const repeatedPhraseOwner = entry.problems
          .map((problem) => problem.match(/(?:from|in) clue (\d+)/i)?.[1])
          .find(Boolean);
        const comparisonText = repeatedPhraseOwner
          ? texts.clues[Number.parseInt(repeatedPhraseOwner, 10) - 1]
          : undefined;
        const repaired = await repairText(
          provider,
          providerSource,
          seed,
          current,
          entry.problems,
          fewshots.clues,
          earlierSceneText,
          comparisonText
        );
        repairs.push({ target: entry.target, attempt: round, problems: entry.problems, before: current, after: repaired });
        if (seed.deliverAs === "butler") texts.clues[(seed.clueNumber ?? 1) - 1] = repaired;
        else if (seed.deliverAs === "note1") texts.note1 = repaired;
        else texts.note2 = repaired;
      }
      verification = runVerification();
    }
    debug.verification = verification;

    // A package with a known prose defect is not "case ready." Repairs are
    // surgical and inexpensive relative to a full generation; if the model
    // still refuses the verified constraints, report the failed stage rather
    // than quietly handing the player malformed or repetitive testimony.
    const unresolved = problematic();
    debug.unresolvedProblems = unresolved;
    if (unresolved.length > 0) {
      throw new MysteryStageError(
        "revision",
        `The rendered mystery still had unresolved prose problems after retries: ${unresolved.map((entry) => `${entry.target}: ${entry.problems.join(" ")}`).join(" | ")}`
      );
    }

    const result: MysteryEngineResult = {
      opening: texts.opening.trim(),
      butlerClues: texts.clues.map((clue) => clue.trim()),
      inspectorNotes: [
        { id: "N1", text: texts.note1.trim(), relatedClues: schedule.noteRelatedClues.note1 },
        { id: "N2", text: texts.note2.trim(), relatedClues: schedule.noteRelatedClues.note2 },
      ],
      closing: texts.closing.trim(),
      mysterySignature: dossier.value.mysterySignature.trim(),
      cluePatternSignature: `${schedule.structuralPatternSignature}|${openingStyleSignature(texts.clues)}`,
    };
    debug.finalPackage = result;
    await emit("complete", "Case ready.", 100);
    return result;
  } catch (error) {
    debug.failure = {
      stage: error instanceof MysteryStageError ? error.stage : "engine",
      message: error instanceof Error ? error.message : "Unknown mystery generation failure",
      status: error instanceof MysteryStageError ? error.status : undefined,
      rawResponse: error instanceof MysteryStageError ? error.rawResponse : undefined,
    };
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OCCASION_CONTEXT_PATTERN = /Occasion context to weave into this recollection: Ashe was (.+?)\. Core fact: /;

/**
 * The dossier supplies several equally truthful ways Ashe could encounter an
 * object or room fact. Harvest assigns one deterministically, then this final
 * answer-blind pass balances only those cosmetic contexts across the clues
 * that were actually selected. It prevents one prop (lanterns, ribbons, and
 * so on) from swallowing a case simply because several unrelated fact hashes
 * happened to choose it.
 */
function createOccasionContextBalancer(world: WorldState, openingSummary: string): {
  record: (text: string) => void;
  balance: (brief: string) => string;
} {
  const texture = world.occasionTexture;
  const props = world.occasionSpine.setDressing
    .map((prop) => prop.trim().toLowerCase())
    .filter(Boolean);
  const propUses = new Map<string, number>(props.map((prop) => [prop, 0]));
  const exactUses = new Map<string, number>();

  const occurrences = (text: string, phrase: string): number => {
    if (!phrase) return 0;
    let count = 0;
    let from = 0;
    const haystack = text.toLowerCase();
    while ((from = haystack.indexOf(phrase, from)) >= 0) {
      count += 1;
      from += Math.max(1, phrase.length);
    }
    return count;
  };
  const record = (text: string): void => {
    for (const prop of props) {
      const count = occurrences(text, prop);
      if (count > 0) propUses.set(prop, (propUses.get(prop) ?? 0) + count);
    }
  };
  record(openingSummary);

  const balance = (brief: string): string => {
    const match = brief.match(OCCASION_CONTEXT_PATTERN);
    if (!match || !texture) {
      record(brief);
      return brief;
    }
    const current = match[1];
    const pool = texture.inspectionContexts.includes(current)
      ? texture.inspectionContexts
      : texture.observationContexts.includes(current)
        ? texture.observationContexts
        : [];
    if (pool.length === 0) {
      record(brief);
      return brief;
    }

    const ranked = pool.map((candidate, index) => {
      const lower = candidate.toLowerCase();
      const propCost = props.reduce(
        (sum, prop) => sum + (lower.includes(prop) ? (propUses.get(prop) ?? 0) : 0),
        0
      );
      return {
        candidate,
        index,
        score: (exactUses.get(lower) ?? 0) * 100 + propCost * 24,
      };
    }).sort((left, right) => left.score - right.score || left.index - right.index);

    const chosen = ranked[0].candidate;
    exactUses.set(chosen.toLowerCase(), (exactUses.get(chosen.toLowerCase()) ?? 0) + 1);
    record(chosen);
    return brief.replace(OCCASION_CONTEXT_PATTERN, `Occasion context to weave into this recollection: Ashe was ${chosen}. Core fact: `);
  };

  return { record, balance };
}

async function repairText(
  provider: StructuredCaller,
  providerSource: string | MysteryProviderRuntime,
  seed: StorySeed,
  previousText: string,
  problems: string[],
  fewshotClues: string[],
  earlierSceneText?: string,
  comparisonText?: string
): Promise<string> {
  const prompt = buildClueRepairPrompt({ seed, previousText, problems, fewshotClues, earlierSceneText, comparisonText });
  const repaired = await provider({
    ...(typeof providerSource === "string"
      ? { apiKey: providerSource }
      : { runtime: providerSource }),
    stage: "revision",
    ...prompt,
    toolName: "submit_repaired_text",
    toolDescription: "Submit the rewritten testimony or note.",
    inputSchema: toToolInputSchema(ClueRepairSchema),
    outputSchema: ClueRepairSchema,
    maxTokens: 500,
  });
  return repaired.value.text;
}

function openingStyleSignature(clues: string[]): string {
  const counts = new Map<string, number>();
  const firstWords = new Set<string>();
  for (const clue of clues) {
    const first = clue.match(/[A-Za-z]+(?:'[A-Za-z]+)?/)?.[0]?.toLowerCase() ?? "other";
    firstWords.add(first);
    const style = /^(hello|coming|good)$/.test(first) ? "greeting" :
      /^(during|before|after|by|at|as|when|later|toward|while)$/.test(first) ? "time" :
      /^(in|near|outside|inside|from|along|beside|within)$/.test(first) ? "place" :
      "direct";
    counts.set(style, (counts.get(style) ?? 0) + 1);
  }
  const styles = ["direct", "time", "place", "greeting"]
    .map((style) => `${style}:${counts.get(style) ?? 0}`)
    .join(",");
  return `openers:${styles},unique:${firstWords.size}`;
}

function chooseOccasionFamily(seed: number, recentSignatures: string[]): string {
  const normalizedSeed = Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) : 0;
  const start = ((normalizedSeed * 2_654_435_761) >>> 0) % OCCASION_FAMILIES.length;
  for (let offset = 0; offset < OCCASION_FAMILIES.length; offset += 1) {
    const candidate = OCCASION_FAMILIES[(start + offset) % OCCASION_FAMILIES.length];
    if (!recentSignatures.some((signature) => signature.toLowerCase().includes(candidate.toLowerCase()))) return candidate;
  }
  return OCCASION_FAMILIES[start];
}

function worldCast(): Array<{ name: string; role: string; traits: string[] }> {
  // Import here would create a cycle through world-sim; use its helpers.
  const ids = ["S01", "S02", "S03", "S04", "S05", "S06", "S07", "S08", "S09", "S10"];
  return ids.map((id) => {
    const suspect = requireSuspect(id);
    return { name: suspect.displayName, role: suspect.role, traits: suspect.traits };
  });
}

function worldColorNotes(world: WorldState): string[] {
  const notes: string[] = [];
  notes.push(`The party mode: ${world.partyMode === "house_party" ? "a weekend house party, everyone staying over" : "a single-day affair with guests arriving and departing"}.`);
  for (const gathering of world.gatherings) {
    if (gathering.kind === "retired") continue;
    notes.push(`${requireTime(gathering.timeId).name}: ${gathering.label}${gathering.locationId ? ` in the ${requireLocation(gathering.locationId).name}` : ""}.`);
  }
  if (world.roomClosure) {
    notes.push(`The ${requireLocation(world.roomClosure.locationId).name} was closed off (${world.roomClosure.cause}).`);
  }
  for (const item of Object.values(world.items)) {
    if (item.offsite) notes.push(`The ${requireItem(item.itemId).nameUS} was ${item.offsite.reason}.`);
  }
  for (const thread of world.threads) {
    notes.push(`Background thread: ${thread.cause}.`);
  }
  for (const entry of world.motives.slice(0, 3)) {
    notes.push(`Whispered about ${requireSuspect(entry.suspectId).displayName}: ${entry.motive}.`);
  }
  return notes;
}

function toStageDebug<T>(
  prompt: { system: string; prompt: string },
  result: StructuredCallResult<T>
): StageDebug<T> {
  return {
    system: prompt.system,
    prompt: prompt.prompt,
    rawResponse: result.raw,
    parsed: result.value,
    durationMs: result.durationMs,
    usage: result.usage,
    stopReason: result.stopReason,
    strictSchema: result.strictSchema,
    model: result.model,
    transport: result.transport,
  };
}
