import { describe, expect, it, vi } from "vitest";
import { generateMysteryV2, getLastMysteryEngineDebug } from "./ai-mystery-engine";
import type { callStructured, StructuredCallResult } from "./ai-mystery-provider";
import type { MysterySetup } from "./ai-mystery-setup";
import { requireItem, requireLocation, requireSuspect, requireTime } from "./world-sim";

const setup: MysterySetup = {
  // A known fast valid world keeps orchestration tests focused on provider,
  // prompt, repair, and determinism behavior. The separate 120-seed scheduler
  // suite owns rare-search coverage up to the full production budget.
  seed: 1,
  themeId: "AI01",
  difficulty: "expert",
  solution: { suspectId: "S10", itemId: "I11", locationId: "L03", timeId: "T04" },
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
  let repairAttempts = 0;
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
          gatheringDetails: ["reading out the newest pledges"],
          inspectionContexts: ["collecting discarded subscription forms"],
          observationContexts: ["putting the pledge cards back in order"],
        },
      };
    } else if (params.toolName === "submit_rendered_mystery") {
      const neutralClues = [
        "Ashe recalled one early household exchange clearly.",
        "Separate arrangements occupied another passage in the day's account.",
        "Before luncheon, several ordinary preparations occupied the company.",
        "While passing, I noticed a brief conversation continue without interruption.",
        "Near the windows, the occasion's decorations drew quiet attention.",
        "Later, another part of the programme proceeded exactly as remembered.",
        "According to Ashe, one uncertain statement entered the written record.",
        "Records from the household preserved a distinct observation.",
        "By dusk, the remaining arrangements had settled into order.",
        "Nobody doubted the final account as it was first given.",
      ];
      const wholeScopeClosures = [
        "Every guest, Mrs. White, and Rusty were covered by that observation.",
        "The entire household, including Mrs. White and Rusty, remained within its scope.",
        "Everyone in the mansion, Mrs. White and Rusty included, was accounted for there.",
        "The whole company, with Mrs. White and Rusty, belonged to that same recollection.",
        "Every single person, including Mrs. White and Rusty, was present for it.",
        "All the guests, as well as Mrs. White and Rusty, came within that account.",
        "The whole house, Mrs. White and Rusty included, was represented in the observation.",
        "Every soul there, including Mrs. White and Rusty, was covered by what Ashe saw.",
        "The entire party, Mrs. White and Rusty among them, remained part of that scene.",
        "Every guest plus Mrs. White and Rusty was included in the remembered company.",
      ];
      const clueTexts = seeds
        .filter((seed) => seed.deliverAs === "butler")
        .sort((a, b) => (a.clueNumber ?? 0) - (b.clueNumber ?? 0))
        .map((seed) => {
          if (seed.clueNumber === overrides?.breakClueNumber) {
            return `I distinctly remember the ${answerNames.item} beside the ${answerNames.location} at ${answerNames.time}.`;
          }
          const neutral = neutralClues[(seed.clueNumber ?? 1) - 1];
          return seed.scopeMode === "whole_household"
            ? `${neutral} ${wholeScopeClosures[(seed.clueNumber ?? 1) - 1]}`
            : neutral;
        });
      const noteFor = (slot: "note1" | "note2"): string => {
        const seed = seeds.find((candidate) => candidate.deliverAs === slot);
        return `${seed?.allowedNames.slice(0, 2).join(" and ") || "The household"} appears in the case file.`;
      };
      value = {
        opening: "Mr. Boddy welcomed his guests for the memorial subscription, with speeches, pledge cards, and a formal supper planned for the company.",
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
      const repairs = [
        "Reframed carefully, nothing amiss appeared in that small part of the household's day.",
        "Looking back, the recollection showed nothing amiss and added no further certainty.",
        "On reflection, the ordinary scene revealed nothing amiss to anyone then present.",
        "Set down plainly, that passage contained nothing amiss beyond the stated observation.",
        "Reviewing it once more, I found nothing amiss in the account as corrected.",
      ];
      value = { text: repairs[repairAttempts % repairs.length] };
      repairAttempts += 1;
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
    expect(result.cluePatternSignature).toContain("openers:");
    expect(result.closing).toContain(answerNames.suspect);
    expect(progress.at(-1)).toBe("complete");
  });

  it("passes a Cloudflare runtime through every V3.1 model call", async () => {
    const { provider, calls } = buildMockProvider();
    const runtime = {
      model: "anthropic/claude-opus-4.8",
      gatewayId: "default",
      ai: { run: vi.fn(async () => ({})) },
      anthropicApiKey: "fallback-key",
    };
    await generateMysteryV2(runtime, {
      setup,
      provider,
      recentCluePatternSignatures: ["pattern-one", "pattern-two"],
    });

    expect(calls).toHaveLength(3);
    expect(calls.every((call) => call.runtime === runtime)).toBe(true);
    expect(calls.every((call) => call.apiKey === undefined)).toBe(true);
    expect(getLastMysteryEngineDebug()?.setup.recentCluePatternSignatures)
      .toEqual(["pattern-one", "pattern-two"]);
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

  it("builds factual clue briefs from the authored spine before the dossier call", async () => {
    const { provider, calls } = buildMockProvider();
    await generateMysteryV2("test-key", { setup, provider });
    const debug = getLastMysteryEngineDebug()!;

    expect(calls.map((call) => call.toolName)).toEqual([
      "submit_case_dossier",
      "submit_rendered_mystery",
      "submit_case_closing",
    ]);
    expect(debug.world!.occasionTexture?.inspectionContexts).toContain("collecting discarded subscription forms");
    const spinePhrases = [
      debug.setup.occasionSpine.mainEvent,
      ...debug.setup.occasionSpine.groupActivities,
      ...debug.setup.occasionSpine.setDressing,
      ...debug.setup.occasionSpine.beats.map((beat) => beat.name),
    ];
    expect(debug.storySeeds!.some((seed) => spinePhrases.some((phrase) => seed.brief.includes(phrase)))).toBe(true);
    expect(debug.dossier!.prompt).toContain(debug.setup.occasionSpine.mainEvent);
  });

  it("builds and audits the story-first package before any model call", async () => {
    const { provider } = buildMockProvider();
    await generateMysteryV2("test-key", { setup, provider });
    const debug = getLastMysteryEngineDebug()!;
    const trajectory = debug.schedule!.trajectory;

    expect(trajectory).toHaveLength(12);
    expect(debug.schedule!.worldAttempts).toBeGreaterThanOrEqual(1);
    expect(debug.schedule!.worldAttempts).toBeLessThanOrEqual(240);
    expect(debug.schedule!.skeletonFactIds.length).toBeGreaterThanOrEqual(3);
    expect(debug.schedule!.structuralPatternSignature).toContain(debug.schedule!.storyRecipe);
    let previous = 12_100;
    for (const point of trajectory) {
      expect(point.remainingSolutions).toBeLessThanOrEqual(previous);
      expect(point.remainingSolutions).toBeGreaterThan(1);
      previous = point.remainingSolutions;
    }
  });

  it("preserves continuing-scene context without duplicating a fused scene", async () => {
    const { provider } = buildMockProvider();
    await generateMysteryV2("test-key", { setup, provider });
    const debug = getLastMysteryEngineDebug()!;
    const continuingSeeds = debug.storySeeds!.filter((seed) => seed.continuesClueNumber);
    for (const seed of continuingSeeds) {
      expect(seed.continuesClueNumber).toBeLessThan(seed.clueNumber!);
      expect(debug.render!.prompt).toContain(seed.episodeRole === "claim"
        ? `This attributed statement refers back to the lived scene in Testimony ${seed.continuesClueNumber}`
        : `This continues the lived scene in Testimony ${seed.continuesClueNumber}`
      );
    }
    if (continuingSeeds.length === 0) {
      const selectedIds = new Set(debug.schedule!.reveals.map((reveal) => reveal.factId));
      expect(debug.facts!.some((fact) =>
        selectedIds.has(fact.id) && (fact.episodeRole === "fused" || fact.kind === "scene_evidence")
      )).toBe(true);
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
    expect(result.butlerClues[0]).toContain("Ashe recalled");
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
  }, 15_000);
});
