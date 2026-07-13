/**
 * V3 World Simulation
 *
 * Builds a seeded, fully deterministic ground-truth day at Tudor Mansion.
 * The theft (the immutable answer) is embedded as ONE thread among many:
 * the world also contains gatherings, small social groups, item lifecycles,
 * household events, and suspicious side threads that may involve anyone.
 *
 * No AI is involved here. Everything downstream (fact harvest, clue
 * scheduling, prose rendering) derives from this single WorldState, which is
 * why rendered clues can never contradict each other.
 *
 * Invariants guaranteed by the simulation:
 *  - No all-hands gathering at the answer time.
 *  - The thief is alone and unobserved in the answer location at the answer time.
 *  - The answer item is kept in the answer location and is present that day.
 *  - The answer item is never inside a secured set that locks before the answer time.
 *  - Room closures never cover (answer location, answer time).
 *  - The thief never departs early and is present from before the answer time.
 *  - Staff suspects (Mrs. White, Rusty) are present all day.
 */

import { ITEMS, LOCATIONS, SUSPECTS, TIME_PERIODS } from "../data/game-elements";
import type { Item, Location, Suspect, TimePeriod } from "../data/game-elements";
import { instantiateOccasionSpine, type OccasionSpine } from "../data/occasion-catalog";
import { SeededRandom } from "./seeded-random";
import type { Answer, OccasionTexture } from "./ai-mystery-schemas";

export const STAFF_SUSPECT_IDS = ["S03", "S10"] as const; // Mrs. White, Rusty

export type SocialState = "gathered" | "group" | "solo" | "away";

export type Placement = {
  locationId: string | null; // null when away from the mansion
  social: SocialState;
  /** Suspects sharing the same group placement (includes self), by id. */
  companions: string[];
  activity: string;
};

export type Gathering = {
  timeId: string;
  /** null for whole-house states (asleep before dawn, all retired at night). */
  locationId: string | null;
  kind: "meal" | "social" | "retired";
  label: string; // e.g. "luncheon on the terrace"
  suspectIds: string[]; // everyone present at the mansion during that slot
};

export type ItemState = {
  itemId: string;
  homeLocationId: string;
  displayedForOccasion: boolean;
  offsite: { reason: string } | null;
  /** Times at which the item was verifiably seen in place (world truth). */
  intactSightings: Array<{ timeId: string; witness: "staff" | "guests" }>;
};

export type SecuredSet = {
  itemIds: string[];
  label: string; // e.g. "the jewelry"
  fromTimeId: string;
} | null;

export type RoomClosure = {
  locationId: string;
  timeIds: string[] | "all";
  cause: string;
} | null;

export type SuspiciousThread = {
  id: string;
  kind: "private_errand" | "borrowed_item" | "private_exchange" | "surprise_task" | "foggy_memory";
  suspectIds: string[];
  locationId?: string;
  timeId?: string;
  itemId?: string;
  /** Occasion-native context; suspicious does not mean guilty. */
  cause: string;
};

export type PartyMode = "house_party" | "day_party";

export type TransitionRemark = {
  suspectId: string;
  fromTimeId: string;
  toTimeId: string;
  /** What was actually said; whether the stated reason was sincere is unknown. */
  line: string;
};

export type FeaturedSuspect = {
  suspectId: string;
  recurringProp: string;
  tension: string;
};

export type SceneStepAway = {
  suspectId: string;
  fromTimeId: string;
  absentFromTimeId: string;
  excuse: string;
  /** Private world truth. Public fragments deliberately leave return unclear. */
  destinationLocationId: string | null;
  destinationActivity: string;
  returnedDuringEpisode: boolean;
};

export type SceneEpisode = {
  id: string;
  locationId: string;
  timeIds: string[];
  /** Everyone who participates at any point in the scene. */
  participantIds: string[];
  /** People continuously witnessed in the room for the full span. */
  continuousParticipantIds: string[];
  activity: string;
  continuationActivity: string;
  prop: string;
  tension: string;
  /** Featured suspect whose answer-blind private preoccupation supplies the
   * tension. Null means the episode uses anonymous background texture. */
  tensionOwnerId: string | null;
  featuredSuspectIds: string[];
  stepAway: SceneStepAway | null;
};

export type WitnessAccountVariant =
  | "true_innocent_departure"
  | "true_thief_departure"
  | "fabricated_innocent_witness"
  | "fabricated_thief_witness";

export type WitnessAccount = {
  id: string;
  episodeId: string;
  witnessId: string;
  timeId: string;
  excuse: string;
  anonymityDevice: string;
  variant: WitnessAccountVariant;
  truthful: boolean;
  /** Private truth only; the public account always leaves identity unnamed. */
  actualDeparterId: string | null;
  fabricationReason: string | null;
};

export type WorldState = {
  seed: number;
  attempt: number;
  answer: Answer;
  occasionFamily: string;
  /** Answer-blind authored story spine fixed before the world is simulated. */
  occasionSpine: OccasionSpine;
  /** Answer-blind AI vocabulary retained for cosmetic room/item observations only. */
  occasionTexture: OccasionTexture | null;
  partyMode: PartyMode;
  /** Order-indexed time periods for convenience. */
  slots: TimePeriod[];
  arrival: { timeId: string; guestIds: string[] } | null; // day_party only
  departures: Array<{ suspectIds: string[]; timeId: string; cause: string }>;
  gatherings: Gathering[];
  /** movement[timeId][suspectId] */
  movement: Record<string, Record<string, Placement>>;
  /** Neutral social excuses spoken when somebody breaks away from a group. */
  transitionRemarks: TransitionRemark[];
  /** Uniformly selected recurring cast; never conditioned on the answer. */
  featuredCast: FeaturedSuspect[];
  /** Truthful multi-hour social arcs derived from the movement grid. */
  episodes: SceneEpisode[];
  /** Truth-ambiguous claims about unnamed departures from those episodes. */
  witnessAccounts: WitnessAccount[];
  items: Record<string, ItemState>;
  /**
   * Decoy items: nobody can quite account for these that day, so they remain
   * live candidates to the very end. This is what keeps the item category
   * honestly uncertain (2-3 candidates) while everything else is swept.
   */
  decoyItemIds: string[];
  securedSet: SecuredSet;
  roomClosure: RoomClosure;
  discovery: { timeId: string; noticedBy: string } | null;
  threads: SuspiciousThread[];
  /** 2-3 items with colorful provenance (may include the answer item). */
  objectHistories: Array<{ itemId: string; note: string }>;
  /**
   * Motives — one per several suspects, always including the thief's real
   * one. Innocent motives are honest red herrings: plenty of people had a
   * reason, only one acted on it. The closing reveals the thief's.
   */
  motives: Array<{ suspectId: string; motive: string }>;
  /**
   * The thief's FALSE alibi: they claim to have been in claimedLocationId
   * during the theft hour. The claim eliminates nothing (statements are not
   * evidence) and is dealt freely — the liar simply lies. The claimed room
   * genuinely held other people at that hour, so the truth is out there in
   * the world (and in the players' hands) for whoever cross-references it.
   */
  falseAlibi: { claimedLocationId: string } | null;
  /**
   * TRUE statements in the very same wrapper — innocents saying where they
   * were, and sometimes the thief truthfully accounting for an innocent
   * hour. These exist so "X says…" is never a lie-marker: the identical
   * clue shape must have a realistic chance of being honest.
   */
  trueStatements: Array<{ suspectId: string; timeId: string; locationId: string; corroborated: boolean }>;
};

// ---------------------------------------------------------------------------
// Catalogs (world texture, all seeded)
// ---------------------------------------------------------------------------

const DEFAULT_OCCASION_TEXTURE: OccasionTexture = {
  gatheringDetails: ["discussing the next part of the programme", "comparing impressions of the occasion"],
  inspectionContexts: ["collecting the abandoned programmes", "putting the occasion's materials in order"],
  observationContexts: ["clearing away the occasion's papers", "making the usual household rounds"],
};

/**
 * Why two-to-five people keep company — the social texture of alibis. Drawn
 * alongside the room flavor so a pair in the Library reads differently from
 * a pair in the Rose Garden, and no two games lean on the same three reasons.
 */
