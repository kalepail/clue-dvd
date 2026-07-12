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

export type FactKind =
  | "gathering"        // suspects S were assembled in L during T      → kills (s∈S, t=T)
  | "group_presence"   // suspects S (2+) together in L during T       → kills (s∈S, t=T)
  | "solo_presence"    // suspect s was alone in L during T            → kills (s, t=T, l≠L)
  | "departure"        // suspects S left at end of T                  → kills (s∈S, t>T)
  | "guests_arrived"   // guests arrived at T                          → kills (guest s, t<T)
  | "item_intact"      // item i seen in place in L during T           → kills (i, t≤T)
  | "item_offsite"     // item i never in the mansion that day         → kills (i)
  | "items_secured"    // items I locked away from T onward            → kills (i∈I, t>T)
  | "room_closed"      // location l inaccessible (times or all day)   → kills (l, t∈set)
  | "room_undisturbed" // nothing missing/amiss in location l          → kills (l)
  | "item_home"        // item i was kept in location L that day       → kills (i, l≠L)
  | "discovery"        // theft noticed during T                       → kills (t≥T)
  | "object_history"   // provenance color                             → mention-only
  | "personal_remark"  // relationship/behavior color                  → mention-only
  | "thread_color"     // innocent-thread color                        → mention-only
  | "claim";           // an attributed STATEMENT (may be a lie)       → mention-only

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
 * Noun-phrase stand-ins for the ANSWER hour, so the theft hour is described
 * by the day's rhythm instead of being named over and over ("Night" five
 * times told everyone the answer). They slot anywhere a time name does:
 * "during the lull after lunch", "as late as the tail of the evening".
 * Lowercase daypart words are invisible to the card-name verifier, and the
 * fact's license carries no time card, so the renderer cannot sharpen them.
 */
const HOUR_STANDINS: Record<number, string[]> = {
  1: ["the grey hour before breakfast", "first light, before the house was up"],
  2: ["the morning table", "the breakfast hour"],
  3: ["the stretch between breakfast and lunch", "the middle of the morning"],
  4: ["the midday meal", "the luncheon hour"],
  5: ["the lull after lunch", "the early stretch of the afternoon"],
  6: ["the deep of the afternoon", "the refreshment hour"],
  7: ["the hour before dinner, as the light failed", "the dressing hour"],
  8: ["the evening meal", "the dinner hour"],
  9: ["the tail of the evening, after dinner", "the stretch before the house went up to bed"],
  10: ["the dead hours after everyone retired", "the deep of the night"],
};

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
    case "personal_remark":
    case "thread_color":
    case "claim":
      // Statements are not evidence. A claim never eliminates anything —
      // which is precisely what makes a lying thief SAFE for fair play:
      // the lie misleads only until the true facts around it snap shut.
      return false;
  }
}

