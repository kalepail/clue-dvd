import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod/v4";
import { callStructured } from "./ai-mystery-provider";

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
    const fetchImpl = vi.fn(async () => successResponse({ value: "valid" }));
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
});
