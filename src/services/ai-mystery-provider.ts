import type { z } from "zod/v4";

export const DEFAULT_AI_MYSTERY_MODEL = "xai/grok-4.3";
export const AI_MYSTERY_MODEL = DEFAULT_AI_MYSTERY_MODEL;

export const AI_MYSTERY_AB_MODELS = [
  "anthropic/claude-opus-4.8",
  "anthropic/claude-sonnet-5",
  "openai/gpt-5.6-luna",
  "openai/gpt-5.6-terra",
  "openai/gpt-5.6-sol",
  "openai/gpt-5.4",
  "xai/grok-4.3",
  "@cf/openai/gpt-oss-120b",
  "@cf/moonshotai/kimi-k2.6",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/qwen/qwen3-30b-a3b-fp8",
] as const;

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 529]);

export type MysteryStage =
  | "architect"
  | "renderer"
  | "inspector"
  | "audit"
  | "revision";

export type MysteryReasoningEffort = "none" | "low" | "medium" | "high";

type CloudflareAiBinding = {
  run: (
    model: string,
    input: Record<string, unknown>,
    options?: Record<string, unknown>
  ) => Promise<unknown>;
};

export type MysteryProviderRuntime = {
  model: string;
  gatewayId: string;
  reasoningEffort?: MysteryReasoningEffort;
  ai?: CloudflareAiBinding;
  accountId?: string;
  gatewayToken?: string;
};

export function mysteryProviderRuntimeFromEnv(env: Record<string, unknown>): MysteryProviderRuntime {
  const model = nonEmptyString(env.AI_MYSTERY_MODEL) ?? DEFAULT_AI_MYSTERY_MODEL;
  return {
    model,
    gatewayId: nonEmptyString(env.AI_GATEWAY_ID) ?? "default",
    reasoningEffort: configuredReasoningEffort(env.AI_MYSTERY_REASONING_EFFORT),
    ai: isAiBinding(env.AI) ? env.AI : undefined,
    accountId: nonEmptyString(env.CLOUDFLARE_ACCOUNT_ID),
    gatewayToken: nonEmptyString(env.AI_GATEWAY_TOKEN),
  };
}

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
  model?: string;
  transport?: "anthropic-direct" | "cloudflare-binding" | "cloudflare-rest";
};

type StructuredCallParams<T> = {
  apiKey?: string;
  runtime?: MysteryProviderRuntime;
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
};

export async function callStructured<T>(params: StructuredCallParams<T>): Promise<StructuredCallResult<T>> {
  if (params.runtime) return callCloudflareStructured(params as StructuredCallParams<T> & { runtime: MysteryProviderRuntime });
  if (params.apiKey) return callAnthropicStructured(params as StructuredCallParams<T> & { apiKey: string });
  throw new MysteryStageError(params.stage, "No AI provider credentials or Cloudflare runtime were configured.");
}

async function callAnthropicStructured<T>(
  params: StructuredCallParams<T> & { apiKey: string }
): Promise<StructuredCallResult<T>> {
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
          model: "claude-sonnet-5",
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
      lastError = errorText(error);
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
      throw tokenLimitError(params, data);
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

    return validateStructuredResult(params, {
      toolInput,
      rawEnvelope: data,
      startedAt,
      usage: {
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
      },
      stopReason: data.stop_reason,
      strictSchema,
      model: "claude-sonnet-5",
      transport: "anthropic-direct",
    });
  }

  throw new MysteryStageError(params.stage, lastError, lastStatus);
}

async function callCloudflareStructured<T>(
  params: StructuredCallParams<T> & { runtime: MysteryProviderRuntime }
): Promise<StructuredCallResult<T>> {
  const startedAt = Date.now();
  let lastError = "Unknown Cloudflare AI failure";
  let lastStatus: number | undefined;

  const input = cloudflareInput(params);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let envelope: unknown;
    let transport: StructuredCallResult<T>["transport"];
    try {
      if (params.runtime.ai) {
        try {
          envelope = await params.runtime.ai.run(params.runtime.model, input, {
            gateway: {
              id: params.runtime.gatewayId,
              metadata: { stage: params.stage, tool: params.toolName, suite: "clue-dvd" },
              collectLog: true,
            },
          });
          transport = "cloudflare-binding";
        } catch (bindingError) {
          if (!hasCloudflareRestCredentials(params.runtime)) throw bindingError;
          const rest = await callCloudflareRest(params, input);
          envelope = rest.envelope;
          lastStatus = rest.status;
          transport = "cloudflare-rest";
        }
      } else {
        const rest = await callCloudflareRest(params, input);
        envelope = rest.envelope;
        lastStatus = rest.status;
        transport = "cloudflare-rest";
      }
    } catch (error) {
      const status = error instanceof CloudflareHttpError ? error.status : undefined;
      lastStatus = status;
      lastError = errorText(error);
      if ((status === undefined || RETRYABLE_STATUSES.has(status)) && attempt < 2) {
        await waitForRetry(attempt);
        continue;
      }
      throw new MysteryStageError(params.stage, lastError, status, rawError(error));
    }

    const normalized = unwrapCloudflareEnvelope(envelope);
    const stopReason = cloudflareStopReason(normalized);
    if (stopReason === "length" || stopReason === "max_tokens" || stopReason === "max_output_tokens") {
      throw tokenLimitError(params, normalized);
    }
    const toolInput = cloudflareToolInput(normalized, params.toolName);
    return validateStructuredResult(params, {
      toolInput,
      rawEnvelope: normalized,
      startedAt,
      usage: cloudflareUsage(normalized),
      stopReason,
      strictSchema: true,
      model: params.runtime.model,
      transport,
    });
  }

  throw new MysteryStageError(params.stage, lastError, lastStatus);
}

