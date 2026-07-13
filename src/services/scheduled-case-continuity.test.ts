import { describe, expect, it } from "vitest";
import { buildScheduledCaseContinuity, type ContinuitySeed } from "./scheduled-case-continuity";

function seed(params: {
  factId: string;
  position: number;
  clueNumber?: number | null;
  deliverAs?: ContinuitySeed["deliverAs"];
  suspectIds?: string[];
  itemIds?: string[];
  locationIds?: string[];
  timeIds?: string[];
  threadId?: string;
}): ContinuitySeed {
  return {
    position: params.position,
    deliverAs: params.deliverAs ?? "butler",
    clueNumber: params.clueNumber === undefined ? params.position : params.clueNumber,
    brief: `Brief for ${params.factId}`,
    threadId: params.threadId,
    evidence: {
      factId: params.factId,
      kind: params.threadId ? "thread_setup" : "group_presence",
      role: params.threadId ? "context" : "formal",
      statement: `Statement for ${params.factId}`,
      suspectIds: params.suspectIds ?? [],
      itemIds: params.itemIds ?? [],
      locationIds: params.locationIds ?? [],
      timeIds: params.timeIds ?? [],
    },
  };
}

describe("scheduled case continuity", () => {
  it("orders selected facts chronologically without changing reveal order", () => {
    const continuity = buildScheduledCaseContinuity([
      seed({ factId: "F_LATE", position: 1, clueNumber: 1, timeIds: ["T08"] }),
      seed({ factId: "F_EARLY", position: 2, clueNumber: 2, timeIds: ["T03"] }),
      seed({ factId: "F_UNTIMED", position: 3, clueNumber: 3 }),
    ]);

    expect(continuity.revealFactIds).toEqual(["F_LATE", "F_EARLY", "F_UNTIMED"]);
    expect(continuity.chronologicalFactIds).toEqual(["F_EARLY", "F_LATE", "F_UNTIMED"]);
  });

  it("links only to earlier public Butler facts with grounded relations", () => {
    const continuity = buildScheduledCaseContinuity([
      seed({ factId: "F1", position: 1, clueNumber: 1, suspectIds: ["S01"], timeIds: ["T03"], threadId: "TH1" }),
      seed({ factId: "N1", position: 2, clueNumber: null, deliverAs: "note1", itemIds: ["I01"], timeIds: ["T04"] }),
      seed({ factId: "F2", position: 3, clueNumber: 2, suspectIds: ["S01"], itemIds: ["I01"], timeIds: ["T04"], threadId: "TH1" }),
      seed({ factId: "N2", position: 4, clueNumber: null, deliverAs: "note2", itemIds: ["I01"] }),
    ]);

    const clue2 = continuity.beats.find((beat) => beat.factId === "F2")!;
    expect(clue2.earlierPublicRelations).toEqual([{
      factId: "F1",
      clueNumber: 1,
      kinds: ["same_thread", "shared_suspect", "adjacent_time"],
    }]);
    expect(clue2.earlierPublicRelations.some((relation) => relation.factId === "N1")).toBe(false);

    const note2 = continuity.beats.find((beat) => beat.factId === "N2")!;
    expect(note2.earlierPublicRelations.map((relation) => relation.factId)).toEqual(["F2"]);
  });

  it("keeps Butler continuity unchanged when private-note facts change", () => {
    const publicSeeds = [
      seed({ factId: "F1", position: 1, clueNumber: 1, locationIds: ["L01"] }),
      seed({ factId: "F2", position: 3, clueNumber: 2, locationIds: ["L01"] }),
    ];
    const first = buildScheduledCaseContinuity([
      publicSeeds[0],
      seed({ factId: "N1A", position: 2, clueNumber: null, deliverAs: "note1", locationIds: ["L01"] }),
      publicSeeds[1],
    ]);
    const second = buildScheduledCaseContinuity([
      publicSeeds[0],
      seed({ factId: "N1B", position: 2, clueNumber: null, deliverAs: "note1", itemIds: ["I08"] }),
      publicSeeds[1],
    ]);

    const publicRelations = (value: typeof first) => value.beats
      .filter((beat) => beat.deliverAs === "butler")
      .map((beat) => [beat.factId, beat.earlierPublicRelations]);
    expect(publicRelations(second)).toEqual(publicRelations(first));
  });
});
