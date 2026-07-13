/**
 * V3 Fact Harvest
 *
 * Derives every tellable, TRUE fact from the simulated world, each with:
 *  - joint-cell semantics: a pure predicate over (suspect, item, location, time)
 *    cells saying which combinations the fact rules out for a rational player;
 *  - a mention license: exactly which card names the rendered clue may say;
 *  - a writer brief: a neutral description of the world event for the prose
 *    model, with NO elimination language and NO knowledge of the answer.
 *
 * The answer cell can never be killed by a harvested fact because every fact
 * is true in a world that contains the answer. `assertFactsSpareAnswer` is a
 * belt-and-suspenders check used by tests and the engine.
 */

import { ITEMS, LOCATIONS, SUSPECTS, TIME_PERIODS } from "../data/game-elements";
import type { EvidenceCapsule, EvidenceKind } from "../shared/evidence";
import { SeededRandom } from "./seeded-random";
import type { Answer } from "./ai-mystery-schemas";
import {
  requireItem,
  requireLocation,
  requireSuspect,
  requireTime,
  type WorldState,
} from "./world-sim";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FactKind = EvidenceKind;

export type MentionLicense = {
  suspects: string[];
  items: string[];
  locations: string[];
  times: string[];
};

export type Fact = {
  id: string;
  kind: FactKind;
  /** Which category this fact chiefly speaks about (pacing heuristics). */
  primaryAxis: "suspect" | "item" | "location" | "time" | "color";
  suspectIds: string[];
  itemIds: string[];
  locationIds: string[];
  timeIds: string[];
  /** Extra payload interpreted per kind (e.g. cutoff order). */
  cutoffOrder?: number;
  mentions: MentionLicense;
  /** Neutral world-event description handed to the answer-blind writer. */
  writerBrief: string;
  /** Exact deterministic proposition for context beats with structured payload. */
  canonicalStatement?: string;
  /** Suitable to be delivered as a formal Inspector note. */
  noteSuitable: boolean;
  threadId?: string;
};

// ---------------------------------------------------------------------------
// Joint-cell semantics
// ---------------------------------------------------------------------------

export const DIMS = {
  suspects: SUSPECTS.map((s) => s.id),
  items: ITEMS.map((i) => i.id),
  locations: LOCATIONS.map((l) => l.id),
  times: [...TIME_PERIODS].sort((a, b) => a.order - b.order).map((t) => t.id),
} as const;

const TIME_ORDER = new Map(TIME_PERIODS.map((t) => [t.id, t.order]));

/**
 * Returns true when the fact rules out the cell (s, i, l, t).
 * This is the ONLY definition of fact semantics in the codebase.
 */
export function factKillsCell(fact: Fact, s: string, i: string, l: string, t: string): boolean {
  const order = TIME_ORDER.get(t) ?? 0;
  switch (fact.kind) {
    case "gathering":
    case "group_presence":
      return fact.timeIds.includes(t) && fact.suspectIds.includes(s);
    case "solo_presence":
      return fact.timeIds.includes(t) && fact.suspectIds.includes(s) && l !== fact.locationIds[0];
    case "departure":
      return fact.suspectIds.includes(s) && order > (fact.cutoffOrder ?? 10);
    case "guests_arrived":
      return fact.suspectIds.includes(s) && order < (fact.cutoffOrder ?? 1);
    case "item_intact":
      return fact.itemIds.includes(i) && order <= (fact.cutoffOrder ?? 0);
    case "item_offsite":
      return fact.itemIds.includes(i);
    case "items_secured":
      return fact.itemIds.includes(i) && order > (fact.cutoffOrder ?? 10);
    case "room_closed":
      return fact.locationIds.includes(l) && (fact.timeIds.length === 0 || fact.timeIds.includes(t));
    case "room_undisturbed":
      return fact.locationIds.includes(l);
    case "item_home":
      return fact.itemIds.includes(i) && l !== fact.locationIds[0];
    case "discovery":
      return order >= (fact.cutoffOrder ?? 11);
    case "object_history":
    case "item_handling":
    case "personal_remark":
    case "thread_setup":
    case "thread_resolution":
    case "thread_color":
      return false;
  }
}