/** Motives — every good suspect has one; only one acted on it. */
const MOTIVE_CATALOG = [
  "gambling debts that have grown past politeness",
  "a business teetering on the edge of the receivers",
  "an inheritance dispute that never quite healed",
  "a collector's envy sharpened by years of wanting",
  "whispers of blackmail that need paying off",
  "a sister's dowry still unfunded",
  "an old wager with Mr. Boddy never settled to satisfaction",
  "quiet resentment over a slight at last year's party",
  "a taste for luxury that outruns the family allowance",
  "creditors in town who have stopped writing politely",
  "a failed venture Mr. Boddy declined to rescue",
  "the simple conviction that the piece was promised to them once",
];

const FOGGY_SENSATIONS = [
  "footsteps hurrying past the door",
  "a door standing ajar that should have been shut",
  "a figure crossing the end of the corridor",
  "the creak of the display case hinge",
  "someone moving in the shrubbery",
  "a light where no light should have been",
];

const OFFSITE_REASONS = [
  "away with a repairer in the village",
  "sent out for professional cleaning",
  "on loan to a museum acquaintance",
];

const CLOSURE_CAUSES = [
  "the floor was being waxed after a spill",
  "decorators had the room sheeted and closed",
  "a broken window pane was being reglazed",
];

const DEPARTURE_CAUSES = [
  "called away by an urgent telegram",
  "pleading a dreadful headache",
  "expected at another engagement",
];

/**
 * Generic provenance color, safe for any item. The famous "given by his late
 * uncle, Dr. Black" line is CANONICAL MEDAL LORE (see game-elements.ts and
 * the original disc's first mystery) and must never migrate to other items.
 */
const OBJECT_NOTES = [
  "a favorite of Mr. Boddy's, acquired on his travels",
  "recently appraised at a handsome sum",
  "the subject of much admiration when shown to guests",
  "won from an old rival in a wager Mr. Boddy still chuckles about",
  "brought back from his celebrated winter in Monte Carlo",
  "a souvenir of his sailing days he claims is priceless",
];

const MEDAL_ITEM_ID = "I04";
const MEDAL_NOTE = "given to Mr. Boddy by his late uncle, Dr. Black";

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

type GatheringOption = {
  timeId: string;
  kind: "meal" | "social";
  locationId: string;
  label: string;
};

function gatheringOptionsForSpine(spine: OccasionSpine): GatheringOption[] {
  const socialSlots = TIME_PERIODS.filter((slot) => slot.order >= 2 && slot.order <= 9);
  return socialSlots.map((slot) => {
    const direct = spine.beats.find((beat) => beat.timeIds.includes(slot.id));
    const beat = direct ?? spine.beats.reduce((nearest, candidate) => {
      const nearestDistance = Math.min(...nearest.timeIds.map((timeId) => Math.abs(requireTime(timeId).order - slot.order)));
      const candidateDistance = Math.min(...candidate.timeIds.map((timeId) => Math.abs(requireTime(timeId).order - slot.order)));
      return candidateDistance < nearestDistance ? candidate : nearest;
    });
    return {
      timeId: slot.id,
      kind: [2, 4, 8].includes(slot.order) ? "meal" : "social",
      locationId: beat.locationId,
      label: beat.gatheringLabel,
    };
  });
}

function chooseGatheringSlate(
  rng: SeededRandom,
  pool: GatheringOption[],
  count: number,
  arrival: WorldState["arrival"],
  departures: WorldState["departures"]
): GatheringOption[] {
  if (count <= 0) return [];
  let fallback = rng.pickMultiple(pool, count);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = attempt === 0 ? fallback : rng.pickMultiple(pool, count);
    const occupied = new Set(candidate.map((option) => option.timeId));
    const freeOrders = TIME_PERIODS
      .filter((slot) =>
        slot.order >= 2 &&
        slot.order <= 9 &&
        !occupied.has(slot.id) &&
        isSlotAttended(slot.id, arrival, departures)
      )
      .map((slot) => slot.order);
    const hasContinuingSceneWindow = freeOrders.some((order) => freeOrders.includes(order + 1));
    if (hasContinuingSceneWindow) return candidate;
    fallback = candidate;
  }
  return fallback;
}

