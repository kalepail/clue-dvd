import { describe, expect, it } from "vitest";
import { classifyActionResult, type TurnActionResult } from "./action-results";

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
