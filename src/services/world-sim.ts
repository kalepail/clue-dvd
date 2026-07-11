/**
 * V3 World Simulation
 *
 * Builds a seeded, fully deterministic ground-truth day at Tudor Mansion.
 * The theft (the immutable answer) is embedded as ONE thread among many:
 * the world also contains gatherings, small social groups, item lifecycles,
 * household events, and innocent-but-suspicious threads (real red herrings).
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
import { SeededRandom } from "./seeded-random";
import type { Answer } from "./ai-mystery-schemas";

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

export type InnocentThread = {
  id: string;
  kind: "private_errand" | "borrowed_item" | "quarrel" | "surprise_task";
  suspectIds: string[];
  locationId?: string;
  timeId?: string;
  itemId?: string;
  cause: string; // the innocent truth, e.g. "wrapping a gift for Mr. Boddy"
};

export type PartyMode = "house_party" | "day_party";

export type WorldState = {
  seed: number;
  attempt: number;
  answer: Answer;
  occasionFamily: string;
  partyMode: PartyMode;
  /** Order-indexed time periods for convenience. */
  slots: TimePeriod[];
  arrival: { timeId: string; guestIds: string[] } | null; // day_party only
  departures: Array<{ suspectIds: string[]; timeId: string; cause: string }>;
  gatherings: Gathering[];
  /** movement[timeId][suspectId] */
  movement: Record<string, Record<string, Placement>>;
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
  threads: InnocentThread[];
  /** 2-3 items with colorful provenance (may include the answer item). */
  objectHistories: Array<{ itemId: string; note: string }>;
};

// ---------------------------------------------------------------------------
// Catalogs (world texture, all seeded)
// ---------------------------------------------------------------------------

const GATHERING_OPTIONS: Array<{ timeId: string; kind: "meal" | "social"; options: Array<{ locationId: string; label: string }> }> = [
  { timeId: "T02", kind: "meal", options: [{ locationId: "L03", label: "breakfast" }] },
  { timeId: "T03", kind: "social", options: [{ locationId: "L10", label: "a turn about the gardens" }, { locationId: "L11", label: "photographs by the fountain" }, { locationId: "L06", label: "a tour of the orchids" }] },
  { timeId: "T04", kind: "meal", options: [{ locationId: "L03", label: "luncheon" }, { locationId: "L10", label: "luncheon in the garden" }] },
  { timeId: "T05", kind: "social", options: [{ locationId: "L10", label: "lawn games" }, { locationId: "L05", label: "charades in the Ballroom" }, { locationId: "L11", label: "boules by the fountain" }] },
  { timeId: "T06", kind: "social", options: [{ locationId: "L10", label: "afternoon tea among the roses" }, { locationId: "L06", label: "tea in the Conservatory" }, { locationId: "L02", label: "afternoon tea" }] },
  { timeId: "T07", kind: "social", options: [{ locationId: "L02", label: "cocktails before dinner" }, { locationId: "L05", label: "an early musical interlude" }] },
  { timeId: "T08", kind: "meal", options: [{ locationId: "L03", label: "dinner" }] },
  { timeId: "T09", kind: "social", options: [{ locationId: "L05", label: "the evening's entertainment" }, { locationId: "L08", label: "readings in the Library" }, { locationId: "L02", label: "after-dinner coffee" }] },
];

const ROOM_ACTIVITIES: Record<string, string[]> = {
  L01: ["admiring the portraits", "waiting for the post", "greeting late arrivals"],
  L02: ["taking coffee", "leafing through magazines", "chatting by the fire"],
  L03: ["lingering over the table", "helping set the service", "sampling the preserves"],
  L04: ["fetching warm water", "consulting the cook", "sneaking a taste of dessert"],
  L05: ["practising a duet at the piano", "arranging chairs", "dancing a few steps"],
  L06: ["admiring the orchids", "sketching the ferns", "taking the warm air"],
  L07: ["playing billiards", "keeping score", "debating a trick shot"],
  L08: ["reading quietly", "hunting for an atlas", "comparing editions"],
  L09: ["writing letters", "examining the collection", "settling accounts"],
  L10: ["strolling among the roses", "cutting blooms for the table", "taking photographs"],
  L11: ["feeding the goldfish", "taking the air", "admiring the stonework"],
};