export function simulateWorld(params: {
  seed: number;
  attempt: number;
  answer: Answer;
  occasionFamily: string;
  occasionSpine?: OccasionSpine;
}): WorldState {
  const { answer, occasionFamily } = params;
  const occasionSpine = params.occasionSpine ?? instantiateOccasionSpine(occasionFamily, params.seed);
  const rng = new SeededRandom(hashSeed(params.seed, params.attempt));
  const featuredCast = buildFeaturedCast(params.seed, params.attempt, occasionSpine);
  const slots = [...TIME_PERIODS].sort((a, b) => a.order - b.order);
  const answerTime = requireTime(answer.timeId);
  const thiefIsStaff = (STAFF_SUSPECT_IDS as readonly string[]).includes(answer.suspectId);

  // --- Party mode, arrival, departures -----------------------------------
  // day_party: guests arrive mid-morning and the party breaks up in the
  // evening. Only simulated when the theft window fits inside the party
  // (or the thief is household staff, who are present regardless).
  let partyMode: PartyMode = "house_party";
  let arrival: WorldState["arrival"] = null;
  const guestIds = SUSPECTS.map((s) => s.id).filter((id) => !(STAFF_SUSPECT_IDS as readonly string[]).includes(id));
  const arrivalOrderCandidate = rng.pick([2, 3]);
  const breakupOrder = rng.pick([8, 9]);
  const canDayParty = thiefIsStaff ||
    (arrivalOrderCandidate < answerTime.order && answerTime.order <= breakupOrder);
  if (canDayParty && rng.nextBool(0.45)) {
    partyMode = "day_party";
    arrival = { timeId: timeAtOrder(arrivalOrderCandidate).id, guestIds };
  }

  const departures: WorldState["departures"] = [];
  if (partyMode === "day_party") {
    // A couple of guests may slip away early. Leaving before the theft is
    // legitimate — it clears them. Only the thief must stay through the theft.
    let remaining = [...guestIds];
    const earlyOptions = [6, 7].filter(
      (order) => order > requireTime(arrival!.timeId).order && order < breakupOrder && order !== answerTime.order
    );
    if (earlyOptions.length > 0 && rng.nextBool(0.5)) {
      const earlyOrder = rng.pick(earlyOptions);
      const eligible = remaining.filter((id) => id !== answer.suspectId);
      const leavers = rng.pickMultiple(eligible, rng.nextInt(1, 2));
      if (leavers.length > 0) {
        departures.push({ suspectIds: leavers, timeId: timeAtOrder(earlyOrder).id, cause: rng.pick(DEPARTURE_CAUSES) });
        remaining = remaining.filter((id) => !leavers.includes(id));
      }
    }
    // …and the party breaks up in the evening. If the thief is a guest, the
    // canDayParty condition already guarantees the theft happened by then.
    if (remaining.length > 0) {
      departures.push({
        suspectIds: remaining,
        timeId: timeAtOrder(breakupOrder).id,
        cause: "the motorcars came round and the party broke up",
      });
    }
  } else if (rng.nextBool(0.5)) {
    // House parties lose a guest or two during the day — a departure is the
    // strongest natural suspect-clearer there is. Never dated to the theft
    // hour itself (that naming is exactly the tell we avoid).
    const departOptions = [5, 6, 7, 8, 9].filter((order) => order !== answerTime.order);
    const departOrder = rng.pick(departOptions);
    const eligible = guestIds.filter((id) => id !== answer.suspectId);
    const leavers = rng.pickMultiple(eligible, rng.nextInt(1, 2));
    if (leavers.length > 0) {
      departures.push({ suspectIds: leavers, timeId: timeAtOrder(departOrder).id, cause: rng.pick(DEPARTURE_CAUSES) });
    }
  }

  // --- Gatherings (never at the answer time) ------------------------------
  const gatheringPool = gatheringOptionsForSpine(occasionSpine).filter((option) => option.timeId !== answer.timeId)
    .filter((option) => isSlotAttended(option.timeId, arrival, departures));
  // Leave at least two attended social slots for a lived scene to continue;
  // gatherings still number 3-5, but they no longer consume every usable
  // hour of a short day-party schedule.
  const gatheringCount = Math.min(
    rng.nextInt(3, 5),
    gatheringPool.length,
    Math.max(3, gatheringPool.length - 2)
  );
  const chosenGatherings = chooseGatheringSlate(rng, gatheringPool, gatheringCount, arrival, departures)
    .sort((a, b) => requireTime(a.timeId).order - requireTime(b.timeId).order);
  const gatherings: Gathering[] = chosenGatherings.map((option) => {
    // Preserve one texture draw per gathering. Keeping structural randomness
    // on the same stream means an occasion wording change cannot reshuffle
    // the rest of an otherwise identical day.
    rng.next();
    return {
      timeId: option.timeId,
      locationId: option.locationId,
      kind: option.kind,
      label: option.label,
      suspectIds: presentSuspects(option.timeId, arrival, departures),
    };
  });

  // Whole-house states: everyone abed before dawn, everyone retired at
  // midnight. These are the great natural time-killers of the original game
  // ("everyone asleep, staff retired, quiet mansion"). Never at answer time.
  if (answer.timeId !== "T01") {
    gatherings.unshift({
      timeId: "T01",
      locationId: null,
      kind: "retired",
      label: partyMode === "house_party" ? "the whole house still abed" : "only the household stirring",
      suspectIds: presentSuspects("T01", arrival, departures),
    });
  }
  if (answer.timeId !== "T10") {
    gatherings.push({
      timeId: "T10",
      locationId: null,
      kind: "retired",
      label: "the house locked up and everyone retired",
      suspectIds: presentSuspects("T10", arrival, departures),
    });
  }

  // --- Suspicious side threads --------------------------------------------
  const threads = buildThreads(rng, answer, arrival, departures, occasionSpine);

  // --- Movement grid -------------------------------------------------------
  const movement = buildMovementGrid(rng, slots, answer, gatherings, threads, arrival, departures, occasionSpine);
  // Dialogue is generated from a separate stream so adding prose texture can
  // never alter the actual movements or deduction structure of the day.
  const transitionRemarks = buildTransitionRemarks(
    new SeededRandom(hashSeed(params.seed ^ 0x4f1bbcdc, params.attempt)),
    slots,
    movement,
    occasionSpine
  );
  const episodes = deriveSceneEpisodes(
    new SeededRandom(hashSeed(params.seed ^ 0x718a6d35, params.attempt)),
    slots,
    movement,
    gatherings,
    transitionRemarks,
    featuredCast,
    occasionSpine
  );
  const witnessAccounts = buildWitnessAccounts(
    new SeededRandom(hashSeed(params.seed ^ 0x2a6f9d83, params.attempt)),
    episodes,
    occasionSpine,
    answer
  );

  // --- Item lifecycles ------------------------------------------------------
  const items = buildItemStates(rng, answer, movement, gatherings);

  // Decoy items: 1-2 pieces from one non-answer category whose whereabouts
  // simply never come up. They hold the item candidates at 2-3 to the end.
  // Decoys 3-5, drawn from ALL categories: with item cards dealt to players
  // like every other card, the public clues keep a broad item field and the
  // hands close it — no more single obvious on-theme piece by the end.
  const answerCategory = requireItem(answer.itemId).category;
  const decoyCandidates = ITEMS.filter(
    (item) => item.id !== answer.itemId && !items[item.id]?.offsite
  );
  const decoyItemIds = rng
    .pickMultiple(decoyCandidates, Math.min(decoyCandidates.length, rng.nextInt(3, 5)))
    .map((item) => item.id);

  // Secured set: a category's remaining members (never the answer's, never decoys).
  let securedSet: SecuredSet = null;
  const securableCategories = (["antique", "desk", "jewelry"] as const).filter(
    (category) =>
      category !== answerCategory &&
      ITEMS.filter((item) => item.category === category && item.id !== answer.itemId && !decoyItemIds.includes(item.id)).length >= 2
  );
  if (securableCategories.length > 0 && rng.nextBool(0.7)) {
    const securedCategory = rng.pick(securableCategories);
    const fromOrder = rng.pick([6, 7, 8].filter((order) => order !== answerTime.order));
    securedSet = {
      itemIds: ITEMS.filter(
        (item) => item.category === securedCategory && item.id !== answer.itemId && !decoyItemIds.includes(item.id)
      ).map((item) => item.id).slice(0, 2),
      label: securedCategory === "jewelry" ? "the jewelry" : securedCategory === "desk" ? "the desk pieces" : "the antiques",
      fromTimeId: timeAtOrder(fromOrder).id,
    };
  }

  // Room closure: choose only a room that the simulated day actually leaves
  // empty for the full closed interval. Selecting a closure from the card
  // list alone once produced a Study that was supposedly sealed all day
  // while two suspects were simultaneously witnessed inside it.
  let roomClosure: RoomClosure = null;
  if (rng.nextBool(0.65)) {
    const indoorCandidates = LOCATIONS.filter(
      (location) => location.id !== answer.locationId && location.type === "indoor"
    );
    const roomIsUnused = (locationId: string, timeIds: string[]): boolean =>
      timeIds.every((timeId) =>
        !gatherings.some((gathering) => gathering.timeId === timeId && gathering.locationId === locationId) &&
        !Object.values(movement[timeId] ?? {}).some((placement) => placement.locationId === locationId)
      );
    const allTimeIds = slots.map((slot) => slot.id);
    const allDayCandidates = indoorCandidates.filter((location) => roomIsUnused(location.id, allTimeIds));
    const partialOptions = rng.shuffle([4, 5, 6, 7]).flatMap((cap) => {
      const timeIds = slots.filter((slot) => slot.order <= cap).map((slot) => slot.id);
      return indoorCandidates
        .filter((location) => roomIsUnused(location.id, timeIds))
        .map((location) => ({ location, timeIds }));
    });
    const preferAllDay = rng.nextBool(0.6);
    if (preferAllDay && allDayCandidates.length > 0) {
      roomClosure = {
        locationId: rng.pick(allDayCandidates).id,
        timeIds: "all",
        cause: rng.pick(CLOSURE_CAUSES),
      };
    } else if (partialOptions.length > 0) {
      const option = rng.pick(partialOptions);
      roomClosure = {
        locationId: option.location.id,
        timeIds: option.timeIds,
        cause: rng.pick(CLOSURE_CAUSES),
      };
    } else if (allDayCandidates.length > 0) {
      roomClosure = {
        locationId: rng.pick(allDayCandidates).id,
        timeIds: "all",
        cause: rng.pick(CLOSURE_CAUSES),
      };
    }
  }

  // --- Discovery ------------------------------------------------------------
  let discovery: WorldState["discovery"] = null;
  if (answerTime.order < 10) {
    const gatheringAfter = gatherings.find((gathering) => requireTime(gathering.timeId).order > answerTime.order);
    const discoveryOrder = gatheringAfter
      ? requireTime(gatheringAfter.timeId).order
      : Math.min(10, answerTime.order + rng.nextInt(1, 2));
    discovery = {
      timeId: timeAtOrder(discoveryOrder).id,
      noticedBy: rng.nextBool(0.5) ? "Ashe" : "Mr. Boddy",
    };
  }

  // --- Motives ---------------------------------------------------------------
  // The thief always has one (the closing will cite it); several innocents
  // have one too — plenty of reasons in the room, only one acted upon.
  // Motive supply must not depend on featured-cast membership: doing so made
  // worlds where the thief was featured subtly easier to schedule. Use a
  // separate stream and a fixed five-person field instead.
  const motiveRng = new SeededRandom(hashSeed(params.seed ^ 0x64a01f2b, params.attempt));
  const innocentMotiveIds = motiveRng.pickMultiple(
    SUSPECTS.map((suspect) => suspect.id).filter((suspectId) => suspectId !== answer.suspectId),
    4
  );
  const motiveSuspects = [answer.suspectId, ...innocentMotiveIds];
  const motivePool = motiveRng.shuffle([...MOTIVE_CATALOG]);
  const motives = motiveSuspects.map((suspectId, index) => ({
    suspectId,
    motive: motivePool[index % motivePool.length],
  }));

  // --- The thief's false alibi -------------------------------------------------
  // They claim a room that a group ACTUALLY held during the theft hour — so
  // the group's own true testimony quietly gives the lie away.
  let falseAlibi: WorldState["falseAlibi"] = null;
  if (rng.nextBool(0.6)) {
    const placementsAtTheft = movement[answer.timeId] ?? {};
    const groupRooms = [...new Set(
      Object.values(placementsAtTheft)
        .filter((placement) => placement.social === "group" && placement.locationId)
        .map((placement) => placement.locationId as string)
    )].filter((locationId) => locationId !== answer.locationId);
    if (groupRooms.length > 0) {
      falseAlibi = { claimedLocationId: rng.pick(groupRooms) };
    }
  }

  // --- True statements (same wrapper as the lie) -------------------------------
  const trueStatements: WorldState["trueStatements"] = [];
  {
    const speakerPool = rng.shuffle(SUSPECTS.map((s) => s.id));
    for (const speakerId of speakerPool) {
      if (trueStatements.length >= 3) break;
      // The thief may speak too — truthfully, about an hour that is not the
      // theft hour. Everyone else may speak about any hour, including the
      // theft hour (they were innocently elsewhere, after all).
      const slotPool = slots.filter((slot) => {
        if (speakerId === answer.suspectId && slot.id === answer.timeId) return false;
        const placement = movement[slot.id]?.[speakerId];
        return Boolean(placement && placement.locationId && placement.social !== "away");
      });
      if (slotPool.length === 0) continue;
      const slot = rng.pick(slotPool);
      const placement = movement[slot.id][speakerId];
      trueStatements.push({
        suspectId: speakerId,
        timeId: slot.id,
        locationId: placement.locationId as string,
        corroborated: placement.social !== "solo",
      });
    }
  }

  // --- Object histories ------------------------------------------------------
  const historyItems = rng.pickMultiple(ITEMS, rng.nextInt(2, 3));
  const objectHistories = historyItems.map((item) => ({
    itemId: item.id,
    note: item.id === MEDAL_ITEM_ID && rng.nextBool(0.6) ? MEDAL_NOTE : rng.pick(OBJECT_NOTES),
  }));

  return {
    seed: params.seed,
    attempt: params.attempt,
    answer,
    occasionFamily,
    occasionSpine,
    occasionTexture: null,
    partyMode,
    slots,
    arrival,
    departures,
    gatherings,
    movement,
    transitionRemarks,
    featuredCast,
    episodes,
    witnessAccounts,
    items,
    decoyItemIds,
    securedSet,
    roomClosure,
    discovery,
    threads,
    objectHistories,
    motives,
    falseAlibi,
    trueStatements,
  };
}

