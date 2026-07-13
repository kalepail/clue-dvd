import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod/v4";
import { callStructured } from "./ai-mystery-provider";
import { toToolInputSchema } from "./ai-mystery-schemas";

const OutputSchema = z.object({ value: z.string() });

function successResponse(value: unknown): Response {
  return new Response(JSON.stringify({
    content: [{ type: "tool_use", name: "submit_test", input: value }],
    stop_reason: "tool_use",
    usage: { input_tokens: 12, output_tokens: 4 },
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("structured Anthropic provider", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("parses forced tool output through the runtime schema", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => successResponse({ value: "valid" }));
    const result = await callStructured({
      apiKey: "test",
      stage: "renderer",
      system: "system",
      prompt: "prompt",
      toolName: "submit_test",
      toolDescription: "test",
      inputSchema: { type: "object" },
      outputSchema: OutputSchema,
      maxTokens: 100,
      fetchImpl,
    });
    expect(result.value).toEqual({ value: "valid" });
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 4 });
    const requestBody = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
    expect(requestBody.tools[0].strict).toBe(true);
  });

  it("retries a transient provider failure and then succeeds", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("busy", { status: 529 }))
      .mockResolvedValueOnce(successResponse({ value: "recovered" }));
    const pending = callStructured({
      apiKey: "test",
      stage: "architect",
      system: "system",
      prompt: "prompt",
      toolName: "submit_test",
      toolDescription: "test",
      inputSchema: { type: "object" },
      outputSchema: OutputSchema,
      maxTokens: 100,
      fetchImpl,
    });
    await vi.advanceTimersByTimeAsync(750);
    await expect(pending).resolves.toMatchObject({ value: { value: "recovered" } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("falls back to locally validated tool output when strict grammar compilation is refused", async () => {
    const grammarError = new Response(JSON.stringify({
      type: "error",
      error: { type: "invalid_request_error", message: "The compiled grammar is too large, which would cause performance issues." },
    }), { status: 400 });
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(grammarError)
      .mockResolvedValueOnce(successResponse({ value: "fallback-valid" }));

    const result = await callStructured({
      apiKey: "test",
      stage: "architect",
      system: "system",
      prompt: "prompt",
      toolName: "submit_test",
      toolDescription: "test",
      inputSchema: { type: "object" },
      outputSchema: OutputSchema,
      maxTokens: 100,
      fetchImpl,
    });

    expect(result.value).toEqual({ value: "fallback-valid" });
    expect(result.strictSchema).toBe(false);
    const firstBody = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
    const secondBody = JSON.parse(String(fetchImpl.mock.calls[1][1]?.body));
    expect(firstBody.tools[0].strict).toBe(true);
    expect(secondBody.tools[0].strict).toBe(false);
  });

  it("reports schema errors with the failed stage", async () => {
    const fetchImpl = vi.fn(async () => successResponse({ value: 42 }));
    await expect(callStructured({
      apiKey: "test",
      stage: "inspector",
      system: "system",
      prompt: "prompt",
      toolName: "submit_test",
      toolDescription: "test",
      inputSchema: { type: "object" },
      outputSchema: OutputSchema,
      maxTokens: 100,
      fetchImpl,
    })).rejects.toEqual(expect.objectContaining({
      stage: "inspector",
      name: "MysteryStageError",
      rawResponse: expect.stringContaining('"value": 42'),
    }));
  });

  it("removes unsupported constraints before strict grammar compilation", () => {
    const runtimeSchema = z.object({
      entries: z.array(z.object({ label: z.string().min(2), score: z.number().min(1).max(10) })).min(2).max(5),
    });
    const schema = toToolInputSchema(runtimeSchema);
    const serialized = JSON.stringify(schema);
    for (const keyword of ["minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems"]) {
      expect(serialized).not.toContain(`\"${keyword}\":`);
    }

    const visit = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      const object = value as Record<string, unknown>;
      if (object.type === "object") expect(object.additionalProperties).toBe(false);
      Object.values(object).forEach(visit);
    };
    visit(schema);
  });
});