export function isMentionOnly(fact: Fact): boolean {
  return (
    fact.kind === "object_history" ||
    fact.kind === "personal_remark" ||
    fact.kind === "thread_color" ||
    fact.kind === "claim"
  );
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

// ---------------------------------------------------------------------------
// Harvest
// ---------------------------------------------------------------------------

export function harvestFacts(world: WorldState): Fact[] {
  const facts: Fact[] = [];
  let counter = 0;
  const nextId = (): string => `F${String(++counter).padStart(3, "0")}`;
  // Seeded phrasing for brief templates, so the same fact kind reads
  // differently from game to game and within one game. The cycler never
  // repeats a variant until its whole family has been used once.
  const phraseRng = new SeededRandom(hashLocal(world.seed, world.attempt, 202));
  const answerHourId = world.answer.timeId;
  const answerOrder = requireTime(answerHourId).order;
  const standinCycle: string[] = [];
  /**
   * How a brief refers to an hour. Every hour keeps its card name EXCEPT the
   * theft hour, which gets a rhythm-of-the-day stand-in and no time card in
   * the license — the writer physically cannot name it.
   */
  const refName = (timeId: string): { text: string; mention: string | null } => {
    const order = requireTime(timeId).order;
    if (timeId !== answerHourId) {
      // Vague timing must be the HOUSE STYLE, not a fingerprint: if rhythm
      // phrases only ever marked the theft hour, the phrasing itself would
      // become the tell. So innocent hours speak in the day's rhythm too,
      // about a third of the time.
      if (phraseRng.nextBool(0.3)) {
        return { text: phraseRng.pick(HOUR_STANDINS[order]), mention: null };
      }
      const name = requireTime(timeId).name;
      return { text: name, mention: name };
    }
    if (standinCycle.length === 0) standinCycle.push(...phraseRng.shuffle([...HOUR_STANDINS[answerOrder]]));
    return { text: standinCycle.shift()!, mention: null };
  };
  const phraseCycles = new Map<string, number[]>();
  const pickPhrase = (family: string, variants: string[]): string => {
    let cycle = phraseCycles.get(family);
    if (!cycle || cycle.length === 0) {
      cycle = phraseRng.shuffle(variants.map((_, index) => index));
      phraseCycles.set(family, cycle);
    }
    const index = cycle.shift()!;
    return variants[index % variants.length];
  };
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
  const threadMoments = new Set(
    world.threads
      .filter((thread) => thread.timeId)
      .map((thread) => `${thread.timeId}|${thread.suspectIds.slice().sort().join("+")}`)
  );
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
        // A quarrel or errand moment is the thread's story to tell — a group
        // fact here would leak its cause as a chummy "activity".
        if (threadMoments.has(`${slot.id}|${key}`)) continue;
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
        const soloRef = refName(slot.id);
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
            times: soloRef.mention ? [soloRef.mention] : [],
          },
          writerBrief: `During ${soloRef.text}, ${names.suspect(suspectId)} was off alone in the ${names.location(placement.locationId)}${suspectId === world.answer.suspectId ? "" : `, ${placement.activity}`}. Nobody else can vouch for exactly what they were doing there.`,
          noteSuitable: false,
          threadId: thread?.id,
        });
      }
    }
  }

  for (const group of rawGroups) {
    const memberNames = group.members.map(names.suspect);
    const multiSlot = group.timeIds.length > 1;
    const roomName = names.location(group.locationId);
    const namesList = listNames(memberNames);
    const firstRef = refName(group.timeIds[0]);
    const lastRef = refName(group.timeIds[group.timeIds.length - 1]);
    const first = firstRef.text;
    const last = lastRef.text;
    const timeNames = [...new Set([firstRef.mention, lastRef.mention].filter((n): n is string => Boolean(n)))];
    // The group that truly held the room the thief CLAIMS to have been in —
    // its honest testimony is what gives the lie away.
    const isLieContradiction =
      world.falseAlibi !== null &&
      group.locationId === world.falseAlibi.claimedLocationId &&
      group.timeIds.includes(world.answer.timeId);
    // Company clues are the heart of the case — people, what they were doing,
    // and who can vouch for whom. Several distinct sentence skeletons (led by
    // the activity, the people, the room, or the stretch of time) so two of
    // these in one case never read as the same clue twice.
    const multiVariants = [
      `From ${first} straight through ${last}, ${namesList} were together in the ${roomName}, ${group.activity}. None of them left the room in all that while.`,
      `The ${group.activity} in the ${roomName} went on from ${first} until well past ${last} — ${namesList} the whole party of it, and nobody stirred.`,
      `${namesList} claimed the ${roomName} for themselves from ${first} to ${last}; whoever looked in found them still at it, ${group.activity}.`,
      `Between ${first} and ${last} the ${roomName} echoed with ${namesList} ${group.activity} — each of them can answer for the others through that whole stretch.`,
    ];
    const singleVariants = [
      `During ${first}, ${namesList} were together in the ${roomName}, ${group.activity}. They kept one another company the whole while.`,
      `The ${roomName} had its own little party during ${first}: ${namesList}, ${group.activity}, none of them going anywhere.`,
      `${namesList} fell in together over ${group.activity} in the ${roomName} during ${first}, and stayed with it to the end of the hour.`,
      `Anyone passing the ${roomName} during ${first} found ${namesList} ${group.activity} — all present, all occupied.`,
    ];
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
        locations: [roomName],
        times: timeNames,
      },
      writerBrief: multiSlot ? pickPhrase("group-multi", multiVariants) : pickPhrase("group-single", singleVariants),
      noteSuitable: true,
      threadId: isLieContradiction ? "LIE" : undefined,
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
      const sightingRef = refName(sighting.timeId);
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
          times: sightingRef.mention ? [sightingRef.mention] : [],
        },
        writerBrief: isAnswerAnchor && bundledIds.length > 1
          ? `As late as ${sightingRef.text}, the ${listNames(bundledNames)} were all still where they belonged — ${sighting.witness === "staff" ? "Mrs. White is certain of it from her rounds" : "several guests remember admiring them"}.`
          : `As late as ${sightingRef.text}, the ${item.nameUS} was still sitting in its place in the ${names.location(state.homeLocationId)} — ${sighting.witness === "staff" ? "Mrs. White saw it during her rounds" : "several guests admired it there"}.`,
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
    const securedRef = refName(world.securedSet.fromTimeId);
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
        times: securedRef.mention ? [securedRef.mention] : [],
      },
      writerBrief: `By the end of ${securedRef.text}, ${world.securedSet.label} — ${listNames(world.securedSet.itemIds.map(names.item))} — had been locked away and accounted for, every piece.`,
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
    const bundle = shuffledRooms.splice(0, 2);
    facts.push({
      id: nextId(),
      kind: "room_undisturbed",
      primaryAxis: "location",
      suspectIds: [],
      itemIds: [],
      locationIds: bundle.map((location) => location.id),
      timeIds: [],
      mentions: { suspects: [], items: [], locations: bundle.map((location) => location.name), times: [] },
      writerBrief: pickPhrase("room-bundle", [
        `The ${listNames(bundle.map((location) => location.name))} were each gone over carefully afterward: nothing out of place in any of them, and nothing missing.`,
        `The Inspector's men went through the ${listNames(bundle.map((location) => location.name))} and came away satisfied — everything in those rooms accounted for.`,
        `Nothing in the ${listNames(bundle.map((location) => location.name))} had been disturbed at all; each was checked with care.`,
      ]),
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
    // for late in the day would keep early times alive forever. Each round
    // names at most two pieces: short lists read as recollection, long ones
    // as inventory.
    const size = Math.min(2, Math.ceil(roundItems.length / (roundTimes.length - roundIndex)));
    const bundle = roundItems.splice(0, size);
    const roundTime = roundTimes[roundIndex];
    roundIndex += 1;
    const roundRef = refName(roundTime.id);
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
        times: roundRef.mention ? [roundRef.mention] : [],
      },
      writerBrief: pickPhrase("item-sweep", [
        `On the rounds during ${roundRef.text}, the ${listNames(bundle.map((item) => item.nameUS))} were each seen still in their proper places — every one present and accounted for at that hour.`,
        `Nothing had touched the ${listNames(bundle.map((item) => item.nameUS))} as of ${roundRef.text}; each sat just where Mr. Boddy keeps it.`,
        `When the rounds were made during ${roundRef.text}, the ${listNames(bundle.map((item) => item.nameUS))} were each in their usual spots — all quite undisturbed.`,
      ]),
      noteSuitable: true,
    });
    // Late-repeat sweep: the same pieces seen again on the night rounds
    // ("by the time I went to bed, all accounted for" — the classic line).
    // Always true for never-stolen items; gives the solver a heavier cutoff.
    if (roundTime.order < nightRound.order) {
      const repeatRef = refName(nightRound.id);
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
          times: repeatRef.mention ? [repeatRef.mention] : [],
        },
        writerBrief: pickPhrase("night-repeat", [
          `On the last look round, during ${repeatRef.text}, the ${listNames(bundle.map((item) => item.nameUS))} were all still exactly where they belonged, every piece accounted for before the house went quiet.`,
          `Locking up during ${repeatRef.text} took me past the ${listNames(bundle.map((item) => item.nameUS))} — all present, all in their places, as the lamps went down.`,
          `By the end of ${repeatRef.text} nothing had moved: the ${listNames(bundle.map((item) => item.nameUS))} sat exactly as they had all day.`,
        ]),
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
      writerBrief: `About the ${item.nameUS}: ${history.note} — Mr. Boddy tells the story to anyone who will listen.`,
      noteSuitable: false,
    });
  }

  for (const thread of world.threads) {
    const mentionSuspects = thread.suspectIds.map(names.suspect);
    const mentionItems = thread.itemId ? [names.item(thread.itemId)] : [];
    const mentionLocations = thread.locationId ? [names.location(thread.locationId)] : [];
    const threadTimeRef = thread.timeId ? refName(thread.timeId) : null;
    const mentionTimes = threadTimeRef?.mention ? [threadTimeRef.mention] : [];
    const where = thread.locationId ? ` in the ${names.location(thread.locationId)}` : "";
    const when = threadTimeRef ? ` around ${threadTimeRef.text}` : "";
    let brief: string;
    if (thread.kind === "foggy_memory") {
      const foggyWhen = threadTimeRef?.text ?? "some point in the day";
      brief = pickPhrase("foggy", [
        `${mentionSuspects[0]} thinks they noticed ${thread.cause} somewhere around ${foggyWhen}, but couldn't swear to it.`,
        `${mentionSuspects[0]} keeps coming back to something half-remembered: ${thread.cause}, around ${foggyWhen}, perhaps.`,
      ]);
    } else if (thread.kind === "quarrel") {
      brief = `${listNames(mentionSuspects)} were heard having sharp words${where}${when} — they broke off the moment the door opened, and neither has said a word about it since.`;
    } else if (thread.kind === "borrowed_item") {
      brief = `${mentionSuspects[0]} was seen with the ${mentionItems[0]} in hand more than once that day; at the time, nobody thought to ask why.`;
    } else if (thread.kind === "surprise_task") {
      brief = `${mentionSuspects[0]} kept disappearing toward the ${mentionLocations[0] ?? "service side of the house"}${when}, and was oddly short with anyone who asked why.`;
    } else {
      brief = `${mentionSuspects[0]} slipped away${where}${when} and was evasive about it afterward.`;
    }
    facts.push({
      id: nextId(),
      kind: thread.kind === "quarrel" ? "personal_remark" : "thread_color",
      primaryAxis: "color",
      suspectIds: [...thread.suspectIds],
      itemIds: thread.itemId ? [thread.itemId] : [],
      locationIds: thread.locationId ? [thread.locationId] : [],
      timeIds: thread.timeId ? [thread.timeId] : [],
      mentions: { suspects: mentionSuspects, items: mentionItems, locations: mentionLocations, times: mentionTimes },
      writerBrief: brief,
      noteSuitable: false,
      threadId: thread.kind === "foggy_memory" ? "FOG" : thread.id,
    });
  }

  // Attributed statements — ALL in the same wrapper, drawn from the same
  // phrase families, whether true or false. Innocents say (truthfully)
  // where they were; the thief may truthfully account for an innocent hour;
  // and the thief's false alibi hides among them indistinguishably. "X
  // says…" must never be a lie-marker or a culprit-marker: the identical
  // clue could be honest in the next game, and often is in this one.
  {
    type Statement = { suspectId: string; locationId: string; timeId: string; lie: boolean };
    const statements: Statement[] = world.trueStatements.map((statement) => ({
      suspectId: statement.suspectId,
      locationId: statement.locationId,
      timeId: statement.timeId,
      lie: false,
    }));
    if (world.falseAlibi) {
      statements.push({
        suspectId: world.answer.suspectId,
        locationId: world.falseAlibi.claimedLocationId,
        timeId: world.answer.timeId,
        lie: true,
      });
    }
    for (const statement of phraseRng.shuffle(statements)) {
      const who = names.suspect(statement.suspectId);
      const room = names.location(statement.locationId);
      const hourRef = refName(statement.timeId);
      facts.push({
        id: nextId(),
        kind: "claim",
        primaryAxis: "color",
        suspectIds: [statement.suspectId],
        itemIds: [],
        locationIds: [statement.locationId],
        timeIds: [],
        mentions: {
          suspects: [who],
          items: [],
          locations: [room],
          times: hourRef.mention ? [hourRef.mention] : [],
        },
        writerBrief: pickPhrase("claim", [
          `For what it is worth, ${who} says they were in the ${room} through ${hourRef.text} — though I cannot say I saw them there myself.`,
          `${who} was quick to mention having spent ${hourRef.text} in the ${room}. Nobody has yet said otherwise in my hearing.`,
          `Asked about ${hourRef.text}, ${who} answers readily enough: the ${room}, they say, the whole while.`,
        ]),
        noteSuitable: false,
        threadId: statement.lie ? "LIE" : undefined,
      });
    }
  }

  // Motives — statements about circumstances, not evidence. Several people
  // had reasons; the clues never say which reason mattered.
  const motiveFacts = phraseRng.shuffle([...world.motives]);
  for (const entry of motiveFacts.slice(0, 3)) {
    const who = names.suspect(entry.suspectId);
    facts.push({
      id: nextId(),
      kind: "personal_remark",
      primaryAxis: "color",
      suspectIds: [entry.suspectId],
      itemIds: [],
      locationIds: [],
      timeIds: [],
      mentions: { suspects: [who], items: [], locations: [], times: [] },
      threadId: "MOTIVE",
      writerBrief: pickPhrase("motive", [
        `Below stairs it is quietly said that ${who} contends with ${entry.motive}. Households hear these things.`,
        `One hears — one cannot help hearing — that ${who} contends with ${entry.motive}.`,
        `${who}'s circumstances are much discussed below stairs: ${entry.motive}, they say.`,
      ]),
      noteSuitable: false,
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
