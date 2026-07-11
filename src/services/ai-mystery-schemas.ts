import { z } from "zod/v4";

export const CategorySchema = z.enum(["suspect", "item", "location", "time"]);

export const AnswerSchema = z.object({
  suspectId: z.string(),
  itemId: z.string(),
  locationId: z.string(),
  timeId: z.string(),
});

const CandidateEffectSchema = z.object({
  category: CategorySchema,
  ids: z.array(z.string()).min(1),
  reason: z.string().min(1),
});

export const CaseBibleSchema = z.object({
  version: z.literal("2.0"),
  occasion: z.object({
    family: z.string().min(1),
    title: z.string().min(1),
    purpose: z.string().min(1),
    schedule: z.array(z.object({
      timeId: z.string(),
      activity: z.string().min(1),
    })).min(3),
  }),
  answer: AnswerSchema,
  centralTension: z.string().min(1),
  theft: z.object({
    theftEventId: z.string().min(1),
    discoveryEventId: z.string().min(1),
    motive: z.string().min(1),
    opportunity: z.string().min(1),
    access: z.string().min(1),
    method: z.string().min(1),
    concealment: z.string().min(1),
    coverStory: z.string().min(1),
    discovery: z.string().min(1),
  }),
  cast: z.array(z.object({
    suspectId: z.string(),
    eventRole: z.string().min(1),
    privateGoal: z.string().min(1),
    relationships: z.array(z.object({
      suspectId: z.string(),
      nature: z.string().min(1),
    })).min(1),
    trueActionEventIds: z.array(z.string()).min(1),
  })).length(10),
  timeline: z.array(z.object({
    id: z.string().min(1),
    timeId: z.string(),
    locationId: z.string(),
    participantIds: z.array(z.string()).min(1),
    itemIds: z.array(z.string()),
    actualEvent: z.string().min(1),
    witnessIds: z.array(z.string()),
  })).min(10).max(20),
  movements: z.array(z.object({
    id: z.string().min(1),
    eventId: z.string().min(1),
    actorId: z.string(),
    fromLocationId: z.string(),
    toLocationId: z.string(),
    method: z.enum(["ordinary", "secret_passage"]),
    itemIds: z.array(z.string()),
  })).min(1).max(20),
  itemThreads: z.array(z.object({
    itemId: z.string(),
    eventIds: z.array(z.string()).min(1),
    storyFunction: z.string().min(1),
  })).min(4).max(6),
  deceptions: z.array(z.object({
    id: z.string().min(1),
    suspectId: z.string(),
    kind: z.enum(["lie", "omission"]),
    publicClaim: z.string().min(1),
    truth: z.string().min(1),
    reason: z.string().min(1),
    contradictionEvidenceIds: z.array(z.string()).min(1),
  })).min(2).max(4),
  innocentThreads: z.array(z.object({
    id: z.string().min(1),
    suspectIds: z.array(z.string()).min(1),
    suspiciousAppearance: z.string().min(1),
    innocentTruth: z.string().min(1),
    evidenceIds: z.array(z.string()).min(1),
  })).min(2).max(3),
  evidenceAtoms: z.array(z.object({
    id: z.string().min(1),
    eventId: z.string(),
    publicFact: z.string().min(1),
  })).min(12),
  inferences: z.array(z.object({
    id: z.string().min(1),
    evidenceIds: z.array(z.string()).min(2),
    conclusion: z.string().min(1),
    category: CategorySchema,
    importance: z.enum(["supporting", "important"]),
  })).min(4),
  clueBlueprints: z.array(z.object({
    position: z.number().int().min(1).max(10),
    source: z.string().min(1),
    evidenceIds: z.array(z.string()).min(1).max(3),
    threadId: z.string().min(1),
    purpose: z.enum(["setup", "testimony", "contradiction", "payoff", "context"]),
    rulesOut: z.array(CandidateEffectSchema),
    supports: z.array(z.object({ category: CategorySchema, id: z.string() })),
    answerDimensions: z.array(CategorySchema).max(2),
  })).length(10),
  inspectorEvidence: z.array(z.object({
    id: z.enum(["N1", "N2"]),
    availableAfterClue: z.union([z.literal(5), z.literal(7)]),
    fact: z.string().min(1),
    evidenceIds: z.array(z.string()).min(1),
    relatedCluePositions: z.array(z.number().int().min(1).max(10)).min(1),
    rulesOut: z.array(CandidateEffectSchema),
  })).length(2),
  closingEvidenceIds: z.array(z.string()).min(4),
  noveltySignature: z.object({
    occasion: z.string().min(1),
    motive: z.string().min(1),
    relationship: z.string().min(1),
    deception: z.string().min(1),
  }),
});

export const RenderedMysterySchema = z.object({
  opening: z.string().min(1),
  clues: z.array(z.object({
    position: z.number().int().min(1).max(10),
    text: z.string().min(1),
    evidenceIds: z.array(z.string()).min(1).max(3),
  })).length(10),
  closing: z.string().min(1),
  closingEvidenceIds: z.array(z.string()).min(4),
});

export const InspectorPackageSchema = z.object({
  notes: z.array(z.object({
    id: z.enum(["N1", "N2"]),
    text: z.string().min(1),
    relatedClues: z.array(z.number().int().min(1).max(10)).min(1),
    evidenceIds: z.array(z.string()).min(1),
  })).length(2),
});

const CandidateSetSchema = z.object({
  suspects: z.array(z.string()).min(1),
  items: z.array(z.string()).min(1),
  locations: z.array(z.string()).min(1),
  times: z.array(z.string()).min(1),
});

export const BlindAuditSchema = z.object({
  snapshots: z.array(z.object({
    afterClue: z.union([z.literal(5), z.literal(7), z.literal(10)]),
    candidates: CandidateSetSchema,
    leadingTheory: z.string(),
    singleSolutionApparent: z.boolean(),
  })).length(3),
  reconstructedTimeline: z.array(z.string()).min(2),
  detectedDeceptions: z.array(z.string()),
  disconnectedCluePositions: z.array(z.number().int().min(1).max(10)),
  repeatedLanguage: z.array(z.string()),
  coherentStory: z.boolean(),
  fairMystery: z.boolean(),
  revisionNeeded: z.boolean(),
  reasons: z.array(z.string()),
});

export const RevisedPackageSchema = RenderedMysterySchema.extend({
  notes: InspectorPackageSchema.shape.notes,
});

export type Answer = z.infer<typeof AnswerSchema>;
export type CaseBible = z.infer<typeof CaseBibleSchema>;
export type RenderedMystery = z.infer<typeof RenderedMysterySchema>;
export type InspectorPackage = z.infer<typeof InspectorPackageSchema>;
export type BlindAudit = z.infer<typeof BlindAuditSchema>;
export type RevisedPackage = z.infer<typeof RevisedPackageSchema>;

/**
 * Anthropic tools consume JSON Schema while the application validates with Zod.
 * Generate the provider schema from the runtime schema so there is only one
 * contract to maintain.
 */
export function toToolInputSchema(schema: z.ZodType): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  const { $schema: _dialect, ...inputSchema } = jsonSchema;
  return inputSchema;
}