describe("structured Cloudflare provider", () => {
  it("parses OpenAI-compatible tool calls from the REST transport", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      success: true,
      result: {
        choices: [{
          finish_reason: "tool_calls",
          message: {
            tool_calls: [{
              type: "function",
              function: { name: "submit_test", arguments: JSON.stringify({ value: "gateway" }) },
            }],
          },
        }],
        usage: { prompt_tokens: 21, completion_tokens: 7 },
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await callStructured({
      runtime: {
        model: "xai/grok-4.3",
        gatewayId: "default",
        accountId: "account",
        gatewayToken: "token",
      },
      stage: "renderer",
      system: "system",
      prompt: "prompt",
      toolName: "submit_test",
      toolDescription: "test",
      inputSchema: { type: "object" },
      outputSchema: OutputSchema,
      maxTokens: 100,
      fetchImpl,
    });

    expect(result).toMatchObject({
      value: { value: "gateway" },
      usage: { inputTokens: 21, outputTokens: 7 },
      model: "xai/grok-4.3",
      transport: "cloudflare-rest",
    });
    const request = fetchImpl.mock.calls[0];
    expect(String(request[0])).toContain("/accounts/account/ai/run");
    const requestBody = JSON.parse(String(request[1]?.body));
    expect(requestBody.model).toBe("xai/grok-4.3");
    expect(requestBody.input.tool_choice.function.name).toBe("submit_test");
  });

  it("parses direct Workers AI tool calls from the binding transport", async () => {
    const run = vi.fn(async () => ({
      tool_calls: [{ name: "submit_test", arguments: { value: "workers" } }],
      usage: { prompt_tokens: 13, completion_tokens: 5 },
    }));
    const result = await callStructured({
      runtime: {
        model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        gatewayId: "default",
        ai: { run },
      },
      stage: "architect",
      system: "system",
      prompt: "prompt",
      toolName: "submit_test",
      toolDescription: "test",
      inputSchema: { type: "object" },
      outputSchema: OutputSchema,
      maxTokens: 100,
    });

    expect(result).toMatchObject({
      value: { value: "workers" },
      transport: "cloudflare-binding",
    });
    expect(run).toHaveBeenCalledWith(
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      expect.objectContaining({ max_tokens: 100 }),
      expect.objectContaining({ gateway: expect.objectContaining({ id: "default" }) })
    );
  });

  it("uses Anthropic Messages tools for unified Claude models", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      success: true,
      result: {
        content: [{ type: "tool_use", name: "submit_test", input: { value: "claude" } }],
        stop_reason: "tool_use",
        usage: { input_tokens: 31, output_tokens: 8 },
      },
    }), { status: 200 }));
    const result = await callStructured({
      runtime: {
        model: "anthropic/claude-sonnet-5",
        gatewayId: "default",
        accountId: "account",
        gatewayToken: "token",
      },
      stage: "renderer",
      system: "system",
      prompt: "prompt",
      toolName: "submit_test",
      toolDescription: "test",
      inputSchema: { type: "object" },
      outputSchema: OutputSchema,
      maxTokens: 100,
      fetchImpl,
    });
    expect(result.value).toEqual({ value: "claude" });
    const body = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
    expect(body.input.tools[0].input_schema).toEqual({ type: "object" });
    expect(body.input.tool_choice).toEqual({ type: "tool", name: "submit_test" });
  });

  it("uses Responses tools for unified GPT models", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      success: true,
      result: {
        status: "completed",
        output: [{ type: "function_call", name: "submit_test", arguments: JSON.stringify({ value: "gpt" }) }],
        usage: { input_tokens: 24, output_tokens: 6 },
      },
    }), { status: 200 }));
    const result = await callStructured({
      runtime: {
        model: "openai/gpt-5.6-sol",
        gatewayId: "default",
        accountId: "account",
        gatewayToken: "token",
        reasoningEffort: "medium",
      },
      stage: "renderer",
      system: "system",
      prompt: "prompt",
      toolName: "submit_test",
      toolDescription: "test",
      inputSchema: { type: "object" },
      outputSchema: OutputSchema,
      maxTokens: 100,
      fetchImpl,
    });
    expect(result.value).toEqual({ value: "gpt" });
    const body = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
    expect(body.input.max_output_tokens).toBe(100);
    expect(body.input.reasoning).toEqual({ effort: "medium" });
    expect(body.input.tools[0]).toMatchObject({ type: "function", name: "submit_test", strict: true });
  });

  it("reports Responses token exhaustion from incomplete_details", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      result: {
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output: [],
      },
    }), { status: 200 }));
    await expect(callStructured({
      runtime: {
        model: "openai/gpt-5.6-terra",
        gatewayId: "default",
        accountId: "account",
        gatewayToken: "token",
      },
      stage: "renderer",
      system: "system",
      prompt: "prompt",
      toolName: "submit_test",
      toolDescription: "test",
      inputSchema: { type: "object" },
      outputSchema: OutputSchema,
      maxTokens: 100,
      fetchImpl,
    })).rejects.toMatchObject({
      stage: "renderer",
      message: expect.stringContaining("100-token output limit"),
    });
  });
});