export function isMentionOnly(fact: Fact): boolean {
  return fact.kind === "object_history" || fact.kind === "item_handling" || fact.kind === "personal_remark" || fact.kind === "thread_setup" || fact.kind === "thread_resolution" || fact.kind === "thread_color";
}

export function factMentionsAnswer(fact: Fact, answer: Answer): boolean {
  const names = answerNameSet(answer);
  return (
    fact.mentions.suspects.some((name) => names.has(name)) ||
    fact.mentions.items.some((name) => names.has(name)) ||
    fact.mentions.locations.some((name) => names.has(name)) ||
    fact.mentions.times.some((name) => names.has(name))
  );
}

export function answerNameSet(answer: Answer): Set<string> {
  return new Set([
    requireSuspect(answer.suspectId).displayName,
    requireItem(answer.itemId).nameUS,
    requireLocation(answer.locationId).name,
    requireTime(answer.timeId).name,
  ]);
}

/** Throws if any single fact would rule out the answer cell. */
export function assertFactsSpareAnswer(facts: Fact[], answer: Answer): void {
  for (const fact of facts) {
    if (factKillsCell(fact, answer.suspectId, answer.itemId, answer.locationId, answer.timeId)) {
      throw new Error(`Fact ${fact.id} (${fact.kind}) rules out the answer — world/harvest bug.`);
    }
  }
}

/**
 * Converts a structured fact into the exact player-facing proposition. This
 * intentionally does not use writerBrief: the brief is creative material,
 * while the capsule is the stable truth boundary.
 */
export function buildEvidenceCapsule(fact: Fact): EvidenceCapsule {
  const suspects = fact.suspectIds.map((id) => requireSuspect(id).displayName);
  const items = fact.itemIds.map((id) => requireItem(id).nameUS);
  const locations = fact.locationIds.map((id) => requireLocation(id).name);
  const times = fact.timeIds.map((id) => requireTime(id).name);
  const during = listNames(times);
  let statement: string;

  if (fact.canonicalStatement) {
    return {
      factId: fact.id,
      kind: fact.kind,
      role: isMentionOnly(fact) ? "context" : "formal",
      statement: fact.canonicalStatement,
      suspectIds: [...fact.suspectIds],
      itemIds: [...fact.itemIds],
      locationIds: [...fact.locationIds],
      timeIds: [...fact.timeIds],
    };
  }

  switch (fact.kind) {
    case "gathering":
    case "group_presence":
      statement = `${listNames(suspects)} were together${locations[0] ? ` in the ${locations[0]}` : ""} during ${during}.`;
      break;
    case "solo_presence":
      statement = `${suspects[0]} was alone in the ${locations[0]} during ${during}.`;
      break;
    case "departure":
      statement = `${listNames(suspects)} left after ${times[0]} and did not return.`;
      break;
    case "guests_arrived":
      statement = `${listNames(suspects)} arrived at ${times[0]}; they were not in the mansion before then.`;
      break;
    case "item_intact":
      statement = `The ${listNames(items)} ${items.length === 1 ? "was" : "were"} still present${locations[0] ? ` in the ${locations[0]}` : ""} during ${times[0]}.`;
      break;
    case "item_offsite":
      statement = `The ${listNames(items)} ${items.length === 1 ? "was" : "were"} not in Tudor Mansion that day.`;
      break;
    case "items_secured":
      statement = `The ${listNames(items)} ${items.length === 1 ? "was" : "were"} secured after ${times[0]} and remained secured.`;
      break;
    case "room_closed":
      statement = `The ${listNames(locations)} ${locations.length === 1 ? "was" : "were"} inaccessible${times.length > 0 ? ` during ${during}` : " all day"}.`;
      break;
    case "room_undisturbed":
      statement = `The ${listNames(locations)} ${locations.length === 1 ? "was" : "were"} searched after the discovery; nothing there was missing or disturbed.`;
      break;
    case "item_home":
      statement = `The ${items[0]} was kept in the ${locations[0]} that day.`;
      break;
    case "discovery":
      statement = `The theft was first discovered during ${times[0]}; it had already happened by then.`;
      break;
    case "item_handling":
      statement = `Witnessed handling involving ${listNames([...suspects, ...items, ...locations, ...times])}; context only, with no claim about what happened later.`;
      break;
    case "thread_setup":
      statement = `Unresolved lead involving ${listNames([...suspects, ...items, ...locations, ...times])}; it has no formal deduction effect yet.`;
      break;
    case "thread_resolution":
      statement = `Innocent explanation recorded for the lead involving ${listNames([...suspects, ...items, ...locations, ...times])}; it has no formal deduction effect.`;
      break;
    case "object_history":
    case "personal_remark":
    case "thread_color":
      statement = `Background context involving ${listNames([...suspects, ...items, ...locations, ...times])}; it has no formal deduction effect.`;
      break;
  }

  return {
    factId: fact.id,
    kind: fact.kind,
    role: isMentionOnly(fact) ? "context" : "formal",
    statement,
    suspectIds: [...fact.suspectIds],
    itemIds: [...fact.itemIds],
    locationIds: [...fact.locationIds],
    timeIds: [...fact.timeIds],
  };
}

