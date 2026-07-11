import { ITEMS, LOCATIONS, SUSPECTS, TIME_PERIODS } from "../data/game-elements";
import {
  buildCreativeAuditPrompt,
  buildCreativeMysteryPrompt,
  buildCreativeRevisionPrompt,
  type MysteryWorld,
} from "../data/ai-creative-mystery-prompts";
import {
  CreativeAuditSchema,
  CreativeMysterySchema,
  toToolInputSchema,
  type Answer,
  type CreativeAudit,
  type CreativeMystery,
} from "./ai-mystery-schemas";
import {
  callStructured,
  MysteryStageError,
  type StructuredCallResult,
} from "./ai-mystery-provider";
import type { MysterySetup } from "./ai-mystery-setup";

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
  engineVersion: "2.1-creative";
  startedAt: string;
  setup: {
    seed: number;
    answer: Answer;
    occasionFamily: string;
    recentSignatures: string[];
    world: MysteryWorld;
  };
  creativeDraft?: StageDebug<CreativeMystery>;
  blindAudit?: StageDebug<CreativeAudit>;
  revision?: StageDebug<CreativeMystery>;
  finalPackage?: CreativeMystery;
  failure?: { stage: string; message: string; status?: number; rawResponse?: string };
};

type StructuredCaller = typeof callStructured;

let lastMysteryEngineDebug: MysteryEngineDebug | null = null;

export function getLastMysteryEngineDebug(): MysteryEngineDebug | null {
  return lastMysteryEngineDebug;
}

