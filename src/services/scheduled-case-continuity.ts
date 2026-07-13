import { TIME_PERIODS } from "../data/game-elements";
import type { EvidenceCapsule } from "../shared/evidence";

export type ContinuityDeliverAs = "butler" | "note1" | "note2";

export type ContinuitySeed = {
  position: number;
  deliverAs: ContinuityDeliverAs;
  clueNumber: number | null;
  brief: string;
  evidence: EvidenceCapsule;
  threadId?: string;
};

export type ContinuityRelationKind =
  | "same_thread"
  | "shared_suspect"
  | "shared_item"
  | "shared_location"
  | "shared_time"
  | "adjacent_time";

export type ContinuityRelation = {
  /** Always an earlier public Butler fact. Private notes are never sources. */
  factId: string;
  clueNumber: number;
  kinds: ContinuityRelationKind[];
};

export type ScheduledCaseBeat = {
  factId: string;
  position: number;
  deliverAs: ContinuityDeliverAs;
  clueNumber: number | null;
  brief: string;
  evidence: EvidenceCapsule;
  firstTimeOrder: number | null;
  earlierPublicRelations: ContinuityRelation[];
};

/**
 * Answer-blind writing context built only from the twelve facts that the
 * scheduler selected. It deliberately contains no WorldState, answer,
 * candidate counts, kill effects, decoy metadata, or unselected facts.
 */
export type ScheduledCaseContinuity = {
  revealFactIds: string[];
  chronologicalFactIds: string[];
  beats: ScheduledCaseBeat[];
};

const TIME_ORDER = new Map(TIME_PERIODS.map((time) => [time.id, time.order]));

export function buildScheduledCaseContinuity(seeds: ContinuitySeed[]): ScheduledCaseContinuity {
  const ordered = [...seeds].sort((left, right) => left.position - right.position);
  const beats: ScheduledCaseBeat[] = ordered.map((seed) => {
    const earlierPublicRelations = ordered
      .filter((candidate) => candidate.deliverAs === "butler" && candidate.position < seed.position)
      .map((candidate) => relationBetween(seed, candidate))
      .filter((relation): relation is ContinuityRelation => relation !== null)
      .sort((left, right) => right.clueNumber - left.clueNumber);

    return {
      factId: seed.evidence.factId,
      position: seed.position,
      deliverAs: seed.deliverAs,
      clueNumber: seed.clueNumber,
      brief: seed.brief,
      evidence: seed.evidence,
      firstTimeOrder: firstTimeOrder(seed.evidence),
      earlierPublicRelations,
    };
  });

  return {
    revealFactIds: beats.map((beat) => beat.factId),
    chronologicalFactIds: [...beats]
      .sort((left, right) =>
        (left.firstTimeOrder ?? Number.MAX_SAFE_INTEGER) - (right.firstTimeOrder ?? Number.MAX_SAFE_INTEGER) ||
        left.position - right.position
      )
      .map((beat) => beat.factId),
    beats,
  };
}

function relationBetween(target: ContinuitySeed, source: ContinuitySeed): ContinuityRelation | null {
  const kinds: ContinuityRelationKind[] = [];
  if (target.threadId && target.threadId === source.threadId) kinds.push("same_thread");
  if (overlap(target.evidence.suspectIds, source.evidence.suspectIds)) kinds.push("shared_suspect");
  if (overlap(target.evidence.itemIds, source.evidence.itemIds)) kinds.push("shared_item");
  if (overlap(target.evidence.locationIds, source.evidence.locationIds)) kinds.push("shared_location");
  if (overlap(target.evidence.timeIds, source.evidence.timeIds)) {
    kinds.push("shared_time");
  } else if (timesAreAdjacent(target.evidence.timeIds, source.evidence.timeIds)) {
    kinds.push("adjacent_time");
  }
  if (kinds.length === 0 || source.clueNumber === null) return null;
  return {
    factId: source.evidence.factId,
    clueNumber: source.clueNumber,
    kinds,
  };
}

function overlap(left: string[], right: string[]): boolean {
  return left.some((value) => right.includes(value));
}

function firstTimeOrder(evidence: EvidenceCapsule): number | null {
  const orders = evidence.timeIds
    .map((timeId) => TIME_ORDER.get(timeId))
    .filter((order): order is number => order !== undefined);
  return orders.length > 0 ? Math.min(...orders) : null;
}

function timesAreAdjacent(leftIds: string[], rightIds: string[]): boolean {
  const left = leftIds.map((id) => TIME_ORDER.get(id)).filter((order): order is number => order !== undefined);
  const right = rightIds.map((id) => TIME_ORDER.get(id)).filter((order): order is number => order !== undefined);
  return left.some((leftOrder) => right.some((rightOrder) => Math.abs(leftOrder - rightOrder) === 1));
}
