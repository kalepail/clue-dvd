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
      "Colonel Mustard and Professor Plum kept to the Billiard Room through Dusk.",
      seed(["Colonel Mustard", "Professor Plum", "Billiard Room", "Dusk"])
    );
    expect(result.problems).toEqual([]);
  });

  it("flags an unlicensed card mention with an actionable message", () => {
    const result = verifyClueText(
      "The Jade Hairpin was much admired that day.",
      seed(["Colonel Mustard"])
    );
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain("Jade Hairpin");
    expect(result.problems[0]).toContain("Colonel Mustard");
  });

  it("repairs overlong testimony instead of accepting padded prose", () => {
    const result = verifyClueText(
      Array.from({ length: 49 }, (_, index) => `word${index}`).join(" "),
      seed([])
    );
    expect(result.problems.some((problem) => problem.includes("49 words"))).toBe(true);
  });

  it("allows a 49-word testimony when it carries a linked episode", () => {
    const linkedSeed = { ...seed([]), episodeId: "episode-1" };
    const result = verifyClueText(
      Array.from({ length: 49 }, (_, index) => `word${index}`).join(" "),
      linkedSeed
    );
    expect(result.problems).toEqual([]);
  });

  it("repairs a linked scene only after it exceeds the 54-word story allowance", () => {
    const linkedSeed = { ...seed([]), episodeId: "episode-1" };
    const result = verifyClueText(
      Array.from({ length: 55 }, (_, index) => `word${index}`).join(" "),
      linkedSeed
    );
    expect(result.problems.some((problem) => problem.includes("55 words"))).toBe(true);
  });

  it("keeps the opening free of every card name", () => {
    const clean = verifyOpening("Mr. Boddy welcomed his friends for a quiet celebration, with music and a formal supper planned for the company.");
    expect(clean.problems).toEqual([]);
    const leaky = verifyOpening("Everyone gathered in the Ballroom at Dinner.");
    expect(leaky.problems.length).toBeGreaterThan(0);
    const mysteryLeak = verifyOpening("The celebration ended when something was discovered missing.");
    expect(mysteryLeak.problems.length).toBeGreaterThan(0);
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
    const invented = verifyClosing(
      "Mrs. Peacock slipped through a hidden passage, then took the Letter Opener from the Billiard Room at Night.",
      answer
    );
    expect(invented.problems.some((problem) => problem.includes("invents an access"))).toBe(true);
    const motionVerb = verifyClosing(
      "Mrs. Peacock slipped away with the Letter Opener from the Billiard Room at Night.",
      answer
    );
    expect(motionVerb.problems.some((problem) => problem.includes("invents an access"))).toBe(true);
  });

  it("matches answer cards exactly and rejects clearing the true answer", () => {
    const midnightAnswer = { suspectId: "S05", itemId: "I07", locationId: "L07", timeId: "T10" };
    const wrongHour = verifyClosing(
      "Mrs. Peacock took the Letter Opener from the Billiard Room at Night.",
      midnightAnswer
    );
    expect(wrongHour.problems).toContain('The closing must explicitly name "Midnight".');

    const answer = { suspectId: "S05", itemId: "I07", locationId: "L07", timeId: "T09" };
    const reversed = verifyClosing(
      "Though the Billiard Room had been cleared, Mrs. Peacock took the Letter Opener there at Night.",
      answer
    );
    expect(reversed.problems).toContain("The closing describes an answer card as cleared, ruled out, or impossible.");
  });

  it("flags every canned greeting and every repeated first word", () => {
    const problems = verifyClueOpeningVariety([
      "Hello -- Mrs. White remembered the flowers.",
      "Coming -- Rusty crossed the lawn.",
      "Good day -- The guests gathered quietly.",
      "During Tea Time the room was crowded.",
      "During Dinner the room had emptied.",
      "During the final preparations the room filled again.",
    ]);
    expect(problems.filter((problem) => problem.problem.includes("canned greeting"))).toHaveLength(3);
    expect(problems.some((problem) => problem.clueNumber === 5 && problem.problem.includes("already used in clue 4"))).toBe(true);
    expect(problems.some((problem) => problem.clueNumber === 6 && problem.problem.includes("already used in clue 4"))).toBe(true);
  });

  it("rejects filler openers and apologetic padding", () => {
    const filler = verifyClueText("Indeed -- Mrs. White recalled the ribbons.", seed(["Mrs. White"]));
    expect(filler.problems.some((problem) => problem.includes("filler interjection"))).toBe(true);
    const apology = verifyClueText("Mrs. White and Rusty stayed together -- forgive me -- throughout the rehearsal.", seed(["Mrs. White", "Rusty"]));
    expect(apology.problems.some((problem) => problem.includes("apologetic aside"))).toBe(true);
    const staff = verifyClueText("The two staff remained with the cue sheets.", seed([]));
    expect(staff.problems.some((problem) => problem.includes("word 'staff'"))).toBe(true);
    const genericButler = verifyClueText(
      "Per the butler, nothing in the display had moved.",
      { ...seed([]), deliverAs: "note1", clueNumber: null }
    );
    expect(genericButler.problems.some((problem) => problem.includes("generic Butler attribution"))).toBe(true);
  });

  it("accepts ten distinct substantive openings without greetings", () => {
    expect(verifyClueOpeningVariety([
      "Colonel Mustard recalled the first exchange.",
      "Rusty crossed the lawn afterward.",
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

  it("rejects canned greetings and malformed forced callbacks in one clue", () => {
    const greeting = verifyClueText("Good day -- Mrs. White recalled the ribbons.", seed(["Mrs. White"]));
    expect(greeting.problems.some((problem) => problem.includes("canned greeting"))).toBe(true);
    const callback = verifyClueText("That same toasting still glass in hand, Mrs. White gave her answer.", seed(["Mrs. White"]));
    expect(callback.problems.some((problem) => problem.includes("malformed forced callback"))).toBe(true);
    const bareParticiple = verifyClueText(
      "Mrs. Meadow-Brook stayed beside Prince Azure, he drifting back to the tournament board.",
      seed(["Mrs. Meadow-Brook", "Prince Azure"])
    );
    expect(bareParticiple.problems.some((problem) => problem.includes("bare pronoun-plus-participle"))).toBe(true);
  });

  it("enforces the exact questioned actor and continuing witnesses", () => {
    const movementSeed = {
      ...seed(["Lady Lavender", "Miss Scarlet", "Professor Plum", "Library"]),
      questionedNames: ["Lady Lavender"],
      continuationNames: ["Miss Scarlet", "Professor Plum"],
    };
    const wrongActor = verifyClueText(
      "Lady Lavender, Miss Scarlet, and Professor Plum worked in the Library until Miss Scarlet stepped away, leaving the others at the task.",
      movementSeed
    );
    expect(wrongActor.problems.some((problem) => problem.includes("named actor must be Lady Lavender"))).toBe(true);
    expect(wrongActor.problems.some((problem) => problem.includes("Drops the continuation"))).toBe(true);

    const exact = verifyClueText(
      "Lady Lavender, Miss Scarlet, and Professor Plum worked in the Library until Lady Lavender stepped away; Miss Scarlet and Professor Plum remained together and continued the task.",
      movementSeed
    );
    expect(exact.problems).toEqual([]);

    const repeatedDeparture = verifyClueText(
      "Lady Lavender stepped away, then went off again; Miss Scarlet and Professor Plum remained together and continued the task.",
      movementSeed
    );
    expect(repeatedDeparture.problems.some((problem) => problem.includes("multiple departures"))).toBe(true);
  });

  it("checks every departure and does not treat 'without warning' as negation", () => {
    const continuousSeed = { ...seed(["Miss Scarlet"]), mustRemainPresent: true };
    const withoutWarning = verifyClueText(
      "Without warning, Miss Scarlet slipped away from the room.",
      continuousSeed
    );
    expect(withoutWarning.problems.some((problem) => problem.includes("continuous-presence"))).toBe(true);

    const laterDeparture = verifyClueText(
      "No one slipped away at first, but Miss Scarlet later left the room.",
      continuousSeed
    );
    expect(laterDeparture.problems.some((problem) => problem.includes("continuous-presence"))).toBe(true);

    const genuinelyNegated = verifyClueText(
      "No one slipped away from the room during the exchange.",
      continuousSeed
    );
    expect(genuinelyNegated.problems).toEqual([]);
  });

  it("rejects dangling recollection grammar and ambiguous named departures", () => {
    const dangling = verifyClueText(
      "Straightening the dance cards, it was during Night that something first seemed amiss.",
      seed(["Night"])
    );
    expect(dangling.problems.some((problem) => problem.includes("dangling action"))).toBe(true);

    const impersonal = verifyClueText(
      "Passing the Dining Room, one found Mr. Green comparing scorecards.",
      seed(["Mr. Green", "Dining Room"])
    );
    expect(impersonal.problems.some((problem) => problem.includes("first-person voice"))).toBe(true);

    const badTimeArticle = verifyClueText(
      "Colonel Mustard crossed the Rose Garden near the Early Afternoon.",
      seed(["Colonel Mustard", "Rose Garden", "Early Afternoon"])
    );
    expect(badTimeArticle.problems.some((problem) => problem.includes("article before a printed time"))).toBe(true);

    const missingThat = verifyClueText(
      "Checking the protective cloths lay straight during Night, my rounds found every display in order.",
      seed(["Night"])
    );
    expect(missingThat.problems.some((problem) => problem.includes("without 'that'"))).toBe(true);

    const ambiguous = verifyClueText(
      "Miss Scarlet, Mrs. Peacock, and Lady Lavender compared masks until she stepped away.",
      {
        ...seed(["Miss Scarlet", "Mrs. Peacock", "Lady Lavender"]),
        questionedNames: ["Lady Lavender"],
      }
    );
    expect(ambiguous.problems.some((problem) => problem.includes("departure actor ambiguous"))).toBe(true);

    const explicit = verifyClueText(
      "Miss Scarlet, Mrs. Peacock, and Lady Lavender compared masks until Lady Lavender stepped away.",
      {
        ...seed(["Miss Scarlet", "Mrs. Peacock", "Lady Lavender"]),
        questionedNames: ["Lady Lavender"],
      }
    );
    expect(explicit.problems).toEqual([]);
  });

  it("requires a fused departure clue to preserve the continuing witnesses", () => {
    const transitionSeed: StorySeed = {
      ...seed(["Miss Scarlet", "Professor Plum", "Lady Lavender", "Library"]),
      questionedNames: ["Miss Scarlet"],
      continuationNames: ["Professor Plum", "Lady Lavender"],
    };
    const dropped = verifyClueText(
      "Miss Scarlet, Professor Plum, and Lady Lavender addressed cards in the Library until Miss Scarlet excused herself; Inspector Brown later found the room untouched.",
      transitionSeed
    );
    expect(dropped.problems.some((problem) => problem.includes("Drops the continuation"))).toBe(true);

    const preserved = verifyClueText(
      "Miss Scarlet, Professor Plum, and Lady Lavender addressed cards in the Library until Miss Scarlet excused herself, leaving Professor Plum and Lady Lavender at the cards.",
      transitionSeed
    );
    expect(preserved.problems).toEqual([]);
  });

  it("locks rendered presence to the deterministic people scope", () => {
    const named = verifyClueText(
      "The entire company worked in the Library, Colonel Mustard and Professor Plum among them.",
      { ...seed(["Colonel Mustard", "Professor Plum", "Library"]), scopeMode: "named_only" }
    );
    expect(named.problems.some((problem) => problem.includes("Broadens a named-person scene"))).toBe(true);

    const droppedWholeHouse = verifyClueText(
      "Colonel Mustard remained in the Library for the ceremony.",
      { ...seed(["Colonel Mustard", "Library"]), scopeMode: "whole_household" }
    );
    expect(droppedWholeHouse.problems.some((problem) => problem.includes("Drops the event's whole-household scope"))).toBe(true);

    const preserved = verifyClueText(
      "Every guest, Mrs. White, and Rusty remained together for the ceremony.",
      { ...seed(["Mrs. White", "Rusty"]), scopeMode: "whole_household" }
    );
    expect(preserved.problems).toEqual([]);
  });

  it("rejects invented departures from a continuous-presence scene", () => {
    const contradicted = verifyClueText(
      "Mrs. White and Rusty remained in the Rose Garden, though Mrs. White kept slipping off to check the counters.",
      { ...seed(["Mrs. White", "Rusty", "Rose Garden"]), scopeMode: "named_only", mustRemainPresent: true }
    );
    expect(contradicted.problems.some((problem) => problem.includes("continuous-presence"))).toBe(true);

    const genuineDeparture = verifyClueText(
      "Mrs. White said an unnamed guest slipped away from the gathering.",
      seed(["Mrs. White"])
    );
    expect(genuineDeparture.problems).toEqual([]);

    const explicitlyContinuous = verifyClueText(
      "Every guest, Mrs. White, and Rusty stayed together, and not one person broke away.",
      { ...seed(["Mrs. White", "Rusty"]), scopeMode: "whole_household", mustRemainPresent: true }
    );
    expect(explicitlyContinuous.problems).toEqual([]);
  });

  it("keeps outdoor locations out of room language", () => {
    const outdoor = verifyClueText(
      "Colonel Mustard stayed beside the Fountain without once leaving the room.",
      { ...seed(["Colonel Mustard", "Fountain"]), locationSetting: "outdoor" }
    );
    expect(outdoor.problems.some((problem) => problem.includes("outdoor setting"))).toBe(true);

    const natural = verifyClueText(
      "Colonel Mustard stayed beside the Fountain without once leaving that spot.",
      { ...seed(["Colonel Mustard", "Fountain"]), locationSetting: "outdoor" }
    );
    expect(natural.problems).toEqual([]);
  });

  it("flags a repeated five-word sentence fragment across clues", () => {
    const problems = verifyClueOpeningVariety([
      "While collecting pledge cards from the table, Ashe noticed a ribbon.",
      "Later, collecting pledge cards from the table proved unexpectedly useful.",
    ]);
    expect(problems.some((problem) => problem.clueNumber === 2 && problem.problem.includes("five-word phrase"))).toBe(true);
  });

  it("does not mistake a repeated suspect group for recycled prose", () => {
    const problems = verifyClueOpeningVariety([
      "Anyone passing found Colonel Mustard, Mrs. Peacock, and Prince Azure running a difficult scene.",
      "From the matinee onward, Colonel Mustard, Mrs. Peacock, and Prince Azure remained occupied with the scenery.",
    ]);
    expect(problems).toEqual([]);
  });
});
