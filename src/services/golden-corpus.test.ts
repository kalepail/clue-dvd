/**
 * Golden corpus test: encodes the first original DVD mystery (Prince Azure /
 * Medal / Kitchen / before-breakfast) in the V3 fact language and replays it
 * through the joint-space grid. Proves the fact taxonomy is expressive enough
 * for real hand-authored mysteries and that their deduction behaves sanely
 * under our semantics: the answer survives everything, and the categories the
 * original converges (times, items) converge here too.
 */

import { describe, expect, it } from "vitest";
import { buildKillLists, JointGrid } from "./clue-scheduler";
import { DIMS, factKillsCell, type Fact } from "./fact-harvest";
import type { Answer } from "./ai-mystery-schemas";

// Original solution: thief Prince Azure (S08), item Medal (I04),
// location Kitchen (L04), time "Before breakfast" → Dawn (T01).
const answer: Answer = { suspectId: "S08", itemId: "I04", locationId: "L04", timeId: "T01" };

const ALL_SUSPECTS = [...DIMS.suspects];
const MEN = ["S02", "S04", "S06", "S08", "S10"]; // Mustard, Green, Plum, Azure, Rusty
const GUESTS = ALL_SUSPECTS.filter((id) => id !== "S03" && id !== "S10");

function fact(partial: Partial<Fact> & Pick<Fact, "id" | "kind">): Fact {
  return {
    primaryAxis: "color",
    suspectIds: [],
    itemIds: [],
    locationIds: [],
    timeIds: [],
    mentions: { suspects: [], items: [], locations: [], times: [] },
    writerBrief: "",
    noteSuitable: true,
    ...partial,
  } as Fact;
}

// The original's eight butler clues and third note, in our fact language.
const goldenFacts: Fact[] = [
  // "Mr. Boddy was given the medal by his uncle, the late Dr. Black."
  fact({ id: "G1", kind: "object_history", itemIds: ["I04"] }),
  // "The key that opens the cases … was missing from its hook by the time
  // she served breakfast." → the theft had happened by Breakfast.
  fact({ id: "G2", kind: "discovery", primaryAxis: "time", timeIds: ["T02"], cutoffOrder: 2 }),
  // "The pocket watch … was never in the mansion yesterday."
  fact({ id: "G3", kind: "item_offsite", primaryAxis: "item", itemIds: ["I09"] }),
  // "The guests did make it easier by arriving right on time, just as lunch
  // was being served." (Prince Azure had stayed the night — the one guest
  // the arrival cannot vouch for, which is precisely the original's trick.)
  fact({ id: "G4", kind: "guests_arrived", primaryAxis: "time", suspectIds: GUESTS.filter((id) => id !== "S08"), timeIds: ["T04"], cutoffOrder: 4 }),
  // "During tea time all guests were sitting around the rose garden … Even
  // Rusty and Mrs. White took a break."
  fact({ id: "G5", kind: "gathering", primaryAxis: "time", suspectIds: ALL_SUSPECTS, locationIds: ["L10"], timeIds: ["T06"] }),
  // "Dinner was a very informal affair … everybody was present."
  fact({ id: "G6", kind: "gathering", primaryAxis: "time", suspectIds: ALL_SUSPECTS, locationIds: ["L03"], timeIds: ["T08"] }),
  // "Mr. Green and Mrs. Peacock left during dinner, even before dessert."
  fact({ id: "G7", kind: "departure", primaryAxis: "suspect", suspectIds: ["S04", "S05"], timeIds: ["T08"], cutoffOrder: 8 }),
  // "Rusty told me that Lady Lavender left her jacket at the mansion."
  fact({ id: "G8", kind: "personal_remark", suspectIds: ["S09", "S10"] }),
  // Inspector note: "The smell of bacon brought all the men to the Kitchen
  // at Dawn." (The thief among them — in the Kitchen, at Dawn.)
  fact({ id: "G9", kind: "group_presence", primaryAxis: "suspect", suspectIds: MEN.filter((id) => id !== "S08"), locationIds: ["L04"], timeIds: ["T01"] }),
];

describe("golden corpus: original mystery #1 in the V3 fact language", () => {
  it("expresses every original clue as a typed fact that spares the answer", () => {
    for (const golden of goldenFacts) {
      expect(
        factKillsCell(golden, answer.suspectId, answer.itemId, answer.locationId, answer.timeId),
        `${golden.id} must not rule out the answer`
      ).toBe(false);
    }
  });

  it("replays to a sane deduction: times pinned, answer alive, cards finish the rest", () => {
    const killLists = buildKillLists(goldenFacts);
    const grid = new JointGrid();
    for (const golden of goldenFacts) grid.apply(killLists.get(golden.id)!);

    const counts = grid.counts();
    // The original pins the time hard: key gone by Breakfast kills T02+,
    // leaving only Dawn — exactly how the disc's closing narrates it.
    expect(counts.times).toBe(1);
    // The pocket watch is gone from contention.
    expect(counts.items).toBeLessThanOrEqual(10);
    // Suspects narrow (guests arrived at Lunch → cleared for Dawn; the men
    // in the Kitchen were observed together) but stay open — the physical
    // suspect cards close the category, as in the real game.
    expect(counts.suspects).toBeGreaterThanOrEqual(2);
    expect(counts.suspects).toBeLessThanOrEqual(6);

    // The answer cell survives the full original clue set.
    const answerAlive =
      grid.isCellAlive(
        ((DIMS.suspects.indexOf(answer.suspectId) * DIMS.items.length + DIMS.items.indexOf(answer.itemId)) *
          DIMS.locations.length + DIMS.locations.indexOf(answer.locationId)) *
          DIMS.times.length + DIMS.times.indexOf(answer.timeId)
      );
    expect(answerAlive).toBe(true);
  });
});