/** Store answer-blind dossier vocabulary without letting it rewrite world truth. */
export function applyOccasionTexture(world: WorldState, proposed: OccasionTexture): void {
  // The authored spine has already made activities, gatherings, threads, and
  // excuses true. Dossier output is now cosmetic vocabulary only; allowing a
  // model response to rewrite movement truth here would recreate the old
  // theme-after-facts dependency that the occasion spine replaces.
  world.occasionTexture = normalizeOccasionTexture(proposed, world.occasionSpine);
}

// ---------------------------------------------------------------------------
// Movement grid construction
// ---------------------------------------------------------------------------

function buildMovementGrid(
  rng: SeededRandom,
  slots: TimePeriod[],
  answer: Answer,
  gatherings: Gathering[],
  threads: SuspiciousThread[],
  arrival: WorldState["arrival"],
  departures: WorldState["departures"],
  occasionSpine: OccasionSpine
): Record<string, Record<string, Placement>> {
  const grid: Record<string, Record<string, Placement>> = {};
  const gatheringByTime = new Map(gatherings.map((gathering) => [gathering.timeId, gathering]));
  const socialRooms = LOCATIONS.filter((location) => location.id !== answer.locationId);

  // Persistent social circles — the bridge set, the billiards set, the staff.
  // People keep the same company through a day, which is exactly what lets
  // testimony clear the same suspects at several different hours.
  const guests = SUSPECTS.map((s) => s.id).filter((id) => !(STAFF_SUSPECT_IDS as readonly string[]).includes(id));
  const circles: string[][] = [];
  const shuffledGuests = rng.shuffle([...guests]);
  while (shuffledGuests.length > 0) {
    const size = shuffledGuests.length <= 4 ? shuffledGuests.length : rng.nextInt(3, 4);
    circles.push(shuffledGuests.splice(0, Math.min(size, shuffledGuests.length)));
  }
  circles.push([...STAFF_SUSPECT_IDS]);
  const circleRooms = new Map<number, string>();
  const circleActivities = new Map<number, string>();
  let plannedStepAwaysRemaining = rng.nextInt(1, 3);

  /** Groups from the previous non-gathering slot, for sticky carry-over. */
  let previousGroups: Array<{ members: string[]; locationId: string; activity: string }> = [];

  // Dispersal hours: once or twice a day the party naturally scatters — a
  // rest after lunch, dressing before dinner — and several guests are simply
  // alone. Being unaccounted for is ordinary, which is what keeps suspicion
  // spread wide rather than pinned on whoever lacks an alibi.
  const gatheringTimeIds = new Set(gatherings.map((gathering) => gathering.timeId));
  const dispersalCandidates = slots.filter(
    (slot) => !gatheringTimeIds.has(slot.id) && slot.order >= 3 && slot.order <= 9
  );
  const dispersalTimeIds = new Set(
    rng.pickMultiple(dispersalCandidates, Math.min(dispersalCandidates.length, rng.nextInt(1, 2))).map((slot) => slot.id)
  );

  for (const slot of slots) {
    const placements: Record<string, Placement> = {};
    const present = presentSuspects(slot.id, arrival, departures);
    const away = SUSPECTS.map((s) => s.id).filter((id) => !present.includes(id));
    for (const suspectId of away) {
      placements[suspectId] = { locationId: null, social: "away", companions: [suspectId], activity: "away from the mansion" };
    }

    const gathering = gatheringByTime.get(slot.id);
    if (gathering) {
      for (const suspectId of present) {
        placements[suspectId] = {
          locationId: gathering.locationId,
          social: "gathered",
          companions: [...present],
          activity: gathering.label,
        };
      }
      grid[slot.id] = placements;
      previousGroups = [];
      continue;
    }

    // Non-gathering slot: place the thief first, then thread solos, then circles.
    let unplaced = [...present];
    if (slot.id === answer.timeId) {
      placements[answer.suspectId] = {
        locationId: answer.locationId,
        social: "solo",
        companions: [answer.suspectId],
        activity: "briefly unaccounted for",
      };
      unplaced = unplaced.filter((id) => id !== answer.suspectId);
    }

    for (const thread of threads) {
      if (thread.timeId !== slot.id || !thread.locationId) continue;
      for (const suspectId of thread.suspectIds) {
        if (!unplaced.includes(suspectId)) continue;
        placements[suspectId] = {
          locationId: thread.locationId,
          social: thread.suspectIds.length > 1 ? "group" : "solo",
          companions: [...thread.suspectIds],
          activity: thread.cause,
        };
        unplaced = unplaced.filter((id) => id !== suspectId);
      }
    }

    // Routine episode departures are generated before sticky carry-over, so
    // the people left behind truly continue their shared activity. This is
    // answer-blind social machinery: an innocent usually runs the errand; if
    // the thief happens to peel away into the theft placement, the identical
    // transition becomes a genuine glimpse of opportunity.
    if (plannedStepAwaysRemaining > 0 && previousGroups.length > 0) {
      const peelable = previousGroups.filter((group) =>
        group.members.filter((member) => unplaced.includes(member)).length >= 3
      );
      for (const group of rng.shuffle(peelable)) {
        if (plannedStepAwaysRemaining <= 0) break;
        const eligible = group.members.filter((member) => unplaced.includes(member));
        if (eligible.length < 3) continue;
        const leaver = rng.pick(eligible);
        const occupied = new Set(
          Object.values(placements)
            .map((placement) => placement.locationId)
            .filter((locationId): locationId is string => Boolean(locationId))
        );
        const roomPool = socialRooms.filter((room) =>
          room.id !== group.locationId &&
          !occupied.has(room.id) &&
          !(slot.id === answer.timeId && room.id === answer.locationId)
        );
        const destination = rng.pick(roomPool.length > 0 ? roomPool : socialRooms.filter((room) =>
          room.id !== group.locationId && !(slot.id === answer.timeId && room.id === answer.locationId)
        ));
        placements[leaver] = {
          locationId: destination.id,
          social: "solo",
          companions: [leaver],
          activity: rng.pick(occasionSpine.soloActivities),
        };
        unplaced = unplaced.filter((member) => member !== leaver);
        plannedStepAwaysRemaining -= 1;
      }
    }

    // Sticky carry-over: preserve the people who genuinely remain together,
    // even when one member peels away or is pulled into a private thread. The
    // old all-or-nothing equality check shattered exactly the useful episode:
    // A, B, and C share an activity; C excuses themself; A and B carry on.
    for (const group of previousGroups) {
      const carryWholeGroup = rng.nextBool(0.55);
      const stillHere = group.members.filter((member) => unplaced.includes(member));
      if (stillHere.length < 2) continue;
      const memberPeeledAway = stillHere.length < group.members.length;
      if (!memberPeeledAway && !carryWholeGroup) continue;
      if (slot.id === answer.timeId && group.locationId === answer.locationId) continue;
      for (const member of stillHere) {
        placements[member] = {
          locationId: group.locationId,
          social: "group",
          companions: [...stillHere],
          activity: group.activity,
        };
      }
      unplaced = unplaced.filter((id) => !stillHere.includes(id));
    }

    // Dispersal hour: several guests drift off alone to different corners.
    if (dispersalTimeIds.has(slot.id)) {
      const wanderCount = Math.min(rng.nextInt(2, 3), Math.max(0, unplaced.length - 4));
      const wanderers = rng.pickMultiple(
        unplaced.filter((id) => id !== answer.suspectId),
        Math.min(wanderCount, unplaced.filter((id) => id !== answer.suspectId).length)
      );
      const wanderRooms = rng.shuffle(
        socialRooms.filter((room) => !(slot.id === answer.timeId && room.id === answer.locationId))
      );
      wanderers.forEach((wanderer, index) => {
        placements[wanderer] = {
          locationId: wanderRooms[index % wanderRooms.length].id,
          social: "solo",
          companions: [wanderer],
          activity: rng.pick(occasionSpine.soloActivities),
        };
      });
      unplaced = unplaced.filter((id) => !wanderers.includes(id));
    } else if (unplaced.length > 4 && rng.nextBool(0.25)) {
      // Occasionally one extra innocent solo for texture (never in the answer room).
      const soloCandidates = unplaced.filter((id) => id !== answer.suspectId);
      if (soloCandidates.length > 0) {
        const soloSuspect = rng.pick(soloCandidates);
        const room = rng.pick(socialRooms);
        placements[soloSuspect] = {
          locationId: room.id,
          social: "solo",
          companions: [soloSuspect],
          activity: rng.pick(occasionSpine.soloActivities),
        };
        unplaced = unplaced.filter((id) => id !== soloSuspect);
      }
    }

    // Place remaining suspects with their circles (rooms drift slowly).
    const occupiedRooms = new Set(
      Object.values(placements)
        .map((placement) => placement.locationId)
        .filter((id): id is string => Boolean(id))
    );
    const legalRooms = socialRooms.filter(
      (room) => !(slot.id === answer.timeId && room.id === answer.locationId)
    );
    circles.forEach((circle, circleIndex) => {
      const members = circle.filter((member) => unplaced.includes(member));
      if (members.length === 0) return;
      let roomId = circleRooms.get(circleIndex);
      const roomTaken = roomId !== undefined && occupiedRooms.has(roomId);
      const wantsMove = rng.nextBool(0.35);
      if (roomId === undefined || roomTaken || wantsMove || (slot.id === answer.timeId && roomId === answer.locationId)) {
        const fresh = legalRooms.filter((room) => !occupiedRooms.has(room.id));
        const pool = fresh.length > 0 ? fresh : legalRooms;
        roomId = rng.pick(pool).id;
        circleRooms.set(circleIndex, roomId);
        circleActivities.set(circleIndex, pickActivity(rng, occasionSpine));
      }
      occupiedRooms.add(roomId);
      const activity = circleActivities.get(circleIndex) ?? pickGroupActivity(rng, occasionSpine);
      for (const member of members) {
        placements[member] = {
          locationId: roomId,
          social: members.length > 1 ? "group" : "solo",
          companions: [...members],
          activity: members.length > 1 ? activity : rng.pick(occasionSpine.soloActivities),
        };
      }
      unplaced = unplaced.filter((id) => !members.includes(id));
    });

    // Remember this slot's groups for sticky carry-over.
    previousGroups = [];
    const seen = new Set<string>();
    for (const placement of Object.values(placements)) {
      if (placement.social !== "group" || !placement.locationId) continue;
      const key = placement.companions.slice().sort().join("+");
      if (seen.has(key)) continue;
      seen.add(key);
      previousGroups.push({
        members: [...placement.companions],
        locationId: placement.locationId,
        activity: placement.activity,
      });
    }

    grid[slot.id] = placements;
  }
  return grid;
}

