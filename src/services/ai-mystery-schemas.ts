import { z } from "zod/v4";

export const AnswerSchema = z.object({
  suspectId: z.string(),
  itemId: z.string(),
  locationId: z.string(),
  timeId: z.string(),
});

/** The deliberately small output contract for the creativity-first engine. */
export const CreativeMysterySchema = z.object({
  title: z.string().min(1),
  privateCaseSummary: z.string().min(1),
  opening: z.string().min(1),
  clues: z.array(z.string().min(1)).length(10),
  inspectorNotes: z.array(z.object({
    text: z.string().min(1),
    relatedClues: z.array(z.number().int()),
  })).length(2),
  closing: z.string().min(1),
  mysterySignature: z.string().min(1),
});

/** Broad answer-blind playability check; intentionally no candidate quotas. */
export const CreativeAuditSchema = z.object({
  earlyTheory: z.object({
    suspectId: z.string(),
    itemId: z.string(),
    locationId: z.string(),
    timeId: z.string(),
    confidence: z.enum(["low", "medium", "high"]),
  }),
  coherent: z.boolean(),
  playable: z.boolean(),
  solvable: z.boolean(),
  answerTooObviousEarly: z.boolean(),
  closingSupportedByClues: z.boolean(),
  feedback: z.array(z.string()),
});

export type Answer = z.infer<typeof AnswerSchema>;
export type CreativeMystery = z.infer<typeof CreativeMysterySchema>;
export type CreativeAudit = z.infer<typeof CreativeAuditSchema>;

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
