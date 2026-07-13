import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyActionResult,
  loadActionEventIds,
  persistActionEventIds,
  shouldBlockPassageSubmit,
  type TurnActionResult,
} from "./action-results";

function result(overrides: Partial<TurnActionResult> = {}): TurnActionResult {
  return {
    action: "use_secret_passage",
    ok: true,
    message: "",
    forEventId: 42,
    updatedAt: "2026-07-13T15:00:00.000Z",
    ...overrides,
  };
}

describe("classifyActionResult", () => {
  it("returns null with no result or an already-seen result", () => {
    expect(classifyActionResult(null, 42, null)).toBeNull();
    expect(classifyActionResult(undefined, 42, null)).toBeNull();
    const r = result();
    const verdict = classifyActionResult(r, 42, null)!;
    expect(classifyActionResult(r, 42, verdict.key)).toBeNull();
  });

  it("defers (without marking seen) when the result arrives before the POST response", () => {
    // The host processed the event and posted the result before the phone's
    // own POST resolved, so the phone does not yet know its event id.
    const r = result({ forEventId: 42 });
    expect(classifyActionResult(r, null, null)).toMatchObject({ decision: "defer" });

    // Once the POST resolves and the phone remembers event 42, the SAME
    // result (never marked seen) now applies.
    expect(classifyActionResult(r, 42, null)).toMatchObject({ decision: "apply" });
  });

  it("defers when the result references a newer event than the phone recorded", () => {
    // A previous turn recorded event 30; the in-flight POST created event 42.
    expect(classifyActionResult(result({ forEventId: 42 }), 30, null)).toMatchObject({ decision: "defer" });
  });

  it("applies only the exactly-correlated result", () => {
    expect(classifyActionResult(result({ forEventId: 42 }), 42, null)).toMatchObject({ decision: "apply" });
  });

  it("ignores results that can never correlate", () => {
    // Stale result for an older event than the phone's latest action
    expect(classifyActionResult(result({ forEventId: 30 }), 42, null)).toMatchObject({ decision: "ignore" });
    // Result with no source event at all
    expect(classifyActionResult(result({ forEventId: null }), 42, null)).toMatchObject({ decision: "ignore" });
  });
});

describe("passage pending persistence across refresh", () => {
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

  it("restores the outstanding passage and blocks a resubmission after refresh", () => {
    // A passage was submitted (event 42) and its result is still outstanding
    // when the phone refreshes.
    persistActionEventIds("p1", { reveal: 10, accusation: null, passage: 42, passagePending: true });

    const restored = loadActionEventIds("p1");
    expect(restored).toEqual({ reveal: 10, accusation: null, passage: 42, passagePending: true });

    // The restored pending state blocks another submission (waiting UI shows)
    expect(shouldBlockPassageSubmit(false, restored.passagePending)).toBe(true);

    // Once the correlated result applies, pending clears and submission opens
    // again on the next turn
    persistActionEventIds("p1", { reveal: 10, accusation: null, passage: 42, passagePending: false });
    const settled = loadActionEventIds("p1");
    expect(settled.passagePending).toBe(false);
    expect(shouldBlockPassageSubmit(false, settled.passagePending)).toBe(false);
  });

  it("blocks resubmission while used this turn even without a pending result", () => {
    expect(shouldBlockPassageSubmit(true, false)).toBe(true);
  });

  it("defaults to no pending state for unknown players or corrupt records", () => {
    expect(loadActionEventIds("unknown")).toEqual({ reveal: null, accusation: null, passage: null, passagePending: false });
    storage.set("clue-dvd-phone-action-events:p2", "{not json");
    expect(loadActionEventIds("p2")).toEqual({ reveal: null, accusation: null, passage: null, passagePending: false });
  });
});
