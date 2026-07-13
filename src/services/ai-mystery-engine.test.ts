import { describe, expect, it, vi } from "vitest";
import { generateMysteryV2, getLastMysteryEngineDebug } from "./ai-mystery-engine";
import type { callStructured, StructuredCallResult } from "./ai-mystery-provider";
import type { MysterySetup } from "./ai-mystery-setup";
import { requireItem, requireLocation, requireSuspect, requireTime } from "./world-sim";

const setup: MysterySetup = {
  seed: 32,
  themeId: "AI01",
  difficulty: "expert",
  solution: { suspectId: "S05", itemId: "I07", locationId: "L07", timeId: "T09" },
};

const answerNames = {
  suspect: requireSuspect(setup.solution.suspectId).displayName,
  item: requireItem(setup.solution.itemId).nameUS,
  location: requireLocation(setup.solution.locationId).name,
  time: requireTime(setup.solution.timeId).name,
};

type ProviderParams = Parameters<typeof callStructured>[0];

/**
 * Mock provider that answers by tool name. The render response echoes each
 * story seed's licensed names so card-name discipline passes by construction;
 * individual tests override pieces to exercise the repair path.
 */
function buildMockProvider(overrides?: {
  breakClueNumber?: number;
  breakClosingOnce?: boolean;
}): { provider: typeof callStructured; calls: ProviderParams[] } {
  const calls: ProviderParams[] = [];
  let closingAttempts = 0;
  const provider = vi.fn(async (params: ProviderParams): Promise<StructuredCallResult<unknown>> => {
    calls.push(params);
    const debug = getLastMysteryEngineDebug();
    const seeds = debug?.storySeeds ?? [];
    let value: unknown;
    if (params.toolName === "submit_case_dossier") {
      value = {
        title: "The Subscription Affair",
        occasionName: "the memorial subscription luncheon",
        occasionSummary: "Mr. Boddy has gathered his acquaintances to settle a village memorial subscription. The mood is generous but watchful.",
        hostReason: "He hopes the fund will be settled without quarrel.",
        mysterySignature: "memorial subscription | old debts | garden weather",
        occasionTexture: {
          groupActivities: ["sorting pledge cards", "comparing the subscription lists"],
          transitionRemarks: ["I ought to fetch the committee papers", "I must check a promised donation"],
          gatheringDetails: ["reading out the newest pledges"],
          inspectionContexts: ["collecting discarded subscription forms"],
          observationContexts: ["putting the pledge cards back in order"],
          uncertainObservations: ["someone folding a pledge sheet and slipping away from the committee"],
        },
      };
    } else if (params.toolName === "submit_rendered_mystery") {
      const clueTexts = seeds
        .filter((seed) => seed.deliverAs === "butler")
        .sort((a, b) => (a.clueNumber ?? 0) - (b.clueNumber ?? 0))
        .map((seed) =>
          seed.clueNumber === overrides?.breakClueNumber
            ? `I distinctly remember the ${answerNames.item} beside the ${answerNames.location} at ${answerNames.time}.`
            : `Hello -- I recall that ${seed.allowedNames.slice(0, 3).join(" and ") || "the household"} figured in the day's little events.`
        );
      const noteFor = (slot: "note1" | "note2"): string => {
        const seed = seeds.find((candidate) => candidate.deliverAs === slot);
        return `${seed?.allowedNames.slice(0, 2).join(" and ") || "The household"} appears in the case file.`;
      };
      value = {
        opening: "Mr. Boddy welcomed his guests for the memorial subscription, and the day passed pleasantly until something was found to be missing.",
        clues: clueTexts,
        note1: noteFor("note1"),
        note2: noteFor("note2"),
      };
    } else if (params.toolName === "submit_case_closing") {
      closingAttempts += 1;
      value = overrides?.breakClosingOnce && closingAttempts === 1
        ? { closing: "Someone took something. Well done." }
        : {
            closing: `Fine work, detectives: ${answerNames.suspect} took the ${answerNames.item} from the ${answerNames.location} at ${answerNames.time}, just as the evidence showed.`,
          };
    } else if (params.toolName === "submit_repaired_text") {
      value = { text: "Hello -- the household went about its day quite ordinarily, nothing amiss that I saw myself." };
    } else {
      throw new Error(`Unexpected tool ${params.toolName}`);
    }
    return {
      value,
      raw: JSON.stringify(value),
      durationMs: 1,
      usage: { inputTokens: 10, outputTokens: 10 },
      stopReason: "tool_use",
      strictSchema: true,
    };
  });
  return { provider: provider as unknown as typeof callStructured, calls };
}