// ---------------------------------------------------------------------------
// Harvest
// ---------------------------------------------------------------------------

export function harvestFacts(world: WorldState): Fact[] {
  const facts: Fact[] = [];
  let counter = 0;
  const nextId = (): string => `F${String(++counter).padStart(3, "0")}`;
  const names = {
    suspect: (id: string) => requireSuspect(id).displayName,
    item: (id: string) => requireItem(id).nameUS,
    location: (id: string) => requireLocation(id).name,
    time: (id: string) => requireTime(id).name,
  };

  // Gatherings ---------------------------------------------------------------
  for (const gathering of world.gatherings) {
    const everyone = gathering.suspectIds.length === SUSPECTS.length;
    const timeName = names.time(gathering.timeId);
    let brief: string;
    if (gathering.kind === "retired") {
      brief = everyone
        ? `At ${timeName}, ${gathering.label} — every bedroom door shut, the halls empty, not a soul about.`
        : `At ${timeName}, ${gathering.label}; only ${listNames(gathering.suspectIds.map(names.suspect))} were on the premises at that hour, and they were about their usual routine together.`;
    } else if (everyone) {
      brief = `During ${timeName}, every single person — guests, plus Mrs. White and Rusty — was together at ${gathering.label} in the ${names.location(gathering.locationId!)}. Nobody slipped out.`;
    } else {
      brief = `During ${timeName}, ${listNames(gathering.suspectIds.map(names.suspect))} were all together at ${gathering.label} in the ${names.location(gathering.locationId!)}.`;
    }
    facts.push({
      id: nextId(),
      kind: "gathering",
      primaryAxis: "time",
      suspectIds: [...gathering.suspectIds],
      itemIds: [],
      locationIds: gathering.locationId ? [gathering.locationId] : [],
      timeIds: [gathering.timeId],
      mentions: {
        suspects: everyone ? ["Mrs. White", "Rusty"] : gathering.suspectIds.map(names.suspect),
        items: [],
        locations: gathering.locationId ? [names.location(gathering.locationId)] : [],
        times: [timeName],
      },
      writerBrief: brief,
      noteSuitable: true,
    });
  }

  // Observed groups and solos from the movement grid --------------------------
  // Identical groups in the same room across consecutive slots merge into one
  // multi-slot fact ("they never left the table from tea time through dusk") —
  // the strongest natural suspect-clearing facts in the original games.
  type RawGroup = { members: string[]; locationId: string; activity: string; timeIds: string[] };
  const rawGroups: RawGroup[] = [];
  for (const slot of world.slots) {
    const placements = world.movement[slot.id];
    if (!placements) continue;
    if (world.gatherings.some((gathering) => gathering.timeId === slot.id)) continue;
    const seenGroups = new Set<string>();
    for (const suspectId of Object.keys(placements)) {
      const placement = placements[suspectId];
      if (placement.social === "group") {
        const key = placement.companions.slice().sort().join("+");
        if (seenGroups.has(key)) continue;
        seenGroups.add(key);
        if (!placement.locationId) continue;
        const merged = rawGroups.find(
          (candidate) =>
            candidate.locationId === placement.locationId &&
            candidate.members.join("+") === placement.companions.slice().sort().join("+") &&
            isConsecutive(candidate.timeIds[candidate.timeIds.length - 1], slot.id)
        );
        if (merged) {
          merged.timeIds.push(slot.id);
        } else {
          rawGroups.push({
            members: placement.companions.slice().sort(),
            locationId: placement.locationId,
            activity: placement.activity,
            timeIds: [slot.id],
          });
        }
      } else if (placement.social === "solo" && placement.locationId) {
        const thread = world.threads.find(
          (candidate) => candidate.timeId === slot.id && candidate.suspectIds.includes(suspectId)
        );
        facts.push({
          id: nextId(),
          kind: "solo_presence",
          primaryAxis: "suspect",
          suspectIds: [suspectId],
          itemIds: [],
          locationIds: [placement.locationId],
          timeIds: [slot.id],
          mentions: {
            suspects: [names.suspect(suspectId)],
            items: [],
            locations: [names.location(placement.locationId)],
            times: [names.time(slot.id)],
          },
          writerBrief: `During ${names.time(slot.id)}, ${names.suspect(suspectId)} was off alone in the ${names.location(placement.locationId)}${suspectId === world.answer.suspectId ? "" : `, ${placement.activity}`}. Nobody else can vouch for exactly what they were doing there.`,
          noteSuitable: false,
          threadId: thread?.id,
        });
      }
    }
  }

  for (const group of rawGroups) {
    const memberNames = group.members.map(names.suspect);
    const timeNames = group.timeIds.map(names.time);
    const multiSlot = group.timeIds.length > 1;
    facts.push({
      id: nextId(),
      kind: "group_presence",
      primaryAxis: "suspect",
      suspectIds: [...group.members],
      itemIds: [],
      locationIds: [group.locationId],
      timeIds: [...group.timeIds],
      mentions: {
        suspects: memberNames,
        items: [],
        locations: [names.location(group.locationId)],
        times: timeNames,
      },
      writerBrief: multiSlot
        ? `From ${timeNames[0]} straight through ${timeNames[timeNames.length - 1]}, ${listNames(memberNames)} were together in the ${names.location(group.locationId)}, ${group.activity}. None of them left the room in all that while.`
        : `During ${timeNames[0]}, ${listNames(memberNames)} were together in the ${names.location(group.locationId)}, ${group.activity}. They kept one another company the whole while.`,
      noteSuitable: true,
    });
  }

  // Departures / arrival -------------------------------------------------------
  for (const departure of world.departures) {
    facts.push({
      id: nextId(),
      kind: "departure",
      primaryAxis: "suspect",
      suspectIds: [...departure.suspectIds],
      itemIds: [],
      locationIds: [],
      timeIds: [departure.timeId],
      cutoffOrder: requireTime(departure.timeId).order,
      mentions: {
        suspects: departure.suspectIds.map(names.suspect),
        items: [],
        locations: [],
        times: [names.time(departure.timeId)],
      },
      writerBrief: `${listNames(departure.suspectIds.map(names.suspect))} left the mansion during ${names.time(departure.timeId)}, ${departure.cause}, and did not return that day.`,
      noteSuitable: true,
    });
  }
  if (world.arrival) {
    facts.push({
      id: nextId(),
      kind: "guests_arrived",
      primaryAxis: "time",
      suspectIds: [...world.arrival.guestIds],
      itemIds: [],
      locationIds: [],
      timeIds: [world.arrival.timeId],
      cutoffOrder: requireTime(world.arrival.timeId).order,
      mentions: {
        suspects: ["Mrs. White", "Rusty"],
        items: [],
        locations: [],
        times: [names.time(world.arrival.timeId)],
      },
      writerBrief: `The guests only began arriving at ${names.time(world.arrival.timeId)}; before that, just the household — Mrs. White and Rusty — were about the mansion.`,
      noteSuitable: true,
    });
  }

  // Item lifecycle facts ---------------------------------------------------------
  for (const item of ITEMS) {
    const state = world.items[item.id];
    if (!state) continue;
    // Decoy items get no accounting facts at all — nobody can quite say where
    // they were that day, which is what keeps the item question open.
    if (world.decoyItemIds.includes(item.id)) continue;
    if (state.offsite) {
      facts.push({
        id: nextId(),
        kind: "item_offsite",
        primaryAxis: "item",
        suspectIds: [],
        itemIds: [item.id],
        locationIds: [],
        timeIds: [],
        mentions: { suspects: [], items: [item.nameUS], locations: [], times: [] },
        writerBrief: `The ${item.nameUS} was not in the mansion at all that day — it was ${state.offsite.reason} and only came back afterward.`,
        noteSuitable: true,
      });
      continue;
    }

    // Home placement fact.
    facts.push({
      id: nextId(),
      kind: "item_home",
      primaryAxis: "item",
      suspectIds: [],
      itemIds: [item.id],
      locationIds: [state.homeLocationId],
      timeIds: [],
      mentions: { suspects: [], items: [item.nameUS], locations: [names.location(state.homeLocationId)], times: [] },
      writerBrief: state.displayedForOccasion
        ? `For the occasion, the ${item.nameUS} had been set out in the ${names.location(state.homeLocationId)} where everyone could admire it.`
        : `The ${item.nameUS} was kept in the ${names.location(state.homeLocationId)}, as it always is.`,
      noteSuitable: true,
    });

    // Latest useful intact sighting. For the ANSWER item this becomes the
    // classic last-seen-together anchor: it is bundled with the decoy items
    // ("the pen, the snuffbox and the hairpin were all still there at Dusk"),
    // which lets the item chain close every earlier hour while the decoys
    // keep the item question honestly open at the theft hour itself.
    const sighting = [...state.intactSightings].sort(
      (a, b) => requireTime(b.timeId).order - requireTime(a.timeId).order
    )[0];
    if (sighting) {
      const isAnswerAnchor = item.id === world.answer.itemId;
      const bundledIds = isAnswerAnchor ? [item.id, ...world.decoyItemIds] : [item.id];
      const bundledNames = bundledIds.map(names.item);
      facts.push({
        id: nextId(),
        kind: "item_intact",
        primaryAxis: "item",
        suspectIds: [],
        itemIds: bundledIds,
        locationIds: [state.homeLocationId],
        timeIds: [sighting.timeId],
        cutoffOrder: requireTime(sighting.timeId).order,
        mentions: {
          suspects: sighting.witness === "staff" ? ["Mrs. White"] : [],
          items: bundledNames,
          locations: [names.location(state.homeLocationId)],
          times: [names.time(sighting.timeId)],
        },
        writerBrief: isAnswerAnchor && bundledIds.length > 1
          ? `As late as ${names.time(sighting.timeId)}, the ${listNames(bundledNames)} were all still where they belonged — ${sighting.witness === "staff" ? "Mrs. White is certain of it from her rounds" : "several guests remember admiring them"}. After that hour, nobody can say.`
          : `As late as ${names.time(sighting.timeId)}, the ${item.nameUS} was still sitting in its place in the ${names.location(state.homeLocationId)} — ${sighting.witness === "staff" ? "Mrs. White saw it during her rounds" : "several guests admired it there"}.`,
        noteSuitable: true,
      });
    }
  }

  // The grand lockup: for Midnight thefts only, Ashe locks every display
  // case in the house at Night — "By the time I went to bed, all of the
  // Jewelry had been locked up and accounted for" is the corpus original.
  // This is the only natural fact that rules items out for the final hour.
  // The answer item's case is never claimed locked (its theft happened),
  // and decoy items stay fuzzy. Other regimes don't get this fact: their
  // late hours are honestly undying via the decoys, and the fact would only
  // bait the scheduler.
  if (requireTime(world.answer.timeId).order === 10) {
    const lockedItems = ITEMS.filter((item) => {
      const state = world.items[item.id];
      if (!state || state.offsite) return false;
      if (item.id === world.answer.itemId) return false;
      if (world.decoyItemIds.includes(item.id)) return false;
      return true;
    });
    const lockupTime = TIME_PERIODS.find((slot) => slot.order === 9)!;
    if (lockedItems.length > 0) {
      facts.push({
        id: nextId(),
        kind: "items_secured",
        primaryAxis: "item",
        suspectIds: [],
        itemIds: lockedItems.map((item) => item.id),
        locationIds: [],
        timeIds: [lockupTime.id],
        cutoffOrder: lockupTime.order,
        mentions: {
          suspects: [],
          items: lockedItems.map((item) => item.nameUS),
          locations: [],
          times: [lockupTime.name],
        },
        writerBrief: `Before retiring at ${lockupTime.name}, the display cases through the house were locked for the night, the valuables inside them all accounted for — the usual final round.`,
        noteSuitable: true,
      });
    }
  }

  if (world.securedSet) {
    facts.push({
      id: nextId(),
      kind: "items_secured",
      primaryAxis: "item",
      suspectIds: [],
      itemIds: [...world.securedSet.itemIds],
      locationIds: [],
      timeIds: [world.securedSet.fromTimeId],
      cutoffOrder: requireTime(world.securedSet.fromTimeId).order,
      mentions: {
        suspects: [],
        items: world.securedSet.itemIds.map(names.item),
        locations: [],
        times: [names.time(world.securedSet.fromTimeId)],
      },
      writerBrief: `By the end of ${names.time(world.securedSet.fromTimeId)}, ${world.securedSet.label} — ${listNames(world.securedSet.itemIds.map(names.item))} — had been locked away and accounted for, every piece.`,
      noteSuitable: true,
    });
  }

  if (world.roomClosure) {
    const closure = world.roomClosure;
    const closedTimeIds = closure.timeIds === "all" ? [] : [...closure.timeIds];
    const allDay = closure.timeIds === "all";
    facts.push({
      id: nextId(),
      kind: "room_closed",
      primaryAxis: "location",
      suspectIds: [],
      itemIds: [],
      locationIds: [closure.locationId],
      timeIds: closedTimeIds,
      mentions: {
        suspects: [],
        items: [],
        locations: [names.location(closure.locationId)],
        times: closedTimeIds.map(names.time),
      },
      writerBrief: allDay
        ? `The ${names.location(closure.locationId)} was shut up the entire day — ${closure.cause} — and nobody could get in.`
        : `The ${names.location(closure.locationId)} was closed off through ${names.time(closedTimeIds[closedTimeIds.length - 1])} — ${closure.cause}.`,
      noteSuitable: true,
    });
  }

  // Undisturbed rooms (checked after the fact; answer location excluded by truth).
  // Harvested both as singles and as bundles of 2-3 rooms ("the whole east side
  // was gone over — nothing amiss"), matching how Ashe and the Inspector talk.
  const undisturbedRooms = LOCATIONS.filter(
    (location) =>
      location.id !== world.answer.locationId &&
      !(world.roomClosure && world.roomClosure.locationId === location.id)
  );
  const bundleRng = new SeededRandom(hashLocal(world.seed, world.attempt, 101));
  for (const location of undisturbedRooms) {
    facts.push({
      id: nextId(),
      kind: "room_undisturbed",
      primaryAxis: "location",
      suspectIds: [],
      itemIds: [],
      locationIds: [location.id],
      timeIds: [],
      mentions: { suspects: [], items: [], locations: [location.name], times: [] },
      writerBrief: `The ${location.name} was gone over carefully afterward: nothing out of place, nothing missing, nothing so much as nudged.`,
      noteSuitable: true,
    });
  }
  const shuffledRooms = bundleRng.shuffle([...undisturbedRooms]);
  while (shuffledRooms.length >= 2) {
    const size = Math.min(shuffledRooms.length, bundleRng.nextInt(2, 3));
    const bundle = shuffledRooms.splice(0, size);
    facts.push({
      id: nextId(),
      kind: "room_undisturbed",
      primaryAxis: "location",
      suspectIds: [],
      itemIds: [],
      locationIds: bundle.map((location) => location.id),
      timeIds: [],
      mentions: { suspects: [], items: [], locations: bundle.map((location) => location.name), times: [] },
      writerBrief: `The ${listNames(bundle.map((location) => location.name))} were each gone over carefully afterward: nothing out of place in any of them, and nothing missing.`,
      noteSuitable: true,
    });
  }

  // Staff-round bundles: Ashe or Mrs. White passing through and seeing several
  // pieces still in their places ("all present and accounted for"). These are
  // the workhorse item facts — one clue can vouch for several valuables.
  const roundCandidates = ITEMS.filter(
    (item) =>
      item.id !== world.answer.itemId &&
      !world.items[item.id]?.offsite &&
      !world.decoyItemIds.includes(item.id)
  );
  const roundItems = bundleRng.shuffle([...roundCandidates]);
  const roundTimes = [6, 7, 9].map((order) => TIME_PERIODS.find((slot) => slot.order === order)!);
  let roundIndex = 0;
  const nightRound = TIME_PERIODS.find((slot) => slot.order === 9)!;
  while (roundItems.length > 0 && roundIndex < roundTimes.length) {
    // Spread ALL eligible items across the rounds — an item nobody vouches
    // for late in the day would keep early times alive forever.
    const size = Math.ceil(roundItems.length / (roundTimes.length - roundIndex));
    const bundle = roundItems.splice(0, size);
    const roundTime = roundTimes[roundIndex];
    roundIndex += 1;
    facts.push({
      id: nextId(),
      kind: "item_intact",
      primaryAxis: "item",
      suspectIds: [],
      itemIds: bundle.map((item) => item.id),
      locationIds: [],
      timeIds: [roundTime.id],
      cutoffOrder: roundTime.order,
      mentions: {
        suspects: bundleRng.nextBool(0.5) ? ["Mrs. White"] : [],
        items: bundle.map((item) => item.nameUS),
        locations: [],
        times: [roundTime.name],
      },
      writerBrief: `On the rounds during ${roundTime.name}, the ${listNames(bundle.map((item) => item.nameUS))} were each seen still in their proper places — every one present and accounted for at that hour.`,
      noteSuitable: true,
    });
    // Late-repeat sweep: the same pieces seen again on the night rounds
    // ("by the time I went to bed, all accounted for" — the classic line).
    // Always true for never-stolen items; gives the solver a heavier cutoff.
    if (roundTime.order < nightRound.order) {
      facts.push({
        id: nextId(),
        kind: "item_intact",
        primaryAxis: "item",
        suspectIds: [],
        itemIds: bundle.map((item) => item.id),
        locationIds: [],
        timeIds: [nightRound.id],
        cutoffOrder: nightRound.order,
        mentions: {
          suspects: [],
          items: bundle.map((item) => item.nameUS),
          locations: [],
          times: [nightRound.name],
        },
        writerBrief: `On the last look round during ${nightRound.name}, the ${listNames(bundle.map((item) => item.nameUS))} were all still exactly where they belonged, every piece accounted for before the house went quiet.`,
        noteSuitable: true,
      });
    }
  }

  if (world.discovery) {
    facts.push({
      id: nextId(),
      kind: "discovery",
      primaryAxis: "time",
      suspectIds: [],
      itemIds: [],
      locationIds: [],
      timeIds: [world.discovery.timeId],
      cutoffOrder: requireTime(world.discovery.timeId).order,
      mentions: { suspects: [], items: [], locations: [], times: [names.time(world.discovery.timeId)] },
      writerBrief: `It was during ${names.time(world.discovery.timeId)} that ${world.discovery.noticedBy} first noticed something was missing — so whatever happened had already happened by then.`,
      noteSuitable: true,
    });
  }

  // Mention-only color ------------------------------------------------------------
  for (const event of world.itemHandlingEvents) {
    const suspect = names.suspect(event.suspectId);
    const item = names.item(event.itemId);
    const location = names.location(event.locationId);
    const time = names.time(event.timeId);
    facts.push({
      id: nextId(),
      kind: "item_handling",
      primaryAxis: "color",
      suspectIds: [event.suspectId],
      itemIds: [event.itemId],
      locationIds: [event.locationId],
      timeIds: [event.timeId],
      mentions: { suspects: [suspect], items: [item], locations: [location], times: [time] },
      writerBrief: `During ${time}, ${suspect} ${event.action} the ${item} in the ${location}. This was witnessed handling, not a claim about what happened later.`,
      canonicalStatement: `During ${time}, ${suspect} ${event.action} the ${item} in the ${location}. This is context only and makes no claim about what happened later.`,
      noteSuitable: false,
    });
  }

  for (const history of world.objectHistories) {
    const item = requireItem(history.itemId);
    const state = world.items[history.itemId];
    if (state?.offsite) continue;
    facts.push({
      id: nextId(),
      kind: "object_history",
      primaryAxis: "color",
      suspectIds: [],
      itemIds: [history.itemId],
      locationIds: [],
      timeIds: [],
      mentions: { suspects: [], items: [item.nameUS], locations: [], times: [] },
      writerBrief: `About the ${item.nameUS}: it is ${history.note}. Mr. Boddy tells the story to anyone who will listen.`,
      noteSuitable: false,
    });
  }

  for (const thread of world.threads) {
    const mentionSuspects = thread.suspectIds.map(names.suspect);
    const mentionItems = thread.itemId ? [names.item(thread.itemId)] : [];
    const mentionLocations = thread.locationId ? [names.location(thread.locationId)] : [];
    const mentionTimes = thread.timeId ? [names.time(thread.timeId)] : [];
    const where = thread.locationId ? ` in the ${names.location(thread.locationId)}` : "";
    const when = thread.timeId ? ` around ${names.time(thread.timeId)}` : "";
    let setupBrief: string;
    let resolutionBrief: string;
    if (thread.kind === "quarrel") {
      setupBrief = `${listNames(mentionSuspects)} were heard having sharp words${where}${when}. They stopped when anyone came near, and the subject was not then known.`;
      resolutionBrief = `Inspector Brown later established that the sharp words between ${listNames(mentionSuspects)} concerned ${thread.cause}, not the missing property.`;
    } else if (thread.kind === "borrowed_item") {
      setupBrief = `${mentionSuspects[0]} was seen with the ${mentionItems[0]} more than once that day, without explaining why.`;
      resolutionBrief = `Mr. Boddy confirmed that ${mentionSuspects[0]} had the ${mentionItems[0]} ${thread.cause}.`;
    } else if (thread.kind === "surprise_task") {
      setupBrief = `${mentionSuspects[0]} kept disappearing toward the ${mentionLocations[0] ?? "service side of the house"}${when}, and was cagey about why.`;
      resolutionBrief = `The unexplained trips by ${mentionSuspects[0]} were eventually accounted for: they were ${thread.cause}.`;
    } else {
      setupBrief = `${mentionSuspects[0]} slipped away${where}${when} and was cagey about it afterward.`;
      resolutionBrief = `Inspector Brown accounted for ${mentionSuspects[0]}'s private errand: they were ${thread.cause}.`;
    }
    const shared = {
      primaryAxis: "color" as const,
      suspectIds: [...thread.suspectIds],
      itemIds: thread.itemId ? [thread.itemId] : [],
      locationIds: thread.locationId ? [thread.locationId] : [],
      timeIds: thread.timeId ? [thread.timeId] : [],
      mentions: { suspects: mentionSuspects, items: mentionItems, locations: mentionLocations, times: mentionTimes },
      threadId: thread.id,
    };
    facts.push({
      id: nextId(),
      kind: "thread_setup",
      ...shared,
      writerBrief: setupBrief,
      canonicalStatement: `${setupBrief} This is an unresolved lead with no formal deduction effect.`,
      noteSuitable: false,
    });
    facts.push({
      id: nextId(),
      kind: "thread_resolution",
      ...shared,
      writerBrief: resolutionBrief,
      canonicalStatement: `${resolutionBrief} This resolves the lead but has no formal deduction effect.`,
      noteSuitable: true,
    });
  }

  assertFactsSpareAnswer(facts, world.answer);
  return facts;
}

const TIME_ORDER_LOOKUP = new Map(TIME_PERIODS.map((t) => [t.id, t.order]));

function isConsecutive(previousTimeId: string, nextTimeId: string): boolean {
  return (TIME_ORDER_LOOKUP.get(nextTimeId) ?? 0) - (TIME_ORDER_LOOKUP.get(previousTimeId) ?? 0) === 1;
}

function hashLocal(seed: number, attempt: number, salt: number): number {
  let h = (Math.abs(Math.trunc(seed)) + attempt * 7_919 + salt * 104_729) >>> 0;
  h = (h ^ (h >>> 16)) * 0x45d9f3b;
  h = (h ^ (h >>> 16)) >>> 0;
  return h & 0x7fffffff;
}

export function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}
