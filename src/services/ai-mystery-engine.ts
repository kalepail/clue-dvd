/**
 * AI Mystery Engine V3 — "world-first"
 *
 * Pipeline (deterministic → AI → deterministic):
 *
 *   1. simulateWorld     seeded ground-truth day; theft embedded as one
 *                        thread among many (world-sim.ts)
 *   2. harvestFacts      every tellable TRUE fact, with joint-cell semantics
 *                        and mention licenses (fact-harvest.ts)
 *   3. scheduleMystery   solver picks the 10 clues + 2 notes and their order
 *                        so the fair-play curve provably holds
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

import { requireItem, requireLocation, requireSuspect, requireTime, simulateWorld, type WorldState } from "./world-sim";
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
import { verifyClosing, verifyClueText, verifyOpening, type TextVerification } from "./clue-verifier";
import { callStructured, MysteryStageError, type StructuredCallResult } from "./ai-mystery-provider";
import type { MysterySetup } from "./ai-mystery-setup";
import { SeededRandom } from "./seeded-random";

export const ENGINE_VERSION = "3.0-world";
const MAX_WORLD_ATTEMPTS = 30;
const MAX_REPAIRS_PER_TEXT = 2;

const OCCASION_FAMILIES = [
  "charitable benefit",
  "private arts recital",
  "family commemoration",
  "county society exhibition",
  "weekend house tournament",
  "reception for a visiting dignitary",
  "engagement celebration",
  "scholarly demonstration",
  "costume fete",
  "reunion of old acquaintances",
  "horticultural prize gathering",
  "collector's private viewing",
  "amateur theatrical rehearsal",
  "subscription committee meeting",
];

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
};

export type MysteryEngineDebug = {
  engineVersion: typeof ENGINE_VERSION;
  startedAt: string;
  setup: {
    seed: number;
    answer: Answer;
    occasionFamily: string;
    recentSignatures: string[];
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

export async function generateMysteryV2(apiKey: string, params: {
  setup: MysterySetup;
  recentSignatures?: string[];
  onProgress?: (event: MysteryProgressEvent) => void | Promise<void>;
  provider?: StructuredCaller;
}): Promise<MysteryEngineResult> {
  const startedAt = Date.now();
  const provider = params.provider ?? callStructured;
  const answer: Answer = { ...params.setup.solution };
  const recentSignatures = (params.recentSignatures ?? []).filter(Boolean).slice(0, 5);
  const occasionFamily = chooseOccasionFamily(params.setup.seed, recentSignatures);
  const debug: MysteryEngineDebug = {
    engineVersion: ENGINE_VERSION,
    startedAt: new Date(startedAt).toISOString(),
    setup: { seed: params.setup.seed, answer, occasionFamily, recentSignatures },
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
      const candidateWorld = simulateWorld({ seed: params.setup.seed, attempt, answer, occasionFamily });
      const candidateFacts = harvestFacts(candidateWorld);
      const candidateSchedule = scheduleMystery({
        facts: candidateFacts,
        answer,
        seed: params.setup.seed * 31 + attempt,
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

    const factById = new Map(facts.map((fact) => [fact.id, fact]));
    const storySeeds: StorySeed[] = schedule.reveals.map((reveal) => {
      const fact = factById.get(reveal.factId)!;
      return {
        position: reveal.position,
        deliverAs: reveal.slot === "clue" ? "butler" : reveal.slot,
        clueNumber: reveal.clueNumber,
        brief: fact.writerBrief,
        allowedNames: [
          ...fact.mentions.suspects,
          ...fact.mentions.items,
          ...fact.mentions.locations,
          ...fact.mentions.times,
        ],
      };
    });
    debug.storySeeds = storySeeds;

    // ---- AI phase (answer-blind until the closing) ------------------------
    const fewshotRng = new SeededRandom(params.setup.seed ^ 0x2c1b3c6d);
    const fewshots = pickFewshots(fewshotRng);

    await emit("relationships", "Inventing the occasion and its tensions.", 30);
    const dossierPrompt = buildDossierPrompt({
      occasionFamily,
      recentSignatures,
      cast: worldCast(),
      colorNotes: worldColorNotes(world),
    });
    const dossier = await provider({
      apiKey,
      stage: "architect",
      ...dossierPrompt,
      toolName: "submit_case_dossier",
      toolDescription: "Submit the occasion dossier for a new Tudor Mansion case.",
      inputSchema: toToolInputSchema(DossierSchema),
      outputSchema: DossierSchema,
      maxTokens: 900,
    });
    debug.dossier = toStageDebug(dossierPrompt, dossier);

    await emit("rendering", "Ashe is recalling the day, one testimony at a time.", 48);
    const renderPrompt = buildRenderPrompt({ dossier: dossier.value, seeds: storySeeds, fewshots });
    const render = await provider({
      apiKey,
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
    const lieReveal = world.falseAlibi
      ? `${answerNames.suspect} claimed to have been in the ${requireLocation(world.falseAlibi.claimedLocationId).name} at the fatal hour — but the party actually in that room never saw them`
      : undefined;
    const closingPrompt = buildClosingPrompt({
      answerNames,
      dossierTitle: dossier.value.title,
      caseRecap: storySeeds.map((seed) => seed.brief),
      finalCandidates: schedule.finalCandidates,
      thiefMotive,
      lieReveal,
      fewshotClosings: fewshots.closings,
    });
    let closing = await provider({
      apiKey,
      stage: "inspector",
      ...closingPrompt,
      toolName: "submit_case_closing",
      toolDescription: "Submit the closing reveal narration.",
      inputSchema: toToolInputSchema(ClosingSchema),
      outputSchema: ClosingSchema,
      maxTokens: 800,
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
            caseRecap: storySeeds.map((seed) => seed.brief),
            finalCandidates: schedule.finalCandidates,
            thiefMotive,
            lieReveal,
            fewshotClosings: fewshots.closings,
          });
          retryPrompt.prompt += `\n\nThe previous attempt had problems: ${entry.problems.join(" ")} Fix them.`;
          closing = await provider({
            apiKey,
            stage: "inspector",
            ...retryPrompt,
            toolName: "submit_case_closing",
            toolDescription: "Submit the corrected closing reveal narration.",
            inputSchema: toToolInputSchema(ClosingSchema),
            outputSchema: ClosingSchema,
            maxTokens: 800,
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
            brief: `${dossier.value.occasionSummary} End on the discovery that something has been stolen, without naming any card.`,
            allowedNames: [],
          };
          const repaired = await repairText(provider, apiKey, openingSeed, texts.opening, entry.problems, fewshots.clues);
          repairs.push({ target: "opening", attempt: round, problems: entry.problems, before: texts.opening, after: repaired });
          texts.opening = repaired;
          continue;
        }
        const seed = seedFor(entry.target);
        if (!seed) continue;
        const current =
          seed.deliverAs === "butler" ? texts.clues[(seed.clueNumber ?? 1) - 1] :
          seed.deliverAs === "note1" ? texts.note1 : texts.note2;
        const repaired = await repairText(provider, apiKey, seed, current, entry.problems, fewshots.clues);
        repairs.push({ target: entry.target, attempt: round, problems: entry.problems, before: current, after: repaired });
        if (seed.deliverAs === "butler") texts.clues[(seed.clueNumber ?? 1) - 1] = repaired;
        else if (seed.deliverAs === "note1") texts.note1 = repaired;
        else texts.note2 = repaired;
      }
      verification = runVerification();
    }
    debug.verification = verification;

    // Never hard-fail on residual style problems: the puzzle is already
    // sound. Log them for the diagnostics payload instead — with one
    // exception: a closing that fails to name the answer is unusable.
    const unresolved = problematic();
    debug.unresolvedProblems = unresolved;
    const closingStillBroken = unresolved.find((entry) => entry.target === "closing");
    if (closingStillBroken) {
      throw new MysteryStageError(
        "inspector",
        `The closing failed to name the full solution after retries: ${closingStillBroken.problems.join(" ")}`
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

async function repairText(
  provider: StructuredCaller,
  apiKey: string,
  seed: StorySeed,
  previousText: string,
  problems: string[],
  fewshotClues: string[]
): Promise<string> {
  const prompt = buildClueRepairPrompt({ seed, previousText, problems, fewshotClues });
  const repaired = await provider({
    apiKey,
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
  };
}