describe("world-first AI mystery engine V3", () => {
  it("produces a complete package in three model calls on the happy path", async () => {
    const { provider, calls } = buildMockProvider();
    const progress: string[] = [];
    const result = await generateMysteryV2("test-key", {
      setup,
      provider,
      onProgress: (event) => { progress.push(event.stage); },
    });

    expect(calls).toHaveLength(3);
    expect(calls.map((call) => call.toolName)).toEqual([
      "submit_case_dossier",
      "submit_rendered_mystery",
      "submit_case_closing",
    ]);
    expect(result.butlerClues).toHaveLength(10);
    expect(result.inspectorNotes).toHaveLength(2);
    expect(result.inspectorNotes[0].relatedClues.length).toBeGreaterThan(0);
    expect(result.mysterySignature).toContain("memorial subscription");
    expect(result.closing).toContain(answerNames.suspect);
    expect(progress.at(-1)).toBe("complete");
  });

  it("keeps the dossier and render prompts answer-blind", async () => {
    const { provider } = buildMockProvider();
    await generateMysteryV2("test-key", { setup, provider });
    const debug = getLastMysteryEngineDebug()!;

    for (const stage of [debug.dossier!, debug.render!]) {
      const text = `${stage.system}\n${stage.prompt}`;
      expect(text).not.toContain("WHO:");
      expect(text).not.toContain(setup.solution.suspectId);
      expect(text).not.toContain(setup.solution.itemId);
      expect(text).not.toMatch(/eliminat/i);
      expect(text).not.toMatch(/solution|answer card/i);
    }
    // The closing is the only answer-aware prose stage.
    const closingText = debug.closing!.prompt;
    expect(closingText).toContain(answerNames.suspect);
    expect(closingText).toContain(answerNames.item);
  });

  it("promotes the dossier occasion palette into factual clue briefs without another model call", async () => {
    const { provider, calls } = buildMockProvider();
    await generateMysteryV2("test-key", { setup, provider });
    const debug = getLastMysteryEngineDebug()!;

    expect(calls.map((call) => call.toolName)).toEqual([
      "submit_case_dossier",
      "submit_rendered_mystery",
      "submit_case_closing",
    ]);
    expect(debug.world!.occasionTexture?.groupActivities).toContain("sorting pledge cards");
    expect(debug.storySeeds!.some((seed) => /pledge|subscription/i.test(seed.brief))).toBe(true);
  });

  it("builds and audits the clue package before any model call without category targets", async () => {
    const { provider } = buildMockProvider();
    await generateMysteryV2("test-key", { setup, provider });
    const debug = getLastMysteryEngineDebug()!;
    const trajectory = debug.schedule!.trajectory;

    expect(trajectory).toHaveLength(12);
    expect(debug.schedule!.worldAttempts).toBe(1);
    let previous = 12_100;
    for (const point of trajectory) {
      expect(point.remainingSolutions).toBeLessThanOrEqual(previous);
      expect(point.remainingSolutions).toBeGreaterThan(1);
      previous = point.remainingSolutions;
    }
  });

  it("repairs a single clue that breaks card-name discipline", async () => {
    const { provider, calls } = buildMockProvider({ breakClueNumber: 2 });
    const result = await generateMysteryV2("test-key", { setup, provider });

    const repairCalls = calls.filter((call) => call.toolName === "submit_repaired_text");
    expect(repairCalls.length).toBeGreaterThanOrEqual(1);
    expect(result.butlerClues[1]).toContain("nothing amiss");
    const debug = getLastMysteryEngineDebug()!;
    expect(debug.repairs!.some((repair) => repair.target === "clue-2")).toBe(true);
    // Only the broken clue was re-rendered — everything else is untouched.
    expect(result.butlerClues[0]).toContain("Hello --");
  });

  it("retries the closing when it fails to name the full solution", async () => {
    const { provider, calls } = buildMockProvider({ breakClosingOnce: true });
    const result = await generateMysteryV2("test-key", { setup, provider });

    const closingCalls = calls.filter((call) => call.toolName === "submit_case_closing");
    expect(closingCalls.length).toBe(2);
    expect(result.closing).toContain(answerNames.location);
  });

  it("is deterministic: same seed, same schedule and story seeds", async () => {
    const first = buildMockProvider();
    await generateMysteryV2("test-key", { setup, provider: first.provider });
    const firstSeeds = getLastMysteryEngineDebug()!.storySeeds!.map((seed) => seed.brief);

    const second = buildMockProvider();
    await generateMysteryV2("test-key", { setup, provider: second.provider });
    const secondSeeds = getLastMysteryEngineDebug()!.storySeeds!.map((seed) => seed.brief);

    expect(secondSeeds).toEqual(firstSeeds);
  });
});
