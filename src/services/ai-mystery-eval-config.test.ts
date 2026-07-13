import { describe, expect, it, vi } from "vitest";
import { DEFAULT_AI_MYSTERY_MODEL } from "./ai-mystery-provider";
import { parseEvalProviderVars, resolveEvalProviderConfig } from "./ai-mystery-eval-config";

describe("AI mystery evaluation provider configuration", () => {
  it("parses only supported provider variables without logging values", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const vars = parseEvalProviderVars(`
      # local configuration
      AI_MYSTERY_MODEL=openai/gpt-5.4
      AI_GATEWAY_ID="eval-gateway"
      CLOUDFLARE_ACCOUNT_ID=account-id
      AI_GATEWAY_TOKEN=secret-token
      ANTHROPIC_API_KEY='fallback-key'
      ELEVENLABS_API_KEY=ignored-secret
    `);

    expect(vars).toEqual({
      AI_MYSTERY_MODEL: "openai/gpt-5.4",
      AI_GATEWAY_ID: "eval-gateway",
      CLOUDFLARE_ACCOUNT_ID: "account-id",
      AI_GATEWAY_TOKEN: "secret-token",
      ANTHROPIC_API_KEY: "fallback-key",
    });
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("prefers the CLI model over the file model", () => {
    const config = resolveEvalProviderConfig({
      AI_MYSTERY_MODEL: "openai/gpt-5.4",
      CLOUDFLARE_ACCOUNT_ID: "account-id",
      AI_GATEWAY_TOKEN: "gateway-token",
    }, "xai/grok-4.3");

    expect(config.configuredModel).toBe("xai/grok-4.3");
    expect(config.runtime.model).toBe("xai/grok-4.3");
    expect(config.initialTransport).toBe("cloudflare-rest");
  });

  it("uses the file model when the CLI does not override it", () => {
    const config = resolveEvalProviderConfig({
      AI_MYSTERY_MODEL: "anthropic/claude-sonnet-5",
      CLOUDFLARE_ACCOUNT_ID: "account-id",
      AI_GATEWAY_TOKEN: "gateway-token",
    });

    expect(config.configuredModel).toBe("anthropic/claude-sonnet-5");
  });

  it("uses the gateway Opus default and builds the full runtime", () => {
    const config = resolveEvalProviderConfig({
      AI_GATEWAY_ID: "evaluation",
      CLOUDFLARE_ACCOUNT_ID: "account-id",
      AI_GATEWAY_TOKEN: "gateway-token",
      ANTHROPIC_API_KEY: "fallback-key",
      AI_MYSTERY_REASONING_EFFORT: "medium",
    });

    expect(config.configuredModel).toBe(DEFAULT_AI_MYSTERY_MODEL);
    expect(config.runtime).toEqual({
      model: DEFAULT_AI_MYSTERY_MODEL,
      gatewayId: "evaluation",
      reasoningEffort: "medium",
      ai: undefined,
      accountId: "account-id",
      gatewayToken: "gateway-token",
      anthropicApiKey: "fallback-key",
    });
  });

  it("retains direct-only Anthropic compatibility for the default model", () => {
    const config = resolveEvalProviderConfig({ ANTHROPIC_API_KEY: "direct-key" });

    expect(config.configuredModel).toBe(DEFAULT_AI_MYSTERY_MODEL);
    expect(config.initialTransport).toBe("anthropic-direct");
    expect(config.runtime.anthropicApiKey).toBe("direct-key");
  });

  it("rejects an A/B model without a Cloudflare transport without exposing secrets", () => {
    const token = "must-not-appear";
    expect(() => resolveEvalProviderConfig({
      AI_MYSTERY_MODEL: "openai/gpt-5.4",
      ANTHROPIC_API_KEY: token,
    })).toThrowError(expect.objectContaining({
      message: expect.not.stringContaining(token),
    }));
  });
});
