import { describe, expect, it } from "vitest";
import { findCardMentions, verifyClosing, verifyClueOpeningVariety, verifyClueText, verifyOpening } from "./clue-verifier";
import type { StorySeed } from "../data/ai-v3-prompts";

const seed = (allowedNames: string[], deliverAs: StorySeed["deliverAs"] = "butler"): StorySeed => ({
  position: 3,
  deliverAs,
  clueNumber: deliverAs === "butler" ? 3 : null,
  brief: "test brief",
  allowedNames,
});

describe("card mention scanning", () => {
  it("finds multi-word and possessive card names exactly", () => {
    const text = "Mrs. Meadow-Brook admired the Crystal Paperweight in the Rose Garden during Tea Time; Miss Scarlet's gloves were elsewhere.";
    const mentions = findCardMentions(text);
    expect(mentions).toContain("Mrs. Meadow-Brook");
    expect(mentions).toContain("Crystal Paperweight");
    expect(mentions).toContain("Rose Garden");
    expect(mentions).toContain("Tea Time");
    expect(mentions).toContain("Miss Scarlet");
  });

  it("does not fire on lowercase ordinary words", () => {
    expect(findCardMentions("They studied the hall clock at night over dinner leftovers.")).toEqual([]);
  });
});

describe("clue verification", () => {
  it("accepts a clue that stays inside its mention license", () => {
    const result = verifyClueText(
      "Coming -- Colonel Mustard and Professor Plum kept to the Billiard Room through Dusk.",
      seed(["Colonel Mustard", "Professor Plum", "Billiard Room", "Dusk"])
    );
    expect(result.problems).toEqual([]);
  });

  it("flags an unlicensed card mention with an actionable message", () => {
    const result = verifyClueText(
      "Hello -- the Jade Hairpin was much admired that day.",
      seed(["Colonel Mustard"])
    );
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain("Jade Hairpin");
    expect(result.problems[0]).toContain("Colonel Mustard");
  });

  it("keeps the opening free of every card name", () => {
    const clean = verifyOpening("Mr. Boddy welcomed his friends for a quiet celebration, until Ashe found something amiss.");
    expect(clean.problems).toEqual([]);
    const leaky = verifyOpening("Everyone gathered in the Ballroom at Dinner.");
    expect(leaky.problems.length).toBeGreaterThan(0);
  });

  it("requires the closing to name all four answer cards", () => {
    const answer = { suspectId: "S05", itemId: "I07", locationId: "L07", timeId: "T09" };
    const good = verifyClosing(
      "Mrs. Peacock took the Letter Opener from the Billiard Room at Night — well solved, detectives.",
      answer
    );
    expect(good.problems).toEqual([]);
    const bad = verifyClosing("Mrs. Peacock took something somewhere.", answer);
    expect(bad.problems.length).toBeGreaterThanOrEqual(3);
  });

  it("flags repeated first words and greeting openers beyond the first two", () => {
    const problems = verifyClueOpeningVariety([
      "Hello -- Mrs. White remembered the flowers.",
      "Coming -- Rusty crossed the lawn.",
      "Good day -- The guests gathered quietly.",
      "During Tea Time the room was crowded.",
      "During Dinner the room had emptied.",
    ]);
    expect(problems.some((problem) => problem.clueNumber === 3 && problem.problem.includes("already has two"))).toBe(true);
    expect(problems.some((problem) => problem.clueNumber === 5 && problem.problem.includes("already used"))).toBe(true);
  });

  it("accepts ten distinct openings with no more than two greetings", () => {
    expect(verifyClueOpeningVariety([
      "Hello -- The first recollection.",
      "Coming -- The second recollection.",
      "Before luncheon, something changed.",
      "While the guests waited, Ashe watched.",
      "Near the windows stood a display.",
      "Later, two voices crossed the hall.",
      "According to Rusty, nothing moved.",
      "Mrs. White recalled the ribbons.",
      "By dusk the room was quiet.",
      "Nobody mentioned the missing paper.",
    ])).toEqual([]);
  });
});
