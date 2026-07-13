import { describe, expect, it } from "vitest";
import { createActionToken, isEventFresh, matchesPendingSource, resolveCurrentActor } from "./turn-authority";

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
