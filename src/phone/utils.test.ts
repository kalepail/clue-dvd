import { describe, expect, it } from "vitest";
import { hostTokenMatches, isTurnOwnedPhoneAction } from "./utils";

describe("hostTokenMatches (fail-closed host auth)", () => {
  it("rejects when the session has no issued token, regardless of what is provided", () => {
    expect(hostTokenMatches(null, "anything")).toBe(false);
    expect(hostTokenMatches(null, undefined)).toBe(false);
    expect(hostTokenMatches(undefined, "anything")).toBe(false);
    expect(hostTokenMatches("", "")).toBe(false);
  });

  it("rejects a missing or wrong provided token", () => {
    expect(hostTokenMatches("secret", undefined)).toBe(false);
    expect(hostTokenMatches("secret", null)).toBe(false);
    expect(hostTokenMatches("secret", "")).toBe(false);
    expect(hostTokenMatches("secret", "wrong")).toBe(false);
    expect(hostTokenMatches("secret", 42)).toBe(false);
  });

  it("accepts only the exact issued token", () => {
    expect(hostTokenMatches("secret", "secret")).toBe(true);
  });
});

describe("isTurnOwnedPhoneAction", () => {
  it("treats every accusation as turn-owned", () => {
    expect(isTurnOwnedPhoneAction("accusation", undefined)).toBe(true);
  });

  it("treats physical turn actions as turn-owned", () => {
    for (const action of [
      "reveal_clue",
      "use_secret_passage",
      "make_suggestion",
      "read_inspector_note",
      "continue_investigation",
      "resolve_accusation_penalty",
    ]) {
      expect(isTurnOwnedPhoneAction("turn_action", action)).toBe(true);
    }
  });

  it("leaves table-wide and lobby actions open to any player", () => {
    for (const action of [
      "begin_investigation",
      "start_game",
      "toggle_setup_symbols",
      "show_story",
      "acknowledge_interruption",
    ]) {
      expect(isTurnOwnedPhoneAction("turn_action", action)).toBe(false);
    }
  });

  it("does not treat malformed actions as turn-owned", () => {
    expect(isTurnOwnedPhoneAction("turn_action", undefined)).toBe(false);
    expect(isTurnOwnedPhoneAction("turn_action", 7)).toBe(false);
  });
});
