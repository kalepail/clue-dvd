import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyActionResult,
  emptyStoredActionEventIds,
  loadActionEventIds,
  persistActionEventIds,
  restorePassageState,
  shouldBlockPassageSubmit,
  type StoredActionEventIds,
  type TurnActionResult,
} from "./action-results";

function result(overrides: Partial<TurnActionResult> = {}): TurnActionResult {
  return {
    action: "use_secret_passage",
    ok: true,
    message: "",
    forEventId: 42,
    requestId: null,
    updatedAt: "2026-07-13T15:00:00.000Z",
    ...overrides,
  };
}

function stored(overrides: Partial<StoredActionEventIds> = {}): StoredActionEventIds {
  return { ...emptyStoredActionEventIds(), ...overrides };
}

describe("classifyActionResult", () => {
  it("returns null with no result or an already-seen result", () => {
    expect(classifyActionResult(null, { eventId: 42, requestId: null }, null)).toBeNull();
    expect(classifyActionResult(undefined, { eventId: 42, requestId: null }, null)).toBeNull();
    const r = result();
    const verdict = classifyActionResult(r, { eventId: 42, requestId: null }, null)!;
    expect(classifyActionResult(r, { eventId: 42, requestId: null }, verdict.key)).toBeNull();
  });

  it("correlates by request id even when the phone never learned its event id", () => {
    // The phone refreshed before its POST resolved: the event id is unknown,
    // but the request id was generated and persisted before the send.
    const r = result({ requestId: "pr-abc12345", forEventId: 42 });
    expect(classifyActionResult(r, { eventId: null, requestId: "pr-abc12345" }, null))
      .toMatchObject({ decision: "apply" });
  });

  it("ignores request-tagged results for a different own request", () => {
    const r = result({ requestId: "pr-abc12345" });
    expect(classifyActionResult(r, { eventId: 42, requestId: "pr-zzz99999" }, null))
      .toMatchObject({ decision: "ignore" });
  });

  it("defers request-tagged results until the own request id hydrates, then applies", () => {
    // A snapshot with a request-tagged result can arrive before the phone's
    // persisted request id has been rehydrated after a refresh. Marking it
    // seen would drop it forever; it must defer instead.
    const r = result({ requestId: "pr-abc12345" });
    expect(classifyActionResult(r, { eventId: 42, requestId: null }, null))
      .toMatchObject({ decision: "defer" });

    // The same never-seen result applies once hydration supplies the id.
    expect(classifyActionResult(r, { eventId: 42, requestId: "pr-abc12345" }, null))
      .toMatchObject({ decision: "apply" });
  });

  it("defers by event id when the result arrives before the POST response (no request id)", () => {
    const r = result({ forEventId: 42, requestId: null });
    expect(classifyActionResult(r, { eventId: null, requestId: null }, null))
      .toMatchObject({ decision: "defer" });
    expect(classifyActionResult(r, { eventId: 42, requestId: null }, null))
      .toMatchObject({ decision: "apply" });
  });

  it("defers when the result references a newer event than the phone recorded", () => {
    expect(classifyActionResult(result({ forEventId: 42 }), { eventId: 30, requestId: null }, null))
      .toMatchObject({ decision: "defer" });
  });

  it("ignores event-correlated results that can never match", () => {
    expect(classifyActionResult(result({ forEventId: 30 }), { eventId: 42, requestId: null }, null))
      .toMatchObject({ decision: "ignore" });
    expect(classifyActionResult(result({ forEventId: null }), { eventId: 42, requestId: null }, null))
      .toMatchObject({ decision: "ignore" });
  });
});

describe("restorePassageState (durable turn identity)", () => {
  it("keeps pending state only for a same-turn refresh", () => {
    const record = stored({ passagePending: true, passageRequestId: "pr-abc12345", passageTurnNumber: 5 });
    expect(restorePassageState(record, 5)).toEqual({ pending: true, usedThisTurn: true });
  });

  it("keeps the settled used-guard on a same-turn refresh", () => {
    const record = stored({ passageUsedTurnNumber: 5 });
    const restored = restorePassageState(record, 5);
    expect(restored).toEqual({ pending: false, usedThisTurn: true });
    expect(shouldBlockPassageSubmit(restored.usedThisTurn, restored.pending)).toBe(true);
  });

  it("clears stale state on any later turn number, even for the same suspect", () => {
    const record = stored({
      passagePending: true,
      passageRequestId: "pr-abc12345",
      passageTurnNumber: 5,
      passageUsedTurnNumber: 5,
    });
    const restored = restorePassageState(record, 8);
    expect(restored).toEqual({ pending: false, usedThisTurn: false });
    expect(shouldBlockPassageSubmit(restored.usedThisTurn, restored.pending)).toBe(false);
  });

  it("restores nothing without a known current turn number", () => {
    const record = stored({ passagePending: true, passageTurnNumber: 5 });
    expect(restorePassageState(record, null)).toEqual({ pending: false, usedThisTurn: false });
  });
});

describe("passage persistence across refresh", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    });
  });

  it("persists the pre-send request identity and correlates after a refresh without the event id", () => {
    // Persisted BEFORE the POST: pending + request id + turn number, but no
    // event id yet.
    persistActionEventIds("p1", stored({
      passagePending: true,
      passageRequestId: "pr-abc12345",
      passageTurnNumber: 5,
    }));

    const restored = loadActionEventIds("p1");
    expect(restored.passage).toBeNull();
    expect(restored.passageRequestId).toBe("pr-abc12345");
    expect(restorePassageState(restored, 5)).toEqual({ pending: true, usedThisTurn: true });

    // The host's echoed result applies via the request id alone.
    const echoed = result({ requestId: restored.passageRequestId, forEventId: 99 });
    expect(classifyActionResult(echoed, { eventId: restored.passage, requestId: restored.passageRequestId }, null))
      .toMatchObject({ decision: "apply" });
  });

  it("blocks resubmission for a same-turn settled refresh and clears on a later turn", () => {
    persistActionEventIds("p1", stored({ passageUsedTurnNumber: 5 }));
    const record = loadActionEventIds("p1");
    const sameTurn = restorePassageState(record, 5);
    expect(shouldBlockPassageSubmit(sameTurn.usedThisTurn, sameTurn.pending)).toBe(true);
    const laterTurn = restorePassageState(record, 6);
    expect(shouldBlockPassageSubmit(laterTurn.usedThisTurn, laterTurn.pending)).toBe(false);
  });

  it("defaults to no pending state for unknown players or corrupt records", () => {
    expect(loadActionEventIds("unknown")).toEqual(emptyStoredActionEventIds());
    storage.set("clue-dvd-phone-action-events:p2", "{not json");
    expect(loadActionEventIds("p2")).toEqual(emptyStoredActionEventIds());
  });
});
