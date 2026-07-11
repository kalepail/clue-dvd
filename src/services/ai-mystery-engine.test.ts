import { describe, expect, it, vi } from "vitest";
import {
  buildMysteryWorld,
  generateMysteryV2,
  getLastMysteryEngineDebug,
} from "./ai-mystery-engine";
import {
  CreativeAuditSchema,
  CreativeMysterySchema,
  toToolInputSchema,
  type CreativeAudit,
  type CreativeMystery,
} from "./ai-mystery-schemas";
import type { callStructured, StructuredCallResult } from "./ai-mystery-provider";
import type { MysterySetup } from "./ai-mystery-setup";

const setup: MysterySetup = {
  seed: 32,
  themeId: "AI01",
  difficulty: "expert",
  solution: { suspectId: "S05", itemId: "I07", locationId: "L07", timeId: "T09" },
};

function buildCreativeFixtures() {
  const world = buildMysteryWorld();
  const suspect = world.suspects.find(({ id }) => id === setup.solution.suspectId)!.name;
  const item = world.items.find(({ id }) => id === setup.solution.itemId)!.name;
  const location = world.locations.find(({ id }) => id === setup.solution.locationId)!.name;
  const time = world.times.find(({ id }) => id === setup.solution.timeId)!.name;
  const mystery = CreativeMysterySchema.parse({
    title: "The Memorial Subscription",
    privateCaseSummary: `${suspect} used a committee dispute to take the ${item} from the ${location} at ${time}.`,
    opening: "Mr. Boddy gathered his acquaintances to support a village memorial and settle the evening's subscription business.",
    clues: Array.from({ length: 10 }, (_, index) => `Story fragment ${index + 1} connects a private promise, disputed accounts, and the gathering's changing relationships.`),
    inspectorNotes: [
      { text: "One correction preceded the public announcement.", relatedClues: [2, 5] },
      { text: "Two conflicting accounts describe different moments.", relatedClues: [4, 7] },
    ],
    closing: `${suspect} stole the ${item} from the ${location} at ${time}, concealing it among corrected subscription papers.`,
    mysterySignature: "memorial subscription | private debt | committee rivalry | altered accounts",
  });
  const passingAudit = CreativeAuditSchema.parse({
    earlyTheory: {
      suspectId: "S01",
      itemId: "I01",
      locationId: "L02",
      timeId: "T02",
      confidence: "low",
    },
    coherent: true,
    playable: true,
    solvable: true,
    answerTooObviousEarly: false,
    closingSupportedByClues: true,
    feedback: [],
  });
  return { world, mystery, passingAudit };
}

function sequenceProvider(values: unknown[]): typeof callStructured {
  const queue = [...values];
  const mock = vi.fn(async (): Promise<StructuredCallResult<unknown>> => ({
    value: queue.shift(),
    raw: "{}",
    durationMs: 1,
    usage: { inputTokens: 10, outputTokens: 10 },
    stopReason: "tool_use",
    strictSchema: true,
  }));
  return mock as unknown as typeof callStructured;
}