function cloudflareInput<T>(
  params: StructuredCallParams<T> & { runtime: MysteryProviderRuntime }
): Record<string, unknown> {
  if (params.runtime.model.startsWith("anthropic/")) {
    return {
      max_tokens: params.maxTokens,
      system: params.system,
      messages: [{ role: "user", content: params.prompt }],
      tools: [{
        name: params.toolName,
        description: params.toolDescription,
        input_schema: params.inputSchema,
      }],
      tool_choice: { type: "tool", name: params.toolName },
    };
  }

  if (params.runtime.model.startsWith("openai/")) {
    const reasoning = params.runtime.reasoningEffort && params.runtime.reasoningEffort !== "none"
      ? { effort: params.runtime.reasoningEffort }
      : undefined;
    return {
      instructions: params.system,
      input: params.prompt,
      max_output_tokens: params.maxTokens,
      tools: [{
        type: "function",
        name: params.toolName,
        description: params.toolDescription,
        parameters: params.inputSchema,
        strict: true,
      }],
      tool_choice: { type: "function", name: params.toolName },
      ...(reasoning ? { reasoning } : {}),
    };
  }

  return {
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.prompt },
    ],
    tools: [{
      type: "function",
      function: {
        name: params.toolName,
        description: params.toolDescription,
        parameters: params.inputSchema,
      },
    }],
    tool_choice: { type: "function", function: { name: params.toolName } },
    max_tokens: params.maxTokens,
    ...(params.runtime.reasoningEffort ? { reasoning_effort: params.runtime.reasoningEffort } : {}),
  };
}

class CloudflareHttpError extends Error {
  constructor(public readonly status: number, public readonly body: string) {
    super(`Cloudflare AI request failed (${status}): ${body}`);
  }
}

async function callCloudflareRest<T>(
  params: StructuredCallParams<T> & { runtime: MysteryProviderRuntime },
  input: Record<string, unknown>
): Promise<{ envelope: unknown; status: number }> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `https://api.cloudflare.com/client/v4/accounts/${params.runtime.accountId}/ai/run`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.runtime.gatewayToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: params.runtime.model,
        input,
        options: {
          gateway: {
            id: params.runtime.gatewayId,
            metadata: { stage: params.stage, tool: params.toolName, suite: "clue-dvd" },
            collectLog: true,
          },
        },
      }),
    }
  );
  const text = await response.text();
  if (!response.ok) throw new CloudflareHttpError(response.status, text.slice(0, 2_000));
  try {
    return { envelope: JSON.parse(text), status: response.status };
  } catch {
    throw new CloudflareHttpError(response.status, `Non-JSON response: ${text.slice(0, 500)}`);
  }
}