function buildTransitionRemarks(
  rng: SeededRandom,
  slots: TimePeriod[],
  movement: Record<string, Record<string, Placement>>,
  occasionSpine: OccasionSpine
): TransitionRemark[] {
  const remarks: TransitionRemark[] = [];
  for (let index = 0; index < slots.length - 1; index += 1) {
    const from = slots[index];
    const to = slots[index + 1];
    for (const suspect of SUSPECTS) {
      const before = movement[from.id]?.[suspect.id];
      const after = movement[to.id]?.[suspect.id];
      if (!before || !after || before.social !== "group") continue;
      const sameCompany =
        after.social === "group" &&
        before.companions.slice().sort().join("+") === after.companions.slice().sort().join("+");
      if (sameCompany && before.locationId === after.locationId) continue;
      if (after.locationId === before.locationId) continue;
      // Only create dialogue for a real handoff: at least two of the people
      // being left behind continue together in the same room next hour.
      const continuingCompanions = before.companions.filter((companionId) => {
        if (companionId === suspect.id) return false;
        const nextPlacement = movement[to.id]?.[companionId];
        return Boolean(
          nextPlacement &&
          nextPlacement.social === "group" &&
          nextPlacement.locationId === before.locationId
        );
      });
      if (continuingCompanions.length < 2) continue;
      remarks.push({
        suspectId: suspect.id,
        fromTimeId: from.id,
        toTimeId: to.id,
        line: rng.pick(occasionSpine.excuses),
      });
    }
  }
  return remarks;
}

function buildFeaturedCast(seed: number, attempt: number, spine: OccasionSpine): FeaturedSuspect[] {
  const rng = new SeededRandom(hashSeed(seed ^ 0x39d47f21, attempt));
  const count = rng.nextInt(3, 5);
  const suspectIds = rng.pickMultiple(SUSPECTS.map((suspect) => suspect.id), count);
  const chooseAssignments = (values: string[]): string[] => {
    const unique = rng.shuffle([...new Set(values)]);
    if (unique.length === 0) return Array.from({ length: count }, () => "the occasion materials");
    return Array.from({ length: count }, (_, index) => unique[index % unique.length]);
  };
  const props = chooseAssignments(spine.setDressing);
  // Solo occasion activities are also truthful private preoccupations. Using
  // them beside the dedicated thread causes gives every featured suspect a
  // distinct undercurrent instead of assigning two people the same secret.
  const tensionPool = [...new Set([...spine.threadCauses, ...spine.soloActivities])];
  const tensions = chooseAssignments(tensionPool);
  return suspectIds.map((suspectId, index) => ({
    suspectId,
    recurringProp: props[index],
    tension: tensions[index],
  }));
}

type EpisodeCandidate = Omit<SceneEpisode, "id" | "prop" | "tension" | "tensionOwnerId" | "featuredSuspectIds">;
type GroupMoment = {
  timeId: string;
  locationId: string;
  memberIds: string[];
  activity: string;
};

/**
 * Convert the simulated movement grid into maximal continuing scenes. A scene
 * survives people joining or leaving as long as at least two witnesses remain
 * together in the same room. This is the world-level source for later linked
 * fragments; the harvest no longer has to guess that two atoms belong together.
 */
