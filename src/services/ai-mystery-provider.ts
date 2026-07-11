import type { z } from "zod/v4";

export const AI_MYSTERY_MODEL = "claude-sonnet-5";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 529]);

export type MysteryStage =
  | "architect"
  | "renderer"
  | "inspector"
  | "audit"
  | "revision";

export class MysteryStageError extends Error {
  constructor(
    public readonly stage: MysteryStage,
    message: string,
    public readonly status?: number,
    public readonly rawResponse?: string
  ) {
    super(`${stage}: ${message}`);
    this.name = "MysteryStageError";
  }
}

export type StructuredCallResult<T> = {
  value: T;
  raw: string;
  durationMs: number;
  usage?: { inputTokens?: number; outputTokens?: number };
  stopReason?: string;
  strictSchema?: boolean;
};

export async function callStructured<T>(params: {
  apiKey: string;
  stage: MysteryStage;
  system: string;
  prompt: string;
  toolName: string;
  toolDescription: string;
  inputSchema: Record<string, unknown>;
  outputSchema: z.ZodType<T>;
  maxTokens: number;
  allowNonStrictFallback?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<StructuredCallResult<T>> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const startedAt = Date.now();
  let lastError = "Unknown provider failure";
  let lastStatus: number | undefined;
  let strictSchema = true;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "x-api-key": params.apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: AI_MYSTERY_MODEL,
          max_tokens: params.maxTokens,
          system: params.system,
          messages: [{ role: "user", content: params.prompt }],
          tools: [{
            name: params.toolName,
            description: params.toolDescription,
            strict: strictSchema,
            input_schema: params.inputSchema,
          }],
          tool_choice: { type: "tool", name: params.toolName },
        }),
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Network request failed";
      if (attempt < 2) {
        await waitForRetry(attempt);
        continue;
      }
      throw new MysteryStageError(params.stage, lastError);
    }

    lastStatus = response.status;
    if (!response.ok) {
      lastError = await response.text();
      if (
        strictSchema &&
        params.allowNonStrictFallback !== false &&
        response.status === 400 &&
        /compiled grammar is too large|grammar.*performance issues/i.test(lastError) &&
        attempt < 2
      ) {
        strictSchema = false;
        continue;
      }
      if (RETRYABLE_STATUSES.has(response.status) && attempt < 2) {
        await waitForRetry(attempt);
        continue;
      }
      throw new MysteryStageError(
        params.stage,
        `Anthropic request failed during ${params.toolName} (${response.status}): ${lastError}`,
        response.status,
        lastError
      );
    }

    const data = await response.json() as {
      content?: Array<{ type?: string; name?: string; input?: unknown }>;
      stop_reason?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    if (data.stop_reason === "max_tokens") {
      throw new MysteryStageError(
        params.stage,
        `Model reached the ${params.maxTokens}-token output limit before completing ${params.toolName}.`,
        undefined,
        JSON.stringify(data, null, 2)
      );
    }
    if (data.stop_reason === "refusal") {
      throw new MysteryStageError(
        params.stage,
        `Model refused while producing ${params.toolName}.`,
        undefined,
        JSON.stringify(data, null, 2)
      );
    }

    const toolInput = data.content?.find(
      (content) => content.type === "tool_use" && content.name === params.toolName
    )?.input;

    if (toolInput === undefined) {
      throw new MysteryStageError(
        params.stage,
        `Model did not call ${params.toolName}.`,
        undefined,
        JSON.stringify(data, null, 2)
      );
    }

    const parsed = params.outputSchema.safeParse(toolInput);
    if (!parsed.success) {
      const issueText = parsed.error.issues
        .slice(0, 8)
        .map((issue) => `${issue.path.join(".") || "output"}: ${issue.message}`)
        .join("; ");
      throw new MysteryStageError(
        params.stage,
        `Structured output failed validation: ${issueText}`,
        undefined,
        JSON.stringify(toolInput, null, 2)
      );
    }

    return {
      value: parsed.data,
      raw: JSON.stringify(toolInput, null, 2),
      durationMs: Date.now() - startedAt,
      usage: {
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
      },
      stopReason: data.stop_reason,
      strictSchema,
    };
  }

  throw new MysteryStageError(params.stage, lastError, lastStatus);
}

function waitForRetry(attempt: number): Promise<void> {
  const delay = attempt === 0 ? 750 : 2000;
  return new Promise((resolve) => setTimeout(resolve, delay));
}
