import { describe, expect, it } from "vitest";
import scenarios, { applyMysteryPackage } from "./scenarios";
import { generateScenarioWithPlan } from "../services/scenario-generator";

const env = {} as CloudflareBindings;

describe("scenario V2 integration", () => {
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
    const evidence = (factId: string) => ({
      factId,
      kind: "thread_color" as const,
      role: "context" as const,
      statement: "Background context; it has no formal deduction effect.",
      suspectIds: [], itemIds: [], locationIds: [], timeIds: [],
    });
    const applied = applyMysteryPackage(scenario, {
      opening: "Mr. Boddy welcomed acquaintances for a county subscription gathering.",
      butlerClues: Array.from({ length: 10 }, (_, index) => `Story fragment ${index + 1}.`),
      butlerEvidence: Array.from({ length: 10 }, (_, index) => evidence(`F${index + 1}`)),
      inspectorNotes: [
        { id: "N1", role: "cross_index", text: "First factual note.", relatedClues: [2, 5], evidence: evidence("N1") },
        { id: "N2", role: "late_discriminator", text: "Second factual note.", relatedClues: [4, 7], evidence: evidence("N2") },
      ],
      closing: "The established evidence explains the theft.",
      mysterySignature: "occasion | motive | relationship | deception",
    });

    expect(applied.clues).toHaveLength(10);
    expect(applied.clues.every((clue) => !("eliminates" in clue))).toBe(true);
    expect(applied.dramaticEvents).toEqual([]);
    expect(applied.metadata).toMatchObject({ engineVersion: "3.0-world", mysterySignature: expect.any(String) });
    expect(applied.inspectorNotes[0].relatedClues).toEqual([2, 5]);
  });
});
