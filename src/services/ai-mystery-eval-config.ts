import {
  DEFAULT_AI_MYSTERY_MODEL,
  mysteryProviderRuntimeFromEnv,
  type MysteryProviderRuntime,
} from "./ai-mystery-provider";

const EVAL_PROVIDER_KEYS = new Set([
  "AI_MYSTERY_MODEL",
  "AI_MYSTERY_REASONING_EFFORT",
  "AI_GATEWAY_ID",
  "CLOUDFLARE_ACCOUNT_ID",
  "AI_GATEWAY_TOKEN",
  "ANTHROPIC_API_KEY",
]);

export type EvalProviderVars = Partial<Record<
  | "AI_MYSTERY_MODEL"
  | "AI_MYSTERY_REASONING_EFFORT"
  | "AI_GATEWAY_ID"
  | "CLOUDFLARE_ACCOUNT_ID"
  | "AI_GATEWAY_TOKEN"
  | "ANTHROPIC_API_KEY",
  string
>>;

export type EvalProviderConfig = {
  configuredModel: string;
  runtime: MysteryProviderRuntime;
  initialTransport: "cloudflare-rest" | "anthropic-direct";
};

/** Parse only evaluation-provider settings and never emit their values. */
export function parseEvalProviderVars(source: string): EvalProviderVars {
  const vars: EvalProviderVars = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^export\s+/, "");
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    if (!EVAL_PROVIDER_KEYS.has(key)) continue;
    vars[key as keyof EvalProviderVars] = unquote(line.slice(separator + 1).trim());
  }
  return vars;
}

export function resolveEvalProviderConfig(
  vars: EvalProviderVars,
  modelOverride?: string
): EvalProviderConfig {
  const configuredModel = nonEmptyString(modelOverride) ??
    nonEmptyString(vars.AI_MYSTERY_MODEL) ??
    DEFAULT_AI_MYSTERY_MODEL;
  const runtime = mysteryProviderRuntimeFromEnv({
    ...vars,
    AI_MYSTERY_MODEL: configuredModel,
  });
  const hasCloudflareTransport = Boolean(runtime.accountId && runtime.gatewayToken);
  const hasDirectAnthropic = Boolean(runtime.anthropicApiKey);

  if (!hasCloudflareTransport && configuredModel !== DEFAULT_AI_MYSTERY_MODEL) {
    throw new Error(
      `AI evaluation model ${configuredModel} requires Cloudflare account and gateway credentials.`
    );
  }
  if (!hasCloudflareTransport && !hasDirectAnthropic) {
    throw new Error(
      "AI evaluation requires Cloudflare account and gateway credentials or a direct Anthropic key."
    );
  }

  return {
    configuredModel,
    runtime,
    initialTransport: hasCloudflareTransport ? "cloudflare-rest" : "anthropic-direct",
  };
}

function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value.at(-1);
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