export function buildMysteryWorld(): MysteryWorld {
  return {
    suspects: SUSPECTS.map((suspect) => ({
      id: suspect.id,
      name: suspect.displayName,
      role: suspect.role,
      traits: suspect.traits,
    })),
    items: ITEMS.map((item) => ({
      id: item.id,
      name: item.nameUS,
      category: item.category,
      description: item.description,
    })),
    locations: LOCATIONS.map((location) => ({
      id: location.id,
      name: location.name,
      adjacentRooms: location.adjacentRooms
        .map((name) => LOCATIONS.find((candidate) => candidate.name === name)?.id)
        .filter((id): id is string => Boolean(id)),
      secretPassageTo: location.secretPassageTo
        ? LOCATIONS.find((candidate) => candidate.name === location.secretPassageTo)?.id ?? null
        : null,
    })),
    times: TIME_PERIODS.map((time) => ({
      id: time.id,
      name: time.name,
      order: time.order,
      activities: time.typicalActivities,
    })),
  };
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
  const world = buildMysteryWorld();
  const recentSignatures = (params.recentSignatures ?? []).filter(Boolean).slice(0, 5);
  const occasionFamily = chooseOccasionFamily(params.setup.seed, recentSignatures);
  const debug: MysteryEngineDebug = {
    engineVersion: "2.1-creative",
    startedAt: new Date(startedAt).toISOString(),
    setup: { seed: params.setup.seed, answer, occasionFamily, recentSignatures, world },
  };
  lastMysteryEngineDebug = debug;

  const emit = async (stage: MysteryProgressStage, message: string, progress: number) => {
    await params.onProgress?.({ stage, message, progress, elapsedMs: Date.now() - startedAt });
  };

  try {
    await emit("occasion", "Creating an original Tudor Mansion mystery.", 10);
    const creativePrompt = buildCreativeMysteryPrompt({ answer, world, occasionFamily, recentSignatures });
    await emit("rendering", "Writing the complete mystery and story clues.", 35);
    const draft = await provider({
      apiKey,
      stage: "renderer",
      ...creativePrompt,
      toolName: "submit_creative_mystery",
      toolDescription: "Submit one complete creative theft mystery with opening, hidden truth, ten clues, two notes, and closing.",
      inputSchema: toToolInputSchema(CreativeMysterySchema),
      outputSchema: CreativeMysterySchema,
      maxTokens: 9_000,
    });
    debug.creativeDraft = toStageDebug(creativePrompt, draft);

    await emit("audit", "Blind-playtesting the mystery for coherence and fairness.", 70);
    const auditPrompt = buildCreativeAuditPrompt({ mystery: draft.value, world });
    const audit = await provider({
      apiKey,
      stage: "audit",
      ...auditPrompt,
      toolName: "submit_creative_audit",
      toolDescription: "Judge broad coherence, playability, solvability, early answer leakage, and closing support.",
      inputSchema: toToolInputSchema(CreativeAuditSchema),
      outputSchema: CreativeAuditSchema,
      maxTokens: 1_500,
    });
    debug.blindAudit = toStageDebug(auditPrompt, audit);

    const answerMissingFromClosing = !closingNamesAnswer(draft.value.closing, answer, world);
    const leakage = analyzeEarlyLeakage(draft.value, audit.value, answer, world);
    const needsRevision = answerMissingFromClosing ||
      leakage.openingLeak ||
      leakage.earlyClueConvergence ||
      leakage.auditConvergence ||
      !audit.value.coherent ||
      !audit.value.playable ||
      !audit.value.solvable ||
      audit.value.answerTooObviousEarly ||
      !audit.value.closingSupportedByClues;
    let finalMystery = draft.value;

    if (needsRevision) {
      const feedback = audit.value.feedback.map((entry) => entry.trim()).filter(Boolean);
      if (answerMissingFromClosing) feedback.push("The closing must explicitly name the supplied WHO, WHAT, WHERE, and WHEN.");
      if (leakage.openingLeak) feedback.push("The opening exposes answer-card details. Rewrite it to establish only the occasion and social atmosphere.");
      if (leakage.earlyClueConvergence) {
        feedback.push(`The first five clues directly converge on ${leakage.earlyMentionedDimensions} answer dimensions. Separate those facts and give innocent story threads real weight.`);
      }
      if (leakage.auditConvergence) {
        feedback.push("The answer-blind player independently reconstructed too much of the true solution after only five clues. Rebuild the early pacing and misdirection.");
      }
      const revisionAudit: CreativeAudit = {
        ...audit.value,
        answerTooObviousEarly: audit.value.answerTooObviousEarly || leakage.earlyClueConvergence || leakage.auditConvergence,
        feedback,
      };
      await emit("revision", "Giving the writer one broad creative revision.", 84);
      const revisionPrompt = buildCreativeRevisionPrompt({
        answer,
        world,
        mystery: draft.value,
        audit: revisionAudit,
      });
      const revision = await provider({
        apiKey,
        stage: "revision",
        ...revisionPrompt,
        toolName: "submit_revised_creative_mystery",
        toolDescription: "Submit the complete revised mystery while preserving its strongest creative ideas.",
        inputSchema: toToolInputSchema(CreativeMysterySchema),
        outputSchema: CreativeMysterySchema,
        maxTokens: 9_000,
      });
      debug.revision = toStageDebug(revisionPrompt, revision);
      finalMystery = revision.value;
    }

    debug.finalPackage = finalMystery;
    await emit("complete", "Case ready.", 100);
    return {
      opening: finalMystery.opening.trim(),
      butlerClues: finalMystery.clues.map((clue) => clue.trim()),
      inspectorNotes: finalMystery.inspectorNotes.map((note, index) => ({
        id: index === 0 ? "N1" : "N2",
        text: note.text.trim(),
        relatedClues: sanitizeRelatedClues(note.relatedClues),
      })),
      closing: finalMystery.closing.trim(),
      mysterySignature: finalMystery.mysterySignature.trim(),
    };
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

function chooseOccasionFamily(seed: number, recentSignatures: string[]): string {
  const normalizedSeed = Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) : 0;
  const start = ((normalizedSeed * 2_654_435_761) >>> 0) % OCCASION_FAMILIES.length;
  for (let offset = 0; offset < OCCASION_FAMILIES.length; offset += 1) {
    const candidate = OCCASION_FAMILIES[(start + offset) % OCCASION_FAMILIES.length];
    if (!recentSignatures.some((signature) => signature.toLowerCase().includes(candidate.toLowerCase()))) return candidate;
  }
  return OCCASION_FAMILIES[start];
}

function closingNamesAnswer(closing: string, answer: Answer, world: MysteryWorld): boolean {
  const normalized = closing.toLowerCase();
  const names = [
    world.suspects.find(({ id }) => id === answer.suspectId)?.name,
    world.items.find(({ id }) => id === answer.itemId)?.name,
    world.locations.find(({ id }) => id === answer.locationId)?.name,
    world.times.find(({ id }) => id === answer.timeId)?.name,
  ].filter((name): name is string => Boolean(name));
  return names.every((name) => normalized.includes(name.toLowerCase()));
}

function analyzeEarlyLeakage(
  mystery: CreativeMystery,
  audit: CreativeAudit,
  answer: Answer,
  world: MysteryWorld
): {
  openingLeak: boolean;
  earlyClueConvergence: boolean;
  auditConvergence: boolean;
  earlyMentionedDimensions: number;
} {
  const names = answerNames(answer, world);
  const opening = mystery.opening.toLowerCase();
  const firstFive = mystery.clues.slice(0, 5).join(" ").toLowerCase();
  const openingLeak = [
    ...world.items.map(({ name }) => name),
    ...world.locations.map(({ name }) => name),
    ...world.times.map(({ name }) => name),
  ].some((name) => opening.includes(name.toLowerCase()));
  const earlyMentionedDimensions = [names.suspect, names.item, names.location, names.time]
    .filter((name) => firstFive.includes(name.toLowerCase())).length;
  const earlyClueConvergence = earlyMentionedDimensions >= 3;
  const theory = audit.earlyTheory;
  const theoryMatches = [
    theory.suspectId === answer.suspectId,
    theory.itemId === answer.itemId,
    theory.locationId === answer.locationId,
    theory.timeId === answer.timeId,
  ].filter(Boolean).length;
  const auditConvergence = theoryMatches === 4 ||
    (theory.confidence === "high" && theoryMatches >= 2) ||
    (theory.confidence === "medium" && theoryMatches >= 3);
  return { openingLeak, earlyClueConvergence, auditConvergence, earlyMentionedDimensions };
}

function answerNames(answer: Answer, world: MysteryWorld) {
  return {
    suspect: world.suspects.find(({ id }) => id === answer.suspectId)?.name ?? answer.suspectId,
    item: world.items.find(({ id }) => id === answer.itemId)?.name ?? answer.itemId,
    location: world.locations.find(({ id }) => id === answer.locationId)?.name ?? answer.locationId,
    time: world.times.find(({ id }) => id === answer.timeId)?.name ?? answer.timeId,
  };
}

function sanitizeRelatedClues(values: number[]): number[] {
  const valid = [...new Set(values.filter((value) => Number.isInteger(value) && value >= 1 && value <= 10))];
  return valid.length > 0 ? valid : [1];
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
