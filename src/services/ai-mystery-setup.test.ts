import { describe, expect, it } from "vitest";
import { SUSPECTS } from "../data/game-elements";
import { createMysteryScenarioShell, createMysterySetup } from "./ai-mystery-setup";

describe("AI Mystery V2 deterministic setup", () => {
  it("selects the same immutable answer for the same seed", () => {
    const first = createMysterySetup({ seed: 90210 });
    const second = createMysterySetup({ seed: 90210 });
    expect(second).toEqual(first);
  });

  it("honors answer exclusions before any model call", () => {
    const excluded = SUSPECTS.slice(0, 9).map((suspect) => suspect.id);
    const setup = createMysterySetup({ seed: 44, excludeSuspects: excluded });
    expect(setup.solution.suspectId).toBe(SUSPECTS[9].id);
  });

  it("fails clearly when a complete category is excluded", () => {
    expect(() => createMysterySetup({
      seed: 44,
      excludeSuspects: SUSPECTS.map((suspect) => suspect.id),
    })).toThrow("all suspects were excluded");
  });

  it("creates a ten-clue V2 shell with no elimination metadata", () => {
    const shell = createMysteryScenarioShell(createMysterySetup({ seed: 45 }));
    expect(shell.clues).toHaveLength(10);
    expect(shell.clues.every((clue) => clue.eliminates === undefined)).toBe(true);
    expect(shell.metadata.engineVersion).toBe("2.1-creative");
    expect(shell.dramaticEvents).toEqual([]);
  });
});