const SOLO_ACTIVITIES = [
  "resting with a headache",
  "writing a private letter",
  "placing a telephone call",
  "looking for a mislaid glove",
  "taking a quiet walk",
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

const ERRAND_CAUSES = [
  "wrapping a small gift meant as a surprise",
  "rehearsing a toast in private",
  "placing a discreet telephone call to a solicitor",
  "resting quietly on doctor's orders",
];

const QUARREL_CAUSES = [
  "an old disagreement over a card debt",
  "a business proposal gone sour",
  "a pointed remark at luncheon neither would forgive",
];

const SURPRISE_CAUSES = [
  "arranging a surprise presentation for Mr. Boddy",
  "planning tomorrow's menu as a treat",
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

export function simulateWorld(params: {
  seed: number;
  attempt: number;
  answer: Answer;
  occasionFamily: string;
}): WorldState {
  const { answer, occasionFamily } = params;
  const rng = new SeededRandom(hashSeed(params.seed, params.attempt));
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
    const earlyOptions = [6, 7].filter((order) => order > requireTime(arrival!.timeId).order && order < breakupOrder);
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
  } else if (rng.nextBool(0.35)) {
    // House parties can still lose a guest or two to an evening engagement.
    const departOptions = [7, 8, 9];
    const departOrder = rng.pick(departOptions);
    const eligible = guestIds.filter((id) => id !== answer.suspectId);
    const leavers = rng.pickMultiple(eligible, rng.nextInt(1, 2));
    if (leavers.length > 0) {
      departures.push({ suspectIds: leavers, timeId: timeAtOrder(departOrder).id, cause: rng.pick(DEPARTURE_CAUSES) });
    }
  }

  // --- Gatherings (never at the answer time) ------------------------------
  const gatheringPool = GATHERING_OPTIONS.filter((option) => option.timeId !== answer.timeId)
    .filter((option) => isSlotAttended(option.timeId, arrival, departures));
  const gatheringCount = Math.min(rng.nextInt(3, 5), gatheringPool.length);
  const chosenGatherings = rng.pickMultiple(gatheringPool, gatheringCount)
    .sort((a, b) => requireTime(a.timeId).order - requireTime(b.timeId).order);
  const gatherings: Gathering[] = chosenGatherings.map((option) => {
    const pick = rng.pick(option.options);
    return {
      timeId: option.timeId,
      locationId: pick.locationId,
      kind: option.kind,
      label: pick.label,
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
      label: "the house locked up and everyone retired for the night",
      suspectIds: presentSuspects("T10", arrival, departures),
    });
  }

  // --- Innocent threads ----------------------------------------------------
  const threads = buildThreads(rng, answer, arrival, departures);

  // --- Movement grid -------------------------------------------------------
  const movement = buildMovementGrid(rng, slots, answer, gatherings, threads, arrival, departures);

  // --- Item lifecycles ------------------------------------------------------
  const items = buildItemStates(rng, answer, movement, gatherings);

  // Decoy items: 1-2 pieces from one non-answer category whose whereabouts
  // simply never come up. They hold the item candidates at 2-3 to the end.
  const answerCategory = requireItem(answer.itemId).category;
  const decoyCategory = rng.pick((["antique", "desk", "jewelry"] as const).filter((c) => c !== answerCategory));
  const decoyCandidates = ITEMS.filter(
    (item) => item.category === decoyCategory && item.id !== answer.itemId && !items[item.id]?.offsite
  );
  const decoyItemIds = rng
    .pickMultiple(decoyCandidates, Math.min(decoyCandidates.length, rng.nextInt(1, 2)))
    .map((item) => item.id);

  // Secured set: the remaining category (never the answer's, never the decoys').
  let securedSet: SecuredSet = null;
  const securedCategory = (["antique", "desk", "jewelry"] as const).find(
    (category) => category !== answerCategory && category !== decoyCategory
  );
  if (securedCategory && rng.nextBool(0.7)) {
    const fromOrder = rng.pick([6, 7, 8]);
    securedSet = {
      itemIds: ITEMS.filter((item) => item.category === securedCategory && item.id !== answer.itemId).map((item) => item.id),
      label: securedCategory === "jewelry" ? "the jewelry" : securedCategory === "desk" ? "the desk pieces" : "the antiques",
      fromTimeId: timeAtOrder(fromOrder).id,
    };
  }

  // Room closure: a room that is not the answer location.
  let roomClosure: RoomClosure = null;
  if (rng.nextBool(0.65)) {
    const candidates = LOCATIONS.filter((location) => location.id !== answer.locationId && location.type === "indoor");
    const location = rng.pick(candidates);
    roomClosure = rng.nextBool(0.6)
      ? { locationId: location.id, timeIds: "all", cause: rng.pick(CLOSURE_CAUSES) }
      : {
          locationId: location.id,
          timeIds: slots.filter((slot) => slot.order <= rng.nextInt(4, 7)).map((slot) => slot.id),
          cause: rng.pick(CLOSURE_CAUSES),
        };
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
    partyMode,
    slots,
    arrival,
    departures,
    gatherings,
    movement,
    items,
    decoyItemIds,
    securedSet,
    roomClosure,
    discovery,
    threads,
    objectHistories,
  };
}

// ---------------------------------------------------------------------------
// Movement grid construction
// ---------------------------------------------------------------------------

function buildMovementGrid(
  rng: SeededRandom,
  slots: TimePeriod[],
  answer: Answer,
  gatherings: Gathering[],
  threads: InnocentThread[],
  arrival: WorldState["arrival"],
  departures: WorldState["departures"]
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

  /** Groups from the previous non-gathering slot, for sticky carry-over. */
  let previousGroups: Array<{ members: string[]; locationId: string; activity: string }> = [];

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

    // Sticky carry-over: a card game that simply continues in the same room.
    for (const group of previousGroups) {
      if (!rng.nextBool(0.55)) continue;
      const stillHere = group.members.filter((member) => unplaced.includes(member));
      if (stillHere.length < 2 || stillHere.length !== group.members.length) continue;
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

    // Occasionally one extra innocent solo for texture (never in the answer room).
    if (unplaced.length > 4 && rng.nextBool(0.25)) {
      const soloCandidates = unplaced.filter((id) => id !== answer.suspectId);
      if (soloCandidates.length > 0) {
        const soloSuspect = rng.pick(soloCandidates);
        const room = rng.pick(socialRooms);
        placements[soloSuspect] = {
          locationId: room.id,
          social: "solo",
          companions: [soloSuspect],
          activity: rng.pick(SOLO_ACTIVITIES),
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
        circleActivities.set(circleIndex, pickActivity(rng, roomId));
      }
      occupiedRooms.add(roomId);
      const activity = circleActivities.get(circleIndex) ?? pickActivity(rng, roomId);
      for (const member of members) {
        placements[member] = {
          locationId: roomId,
          social: members.length > 1 ? "group" : "solo",
          companions: [...members],
          activity: members.length > 1 ? activity : rng.pick(SOLO_ACTIVITIES),
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
  departures: WorldState["departures"]
): InnocentThread[] {
  const threads: InnocentThread[] = [];
  const count = rng.nextInt(2, 3);
  const kinds = rng.shuffle(["private_errand", "borrowed_item", "quarrel", "surprise_task"] as const).slice(0, count);
  const eligibleSuspects = SUSPECTS.map((s) => s.id).filter((id) => id !== answer.suspectId);
  const usedSuspects = new Set<string>();
  const pickSuspects = (n: number): string[] => {
    const pool = eligibleSuspects.filter((id) => !usedSuspects.has(id));
    const chosen = rng.pickMultiple(pool.length >= n ? pool : eligibleSuspects, n);
    chosen.forEach((id) => usedSuspects.add(id));
    return chosen;
  };
  const threadRooms = LOCATIONS.filter((location) => location.id !== answer.locationId);

  kinds.forEach((kind, index) => {
    const id = `TH${index + 1}`;
    if (kind === "private_errand") {
      const timeId = rng.pick(TIME_PERIODS.filter((slot) => isSlotAttendedStrict(slot.id, arrival, departures))).id;
      threads.push({
        id,
        kind,
        suspectIds: pickSuspects(1),
        locationId: rng.pick(threadRooms).id,
        timeId,
        cause: rng.pick(ERRAND_CAUSES),
      });
    } else if (kind === "borrowed_item") {
      const item = rng.pick(ITEMS.filter((candidate) => candidate.id !== answer.itemId));
      threads.push({ id, kind, suspectIds: pickSuspects(1), itemId: item.id, cause: "borrowed openly, with Mr. Boddy's blessing" });
    } else if (kind === "quarrel") {
      const timeId = rng.pick(TIME_PERIODS.filter((slot) => isSlotAttendedStrict(slot.id, arrival, departures))).id;
      threads.push({
        id,
        kind,
        suspectIds: pickSuspects(2),
        locationId: rng.pick(threadRooms).id,
        timeId,
        cause: rng.pick(QUARREL_CAUSES),
      });
    } else {
      const timeId = rng.pick(TIME_PERIODS.filter((slot) => isSlotAttendedStrict(slot.id, arrival, departures))).id;
      threads.push({
        id,
        kind,
        suspectIds: pickSuspects(1),
        locationId: rng.pick([threadRooms.find((room) => room.id === "L04") ?? rng.pick(threadRooms), rng.pick(threadRooms)]).id,
        timeId,
        cause: rng.pick(SURPRISE_CAUSES),
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

function pickActivity(rng: SeededRandom, locationId: string): string {
  const options = ROOM_ACTIVITIES[locationId] ?? ["passing the time"];
  return rng.pick(options);
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