function deriveSceneEpisodes(
  rng: SeededRandom,
  slots: TimePeriod[],
  movement: Record<string, Record<string, Placement>>,
  gatherings: Gathering[],
  transitionRemarks: TransitionRemark[],
  featuredCast: FeaturedSuspect[],
  spine: OccasionSpine
): SceneEpisode[] {
  const gatheringTimes = new Set(gatherings.map((gathering) => gathering.timeId));
  const momentsByTime = new Map<string, GroupMoment[]>();

  for (const slot of slots) {
    if (gatheringTimes.has(slot.id)) continue;
    const moments: GroupMoment[] = [];
    const seen = new Set<string>();
    for (const placement of Object.values(movement[slot.id] ?? {})) {
      if (placement.social !== "group" || !placement.locationId || placement.companions.length < 2) continue;
      const members = placement.companions.slice().sort();
      const key = `${placement.locationId}|${members.join("+")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      moments.push({
        timeId: slot.id,
        locationId: placement.locationId,
        memberIds: members,
        activity: placement.activity,
      });
    }
    momentsByTime.set(slot.id, moments);
  }

  const candidates: EpisodeCandidate[] = [];
  for (let startIndex = 0; startIndex < slots.length - 1; startIndex += 1) {
    const firstSlot = slots[startIndex];
    for (const first of momentsByTime.get(firstSlot.id) ?? []) {
      let core = [...first.memberIds];
      const states = [first];
      for (let index = startIndex + 1; index < slots.length; index += 1) {
        const nextSlot = slots[index];
        const next = (momentsByTime.get(nextSlot.id) ?? [])
          .filter((moment) => moment.locationId === first.locationId)
          .map((moment) => ({
            moment,
            overlap: core.filter((suspectId) => moment.memberIds.includes(suspectId)),
          }))
          .sort((a, b) => b.overlap.length - a.overlap.length)[0];
        if (!next || next.overlap.length < 2) break;
        core = next.overlap;
        states.push(next.moment);
      }
      if (states.length < 2) continue;

      const participants = [...new Set(states.flatMap((state) => state.memberIds))].sort();
      let stepAway: SceneStepAway | null = null;
      for (let index = 0; index < states.length - 1 && !stepAway; index += 1) {
        const before = states[index];
        const after = states[index + 1];
        const leaver = before.memberIds.find((suspectId) => !after.memberIds.includes(suspectId));
        if (!leaver) continue;
        const remark = transitionRemarks.find(
          (candidate) =>
            candidate.suspectId === leaver &&
            candidate.fromTimeId === before.timeId &&
            candidate.toTimeId === after.timeId
        );
        if (!remark) continue;
        const destination = movement[after.timeId]?.[leaver];
        stepAway = {
          suspectId: leaver,
          fromTimeId: before.timeId,
          absentFromTimeId: after.timeId,
          excuse: remark.line,
          destinationLocationId: destination?.locationId ?? null,
          destinationActivity: destination?.activity ?? "away from the scene",
          returnedDuringEpisode: states.slice(index + 2).some((state) => state.memberIds.includes(leaver)),
        };
      }

      candidates.push({
        locationId: first.locationId,
        timeIds: states.map((state) => state.timeId),
        participantIds: participants,
        continuousParticipantIds: core.slice().sort(),
        activity: states[0].activity,
        continuationActivity: states[states.length - 1].activity,
        stepAway,
      });
    }
  }

  // Longest truthful span wins. Shorter starts contained inside the same
  // continuous scene add no material and would only create duplicate clues.
  const maximal: EpisodeCandidate[] = [];
  for (const candidate of candidates.sort((a, b) => b.timeIds.length - a.timeIds.length)) {
    const contained = maximal.some((stronger) =>
      stronger.locationId === candidate.locationId &&
      candidate.timeIds.every((timeId) => stronger.timeIds.includes(timeId)) &&
      candidate.continuousParticipantIds.every((suspectId) => stronger.continuousParticipantIds.includes(suspectId))
    );
    if (!contained) maximal.push(candidate);
  }

  const withStepAway = maximal.filter((candidate) => candidate.stepAway);
  const stepAwayTarget = Math.min(withStepAway.length, rng.nextInt(1, 3));
  const selected = rng.pickMultiple(withStepAway, stepAwayTarget);
  const selectedSet = new Set(selected);
  const remaining = maximal
    .filter((candidate) => !selectedSet.has(candidate) && !candidate.stepAway)
    .map((candidate) => ({
      candidate,
      score:
        candidate.timeIds.length * 3 +
        rng.next(),
    }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.candidate);
  const totalTarget = Math.min(maximal.length, 6);
  selected.push(...remaining.slice(0, Math.max(0, totalTarget - selected.length)));

  const usedPropOwners = new Map<string, string | null>();
  const usedTensionOwners = new Map<string, string | null>();
  const reservedFeaturedProps = new Set(featuredCast.map((entry) => entry.recurringProp));
  const reservedFeaturedTensions = new Set(featuredCast.map((entry) => entry.tension));
  return selected
    .sort((a, b) => requireTime(a.timeIds[0]).order - requireTime(b.timeIds[0]).order)
    .map((candidate, index) => {
      const featuredInEpisode = featuredCast.filter((entry) =>
        candidate.participantIds.includes(entry.suspectId)
      );
      const significantWords = (value: string): Set<string> => new Set(
        (value.toLowerCase().match(/[a-z]+/g) ?? []).filter((word) => word.length >= 5)
      );
      const activityWords = significantWords(candidate.activity);
      const isCompatible = (value: string): boolean =>
        ![...significantWords(value)].some((word) => activityWords.has(word));
      const compatibleFeaturedProps = featuredInEpisode.filter((entry) => isCompatible(entry.recurringProp));
      const featuredPropOwner = compatibleFeaturedProps.find((entry) => {
        const priorOwner = usedPropOwners.get(entry.recurringProp);
        return priorOwner === undefined || priorOwner === entry.suspectId;
      });
      const shuffledProps = rng.shuffle([...new Set(spine.setDressing)]);
      const prop = featuredPropOwner?.recurringProp ??
        shuffledProps.find((entry) => isCompatible(entry) && !usedPropOwners.has(entry) && !reservedFeaturedProps.has(entry)) ??
        shuffledProps.find((entry) => isCompatible(entry) && !usedPropOwners.has(entry)) ??
        shuffledProps.find(isCompatible) ??
        spine.setDressing[0];
      if (!usedPropOwners.has(prop)) {
        usedPropOwners.set(prop, featuredPropOwner?.suspectId ?? null);
      }

      const fallbackTensions = [...new Set([...spine.threadCauses, ...spine.soloActivities])];
      const compatibleFallbacks = fallbackTensions.filter((entry) =>
        isCompatible(entry)
      );
      const tensionOwner = featuredInEpisode.find((entry) => {
        if (!isCompatible(entry.tension)) return false;
        const priorOwner = usedTensionOwners.get(entry.tension);
        return priorOwner === undefined || priorOwner === entry.suspectId;
      });
      const shuffledTensions = rng.shuffle(compatibleFallbacks.length > 0 ? compatibleFallbacks : fallbackTensions);
      const tension = tensionOwner?.tension ??
        shuffledTensions.find((entry) => !usedTensionOwners.has(entry) && !reservedFeaturedTensions.has(entry)) ??
        shuffledTensions.find((entry) => !usedTensionOwners.has(entry)) ??
        shuffledTensions[0];
      if (!usedTensionOwners.has(tension)) {
        usedTensionOwners.set(tension, tensionOwner?.suspectId ?? null);
      }
      return {
        id: `EP${String(index + 1).padStart(2, "0")}`,
        ...candidate,
        prop,
        tension,
        tensionOwnerId: tensionOwner?.suspectId ?? null,
        featuredSuspectIds: featuredInEpisode.map((entry) => entry.suspectId),
      };
    });
}

function buildWitnessAccounts(
  rng: SeededRandom,
  episodes: SceneEpisode[],
  spine: OccasionSpine,
  answer: Answer
): WitnessAccount[] {
  if (episodes.length === 0 || spine.anonymityDevices.length === 0) return [];
  const accounts: WitnessAccount[] = [];
  const count = rng.nextInt(2, 3);
  // Choose the public scene scaffold before deciding whether the account is
  // true. The scheduler sees episode linkage, so letting truth status choose
  // the episode made accepted slates over-sample one private variant even
  // though the prose wrappers were identical.
  // When the day contains real step-aways, both truthful and fabricated
  // accounts use those same episode shapes. A fabrication is an invented or
  // mistaken *additional* departure, so its wrapper remains indistinguishable
  // without making truth status correlate with scene richness.
  const stepAwayEpisodes = episodes.filter((episode) => episode.stepAway);
  const episodeOrder = rng.shuffle(stepAwayEpisodes.length > 0 ? stepAwayEpisodes : [...episodes]);
  const fabricationReasons = [
    "mistook movement at the edge of the gathering for a departure",
    "embellished an uncertain glimpse to seem useful",
    "confused two similar figures in the occasion's bustle",
  ];

  for (let index = 0; index < count; index += 1) {
    const episode = episodeOrder[index % episodeOrder.length];
    // A day with no real departure can still carry the exact same public
    // witness wrapper, but every such account is necessarily mistaken or
    // invented. Otherwise truth/fabrication is an independent texture draw.
    const requestedFabrication = rng.nextBool(0.275);
    const truthful = !requestedFabrication && Boolean(episode.stepAway);
    const actualDeparterId = truthful ? episode.stepAway!.suspectId : null;
    const timeId = truthful ? episode.stepAway!.absentFromTimeId : rng.pick(episode.timeIds);
    const eligibleWitnesses = truthful
      ? episode.continuousParticipantIds.filter((suspectId) => suspectId !== actualDeparterId)
      : SUSPECTS.map((suspect) => suspect.id).filter((suspectId) => suspectId !== actualDeparterId);
    // The plan deliberately tunes thief-as-witness accounts to be a regular
    // red herring. Honest witnesses must actually be present; a fabricated
    // account needs no such placement and is where that distribution is set.
    const witnessId = truthful
      ? rng.pick(eligibleWitnesses)
      : rng.nextBool(0.85)
        ? answer.suspectId
        : rng.pick(eligibleWitnesses.filter((suspectId) => suspectId !== answer.suspectId));
    const fabricatedByThief = !truthful && witnessId === answer.suspectId;
    const variant: WitnessAccountVariant = truthful
      ? actualDeparterId === answer.suspectId
        ? "true_thief_departure"
        : "true_innocent_departure"
      : fabricatedByThief
        ? "fabricated_thief_witness"
        : "fabricated_innocent_witness";
    accounts.push({
      id: `WA${index + 1}`,
      episodeId: episode.id,
      witnessId,
      timeId,
      excuse: truthful ? episode.stepAway!.excuse : rng.pick(spine.excuses),
      anonymityDevice: rng.pick(spine.anonymityDevices),
      variant,
      truthful,
      actualDeparterId,
      fabricationReason: truthful ? null : rng.pick(fabricationReasons),
    });
  }
  return accounts;
}

function buildItemStates(
  rng: SeededRandom,
  answer: Answer,
  movement: Record<string, Record<string, Placement>>,
  gatherings: Gathering[]
): Record<string, ItemState> {
  const answerTime = requireTime(answer.timeId);
  const states: Record<string, ItemState> = {};
  const usedHomes = new Map<string, number>();

  for (const item of ITEMS) {
    const isAnswerItem = item.id === answer.itemId;
    let homeLocationId: string;
    let displayedForOccasion = false;
    if (isAnswerItem) {
      homeLocationId = answer.locationId;
      const likely = item.likelyLocations.map((name) => LOCATIONS.find((location) => location.name === name)?.id);
      displayedForOccasion = !likely.includes(answer.locationId);
    } else {
      const likelyIds = item.likelyLocations
        .map((name) => LOCATIONS.find((location) => location.name === name)?.id)
        .filter((id): id is string => Boolean(id));
      homeLocationId = rng.pick(likelyIds.length > 0 ? likelyIds : [rng.pick(LOCATIONS).id]);
    }
    usedHomes.set(homeLocationId, (usedHomes.get(homeLocationId) ?? 0) + 1);

    // Intact sightings: staff rounds in the morning, plus any slot where a
    // group occupied the item's home room (they'd have noticed it in place).
    const intactSightings: ItemState["intactSightings"] = [];
    const latestTruthfulOrder = isAnswerItem ? answerTime.order - 1 : 10;
    for (const slot of TIME_PERIODS) {
      if (slot.order > latestTruthfulOrder) continue;
      const staffRound = slot.order <= 2 && rng.nextBool(0.6);
      const occupied = Object.values(movement[slot.id] ?? {}).some(
        (placement) => placement.locationId === homeLocationId && placement.social !== "solo"
      );
      if (staffRound) intactSightings.push({ timeId: slot.id, witness: "staff" });
      else if (occupied && rng.nextBool(0.35)) intactSightings.push({ timeId: slot.id, witness: "guests" });
    }
    // The stolen item is always anchored by a last-seen-intact sighting just
    // before the theft hour — every original mystery does this ("it was still
    // there when…"). True in this world by construction.
    if (isAnswerItem && answerTime.order >= 2) {
      const anchorTime = TIME_PERIODS.find((slot) => slot.order === answerTime.order - 1)!;
      if (!intactSightings.some((sighting) => sighting.timeId === anchorTime.id)) {
        intactSightings.push({ timeId: anchorTime.id, witness: rng.nextBool(0.5) ? "staff" : "guests" });
      }
    }

    states[item.id] = { itemId: item.id, homeLocationId, displayedForOccasion, offsite: null, intactSightings };
  }

  // One non-answer item may be offsite for the whole day.
  if (rng.nextBool(0.55)) {
    const candidates = ITEMS.filter((item) => item.id !== answer.itemId);
    const offsiteItem = rng.pick(candidates);
    states[offsiteItem.id] = {
      ...states[offsiteItem.id],
      offsite: { reason: rng.pick(OFFSITE_REASONS) },
      intactSightings: [],
    };
  }

  return states;
}

function buildThreads(
  rng: SeededRandom,
  answer: Answer,
  arrival: WorldState["arrival"],
  departures: WorldState["departures"],
  occasionSpine: OccasionSpine
): SuspiciousThread[] {
  const threads: SuspiciousThread[] = [];
  const count = rng.nextInt(2, 3);
  const kinds = rng.shuffle(["private_errand", "borrowed_item", "private_exchange", "surprise_task", "foggy_memory"] as const).slice(0, count);
  const allSuspectIds = SUSPECTS.map((suspect) => suspect.id);
  const usedSuspects = new Set<string>();
  const pickSuspects = (n: number, forbiddenIds: string[] = []): string[] => {
    const allowed = allSuspectIds.filter((id) => !forbiddenIds.includes(id));
    const pool = allowed.filter((id) => !usedSuspects.has(id));
    const chosen = rng.pickMultiple(pool.length >= n ? pool : allowed, n);
    chosen.forEach((id) => usedSuspects.add(id));
    return chosen;
  };
  const attendedTimes = (): TimePeriod[] =>
    TIME_PERIODS.filter((slot) => isSlotAttendedStrict(slot.id, arrival, departures));
  const forbiddenSuspectsAt = (timeId: string): string[] =>
    timeId === answer.timeId ? [answer.suspectId] : [];
  const threadRoomsAt = (timeId: string): Location[] =>
    LOCATIONS.filter((location) => timeId !== answer.timeId || location.id !== answer.locationId);

  kinds.forEach((kind, index) => {
    const id = `TH${index + 1}`;
    if (kind === "private_errand") {
      const timeId = rng.pick(attendedTimes()).id;
      threads.push({
        id,
        kind,
        suspectIds: pickSuspects(1, forbiddenSuspectsAt(timeId)),
        locationId: rng.pick(threadRoomsAt(timeId)).id,
        timeId,
        cause: rng.pick(occasionSpine.threadCauses),
      });
    } else if (kind === "borrowed_item") {
      const item = rng.pick(ITEMS.filter((candidate) => candidate.id !== answer.itemId));
      threads.push({ id, kind, suspectIds: pickSuspects(1), itemId: item.id, cause: "borrowed openly, with Mr. Boddy's blessing" });
    } else if (kind === "private_exchange") {
      const timeId = rng.pick(attendedTimes()).id;
      const prop = rng.pick(occasionSpine.setDressing);
      threads.push({
        id,
        kind,
        suspectIds: pickSuspects(2, forbiddenSuspectsAt(timeId)),
        locationId: rng.pick(threadRoomsAt(timeId)).id,
        timeId,
        cause: rng.pick([
          `discussing ${prop} in private`,
          `comparing conflicting accounts of ${prop}`,
          `sharing a confidence about ${prop}`,
        ]),
      });
    } else if (kind === "foggy_memory") {
      // Fog of the day: a witness half-remembers something — at whatever
      // hour their memory insists on. It is a statement, not evidence, and
      // eliminates nothing. Suspect and hour are selected without consulting
      // the answer, so an accidental match occurs only at natural chance and
      // the wrapper can never become a statistical theft-hour tell.
      const rememberer = pickSuspects(1)[0];
      const memoryTimeId = rng.pick(TIME_PERIODS).id;
      const occasionFog = occasionSpine.anonymityDevices.map((device) => `a figure obscured by ${device}`);
      threads.push({
        id,
        kind,
        suspectIds: [rememberer],
        timeId: memoryTimeId,
        cause: rng.pick([...occasionFog, ...FOGGY_SENSATIONS]),
      });
    } else {
      const timeId = rng.pick(attendedTimes()).id;
      // One texture draw keeps world structure independent of whether this
      // catalog happens to offer one or several preparations.
      rng.pick(occasionSpine.threadCauses);
      const threadRooms = threadRoomsAt(timeId);
      threads.push({
        id,
        kind,
        suspectIds: pickSuspects(1, forbiddenSuspectsAt(timeId)),
        locationId: rng.pick([threadRooms.find((room) => room.id === "L04") ?? rng.pick(threadRooms), rng.pick(threadRooms)]).id,
        timeId,
        cause: `quietly preparing for ${occasionSpine.mainEvent}`,
      });
    }
  });
  return threads;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashSeed(seed: number, attempt: number): number {
  let h = (Math.abs(Math.trunc(seed)) + attempt * 7_919) >>> 0;
  h = (h ^ (h >>> 16)) * 0x45d9f3b;
  h = (h ^ (h >>> 16)) >>> 0;
  return h & 0x7fffffff;
}

function normalizeOccasionTexture(proposed: OccasionTexture, occasionSpine: OccasionSpine): OccasionTexture {
  const forbidden = [
    ...SUSPECTS.flatMap((suspect) => [suspect.name, suspect.displayName]),
    ...ITEMS.flatMap((item) => [item.nameUS, item.nameUK]),
    ...LOCATIONS.map((location) => location.name),
    ...TIME_PERIODS.map((time) => time.name),
  ].map((name) => name.toLowerCase());
  const cleanOne = (value: string | undefined): string | null => {
    const cleaned = value?.trim().replace(/^["“]|["”]$/g, "").replace(/[.!]$/, "") ?? "";
    if (cleaned.length < 4 || cleaned.length > 120) return null;
    if (forbidden.some((name) => cleaned.toLowerCase().includes(name))) return null;
    return cleaned;
  };
  const clean = (values: string[] | undefined, fallback: string[]): string[] => {
    const accepted = (values ?? [])
      .map(cleanOne)
      .filter((value): value is string => Boolean(value))
      .slice(0, 8);
    return accepted.length > 0 ? accepted : [...fallback];
  };
  // The model occasionally chooses empty arrays rather than risk inventing
  // world truth. Falling back to generic "programmes" would sever the clues
  // from the opening, so derive every fallback from the already-authored,
  // answer-blind spine instead. These remain cosmetic and cannot alter facts.
  const props = occasionSpine.setDressing.length > 0
    ? occasionSpine.setDressing
    : ["the occasion materials"];
  const spineFallback = {
    inspectionContexts: props.slice(0, 4).map((prop) => `putting ${prop} back in order`),
    observationContexts: props.slice(-4).map((prop) => `checking the arrangement of ${prop}`),
  };
  const timeAnchors: Array<{ pattern: RegExp; timeIds: string[] }> = [
    { pattern: /\bdawn\b/i, timeIds: ["T01"] },
    { pattern: /\bbreakfast\b/i, timeIds: ["T02"] },
    { pattern: /\bmorning\b/i, timeIds: ["T02", "T03"] },
    { pattern: /\b(?:midday|lunch)\b/i, timeIds: ["T04"] },
    { pattern: /\bafternoon\b/i, timeIds: ["T05", "T06"] },
    { pattern: /\btea(?:\s+time)?\b/i, timeIds: ["T06"] },
    { pattern: /\bdusk\b/i, timeIds: ["T07"] },
    { pattern: /\b(?:dinner|evening)\b/i, timeIds: ["T07", "T08", "T09"] },
    { pattern: /\bnight\b/i, timeIds: ["T09", "T10"] },
    { pattern: /\bmidnight\b/i, timeIds: ["T10"] },
  ];
  const gatheringDetails = occasionSpine.beats.map((beat, index) => {
    const candidate = cleanOne(proposed?.gatheringDetails?.[index]);
    const referencesAnotherPartOfDay = candidate && (
      /\b(?:today's|day's|earlier|later|previous(?:ly)?|already finished)\b/i.test(candidate) ||
      timeAnchors.some(({ pattern, timeIds }) =>
        pattern.test(candidate) && !timeIds.some((timeId) => beat.timeIds.includes(timeId))
      ) ||
      occasionSpine.beats.some((otherBeat) =>
        otherBeat.id !== beat.id &&
        [otherBeat.name, otherBeat.gatheringLabel]
          .map((label) => label.toLowerCase())
          .some((label) => label.length >= 6 && candidate.toLowerCase().includes(label))
      )
    );
    return candidate && !referencesAnotherPartOfDay
      ? candidate
      : beat.gatheringLabel || DEFAULT_OCCASION_TEXTURE.gatheringDetails[index % DEFAULT_OCCASION_TEXTURE.gatheringDetails.length];
  });
  const stageNeutralObservationContexts = (proposed?.observationContexts ?? []).filter(
    (value) => !/\b(?:after|before|back|return(?:ed|ing)?|last|final|finish(?:ed|ing)?|ended|over|left\s+behind|abandoned|closing)\b/i.test(value)
  );
  return {
    gatheringDetails,
    inspectionContexts: clean(proposed?.inspectionContexts, spineFallback.inspectionContexts),
    observationContexts: clean(stageNeutralObservationContexts, spineFallback.observationContexts),
  };
}

function pickActivity(rng: SeededRandom, occasionSpine: OccasionSpine): string {
  return rng.pick(occasionSpine.groupActivities);
}

/**
 * Group activities blend room flavor with size-appropriate social reasons —
 * a pair reads as a tête-à-tête, four reads as a card table, six as a party.
 */
function pickGroupActivity(rng: SeededRandom, occasionSpine: OccasionSpine): string {
  return rng.pick(occasionSpine.groupActivities);
}

export function presentSuspects(
  timeId: string,
  arrival: WorldState["arrival"],
  departures: WorldState["departures"]
): string[] {
  const order = requireTime(timeId).order;
  return SUSPECTS.map((s) => s.id).filter((suspectId) => {
    if ((STAFF_SUSPECT_IDS as readonly string[]).includes(suspectId)) return true;
    if (arrival && order < requireTime(arrival.timeId).order && arrival.guestIds.includes(suspectId)) return false;
    const departure = departures.find((entry) => entry.suspectIds.includes(suspectId));
    if (departure && order > requireTime(departure.timeId).order) return false;
    return true;
  });
}

function isSlotAttended(timeId: string, arrival: WorldState["arrival"], departures: WorldState["departures"]): boolean {
  return presentSuspects(timeId, arrival, departures).length >= 6;
}

function isSlotAttendedStrict(timeId: string, arrival: WorldState["arrival"], departures: WorldState["departures"]): boolean {
  return presentSuspects(timeId, arrival, departures).length === SUSPECTS.length;
}

export function requireTime(timeId: string): TimePeriod {
  const time = TIME_PERIODS.find((slot) => slot.id === timeId);
  if (!time) throw new Error(`Unknown time id: ${timeId}`);
  return time;
}

export function timeAtOrder(order: number): TimePeriod {
  const time = TIME_PERIODS.find((slot) => slot.order === order);
  if (!time) throw new Error(`No time at order ${order}`);
  return time;
}

export function requireItem(itemId: string): Item {
  const item = ITEMS.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error(`Unknown item id: ${itemId}`);
  return item;
}

export function requireLocation(locationId: string): Location {
  const location = LOCATIONS.find((candidate) => candidate.id === locationId);
  if (!location) throw new Error(`Unknown location id: ${locationId}`);
  return location;
}

export function requireSuspect(suspectId: string): Suspect {
  const suspect = SUSPECTS.find((candidate) => candidate.id === suspectId);
  if (!suspect) throw new Error(`Unknown suspect id: ${suspectId}`);
  return suspect;
}
