import {
  ITEMS,
  LOCATIONS,
  SUSPECTS,
  TIME_PERIODS,
} from "../data/game-elements";
import {
  buildArchitectPrompt,
  buildAuditPrompt,
  buildInspectorPrompt,
  buildRendererPrompt,
  buildRevisionPrompt,
  type MysteryWorld,
} from "../data/ai-mystery-prompts";
import {
  BlindAuditSchema,
  CaseBibleSchema,
  InspectorPackageSchema,
  RenderedMysterySchema,
  RevisedPackageSchema,
  toToolInputSchema,
  type Answer,
  type BlindAudit,
  type CaseBible,
  type InspectorPackage,
  type RenderedMystery,
} from "./ai-mystery-schemas";
import {
  callStructured,
  MysteryStageError,
  type MysteryStage,
  type StructuredCallResult,
} from "./ai-mystery-provider";
import {
  evaluateBlindAudit,
  validateCaseBible,
  validatePublicPackage,
} from "./ai-mystery-validator";
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
};

export type MysteryEngineDebug = {
  engineVersion: "2.0";
  startedAt: string;
  setup: {
    seed: number;
    answer: Answer;
    occasionFamily: string;
    recentSignatures: string[];
    world: MysteryWorld;
  };
  caseBible?: StageDebug<CaseBible>;
  renderedDraft?: StageDebug<RenderedMystery>;
  inspectorEvidence?: StageDebug<InspectorPackage>;
  blindAudit?: StageDebug<BlindAudit>;
  revision?: StageDebug<RenderedMystery & InspectorPackage>;
  finalAudit?: StageDebug<BlindAudit>;
  deterministicIssues: {
    caseBible: string[];
    publicDraft: string[];
    publicFinal: string[];
    auditDraft: string[];
    auditFinal: string[];
  };
  finalPackage?: {
    opening: string;
    clues: RenderedMystery["clues"];
    inspectorNotes: InspectorPackage["notes"];
    closing: string;
    closingEvidenceIds: string[];
    mysterySignature: string;
  };
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
    engineVersion: "2.0",
    startedAt: new Date(startedAt).toISOString(),
    setup: {
      seed: params.setup.seed,
      answer,
      occasionFamily,
      recentSignatures,
      world,
    },
    deterministicIssues: {
      caseBible: [],
      publicDraft: [],
      publicFinal: [],
      auditDraft: [],
      auditFinal: [],
    },
  };
  lastMysteryEngineDebug = debug;

  const emit = async (stage: MysteryProgressStage, message: string, progress: number) => {
    await params.onProgress?.({ stage, message, progress, elapsedMs: Date.now() - startedAt });
  };

  try {
    await emit("occasion", "Designing the occasion.", 8);
    const architectPrompt = buildArchitectPrompt({ answer, world, occasionFamily, recentSignatures });
    await emit("relationships", "Building motives and relationships.", 18);
    const architect = await provider({
      apiKey,
      stage: "architect",
      ...architectPrompt,
      toolName: "submit_case_bible",
      toolDescription: "Submit the complete private causal case bible.",
      inputSchema: toToolInputSchema(CaseBibleSchema),
      outputSchema: CaseBibleSchema,
      maxTokens: 10_000,
    });
    debug.caseBible = toStageDebug(architectPrompt, architect);

    await emit("timeline", "Simulating and validating the hidden timeline.", 36);
    debug.deterministicIssues.caseBible = validateCaseBible(architect.value, answer, world, {
      occasionFamily,
      recentSignatures,
    });
    throwForIssues("architect", "Case bible failed deterministic validation", debug.deterministicIssues.caseBible);

    const rendererPrompt = buildRendererPrompt({ bible: architect.value, world });
    await emit("rendering", "Writing witness fragments.", 46);
    const rendered = await provider({
      apiKey,
      stage: "renderer",
      ...rendererPrompt,
      toolName: "submit_rendered_mystery",
      toolDescription: "Submit the opening, ten evidence-linked fragments, and evidence-grounded closing.",
      inputSchema: toToolInputSchema(RenderedMysterySchema),
      outputSchema: RenderedMysterySchema,
      maxTokens: 6_500,
    });
    debug.renderedDraft = toStageDebug(rendererPrompt, rendered);

    const inspectorPrompt = buildInspectorPrompt({ bible: architect.value, mystery: rendered.value, world });
    await emit("inspector", "Preparing Inspector evidence.", 62);
    const inspector = await provider({
      apiKey,
      stage: "inspector",
      ...inspectorPrompt,
      toolName: "submit_inspector_evidence",
      toolDescription: "Submit the two evidence-linked Inspector Brown notes.",
      inputSchema: toToolInputSchema(InspectorPackageSchema),
      outputSchema: InspectorPackageSchema,
      maxTokens: 1_200,
    });
    debug.inspectorEvidence = toStageDebug(inspectorPrompt, inspector);
    debug.deterministicIssues.publicDraft = validatePublicPackage({
      bible: architect.value,
      mystery: rendered.value,
      inspector: inspector.value,
      world,
    });

    const auditPrompt = buildAuditPrompt({ mystery: rendered.value, inspector: inspector.value, world });
    await emit("audit", "Blind-playtesting the mystery.", 74);
    const audit = await provider({
      apiKey,
      stage: "audit",
      ...auditPrompt,
      toolName: "submit_blind_audit",
      toolDescription: "Submit the three-snapshot blind playtest and narrative audit.",
      inputSchema: toToolInputSchema(BlindAuditSchema),
      outputSchema: BlindAuditSchema,
      maxTokens: 3_000,
    });
    debug.blindAudit = toStageDebug(auditPrompt, audit);
    debug.deterministicIssues.auditDraft = evaluateBlindAudit(audit.value, answer, world);

    let finalMystery = rendered.value;
    let finalInspector = inspector.value;
    const draftIssues = unique([
      ...debug.deterministicIssues.publicDraft,
      ...debug.deterministicIssues.auditDraft,
    ]);

    if (draftIssues.length > 0) {
      await emit("revision", "Revising the public mystery package.", 84);
      const revisionPrompt = buildRevisionPrompt({
        bible: architect.value,
        mystery: rendered.value,
        inspector: inspector.value,
        audit: audit.value,
        deterministicIssues: draftIssues,
      });
      const revision = await provider({
        apiKey,
        stage: "revision",
        ...revisionPrompt,
        toolName: "submit_revised_mystery",
        toolDescription: "Submit the complete revised public mystery while preserving all evidence provenance.",
        inputSchema: toToolInputSchema(RevisedPackageSchema),
        outputSchema: RevisedPackageSchema,
        maxTokens: 7_000,
      });
      finalMystery = {
        opening: revision.value.opening,
        clues: revision.value.clues,
        closing: revision.value.closing,
        closingEvidenceIds: revision.value.closingEvidenceIds,
      };
      finalInspector = { notes: revision.value.notes };
      debug.revision = toStageDebug(revisionPrompt, revision);
      debug.deterministicIssues.publicFinal = validatePublicPackage({
        bible: architect.value,
        mystery: finalMystery,
        inspector: finalInspector,
        world,
      });
      throwForIssues("revision", "Revised package failed deterministic validation", debug.deterministicIssues.publicFinal);

      await emit("revision", "Rechecking the revised mystery blind.", 92);
      const finalAuditPrompt = buildAuditPrompt({ mystery: finalMystery, inspector: finalInspector, world });
      const finalAudit = await provider({
        apiKey,
        stage: "audit",
        ...finalAuditPrompt,
        toolName: "submit_final_blind_audit",
        toolDescription: "Submit the final three-snapshot blind playtest.",
        inputSchema: toToolInputSchema(BlindAuditSchema),
        outputSchema: BlindAuditSchema,
        maxTokens: 3_000,
      });
      debug.finalAudit = toStageDebug(finalAuditPrompt, finalAudit);
      debug.deterministicIssues.auditFinal = evaluateBlindAudit(finalAudit.value, answer, world);
      throwForIssues("audit", "Final blind audit rejected the mystery", debug.deterministicIssues.auditFinal);
    }

    const mysterySignature = formatMysterySignature(architect.value);
    debug.finalPackage = {
      opening: finalMystery.opening,
      clues: finalMystery.clues,
      inspectorNotes: finalInspector.notes,
      closing: finalMystery.closing,
      closingEvidenceIds: finalMystery.closingEvidenceIds,
      mysterySignature,
    };
    await emit("complete", "Case ready.", 100);

    return {
      opening: finalMystery.opening.trim(),
      butlerClues: finalMystery.clues
        .slice()
        .sort((left, right) => left.position - right.position)
        .map((clue) => clue.text.trim()),
      inspectorNotes: finalInspector.notes
        .slice()
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((note) => ({ id: note.id, text: note.text.trim(), relatedClues: note.relatedClues })),
      closing: finalMystery.closing.trim(),
      mysterySignature,
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
    if (!recentSignatures.some((signature) => signature.toLowerCase().includes(candidate.toLowerCase()))) {
      return candidate;
    }
  }
  return OCCASION_FAMILIES[start];
}

function formatMysterySignature(bible: CaseBible): string {
  const signature = bible.noveltySignature;
  return [signature.occasion, signature.motive, signature.relationship, signature.deception]
    .map((part) => part.trim().replace(/\s+/g, " "))
    .join(" | ");
}

function throwForIssues(stage: MysteryStage, prefix: string, issues: string[]): void {
  if (issues.length === 0) return;
  throw new MysteryStageError(stage, `${prefix}: ${issues.join(" ")}`);
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
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