describe("creativity-first AI mystery engine", () => {
  it("uses small contracts with no procedural CaseBible mechanics", () => {
    const schemas = [CreativeMysterySchema, CreativeAuditSchema]
      .map((schema) => JSON.stringify(toToolInputSchema(schema)));
    expect(Math.max(...schemas.map((schema) => schema.length))).toBeLessThan(1_500);
    for (const obsolete of ["caseBible", "evidenceAtoms", "movements", "answerDimensions", "rulesOut", "candidate"]) {
      expect(schemas.join(" ")).not.toContain(obsolete);
    }
  });

  it("passes complete verified lore and component details to the writer", async () => {
    const fixture = buildCreativeFixtures();
    const provider = sequenceProvider([fixture.mystery, fixture.passingAudit]);
    await generateMysteryV2("test-key", { setup, provider });

    const prompt = getLastMysteryEngineDebug()?.creativeDraft?.prompt ?? "";
    expect(prompt).toContain(setup.solution.suspectId);
    expect(prompt).toContain(setup.solution.itemId);
    expect(prompt).toContain(fixture.world.suspects[0].traits[0]);
    expect(prompt).toContain(fixture.world.items[0].description);
    expect(prompt).toContain(fixture.world.locations[0].adjacentRooms[0]);
    expect(prompt).toContain(fixture.world.times[0].activities[0]);
    expect(prompt).toContain("Everything else is your creative decision");
  });

  it("generates and broadly audits a complete mystery in two calls", async () => {
    const fixture = buildCreativeFixtures();
    const provider = sequenceProvider([fixture.mystery, fixture.passingAudit]);
    const progress: string[] = [];
    const result = await generateMysteryV2("test-key", {
      setup,
      provider,
      onProgress: (event) => { progress.push(event.stage); },
    });

    expect(provider).toHaveBeenCalledTimes(2);
    expect(result.butlerClues).toHaveLength(10);
    expect(result.inspectorNotes).toHaveLength(2);
    expect(result.mysterySignature).toContain("memorial subscription");
    expect(progress.at(-1)).toBe("complete");
  });

  it("uses one broad rewrite when playability needs material improvement", async () => {
    const fixture = buildCreativeFixtures();
    const failedAudit: CreativeAudit = {
      ...fixture.passingAudit,
      coherent: false,
      feedback: ["The middle clues do not feel connected."],
    };
    const revised: CreativeMystery = {
      ...fixture.mystery,
      clues: fixture.mystery.clues.map((clue) => `${clue} The committee dispute connects this fragment to the central incident.`),
    };
    const provider = sequenceProvider([fixture.mystery, failedAudit, revised]);

    const result = await generateMysteryV2("test-key", { setup, provider });
    expect(provider).toHaveBeenCalledTimes(3);
    expect(result.butlerClues[0]).toContain("central incident");
    expect(getLastMysteryEngineDebug()?.revision?.parsed).toEqual(revised);
  });

  it("forces a pacing rewrite when the first five clues converge on the hidden answer", async () => {
    const fixture = buildCreativeFixtures();
    const suspect = fixture.world.suspects.find(({ id }) => id === setup.solution.suspectId)!.name;
    const item = fixture.world.items.find(({ id }) => id === setup.solution.itemId)!.name;
    const location = fixture.world.locations.find(({ id }) => id === setup.solution.locationId)!.name;
    const time = fixture.world.times.find(({ id }) => id === setup.solution.timeId)!.name;
    const leaky: CreativeMystery = {
      ...fixture.mystery,
      opening: `The guests gathered in the ${location} at ${time} beside Mr. Boddy's ${item}.`,
      clues: [
        `${suspect} had a pressing financial motive.`,
        `The ${item} was left unattended.`,
        `${suspect} lingered alone in the ${location}.`,
        `${time} gave ${suspect} an opportunity.`,
        `An open handbag could conceal the ${item}.`,
        ...fixture.mystery.clues.slice(5),
      ],
    };
    const complacentAudit: CreativeAudit = {
      ...fixture.passingAudit,
      earlyTheory: {
        suspectId: setup.solution.suspectId,
        itemId: setup.solution.itemId,
        locationId: setup.solution.locationId,
        timeId: setup.solution.timeId,
        confidence: "high",
      },
      answerTooObviousEarly: false,
    };
    const provider = sequenceProvider([leaky, complacentAudit, fixture.mystery]);

    await expect(generateMysteryV2("test-key", { setup, provider })).resolves.toBeDefined();
    expect(provider).toHaveBeenCalledTimes(3);
    const revisionPrompt = getLastMysteryEngineDebug()?.revision?.prompt ?? "";
    expect(revisionPrompt).toContain("first five clues directly converge");
    expect(revisionPrompt).toContain("answer-blind player independently reconstructed");
  });

  it("sanitizes optional Inspector links without rejecting a usable story", async () => {
    const fixture = buildCreativeFixtures();
    const looseLinks: CreativeMystery = {
      ...fixture.mystery,
      inspectorNotes: [
        { text: "A useful note.", relatedClues: [0, 2, 2, 14] },
        { text: "Another useful note.", relatedClues: [] },
      ],
    };
    const provider = sequenceProvider([looseLinks, fixture.passingAudit]);
    const result = await generateMysteryV2("test-key", { setup, provider });
    expect(result.inspectorNotes[0].relatedClues).toEqual([2]);
    expect(result.inspectorNotes[1].relatedClues).toEqual([1]);
  });
});