function validateStructuredResult<T>(
  params: StructuredCallParams<T>,
  result: {
    toolInput: unknown;
    rawEnvelope: unknown;
    startedAt: number;
    usage?: StructuredCallResult<T>["usage"];
    stopReason?: string;
    strictSchema: boolean;
    model: string;
    transport: StructuredCallResult<T>["transport"];
  }
): StructuredCallResult<T> {
  if (result.toolInput === undefined) {
    throw new MysteryStageError(
      params.stage,
      `Model did not call ${params.toolName}.`,
      undefined,
      JSON.stringify(result.rawEnvelope, null, 2)
    );
  }
  const parsed = params.outputSchema.safeParse(result.toolInput);
  if (!parsed.success) {
    const issueText = parsed.error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.join(".") || "output"}: ${issue.message}`)
      .join("; ");
    throw new MysteryStageError(
      params.stage,
      `Structured output failed validation: ${issueText}`,
      undefined,
      JSON.stringify(result.toolInput, null, 2)
    );
  }
  return {
    value: parsed.data,
    raw: JSON.stringify(result.toolInput, null, 2),
    durationMs: Date.now() - result.startedAt,
    usage: result.usage,
    stopReason: result.stopReason,
    strictSchema: result.strictSchema,
    model: result.model,
    transport: result.transport,
  };
}

function unwrapCloudflareEnvelope(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") throw new Error("Cloudflare AI returned a non-object response.");
  const object = value as Record<string, unknown>;
  if (object.success === false) {
    throw new Error(`Cloudflare AI returned an error: ${JSON.stringify(object.errors ?? object)}`);
  }
  return object.result && typeof object.result === "object"
    ? object.result as Record<string, unknown>
    : object;
}

function cloudflareToolInput(value: Record<string, unknown>, toolName: string): unknown {
  const anthropicContent = Array.isArray(value.content) ? value.content : [];
  for (const candidate of anthropicContent) {
    if (!candidate || typeof candidate !== "object") continue;
    const block = candidate as Record<string, unknown>;
    if (block.type === "tool_use" && block.name === toolName) return block.input;
  }

  const responsesOutput = Array.isArray(value.output) ? value.output : [];
  for (const candidate of responsesOutput) {
    if (!candidate || typeof candidate !== "object") continue;
    const item = candidate as Record<string, unknown>;
    if (item.type === "function_call" && item.name === toolName) return parseToolArguments(item.arguments);
  }

  const directCalls = Array.isArray(value.tool_calls) ? value.tool_calls : [];
  const choices = Array.isArray(value.choices) ? value.choices : [];
  const firstChoice = choices[0] && typeof choices[0] === "object" ? choices[0] as Record<string, unknown> : undefined;
  const message = firstChoice?.message && typeof firstChoice.message === "object"
    ? firstChoice.message as Record<string, unknown>
    : undefined;
  const choiceCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  for (const candidate of [...directCalls, ...choiceCalls]) {
    if (!candidate || typeof candidate !== "object") continue;
    const call = candidate as Record<string, unknown>;
    const fn = call.function && typeof call.function === "object"
      ? call.function as Record<string, unknown>
      : call;
    if (fn.name !== toolName) continue;
    return parseToolArguments(fn.arguments);
  }
  return undefined;
}

function parseToolArguments(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function cloudflareStopReason(value: Record<string, unknown>): string | undefined {
  const choices = Array.isArray(value.choices) ? value.choices : [];
  const firstChoice = choices[0] && typeof choices[0] === "object" ? choices[0] as Record<string, unknown> : undefined;
  const incomplete = value.incomplete_details && typeof value.incomplete_details === "object"
    ? value.incomplete_details as Record<string, unknown>
    : undefined;
  return typeof firstChoice?.finish_reason === "string"
    ? firstChoice.finish_reason
    : typeof value.stop_reason === "string"
      ? value.stop_reason
      : value.status === "incomplete" && typeof incomplete?.reason === "string"
        ? incomplete.reason
        : typeof value.status === "string"
          ? value.status
      : undefined;
}

function cloudflareUsage(value: Record<string, unknown>): StructuredCallResult<unknown>["usage"] {
  const usage = value.usage && typeof value.usage === "object" ? value.usage as Record<string, unknown> : undefined;
  if (!usage) return undefined;
  return {
    inputTokens: numberValue(usage.prompt_tokens) ?? numberValue(usage.input_tokens),
    outputTokens: numberValue(usage.completion_tokens) ?? numberValue(usage.output_tokens),
  };
}

function tokenLimitError<T>(params: StructuredCallParams<T>, data: unknown): MysteryStageError {
  return new MysteryStageError(
    params.stage,
    `Model reached the ${params.maxTokens}-token output limit before completing ${params.toolName}.`,
    undefined,
    JSON.stringify(data, null, 2)
  );
}

function hasCloudflareRestCredentials(runtime: MysteryProviderRuntime): boolean {
  return Boolean(runtime.accountId && runtime.gatewayToken);
}

function isAiBinding(value: unknown): value is CloudflareAiBinding {
  return Boolean(value && typeof value === "object" && typeof (value as CloudflareAiBinding).run === "function");
}

function configuredReasoningEffort(value: unknown): MysteryReasoningEffort | undefined {
  const effort = nonEmptyString(value);
  return effort === "none" || effort === "low" || effort === "medium" || effort === "high" ? effort : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function rawError(error: unknown): string | undefined {
  return error instanceof CloudflareHttpError ? error.body : undefined;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Network request failed";
}

function waitForRetry(attempt: number): Promise<void> {
  const delay = attempt === 0 ? 750 : 2000;
  return new Promise((resolve) => setTimeout(resolve, delay));
}
