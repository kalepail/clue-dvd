import { describe, expect, it } from "vitest";
import {
  createActionToken,
  createEventPipeline,
  isEventFresh,
  matchesPendingSource,
  parseSuggestionCategories,
  resolveCurrentActor,
} from "./turn-authority";

describe("resolveCurrentActor", () => {
  const ada = { name: "Ada", suspectId: "S01" };
  const bert = { name: "Bert", suspectId: "S02" };
  const cy = { name: "Cy", suspectId: "S03" };

  it("returns the pawn at the current turn index", () => {
    const state = { turnOrder: [ada, bert, cy], players: [ada, bert, cy], currentTurnIndex: 1 };
    expect(resolveCurrentActor(state)).toEqual(bert);
  });

  it("wraps an out-of-range index instead of crashing", () => {
    const state = { turnOrder: [ada, bert], players: [ada, bert], currentTurnIndex: 5 };
    expect(resolveCurrentActor(state)).toEqual(bert);
  });

  it("identifies an unauthorized actor by mismatch with the resolved actor", () => {
    const state = { turnOrder: [ada, bert, cy], players: [ada, bert, cy], currentTurnIndex: 0 };
    const sender = bert;
    expect(resolveCurrentActor(state)?.suspectId).not.toBe(sender.suspectId);
  });

  it("falls back to the players list only when no turn order exists", () => {
    const state = { turnOrder: [], players: [ada, bert], currentTurnIndex: 0 };
    expect(resolveCurrentActor(state)).toEqual(ada);
  });

  it("returns null when nobody can hold the turn", () => {
    expect(resolveCurrentActor({ turnOrder: [], players: [], currentTurnIndex: 0 })).toBeNull();
  });
});

describe("isEventFresh", () => {
  it("accepts any event when no cursor exists yet", () => {
    expect(isEventFresh(null, 1)).toBe(true);
    expect(isEventFresh(null, 999)).toBe(true);
  });

  it("rejects a duplicate delivery of the last processed event", () => {
    expect(isEventFresh(7, 7)).toBe(false);
  });

  it("rejects replayed history after a host reload restores the cursor", () => {
    // A reload rehydrates the persisted cursor; every already-processed
    // event id compares <= cursor and must be rejected.
    const persistedCursor = 42;
    for (const replayedId of [1, 17, 41, 42]) {
      expect(isEventFresh(persistedCursor, replayedId)).toBe(false);
    }
    expect(isEventFresh(persistedCursor, 43)).toBe(true);
  });
});

describe("parseSuggestionCategories", () => {
  it("accepts exactly three distinct allowed categories, preserving order", () => {
    expect(parseSuggestionCategories(["time", "suspect", "location"])).toEqual(["time", "suspect", "location"]);
  });

  it("rejects wrong lengths, duplicates, and unknown categories", () => {
    expect(parseSuggestionCategories(["suspect", "item"])).toBeNull();
    expect(parseSuggestionCategories(["suspect", "item", "location", "time"])).toBeNull();
    expect(parseSuggestionCategories(["suspect", "suspect", "item"])).toBeNull();
    expect(parseSuggestionCategories(["suspect", "item", "weapon"])).toBeNull();
  });

  it("rejects non-arrays and non-string entries", () => {
    expect(parseSuggestionCategories(undefined)).toBeNull();
    expect(parseSuggestionCategories("suspect,item,location")).toBeNull();
    expect(parseSuggestionCategories(["suspect", 3, "location"])).toBeNull();
    expect(parseSuggestionCategories(null)).toBeNull();
  });
});

describe("createEventPipeline", () => {
  interface TestEvent {
    id: number;
  }

  function buildHarness(outcomes: Record<number, Array<"handled" | "retry" | "throw">>) {
    let cursor: number | null = null;
    const commits: number[] = [];
    const processed: number[] = [];
    let recoveries = 0;
    const pipeline = createEventPipeline<TestEvent>({
      getCursor: () => cursor,
      commit: (eventId) => {
        cursor = eventId;
        commits.push(eventId);
      },
      process: async (event) => {
        processed.push(event.id);
        const plan = outcomes[event.id] ?? ["handled"];
        const step = plan.length > 1 ? plan.shift()! : plan[0];
        if (step === "throw") throw new Error("boom");
        return step;
      },
      requestRecovery: () => {
        recoveries += 1;
      },
    });
    return { pipeline, commits, processed, recoveries: () => recoveries, cursor: () => cursor };
  }

  it("never lets a later id commit past a deferred earlier id", async () => {
    const harness = buildHarness({ 10: ["retry", "handled"] });

    // Event 10 defers; event 11 arrives while the pipeline is blocked.
    await harness.pipeline.push({ id: 10 });
    await harness.pipeline.push({ id: 11 });
    expect(harness.commits).toEqual([]);
    expect(harness.processed).toEqual([10]);
    expect(harness.pipeline.isBlocked()).toBe(true);
    expect(harness.recoveries()).toBe(1);

    // Recovery reconnects and the server replays 10 then 11 in order.
    harness.pipeline.unblock();
    await harness.pipeline.push({ id: 10 });
    await harness.pipeline.push({ id: 11 });
    expect(harness.commits).toEqual([10, 11]);
    expect(harness.cursor()).toBe(11);
  });

  it("blocks on a thrown processing error exactly like a deferral", async () => {
    const harness = buildHarness({ 5: ["throw", "handled"] });
    await harness.pipeline.push({ id: 5 });
    await harness.pipeline.push({ id: 6 });
    expect(harness.commits).toEqual([]);
    expect(harness.pipeline.isBlocked()).toBe(true);

    harness.pipeline.unblock();
    await harness.pipeline.push({ id: 5 });
    await harness.pipeline.push({ id: 6 });
    expect(harness.commits).toEqual([5, 6]);
  });

  it("skips already-committed ids on replay without reprocessing them", async () => {
    const harness = buildHarness({});
    await harness.pipeline.push({ id: 1 });
    await harness.pipeline.push({ id: 1 });
    expect(harness.commits).toEqual([1]);
    expect(harness.processed).toEqual([1]);
  });
});

describe("matchesPendingSource", () => {
  it("accepts an acknowledgement for the exact initiating event", () => {
    expect(matchesPendingSource(41, 41)).toBe(true);
  });

  it("rejects a delayed acknowledgement of an earlier event against a later pending", () => {
    // The pending action was created by event 60; a confirmation the phone
    // sent for its earlier event 41 must not resolve it.
    expect(matchesPendingSource(41, 60)).toBe(false);
  });

  it("matches host-local pendings (no source event) only with no forEventId", () => {
    expect(matchesPendingSource(undefined, null)).toBe(true);
    expect(matchesPendingSource(41, null)).toBe(false);
  });

  it("rejects a missing or malformed forEventId against a phone-initiated pending", () => {
    expect(matchesPendingSource(undefined, 41)).toBe(false);
    expect(matchesPendingSource("41", 41)).toBe(false);
    expect(matchesPendingSource(Number.NaN, 41)).toBe(false);
  });
});

describe("createActionToken", () => {
  it("embeds the kind, turn, and sequence", () => {
    expect(createActionToken("pantry", 3, 12)).toMatch(/^pantry-3-12-[a-z0-9]+$/);
  });

  it("differs across turns, sequences, and repeated calls at the same position", () => {
    const base = createActionToken("penalty", 2, 5);
    expect(createActionToken("penalty", 3, 5)).not.toBe(base);
    expect(createActionToken("penalty", 2, 6)).not.toBe(base);
    expect(createActionToken("penalty", 2, 5)).not.toBe(base);
  });
});
