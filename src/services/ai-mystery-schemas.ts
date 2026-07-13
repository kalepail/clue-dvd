import { z } from "zod/v4";

export const AnswerSchema = z.object({
  suspectId: z.string(),
  itemId: z.string(),
  locationId: z.string(),
  timeId: z.string(),
});

/**
 * V3 output contracts. Deliberately small and flat: every earlier iteration
 * that asked the model for large structured objects (CaseBible, elimination
 * metadata, timelines) died fighting schema grammar limits and enum drift.
 * The logic lives in deterministic code now; the model only returns prose.
 */

export const DossierSchema = z.object({
  title: z.string().min(1),
  occasionName: z.string().min(1),
  occasionSummary: z.string().min(1),
  hostReason: z.string().min(1),
  mysterySignature: z.string().min(1),
  occasionTexture: z.object({
    gatheringDetails: z.array(z.string()),
    inspectionContexts: z.array(z.string()),
    observationContexts: z.array(z.string()),
  }),
});

export const RenderedMysterySchema = z.object({
  opening: z.string().min(1),
  clues: z.array(z.string().min(1)).length(10),
  note1: z.string().min(1),
  note2: z.string().min(1),
});

export const ClueRepairSchema = z.object({
  text: z.string().min(1),
});

export const ClosingSchema = z.object({
  closing: z.string().min(1),
});

export type Answer = z.infer<typeof AnswerSchema>;
export type Dossier = z.infer<typeof DossierSchema>;
export type OccasionTexture = Dossier["occasionTexture"];
export type RenderedMystery = z.infer<typeof RenderedMysterySchema>;
export type ClueRepair = z.infer<typeof ClueRepairSchema>;
export type Closing = z.infer<typeof ClosingSchema>;

/** Generate Anthropic's tool schema from the same Zod runtime contract. */
export function toToolInputSchema(schema: z.ZodType): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  const { $schema: _dialect, ...inputSchema } = jsonSchema;
  return transformForAnthropicStrictSchema(inputSchema) as Record<string, unknown>;
}

const ANTHROPIC_UNSUPPORTED_CONSTRAINTS = new Set([
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "uniqueItems",
]);

function transformForAnthropicStrictSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(transformForAnthropicStrictSchema);
  if (!value || typeof value !== "object") return value;

  const input = value as Record<string, unknown>;
  const transformed: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(input)) {
    if (ANTHROPIC_UNSUPPORTED_CONSTRAINTS.has(key)) continue;
    transformed[key] = transformForAnthropicStrictSchema(child);
  }
  if (transformed.type === "object") transformed.additionalProperties = false;
  return transformed;
}
