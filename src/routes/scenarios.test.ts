import { afterEach, describe, expect, it, vi } from "vitest";

const engineMocks = vi.hoisted(() => ({
  generateMysteryV2: vi.fn(),
}));

vi.mock("../services/ai-mystery-engine", async (importOriginal) => ({
  ...await importOriginal<typeof import("../services/ai-mystery-engine")>(),
  generateMysteryV2: engineMocks.generateMysteryV2,
}));

import scenarios, { applyMysteryPackage } from "./scenarios";
import { generateScenarioWithPlan } from "../services/scenario-generator";

const env = {} as CloudflareBindings;

describe("scenario V2 integration", () => {
  afterEach(() => {
    engineMocks.generateMysteryV2.mockReset();
  });

  it("preserves the synchronous scenario response for compatibility", async () => {
    const response = await scenarios.request("http://local.test/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ themeId: "DEV01", seed: 100 }),
    }, env);
    const result = await response.json() as { success: boolean; scenario: { clues: unknown[] } };
    expect(response.status).toBe(200);
    expect(result.success).toBe(true);
    expect(result.scenario.clues).toHaveLength(10);
  });

  it("streams progress and a final backward-compatible scenario", async () => {
    const response = await scenarios.request("http://local.test/generate-stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ themeId: "DEV01", seed: 101 }),
    }, env);
    const lines = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/x-ndjson");
    expect(lines[0]).toMatchObject({ type: "progress", stage: "complete", progress: 100 });
    expect(lines.at(-1)).toMatchObject({ type: "complete", success: true });
    expect(lines.at(-1).scenario.clues).toHaveLength(10);
  });

  it("removes AI elimination metadata and unrelated legacy events", () => {
    const { scenario } = generateScenarioWithPlan({ themeId: "DEV01", seed: 102 });
    const applied = applyMysteryPackage(scenario, {
      opening: "Mr. Boddy welcomed acquaintances for a county subscription gathering.",
      butlerClues: Array.from({ length: 10 }, (_, index) => `Story fragment ${index + 1}.`),
      inspectorNotes: [
        { id: "N1", text: "First factual note.", relatedClues: [2, 5] },
        { id: "N2", text: "Second factual note.", relatedClues: [4, 7] },
      ],
      closing: "The established evidence explains the theft.",
      mysterySignature: "occasion | motive | relationship | deception",
      cluePatternSignature: "witness-centric|story:3|openers:direct:8,greeting:2",
    });

    expect(applied.clues).toHaveLength(10);
    expect(applied.clues.every((clue) => !("eliminates" in clue))).toBe(true);
    expect(applied.dramaticEvents).toEqual([]);
    expect(applied.metadata).toMatchObject({
      engineVersion: "3.1-scene",
      mysterySignature: expect.any(String),
      cluePatternSignature: expect.stringContaining("witness-centric"),
    });
    expect(applied.inspectorNotes[0].relatedClues).toEqual([2, 5]);
  });

  it("wires Cloudflare runtime selection without dropping V3.1 clue-pattern history", async () => {
    engineMocks.generateMysteryV2.mockResolvedValue({
      opening: "Mr. Boddy welcomed acquaintances for a county subscription gathering.",
      butlerClues: Array.from({ length: 10 }, (_, index) => `Story fragment ${index + 1}.`),
      inspectorNotes: [
        { id: "N1", text: "First factual note.", relatedClues: [2, 5] },
        { id: "N2", text: "Second factual note.", relatedClues: [4, 7] },
      ],
      closing: "The established evidence explains the theft.",
      mysterySignature: "occasion | motive | relationship | deception",
      cluePatternSignature: "witness-centric|story:3|openers:direct:8,greeting:2",
    });
    const run = vi.fn(async () => ({}));
    const aiEnv = {
      AI: { run },
      AI_GATEWAY_ID: "production",
      ANTHROPIC_API_KEY: "fallback-key",
    } as unknown as CloudflareBindings;
    const recentMysterySignatures = Array.from({ length: 6 }, (_, index) => `mystery-${index}`);
    const recentCluePatternSignatures = Array.from({ length: 6 }, (_, index) => `pattern-${index}`);

    const response = await scenarios.request("http://local.test/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        themeId: "AI01",
        seed: 103,
        recentMysterySignatures,
        recentCluePatternSignatures,
      }),
    }, aiEnv);

    expect(response.status).toBe(200);
    expect(engineMocks.generateMysteryV2).toHaveBeenCalledOnce();
    const [runtime, params] = engineMocks.generateMysteryV2.mock.calls[0];
    expect(runtime).toMatchObject({
      model: "anthropic/claude-opus-4.8",
      gatewayId: "production",
      ai: { run },
      anthropicApiKey: "fallback-key",
    });
    expect(params.recentSignatures).toEqual(recentMysterySignatures.slice(0, 5));
    expect(params.recentCluePatternSignatures).toEqual(recentCluePatternSignatures.slice(0, 5));
  });
});
