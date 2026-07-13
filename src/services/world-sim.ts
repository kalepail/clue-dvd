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

export type InnocentThread = {
  id: string;
  kind: "private_errand" | "borrowed_item" | "quarrel" | "surprise_task" | "foggy_memory";
  suspectIds: string[];
  locationId?: string;
  timeId?: string;
  itemId?: string;
  cause: string; // the innocent truth, e.g. "wrapping a gift for Mr. Boddy"
};

export type PartyMode = "house_party" | "day_party";

export type TransitionRemark = {
  suspectId: string;
  fromTimeId: string;
  toTimeId: string;
  /** What was actually said; whether the stated reason was sincere is unknown. */
  line: string;
};

export type WorldState = {
  seed: number;
  attempt: number;
  answer: Answer;
  occasionFamily: string;
  /** Answer-blind occasion details promoted to world truth after dossier design. */
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

const TRANSITION_REMARKS = {
  morning: [
    "I ought to fetch my spectacles",
    "I promised to look for a missing letter",
    "I left my gloves upstairs",
    "I must see whether the morning post has come",
  ],
  afternoon: [
    "I must make a telephone call",
    "I promised to find Mr. Boddy's programme",
    "I ought to fetch my notes",
    "I left my gloves in another room",
  ],
  evening: [
    "I ought to fetch my coat",
    "I left my cigarette case upstairs",
    "I must see whether my motorcar has come round",
    "I promised to find the evening programme",
  ],
} as const;

const DEFAULT_OCCASION_TEXTURE: OccasionTexture = {
  groupActivities: ["comparing the day's programmes", "helping with the arrangements", "rehearsing a short presentation"],
  transitionRemarks: ["I ought to fetch my notes", "I must make a telephone call", "I left my gloves in another room"],
  gatheringDetails: ["discussing the next part of the programme", "comparing impressions of the occasion"],
  inspectionContexts: ["collecting the abandoned programmes", "putting the occasion's materials in order"],
  observationContexts: ["clearing away the occasion's papers", "making the usual household rounds"],
  uncertainObservations: ["someone hurrying away from the company", "a figure slipping through the edge of the gathering"],
};

/**
 * Why two-to-five people keep company — the social texture of alibis. Drawn
 * alongside the room flavor so a pair in the Library reads differently from
 * a pair in the Rose Garden, and no two games lean on the same three reasons.
 */
const PAIR_REASONS = [
  "deep in a game of chess",
  "catching up on years of family news",
  "comparing notes on the racing form",
  "rehearsing a toast neither would let the other hear",
  "arguing amiably over a crossword",
  "trading investment advice neither will follow",
  "swapping stories about Mr. Boddy's younger days",
  "mending the hem of an evening coat between them",
  "conspiring over the menu for a future dinner of their own",
  "teaching one another a card trick",
];
const SMALL_GROUP_REASONS = [
  "three-handed whist with running commentary",
  "a heated round of charades practice",
  "debating the merits of Mr. Boddy's port",
  "planning a subscription none of them will pay for",
  "taking turns reading the society pages aloud",
  "a gramophone recital of dubious quality",
  "comparing photographs from past summers",
  "an impromptu committee on the evening's entertainment",
];
const LARGE_GROUP_REASONS = [
  "a noisy parlor game that kept score in laughter",
  "listening to Professor Plum hold forth at length",
  "a sing-along around the piano",
  "a tournament of anagrams that nearly came to blows",
];

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
  // Dialogue is generated from a separate stream so adding prose texture can
  // never alter the actual movements or deduction structure of the day.
  const transitionRemarks = buildTransitionRemarks(
    new SeededRandom(hashSeed(params.seed ^ 0x4f1bbcdc, params.attempt)),
    slots,
    movement
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

  // Room closure: a room that is not the answer location.
  let roomClosure: RoomClosure = null;
  if (rng.nextBool(0.65)) {
    const candidates = LOCATIONS.filter((location) => location.id !== answer.locationId && location.type === "indoor");
    const location = rng.pick(candidates);
    roomClosure = rng.nextBool(0.6)
      ? { locationId: location.id, timeIds: "all", cause: rng.pick(CLOSURE_CAUSES) }
      : (() => {
          let cap = rng.nextInt(4, 7);
          if (cap === answerTime.order) cap = cap > 4 ? cap - 1 : cap + 1;
          return {
            locationId: location.id,
            timeIds: slots.filter((slot) => slot.order <= cap).map((slot) => slot.id),
            cause: rng.pick(CLOSURE_CAUSES),
          };
        })();
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
  const motiveCount = rng.nextInt(3, 5);
  const motiveSuspects = [
    answer.suspectId,
    ...rng.pickMultiple(SUSPECTS.map((s) => s.id).filter((id) => id !== answer.suspectId), motiveCount - 1),
  ];
  const motivePool = rng.shuffle([...MOTIVE_CATALOG]);
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
    occasionTexture: null,
    partyMode,
    slots,
    arrival,
    departures,
    gatherings,
    movement,
    transitionRemarks,
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

/**
 * Promote the answer-blind dossier's creative palette into world truth.
 * Only narrative texture changes: placements, companions, rooms, times,
 * items, and every deduction predicate remain untouched.
 */
export function applyOccasionTexture(world: WorldState, proposed: OccasionTexture): void {
  const texture = normalizeOccasionTexture(proposed);
  world.occasionTexture = texture;

  const threadMoments = new Set(
    world.threads
      .filter((thread) => thread.timeId)
      .map((thread) => `${thread.timeId}|${thread.suspectIds.slice().sort().join("+")}`)
  );
  for (const slot of world.slots) {
    const placements = world.movement[slot.id] ?? {};
    const seen = new Set<string>();
    for (const placement of Object.values(placements)) {
      if (placement.social !== "group") continue;
      const groupKey = placement.companions.slice().sort().join("+");
      if (seen.has(groupKey) || threadMoments.has(`${slot.id}|${groupKey}`)) continue;
      seen.add(groupKey);
      const activity = pickTexture(texture.groupActivities, `${world.seed}|${world.attempt}|${slot.id}|${groupKey}`);
      for (const suspectId of placement.companions) {
        const companion = placements[suspectId];
        if (companion?.social === "group" && companion.companions.slice().sort().join("+") === groupKey) {
          companion.activity = activity;
        }
      }
    }
  }

  world.transitionRemarks.forEach((remark, index) => {
    remark.line = pickTexture(
      texture.transitionRemarks,
      `${world.seed}|${world.attempt}|remark|${index}|${remark.suspectId}|${remark.toTimeId}`
    );
  });
  world.threads
    .filter((thread) => thread.kind === "foggy_memory")
    .forEach((thread, index) => {
      thread.cause = pickTexture(
        texture.uncertainObservations,
        `${world.seed}|${world.attempt}|uncertain|${index}|${thread.suspectIds[0]}`
      );
    });
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
          activity: rng.pick(SOLO_ACTIVITIES),
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
      const activity = circleActivities.get(circleIndex) ?? pickGroupActivity(rng, roomId, members.length);
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

function buildTransitionRemarks(
  rng: SeededRandom,
  slots: TimePeriod[],
  movement: Record<string, Record<string, Placement>>
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
      const phase = to.order <= 3 ? "morning" : to.order <= 6 ? "afternoon" : "evening";
      remarks.push({
        suspectId: suspect.id,
        fromTimeId: from.id,
        toTimeId: to.id,
        line: rng.pick([...TRANSITION_REMARKS[phase]]),
      });
    }
  }
  return remarks;
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
  const kinds = rng.shuffle(["private_errand", "borrowed_item", "quarrel", "surprise_task", "foggy_memory"] as const).slice(0, count);
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
    } else if (kind === "foggy_memory") {
      // Fog of the day: a witness half-remembers something — at whatever
      // hour their memory insists on. It is a statement, not evidence; it
      // eliminates nothing. ANYONE may be the rememberer, the thief
      // included, and about a third of the time the memory is anchored to
      // the real theft hour — fog that happens to be true. No clue shape is
      // reliably honest or reliably wrong.
      const rememberer = rng.nextBool(0.15) ? answer.suspectId : pickSuspects(1)[0];
      const memoryTimeId = rng.nextBool(0.3) ? answer.timeId : rng.pick(TIME_PERIODS).id;
      threads.push({
        id,
        kind,
        suspectIds: [rememberer],
        timeId: memoryTimeId,
        cause: rng.pick(FOGGY_SENSATIONS),
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

function normalizeOccasionTexture(proposed: OccasionTexture): OccasionTexture {
  const forbidden = [
    ...SUSPECTS.flatMap((suspect) => [suspect.name, suspect.displayName]),
    ...ITEMS.flatMap((item) => [item.nameUS, item.nameUK]),
    ...LOCATIONS.map((location) => location.name),
    ...TIME_PERIODS.map((time) => time.name),
  ].map((name) => name.toLowerCase());
  const clean = (values: string[] | undefined, fallback: string[]): string[] => {
    const accepted = (values ?? [])
      .map((value) => value.trim().replace(/^["“]|["”]$/g, "").replace(/[.!]$/, ""))
      .filter((value) => value.length >= 4 && value.length <= 120)
      .filter((value) => !forbidden.some((name) => value.toLowerCase().includes(name)))
      .slice(0, 8);
    return accepted.length > 0 ? accepted : [...fallback];
  };
  return {
    groupActivities: clean(proposed?.groupActivities, DEFAULT_OCCASION_TEXTURE.groupActivities),
    transitionRemarks: clean(proposed?.transitionRemarks, DEFAULT_OCCASION_TEXTURE.transitionRemarks),
    gatheringDetails: clean(proposed?.gatheringDetails, DEFAULT_OCCASION_TEXTURE.gatheringDetails),
    inspectionContexts: clean(proposed?.inspectionContexts, DEFAULT_OCCASION_TEXTURE.inspectionContexts),
    observationContexts: clean(proposed?.observationContexts, DEFAULT_OCCASION_TEXTURE.observationContexts),
    uncertainObservations: clean(proposed?.uncertainObservations, DEFAULT_OCCASION_TEXTURE.uncertainObservations),
  };
}

function pickTexture(values: string[], key: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return values[(hash >>> 0) % values.length];
}

function pickActivity(rng: SeededRandom, locationId: string): string {
  const options = ROOM_ACTIVITIES[locationId] ?? ["passing the time"];
  return rng.pick(options);
}

/**
 * Group activities blend room flavor with size-appropriate social reasons —
 * a pair reads as a tête-à-tête, four reads as a card table, six as a party.
 */
function pickGroupActivity(rng: SeededRandom, locationId: string, size: number): string {
  const roomFlavor = ROOM_ACTIVITIES[locationId] ?? ["passing the time"];
  const social = size <= 2 ? PAIR_REASONS : size <= 4 ? SMALL_GROUP_REASONS : LARGE_GROUP_REASONS;
  return rng.nextBool(0.55) ? rng.pick(social) : rng.pick(roomFlavor);
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
