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
import { beatPhrasesForTime } from "../data/occasion-catalog";
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
  | "retired_gathering" // household asleep/retired during T           → kills (s∈S, t=T)
  | "group_presence"   // suspects S (2+) together in L during T       → kills (s∈S, t=T)
  | "scene_continuation" // suspects S continuously in L over T1..Tn  → kills vouched (s,t) pairs
  | "scene_evidence"   // lived scene fused with compatible physical evidence → union of components
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
  | "claim"            // an attributed STATEMENT (may be a lie)       → mention-only
  | "witness_account"  // unnamed departure claim, true or fabricated  → mention-only
  | "excuse_given";    // attributed step-away excuse                   → mention-only

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
  /**
   * Exact vouched-for suspect/hour pairs for a changing group. When absent,
   * suspectIds × timeIds remains the fact's coverage. This prevents a clue
   * from extending a departing guest's alibi into hours only the continuing
   * members actually shared.
   */
  suspectTimePairs?: Array<{ suspectId: string; timeId: string }>;
  /** Extra payload interpreted per kind (e.g. cutoff order). */
  cutoffOrder?: number;
  mentions: MentionLicense;
  /** Neutral world-event description handed to the answer-blind writer. */
  writerBrief: string;
  /** Suitable to be delivered as a formal Inspector note. */
  noteSuitable: boolean;
  threadId?: string;
  episodeId?: string;
  episodeRole?: "setup" | "continuation" | "excuse" | "witness" | "claim" | "fused";
  /** Optional character undercurrent for the first public fragment from an
   * episode. The engine adds it once, never to every fragment. Episode facts
   * already carry their occasion prop, so this field deliberately contributes
   * the human preoccupation without repeating the same set dressing. */
  sceneTexture?: string;
  /** Private composition hint used to diversify lived-scene/evidence fusions. */
  sceneEvidenceMode?: "same_hour_item" | "clearing_coda" | "inspection_coda" | "material_handover";
  /** Exact people whose uncertain movement or suspicious action draws
   * attention in this fact. This is intentionally narrower than suspectIds:
   * in a three-person handoff, only the person who stepped away belongs here.
   * Private composition/diagnostics only; it has no evidence semantics. */
  questionedSuspectIds?: string[];
  /** Exact suspect/hour boundary for questioned movement when one exists.
   * This distinguishes a departure from the broader span described by a
   * fused social scene. Private diagnostics only. */
  questionedMovementPairs?: Array<{ suspectId: string; timeId: string }>;
  /** People explicitly known to continue together after a fused departure.
   * This is narrower than suspectIds and lets prose verification ensure the
   * second half of the social fact is not dropped. */
  continuousSuspectIds?: string[];
  /** Private diagnostics only; never sent to the renderer. */
  witnessVariant?: import("./world-sim").WitnessAccountVariant;
  /** A composite clue carries the union of two already-truthful facts. Base
   * facts never contain components, so this remains shallow and acyclic. */
  components?: Fact[];
  componentFactIds?: string[];
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
  2: ["the first meal of the day", "when the household first sat down"],
  3: ["the stretch between breakfast and lunch", "the middle of the morning"],
  4: ["the midday meal", "the luncheon hour"],
  5: ["the lull after lunch", "the early stretch of the afternoon"],
  6: ["the deep of the afternoon", "the refreshment hour"],
  7: ["the hour before dinner, as the light failed", "the dressing hour"],
  8: ["the evening meal", "when the company sat down again"],
  9: ["the tail of the evening, after dinner", "the stretch before the house went up to bed"],
  // Midnight can still contain truthful movement when the theft itself falls
  // there. Never imply the whole house has retired merely because the printed
  // card is late; use neutral night language that remains true in both worlds.
  10: ["the final stretch of the night", "the deep of the night"],
};

/**
 * Returns true when the fact rules out the cell (s, i, l, t).
 * This is the ONLY definition of fact semantics in the codebase.
 */
export function factKillsCell(fact: Fact, s: string, i: string, l: string, t: string): boolean {
  const order = TIME_ORDER.get(t) ?? 0;
  switch (fact.kind) {
    case "gathering":
    case "retired_gathering":
      return fact.timeIds.includes(t) && fact.suspectIds.includes(s);
    case "group_presence":
    case "scene_continuation":
      return fact.suspectTimePairs
        ? fact.suspectTimePairs.some((pair) => pair.suspectId === s && pair.timeId === t)
        : fact.timeIds.includes(t) && fact.suspectIds.includes(s);
    case "scene_evidence":
      return (fact.components ?? []).some((component) => factKillsCell(component, s, i, l, t));
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
    case "witness_account":
    case "excuse_given":
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
    fact.kind === "claim" ||
    fact.kind === "witness_account" ||
    fact.kind === "excuse_given"
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
  // Dossier texture is cosmetic. Keep its cycling RNG completely separate
  // from time-reference and fact-template phrasing so applying model-supplied
  // vocabulary cannot alter mention licenses, fact order, or any semantics.
  const textureRng = new SeededRandom(hashLocal(world.seed, world.attempt, 303));
  const textureCycles = new Map<string, number[]>();
  const answerHourId = world.answer.timeId;
  const beatCycles = new Map<string, string[]>();
  type TimeReference = { point: string; clause: string; mention: string | null };
  const temporalPoint = (text: string): string => {
    const trimmed = text.trim();
    const transformations: Array<[RegExp, string]> = [
      [/^just before\s+/i, "the moments just before "],
      [/^before\s+/i, "the period before "],
      [/^after\s+/i, "the period after "],
      [/^as\s+/i, "the point when "],
      [/^when\s+/i, "the moment when "],
      [/^while\s+/i, "the time when "],
      [/^by\s+/i, "the point reached by "],
      [/^in the thick of\s+/i, "the height of "],
      [/^amid\s+/i, "the midst of "],
      [/^(?:during|amid|in|over|at)\s+/i, ""],
    ];
    for (const [pattern, replacement] of transformations) {
      if (pattern.test(trimmed)) return trimmed.replace(pattern, replacement);
    }
    return trimmed;
  };
  const timeReference = (text: string, mention: string | null): TimeReference => ({
    point: temporalPoint(text),
    clause: /^(?:during|amid|in|over|at|as|while|when|before|after|just before|by)\b/i.test(text.trim())
      ? text.trim()
      : `during ${text.trim()}`,
    mention,
  });
  const capitalize = (value: string): string => value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value;
  const unnamedPhrases = (timeId: string, includeOccasionBeats = true): string[] => {
    const printedName = requireTime(timeId).name;
    const patternFor = (name: string): RegExp =>
      new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+")}\\b`, "i");
    const ownPattern = patternFor(printedName);
    const answerPattern = patternFor(requireTime(answerHourId).name);
    const order = requireTime(timeId).order;
    const candidates = [
      ...(includeOccasionBeats ? beatPhrasesForTime(world.occasionSpine, timeId) : []),
      ...HOUR_STANDINS[order],
    ]
      .filter((phrase) => !ownPattern.test(phrase) && !answerPattern.test(phrase));
    return candidates.length > 0 ? candidates : ["that part of the day's programme"];
  };
  const nextVaguePhrase = (timeId: string, includeOccasionBeats = true): string => {
    const cycleKey = `${timeId}:${includeOccasionBeats ? "beat" : "clock"}`;
    let cycle = beatCycles.get(cycleKey);
    if (!cycle || cycle.length === 0) {
      cycle = phraseRng.shuffle([...unnamedPhrases(timeId, includeOccasionBeats)]);
      beatCycles.set(cycleKey, cycle);
    }
    return cycle.shift()!;
  };
  /**
   * How a brief refers to an hour. Every hour keeps its card name EXCEPT the
   * theft hour, which gets a rhythm-of-the-day stand-in and no time card in
   * the license — the writer physically cannot name it.
  */
  const refName = (timeId: string, includeOccasionBeats = true): TimeReference => {
    if (timeId !== answerHourId) {
      // Vague timing must be the HOUSE STYLE, not a fingerprint: if rhythm
      // phrases only ever marked the theft hour, the phrasing itself would
      // become the tell. So innocent hours speak through occasion beats or
      // the day's rhythm too, about forty percent of the time.
      if (phraseRng.nextBool(0.4)) {
        return timeReference(nextVaguePhrase(timeId, includeOccasionBeats), null);
      }
      const name = requireTime(timeId).name;
      return timeReference(name, name);
    }
    return timeReference(nextVaguePhrase(timeId, includeOccasionBeats), null);
  };
  const beatRef = (timeId: string): TimeReference => {
    return timeReference(nextVaguePhrase(timeId), null);
  };
  const spanPhrase = (timeIds: string[], firstRef: TimeReference, lastRef: TimeReference): string => {
    const sharedBeat = world.occasionSpine.beats.find((beat) =>
      timeIds.every((timeId) => beat.timeIds.includes(timeId))
    );
    if (sharedBeat) {
      const firstIndex = sharedBeat.timeIds.indexOf(timeIds[0]);
      const lastIndex = sharedBeat.timeIds.indexOf(timeIds[timeIds.length - 1]);
      const coversWholeBeat = firstIndex === 0 && lastIndex === sharedBeat.timeIds.length - 1;
      if (coversWholeBeat) return `throughout ${sharedBeat.name}`;
      if (firstIndex === 0 && lastIndex > firstIndex) {
        return `from the opening through the height of ${sharedBeat.name}`;
      }
      if (lastIndex === sharedBeat.timeIds.length - 1 && firstIndex < lastIndex) {
        return `from the height of ${sharedBeat.name} through its close`;
      }
    }
    return `from ${firstRef.point} through ${lastRef.point}`;
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
  };
  const feminineSuspectIds = new Set(["S01", "S03", "S05", "S07", "S09"]);
  const pronounsFor = (suspectId: string): {
    subject: "she" | "he";
    object: "her" | "him";
    possessive: "her" | "his";
  } => feminineSuspectIds.has(suspectId)
    ? { subject: "she", object: "her", possessive: "her" }
    : { subject: "he", object: "him", possessive: "his" };
  const texture = (
    field: "gatheringDetails" | "inspectionContexts" | "observationContexts",
    _salt: number
  ): string | null => {
    const values = world.occasionTexture?.[field] ?? [];
    if (values.length === 0) return null;
    // Texture used to be independently hashed for every fact. Different
    // facts therefore landed on the same prop again and again while equally
    // useful alternatives were never used. Draw through the same seeded
    // no-replacement cycler as prose families so every available setting gets
    // a turn before one repeats. The salt remains in the signature to keep
    // call sites documenting which observation they are decorating.
    let cycle = textureCycles.get(field);
    if (!cycle || cycle.length === 0) {
      cycle = textureRng.shuffle(values.map((_, index) => index));
      textureCycles.set(field, cycle);
    }
    return values[cycle.shift()! % values.length];
  };
  // Occasion texture describes what Ashe was doing when a fact became
  // observable. Keep it separate from the fact at this layer: mechanically
  // prefixing a gerund to an item or room sentence creates dangling modifiers
  // ("While counting ribbons, the Pocket Watch was kept..."). The renderer
  // can now fuse agent + observation naturally without changing either truth.
  const withThemedContext = (detail: string | null, sentence: string): string =>
    detail
      ? `Occasion context to weave into this recollection: Ashe was ${detail}. Core fact: ${sentence}`
      : sentence;
  const episodeFor = (locationId: string, timeIds: string[], suspectIds: string[]): string | undefined =>
    world.episodes.find((episode) =>
      episode.locationId === locationId &&
      timeIds.some((timeId) => episode.timeIds.includes(timeId)) &&
      suspectIds.filter((suspectId) => episode.participantIds.includes(suspectId)).length >= 2
    )?.id;
  const sceneTextureFor = (episodeId: string | undefined, namedSuspectIds: string[]): string | undefined => {
    if (!episodeId) return undefined;
    const episode = world.episodes.find((candidate) => candidate.id === episodeId);
    if (!episode) return undefined;
    const featuredId = episode.tensionOwnerId && namedSuspectIds.includes(episode.tensionOwnerId)
      ? episode.tensionOwnerId
      : null;
    return featuredId
      ? `${names.suspect(featuredId)} was ${episode.tension}.`
      : `Someone in that company was ${episode.tension}.`;
  };

  // Gatherings ---------------------------------------------------------------
  // Only a gathering that somebody later cites in an attributed statement
  // receives story linkage. Tagging every gathering as an episode lets plain
  // whole-company alibis crowd actual testimony out of the story skeleton.
  const claimedGatheringKeys = new Set(
    world.trueStatements.map((statement) => `${statement.timeId}:${statement.locationId}`)
  );
  for (const gathering of world.gatherings) {
    const everyone = gathering.suspectIds.length === SUSPECTS.length;
    const gatheringEpisodeId = gathering.locationId && claimedGatheringKeys.has(`${gathering.timeId}:${gathering.locationId}`)
      ? `GATHERING:${gathering.timeId}:${gathering.locationId}`
      : undefined;
    // Sleeping/retired facts must use clock/daylight language. An occasion
    // beat such as "while the entries were placed" is an active event and
    // cannot truthfully coincide with the whole household being abed.
    const timeRef = refName(gathering.timeId, gathering.kind !== "retired");
    const gatheringBeatIndex = world.occasionSpine.beats.findIndex((beat) => beat.timeIds.includes(gathering.timeId));
    const gatheringDetail = gathering.kind === "retired"
      ? null
      : gatheringBeatIndex >= 0
        ? world.occasionTexture?.gatheringDetails[gatheringBeatIndex] ?? null
        : texture("gatheringDetails", 300 + requireTime(gathering.timeId).order);
    const detailSuffix = gatheringDetail ? `, ${gatheringDetail}` : "";
    const roomName = gathering.locationId ? names.location(gathering.locationId) : "";
    const roomSuffix = roomName && !gathering.label.toLowerCase().includes(roomName.toLowerCase())
      ? ` in the ${roomName}`
      : "";
    let brief: string;
    if (gathering.kind === "retired") {
      brief = everyone
        ? `At ${timeRef.point}, ${gathering.label} — every bedroom door shut, the halls empty, not a soul about.`
        : `At ${timeRef.point}, ${gathering.label}; only ${listNames(gathering.suspectIds.map(names.suspect))} were on the premises at that hour, and they were about their usual routine together.`;
    } else if (everyone) {
      brief = pickPhrase("gathering-everyone", [
        `${capitalize(timeRef.clause)}, every single person — guests, plus Mrs. White and Rusty — was together at ${gathering.label}${roomSuffix}${detailSuffix}. Nobody slipped out.`,
        `${capitalize(gathering.label)}${roomSuffix} drew every guest together with Mrs. White and Rusty ${timeRef.clause}${detailSuffix}; Ashe saw the company through it without a single departure.`,
        `From first to last ${timeRef.clause}, ${gathering.label}${roomSuffix} held the entire household — every guest, Mrs. White, and Rusty${detailSuffix}. No one left the gathering.`,
        `The entire company, including Mrs. White and Rusty, remained together for ${gathering.label}${roomSuffix} ${timeRef.clause}${detailSuffix}; not one person broke away.`,
      ]);
    } else {
      brief = `${capitalize(timeRef.clause)}, ${listNames(gathering.suspectIds.map(names.suspect))} were all together at ${gathering.label}${roomSuffix}${detailSuffix}.`;
    }
    facts.push({
      id: nextId(),
      kind: gathering.kind === "retired" ? "retired_gathering" : "gathering",
      primaryAxis: "time",
      suspectIds: [...gathering.suspectIds],
      itemIds: [],
      locationIds: gathering.locationId ? [gathering.locationId] : [],
      timeIds: [gathering.timeId],
      mentions: {
        suspects: everyone ? ["Mrs. White", "Rusty"] : gathering.suspectIds.map(names.suspect),
        items: [],
        locations: gathering.locationId ? [names.location(gathering.locationId)] : [],
        times: timeRef.mention ? [timeRef.mention] : [],
      },
      writerBrief: brief,
      noteSuitable: true,
      episodeId: gatheringEpisodeId,
      episodeRole: gatheringEpisodeId ? "setup" : undefined,
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
        // A private exchange or errand moment is the thread's story to tell — a group
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
        // The hidden answer hour is not a source of singled-out public
        // movement for any suspect. The simulated solo still exists for world
        // continuity and anonymous accounts; only answer-conditioned public
        // provenance is withheld.
        if (slot.id === world.answer.timeId) continue;
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
          writerBrief: `${capitalize(soloRef.clause)}, ${names.suspect(suspectId)} was off alone in the ${names.location(placement.locationId)}, ${placement.activity}. Nobody else can vouch for exactly what ${pronounsFor(suspectId).subject} was doing there.`,
          noteSuitable: false,
          threadId: thread?.id,
          questionedSuspectIds: [suspectId],
          questionedMovementPairs: [{ suspectId, timeId: slot.id }],
        });
      }
    }
  }

  // Adjacent exact-group blocks can describe one richer social episode when
  // at least two people remain together in the same room while others peel
  // away or join. Choose maximal, non-overlapping handoffs so the harvest
  // offers the complete transition rather than its shorter component facts.
  const transitionCandidates: Array<{ first: RawGroup; second: RawGroup; core: string[] }> = [];
  for (const first of rawGroups) {
    const firstEnd = first.timeIds[first.timeIds.length - 1];
    for (const second of rawGroups) {
      if (first === second || first.locationId !== second.locationId) continue;
      if (!isConsecutive(firstEnd, second.timeIds[0])) continue;
      if (first.members.join("+") === second.members.join("+")) continue;
      const core = first.members.filter((member) => second.members.includes(member));
      // Keep the world episode, but do not turn either boundary touching the
      // hidden answer hour into singled-out public movement for anyone.
      if (second.timeIds[0] === world.answer.timeId || firstEnd === world.answer.timeId) continue;
      if (core.length >= 2) transitionCandidates.push({ first, second, core });
    }
  }
  transitionCandidates.sort(
    (a, b) => b.first.timeIds.length + b.second.timeIds.length - (a.first.timeIds.length + a.second.timeIds.length)
  );
  const consumedGroups = new Set<RawGroup>();
  const transitions: typeof transitionCandidates = [];
  for (const candidate of transitionCandidates) {
    if (consumedGroups.has(candidate.first) || consumedGroups.has(candidate.second)) continue;
    transitions.push(candidate);
    consumedGroups.add(candidate.first);
    consumedGroups.add(candidate.second);
  }

  for (const group of rawGroups) {
    if (consumedGroups.has(group)) continue;
    const memberNames = group.members.map(names.suspect);
    const multiSlot = group.timeIds.length > 1;
    const roomName = names.location(group.locationId);
    const namesList = listNames(memberNames);
    const firstRef = refName(group.timeIds[0]);
    const lastRef = refName(group.timeIds[group.timeIds.length - 1]);
    const span = spanPhrase(group.timeIds, firstRef, lastRef);
    const timeNames = [...new Set([firstRef.mention, lastRef.mention].filter((n): n is string => Boolean(n)))];
    const episodeId = episodeFor(group.locationId, group.timeIds, group.members);
    const resumedTransition = transitions.find((transition) => {
      const transitionEnd = transition.second.timeIds[transition.second.timeIds.length - 1];
      const leavers = transition.first.members.filter((member) => !transition.second.members.includes(member));
      return (
        leavers.length > 0 &&
        transition.first.locationId === group.locationId &&
        transition.first.activity === group.activity &&
        requireTime(group.timeIds[0]).order > requireTime(transitionEnd).order &&
        transition.core.every((member) => group.members.includes(member)) &&
        leavers.every((member) => group.members.includes(member))
      );
    });
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
    const stayedPut = memberNames.length === 2
      ? "Neither of them went elsewhere in all that while."
      : "None of them went elsewhere in all that while.";
    const multiVariants = [
      `${capitalize(span)}, ${namesList} were together in the ${roomName}, ${group.activity}. ${stayedPut}`,
      `${capitalize(group.activity)} in the ${roomName} went on ${span} — ${namesList} present throughout, and nobody stirred.`,
      `${namesList} claimed the ${roomName} for themselves ${span}; each time Ashe looked in, they were still at it, ${group.activity}.`,
      `${capitalize(span)}, the ${roomName} echoed with ${namesList} ${group.activity} — each of them can answer for the others through that whole stretch.`,
    ];
    const singleVariants = [
      `${capitalize(firstRef.clause)}, ${namesList} were together in the ${roomName}, ${group.activity}. They kept one another company the whole while.`,
      `The ${roomName} had its own little party ${firstRef.clause}: ${namesList}, ${group.activity}, none of them going anywhere.`,
      `${namesList} fell in together over ${group.activity} in the ${roomName} ${firstRef.clause}, and stayed with it to the end of the hour.`,
      `On passing the ${roomName} ${firstRef.clause}, Ashe found ${namesList} ${group.activity} — all present, all occupied.`,
    ];
    const returnBrief = resumedTransition
      ? `${capitalize(firstRef.clause)}, ${listNames(resumedTransition.first.members.filter((member) => !resumedTransition.second.members.includes(member)).map(names.suspect))} had rejoined ${listNames(resumedTransition.core.map(names.suspect))} in the ${roomName}, and ${namesList} resumed ${group.activity}. ${multiSlot ? `They remained together ${span}.` : "They stayed together for the rest of that stretch."}`
      : null;
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
      writerBrief: returnBrief ?? (multiSlot ? pickPhrase("group-multi", multiVariants) : pickPhrase("group-single", singleVariants)),
      noteSuitable: true,
      threadId: isLieContradiction ? "LIE" : resumedTransition ? "CONTINUITY_RETURN" : undefined,
      episodeId,
      episodeRole: episodeId ? "setup" : undefined,
      sceneTexture: sceneTextureFor(episodeId, group.members),
    });
  }

  for (const transition of transitions) {
    const { first, second, core } = transition;
    const firstOnly = first.members.filter((member) => !second.members.includes(member));
    const secondOnly = second.members.filter((member) => !first.members.includes(member));
    const allSuspects = [...new Set([...first.members, ...second.members])];
    const allTimes = [...first.timeIds, ...second.timeIds];
    const refs = new Map<string, ReturnType<typeof refName>>();
    const ref = (timeId: string) => {
      const existing = refs.get(timeId);
      if (existing) return existing;
      const created = refName(timeId);
      refs.set(timeId, created);
      return created;
    };
    const firstStart = ref(first.timeIds[0]);
    const firstEnd = ref(first.timeIds[first.timeIds.length - 1]);
    const secondStart = ref(second.timeIds[0]);
    const secondEnd = ref(second.timeIds[second.timeIds.length - 1]);
    const firstRange = first.timeIds.length > 1
      ? spanPhrase(first.timeIds, firstStart, firstEnd)
      : firstStart.clause;
    const secondRange = second.timeIds.length > 1
      ? spanPhrase(second.timeIds, secondStart, secondEnd)
      : secondStart.clause;
    const roomName = names.location(first.locationId);
    const firstNames = listNames(first.members.map(names.suspect));
    const coreNames = listNames(core.map(names.suspect));
    const leftNames = listNames(firstOnly.map(names.suspect));
    const joinedNames = listNames(secondOnly.map(names.suspect));
    const boundaryFrom = first.timeIds[first.timeIds.length - 1];
    const boundaryTo = second.timeIds[0];
    const spokenAside = firstOnly.length === 1
      ? world.transitionRemarks.find(
          (remark) =>
            remark.suspectId === firstOnly[0] &&
            remark.fromTimeId === boundaryFrom &&
            remark.toTimeId === boundaryTo
        )
      : undefined;
    const departingPronoun = firstOnly.length === 1 ? pronounsFor(firstOnly[0]).subject : "they";

    let handoff: string;
    if (firstOnly.length > 0 && secondOnly.length === 0) {
      handoff = `${leftNames} stepped away${spokenAside ? ` — “${spokenAside.line},” was all ${departingPronoun} said` : ""}, while ${coreNames} remained in the ${roomName}, ${second.activity}, ${secondRange}.`;
    } else if (firstOnly.length === 0 && secondOnly.length > 0) {
      handoff = `${joinedNames} joined the others, and ${coreNames} stayed on with the new company in the ${roomName} ${secondRange}, ${second.activity}.`;
    } else {
      handoff = `${leftNames} stepped away${spokenAside ? ` — “${spokenAside.line},” was all ${departingPronoun} said` : ""}, just as ${joinedNames} joined the conversation; ${coreNames} remained in the ${roomName} ${secondRange}.`;
    }

    const suspectTimePairs = [first, second].flatMap((group) =>
      group.timeIds.flatMap((timeId) => group.members.map((suspectId) => ({ suspectId, timeId })))
    );
    const isLieContradiction =
      world.falseAlibi !== null &&
      first.locationId === world.falseAlibi.claimedLocationId &&
      suspectTimePairs.some((pair) => pair.timeId === world.answer.timeId);
    const episodeId = episodeFor(first.locationId, allTimes, allSuspects);
    facts.push({
      id: nextId(),
      kind: "group_presence",
      primaryAxis: "suspect",
      suspectIds: allSuspects,
      itemIds: [],
      locationIds: [first.locationId],
      timeIds: allTimes,
      suspectTimePairs,
      mentions: {
        suspects: allSuspects.map(names.suspect),
        items: [],
        locations: [roomName],
        times: [...new Set([...refs.values()].map((entry) => entry.mention).filter((entry): entry is string => Boolean(entry)))],
      },
      writerBrief: `${firstNames} were together in the ${roomName}, ${first.activity}, ${firstRange}. ${capitalize(handoff)}`,
      noteSuitable: true,
      threadId: isLieContradiction ? "LIE" : "CONTINUITY",
      episodeId,
      // This handoff already contains setup, departure, and continuation in
      // one N1-style scene. It must never be dealt beside smaller fragments
      // from the same episode, or the later clues merely repeat it.
      episodeRole: episodeId ? "fused" : undefined,
      sceneTexture: sceneTextureFor(episodeId, allSuspects),
      questionedSuspectIds: firstOnly.length > 0 ? [...firstOnly] : undefined,
      questionedMovementPairs: firstOnly.length > 0
        ? firstOnly.map((suspectId) => ({ suspectId, timeId: boundaryTo }))
        : undefined,
      continuousSuspectIds: [...core],
    });
  }

  // Departures / arrival -------------------------------------------------------
  for (const departure of world.departures) {
    const departureRef = refName(departure.timeId);
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
        times: departureRef.mention ? [departureRef.mention] : [],
      },
      writerBrief: `${capitalize(departureRef.clause)}, ${listNames(departure.suspectIds.map(names.suspect))} left the mansion, ${departure.cause}, and did not return that day.`,
      noteSuitable: true,
    });
  }
  if (world.arrival) {
    const arrivalRef = refName(world.arrival.timeId);
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
        times: arrivalRef.mention ? [arrivalRef.mention] : [],
      },
      writerBrief: `${capitalize(arrivalRef.clause)}, the guests first began arriving; before that, just the household — Mrs. White and Rusty — were about the mansion.`,
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
      writerBrief: withThemedContext(
        texture("observationContexts", 450 + Number(item.id.slice(1))),
        state.displayedForOccasion
          ? `For the occasion, the ${item.nameUS} had been set out in the ${names.location(state.homeLocationId)} where everyone could admire it.`
          : `The ${item.nameUS} was kept in the ${names.location(state.homeLocationId)}, as it always is.`
      ),
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
      const distributedBundle = isAnswerAnchor && bundledIds.length > 1;
      const sightingRef = refName(sighting.timeId);
      facts.push({
        id: nextId(),
        kind: "item_intact",
        primaryAxis: "item",
        suspectIds: [],
        itemIds: bundledIds,
        // A bundled anchor says each piece was in its own proper place. The
        // answer item's home room is not the location of every decoy, so it
        // must not be licensed beside the whole bundle or the renderer may
        // falsely put all six objects in one room.
        locationIds: distributedBundle ? [] : [state.homeLocationId],
        timeIds: [sighting.timeId],
        cutoffOrder: requireTime(sighting.timeId).order,
        mentions: {
          suspects: sighting.witness === "staff" ? ["Mrs. White"] : [],
          items: bundledNames,
          locations: distributedBundle ? [] : [names.location(state.homeLocationId)],
          times: sightingRef.mention ? [sightingRef.mention] : [],
        },
        writerBrief: withThemedContext(
          texture("observationContexts", 500 + Number(item.id.slice(1))),
          isAnswerAnchor && bundledIds.length > 1
            ? `As late as ${sightingRef.point}, the ${listNames(bundledNames)} were all still where they belonged — ${sighting.witness === "staff" ? "Mrs. White is certain of it from her rounds" : "the display check plainly recorded each one"}.`
            : `As late as ${sightingRef.point}, the ${item.nameUS} was still sitting in its place in the ${names.location(state.homeLocationId)} — ${sighting.witness === "staff" ? "Mrs. White saw it during her rounds" : "it was plainly seen there"}.`
        ),
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
    const lockupRef = refName(lockupTime.id);
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
          times: lockupRef.mention ? [lockupRef.mention] : [],
        },
        writerBrief: `${capitalize(lockupRef.clause)}, the display cases throughout the house were locked before the household retired, with the valuables inside them all accounted for.`,
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
      writerBrief: `By ${securedRef.point}, ${world.securedSet.label} — ${listNames(world.securedSet.itemIds.map(names.item))} — had been locked away and accounted for, every piece.`,
      noteSuitable: true,
    });
  }

  if (world.roomClosure) {
    const closure = world.roomClosure;
    const closedTimeIds = closure.timeIds === "all" ? [] : [...closure.timeIds];
    const allDay = closure.timeIds === "all";
    const closureRef = allDay ? null : refName(closedTimeIds[closedTimeIds.length - 1]);
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
        times: closureRef?.mention ? [closureRef.mention] : [],
      },
      writerBrief: allDay
        ? `The ${names.location(closure.locationId)} was shut up the entire day — ${closure.cause} — and nobody could get in.`
        : `The ${names.location(closure.locationId)} was closed off through ${closureRef!.point} — ${closure.cause}.`,
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
    const placeNoun = location.type === "outdoor" ? "place" : "room";
    facts.push({
      id: nextId(),
      kind: "room_undisturbed",
      primaryAxis: "location",
      suspectIds: [],
      itemIds: [],
      locationIds: [location.id],
      timeIds: [],
      mentions: { suspects: [], items: [], locations: [location.name], times: [] },
      writerBrief: withThemedContext(
        texture("inspectionContexts", 600 + Number(location.id.slice(1))),
        pickPhrase("room-single", [
          `The ${location.name} was gone over carefully afterward: nothing out of place, nothing missing, nothing so much as nudged.`,
          `Inspector Brown's later pass through the ${location.name} found the ${placeNoun} exactly as arranged, with nothing disturbed or gone.`,
          `The final clearing of the ${location.name} found every furnishing and display exactly where it belonged.`,
          `A careful check of the ${location.name} found no displaced furnishing, no broken arrangement, and nothing missing.`,
        ])
      ),
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
      writerBrief: withThemedContext(
        texture("inspectionContexts", 650 + Number(bundle[0].id.slice(1))),
        pickPhrase("room-bundle", [
          `The ${listNames(bundle.map((location) => location.name))} were each gone over carefully afterward: nothing out of place in any of them, and nothing missing.`,
          `Inspector Brown's inspection of the ${listNames(bundle.map((location) => location.name))} found everything accounted for, with nothing amiss in either place.`,
          `Nothing in the ${listNames(bundle.map((location) => location.name))} had been disturbed at all; each was checked with care.`,
        ])
      ),
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
    const bundleNames = listNames(bundle.map((item) => item.nameUS));
    const singularBundle = bundle.length === 1;
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
      writerBrief: withThemedContext(
        texture("observationContexts", 700 + roundTime.order),
        pickPhrase("item-sweep", [
          singularBundle
            ? `${capitalize(roundRef.clause)}, the ${bundleNames} was still in its proper place — present and accounted for at that hour.`
            : `${capitalize(roundRef.clause)}, the ${bundleNames} were each seen still in their proper places — every one present and accounted for at that hour.`,
          singularBundle
            ? `Nothing had touched the ${bundleNames} as of ${roundRef.point}; it sat just where Mr. Boddy keeps it.`
            : `Nothing had touched the ${bundleNames} as of ${roundRef.point}; each sat just where Mr. Boddy keeps it.`,
          singularBundle
            ? `${capitalize(roundRef.clause)}, the rounds found the ${bundleNames} in its usual spot — quite undisturbed.`
            : `${capitalize(roundRef.clause)}, the rounds found the ${bundleNames} in their usual spots — all quite undisturbed.`,
        ])
      ),
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
        writerBrief: withThemedContext(
          texture("observationContexts", 750 + roundTime.order),
          pickPhrase("night-repeat", [
            singularBundle
              ? `${capitalize(repeatRef.clause)}, the last look round found the ${bundleNames} exactly where it belonged, accounted for before the house went quiet.`
              : `${capitalize(repeatRef.clause)}, the last look round found the ${bundleNames} exactly where they belonged, every piece accounted for before the house went quiet.`,
            singularBundle
              ? `${capitalize(repeatRef.clause)}, locking up took me past the ${bundleNames} — present and in its place as the lamps went down.`
              : `${capitalize(repeatRef.clause)}, locking up took me past the ${bundleNames} — all present and in their places as the lamps went down.`,
            singularBundle
              ? `By ${repeatRef.point}, nothing had moved: the ${bundleNames} sat exactly as it had all day.`
              : `By ${repeatRef.point}, nothing had moved: the ${bundleNames} sat exactly as they had all day.`,
          ])
        ),
        noteSuitable: true,
      });
    }
  }

  if (world.discovery) {
    const discoveryRef = refName(world.discovery.timeId);
    facts.push({
      id: nextId(),
      kind: "discovery",
      primaryAxis: "time",
      suspectIds: [],
      itemIds: [],
      locationIds: [],
      timeIds: [world.discovery.timeId],
      cutoffOrder: requireTime(world.discovery.timeId).order,
      mentions: { suspects: [], items: [], locations: [], times: discoveryRef.mention ? [discoveryRef.mention] : [] },
      writerBrief: withThemedContext(
        texture("inspectionContexts", 850 + requireTime(world.discovery.timeId).order),
        `${capitalize(discoveryRef.clause)}, ${world.discovery.noticedBy} first noticed something was missing — so whatever happened had already happened by then.`
      ),
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
    const when = threadTimeRef ? ` around ${threadTimeRef.point}` : "";
    let brief: string;
    if (thread.kind === "foggy_memory") {
      const foggyWhen = threadTimeRef?.point ?? "some point in the day";
      const pronouns = pronounsFor(thread.suspectIds[0]);
      brief = pickPhrase("foggy", [
        `${mentionSuspects[0]} thinks ${pronouns.subject} noticed ${thread.cause} somewhere around ${foggyWhen}, but couldn't swear to it.`,
        `${mentionSuspects[0]} keeps coming back to something half-remembered: ${thread.cause}, around ${foggyWhen}, perhaps.`,
      ]);
    } else if (thread.kind === "private_exchange") {
      brief = pickPhrase("private-exchange", [
        `${listNames(mentionSuspects)} were heard ${thread.cause}${where}${when}; the exchange ended when the door opened, and its meaning remains private.`,
        `${listNames(mentionSuspects)} kept to themselves${where}${when}, ${thread.cause}; neither offered Ashe any context afterward.`,
        `${listNames(mentionSuspects)} were deep in conversation${where}${when}, ${thread.cause}; whether it was confidence, disagreement, or ordinary business was never clear.`,
      ]);
    } else if (thread.kind === "borrowed_item") {
      brief = `${mentionSuspects[0]} was seen with the ${mentionItems[0]} in hand more than once that day; at the time, nobody thought to ask why.`;
    } else if (thread.kind === "surprise_task") {
      brief = `${mentionSuspects[0]} kept disappearing toward the ${mentionLocations[0] ?? "service side of the house"}${when}, and was oddly short with anyone who asked why.`;
    } else {
      brief = `${mentionSuspects[0]} slipped away${where}${when} and was evasive about it afterward.`;
    }
    facts.push({
      id: nextId(),
      kind: thread.kind === "private_exchange" ? "personal_remark" : "thread_color",
      primaryAxis: "color",
      suspectIds: [...thread.suspectIds],
      itemIds: thread.itemId ? [thread.itemId] : [],
      locationIds: thread.locationId ? [thread.locationId] : [],
      timeIds: thread.timeId ? [thread.timeId] : [],
      mentions: { suspects: mentionSuspects, items: mentionItems, locations: mentionLocations, times: mentionTimes },
      writerBrief: brief,
      noteSuitable: false,
      threadId: thread.kind === "foggy_memory" ? "FOG" : thread.id,
      questionedSuspectIds: thread.kind === "foggy_memory" ? undefined : [...thread.suspectIds],
      questionedMovementPairs: thread.kind !== "foggy_memory" && thread.timeId
        ? thread.suspectIds.map((suspectId) => ({ suspectId, timeId: thread.timeId! }))
        : undefined,
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
      const pronouns = pronounsFor(statement.suspectId);
      const room = names.location(statement.locationId);
      const hourRef = refName(statement.timeId);
      const placement = world.movement[statement.timeId]?.[statement.suspectId];
      const claimedEpisode = world.episodes.find((episode) =>
        episode.locationId === statement.locationId && episode.timeIds.includes(statement.timeId)
      );
      const roomPlacement = Object.values(world.movement[statement.timeId] ?? {}).find((entry) =>
        entry.locationId === statement.locationId && entry.social === "group"
      );
      const gathering = world.gatherings.find((entry) =>
        entry.timeId === statement.timeId && entry.locationId === statement.locationId
      );
      const claimedActivity =
        (gathering ? `taking part in ${gathering.label}` : null) ??
        (placement?.locationId === statement.locationId ? placement.activity : null) ??
        claimedEpisode?.activity ??
        roomPlacement?.activity ??
        world.occasionSpine.groupActivities[hashLocal(world.seed, world.attempt, 810 + requireTime(statement.timeId).order) % world.occasionSpine.groupActivities.length];
      const companyPhrase = claimedEpisode ? " with the others" : "";
      const claimedSceneId = claimedEpisode?.id ?? (gathering
        ? `GATHERING:${gathering.timeId}:${gathering.locationId}`
        : undefined);
      const claimVariants = gathering
        ? [
            `${who} says ${pronouns.subject} joined the company in the ${room} ${hourRef.clause}; Ashe records it as ${pronouns.possessive} account, not his own observation.`,
            `Asked where ${pronouns.subject} was ${hourRef.clause}, ${who} named the ${room} and said ${pronouns.subject} stayed with the assembled company throughout.`,
            `${who}'s answer for ${hourRef.point} is the ${room}, among everyone gathered there; it remains ${pronouns.possessive} statement.`,
          ]
        : [
            `${who}'s account places ${pronouns.object} in the ${room} ${hourRef.clause}, ${claimedActivity}${companyPhrase}. Ashe did not witness the claim personally.`,
            `${who} was quick to name the ${room} for ${hourRef.point}: “I was ${claimedActivity}${companyPhrase},” ${pronouns.subject} insists.`,
            `Asked about ${hourRef.point}, ${who} answered that ${pronouns.subject} spent the whole while in the ${room}, ${claimedActivity}${companyPhrase}; it remains ${pronouns.possessive} account, not Ashe's observation.`,
          ];
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
        writerBrief: pickPhrase(gathering ? "claim-gathering" : "claim", claimVariants),
        noteSuitable: false,
        threadId: statement.lie ? "LIE" : undefined,
        episodeId: claimedSceneId,
        episodeRole: claimedSceneId ? "claim" : undefined,
      });
    }
  }

  // Episode-linked material ---------------------------------------------------
  // The same lived scene now supplies several independently selectable
  // fragments: a factual continuous alibi, an attributed excuse, and (when
  // the occasion permits anonymity) a truth-ambiguous witness account.
  for (const episode of world.episodes) {
    const firstRef = refName(episode.timeIds[0]);
    const lastRef = refName(episode.timeIds[episode.timeIds.length - 1]);
    const roomName = names.location(episode.locationId);
    const continuousNames = episode.continuousParticipantIds.map(names.suspect);
    const episodeSpan = spanPhrase(episode.timeIds, firstRef, lastRef);
    const timeMentions = [...new Set(
      [firstRef.mention, lastRef.mention].filter((mention): mention is string => Boolean(mention))
    )];
    facts.push({
      id: nextId(),
      kind: "scene_continuation",
      primaryAxis: "suspect",
      suspectIds: [...episode.continuousParticipantIds],
      itemIds: [],
      locationIds: [episode.locationId],
      timeIds: [...episode.timeIds],
      suspectTimePairs: episode.timeIds.flatMap((timeId) =>
        episode.continuousParticipantIds.map((suspectId) => ({ suspectId, timeId }))
      ),
      mentions: {
        suspects: continuousNames,
        items: [],
        locations: [roomName],
        times: timeMentions,
      },
      writerBrief: pickPhrase("scene-continuation", [
        `${listNames(continuousNames)} settled into the ${roomName}, ${episode.activity}, with ${episode.prop} close at hand. They were still there ${episodeSpan}, occupied together as the day moved toward ${world.occasionSpine.mainEvent}.`,
        `What began with ${episode.activity} beside ${episode.prop} became a proper little scene in the ${roomName}: ${listNames(continuousNames)} remained together ${episodeSpan}.`,
        `The ${roomName} held the same continuing company — ${listNames(continuousNames)} — ${episodeSpan}; they continued ${episode.activity} with ${episode.prop} nearby.`,
      ]),
      noteSuitable: false,
      episodeId: episode.id,
      episodeRole: "continuation",
      sceneTexture: sceneTextureFor(episode.id, episode.continuousParticipantIds),
    });

    if (episode.stepAway && episode.stepAway.absentFromTimeId !== world.answer.timeId) {
      const step = episode.stepAway;
      const stepRef = beatRef(step.absentFromTimeId);
      const who = names.suspect(step.suspectId);
      facts.push({
        id: nextId(),
        kind: "excuse_given",
        primaryAxis: "color",
        suspectIds: [step.suspectId],
        itemIds: [],
        locationIds: [episode.locationId],
        timeIds: [step.absentFromTimeId],
        mentions: {
          suspects: [who],
          items: [],
          locations: [roomName],
          times: [],
        },
        writerBrief: `${capitalize(stepRef.clause)}, while ${episode.activity} continued around ${episode.prop} in the ${roomName}, ${who} stepped out after saying, “${step.excuse}.”`,
        noteSuitable: false,
        episodeId: episode.id,
        episodeRole: "excuse",
        sceneTexture: sceneTextureFor(episode.id, [step.suspectId]),
        questionedSuspectIds: [step.suspectId],
        questionedMovementPairs: [{ suspectId: step.suspectId, timeId: step.absentFromTimeId }],
      });
    }
  }

  for (const account of world.witnessAccounts) {
    const episode = world.episodes.find((candidate) => candidate.id === account.episodeId);
    if (!episode) continue;
    const witness = names.suspect(account.witnessId);
    const roomName = names.location(episode.locationId);
    const accountRef = beatRef(account.timeId);
    facts.push({
      id: nextId(),
      kind: "witness_account",
      primaryAxis: "color",
      suspectIds: [account.witnessId],
      itemIds: [],
      locationIds: [episode.locationId],
      timeIds: [account.timeId],
      mentions: { suspects: [witness], items: [], locations: [roomName], times: [] },
      writerBrief: pickPhrase("witness-account", [
        `${capitalize(accountRef.clause)}, ${witness} says an unidentified guest broke away from ${episode.activity} in the ${roomName}, offering “${account.excuse}” by way of explanation. ${capitalize(account.anonymityDevice)} kept the person's identity from being clear.`,
        `${witness}'s account places an unnamed figure slipping away from ${episode.activity} in the ${roomName} ${accountRef.clause} with the words, “${account.excuse}.” In the confusion of ${account.anonymityDevice}, the witness could not say who it was.`,
        `According to ${witness}, someone left the ${roomName} while the company were ${episode.activity} ${accountRef.clause}, saying only, “${account.excuse}.” The figure was impossible to identify through ${account.anonymityDevice}.`,
      ]),
      noteSuitable: false,
      episodeId: account.episodeId,
      episodeRole: "witness",
      witnessVariant: account.variant,
      sceneTexture: sceneTextureFor(account.episodeId, [account.witnessId]),
    });
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
        `Below stairs, ${entry.motive} is mentioned whenever ${who}'s name comes up.`,
        `One hears — one cannot help hearing — that ${who} is troubled by ${entry.motive}.`,
        `${who}'s circumstances are much discussed below stairs: ${entry.motive}, they say.`,
      ]),
      noteSuitable: false,
    });
  }

  // Scene evidence ----------------------------------------------------------
  // Fuse a lived movement scene with physical evidence ONLY when both belong
  // to the same room (and, for an item sighting, the same hour). This raises
  // deduction work per slot without sprinkling an unrelated inventory line
  // onto a story clue. Source IDs ensure the scheduler can never deal the
  // composite beside either smaller component and repeat itself later.
  const sourceFacts = [...facts];
  const candidateSceneSources = sourceFacts.filter((fact) =>
    ["group_presence", "scene_continuation", "solo_presence"].includes(fact.kind) &&
    Boolean(fact.episodeId) &&
    fact.locationIds.length === 1 &&
    fact.suspectIds.length <= 5
  );
  const sceneSources = [...new Set(candidateSceneSources.map((fact) => fact.episodeId!))]
    .map((episodeId) => candidateSceneSources
      .filter((fact) => fact.episodeId === episodeId)
      .sort((left, right) => {
        const roleScore = (fact: Fact): number =>
          fact.episodeRole === "fused" ? 3 : fact.kind === "group_presence" ? 2 : 1;
        return roleScore(right) - roleScore(left) || right.timeIds.length - left.timeIds.length;
      })[0]
    );
  const singleRoomChecks = sourceFacts.filter((fact) =>
    fact.kind === "room_undisturbed" && fact.locationIds.length === 1
  );
  const localItemSightings = sourceFacts.filter((fact) =>
    fact.kind === "item_intact" &&
    fact.locationIds.length === 1 &&
    fact.itemIds.length <= 2 &&
    fact.mentions.suspects.length === 0
  );
  const mergeLicense = (left: MentionLicense, right: MentionLicense): MentionLicense => ({
    suspects: [...new Set([...left.suspects, ...right.suspects])],
    items: [...new Set([...left.items, ...right.items])],
    locations: [...new Set([...left.locations, ...right.locations])],
    times: [...new Set([...left.times, ...right.times])],
  });
  const addComposite = (
    scene: Fact,
    evidence: Fact,
    relationship: string,
    mode: NonNullable<Fact["sceneEvidenceMode"]>,
    evidenceRendering = evidence.writerBrief
  ): void => {
    facts.push({
      id: nextId(),
      kind: "scene_evidence",
      primaryAxis: scene.primaryAxis,
      suspectIds: [...new Set([...scene.suspectIds, ...evidence.suspectIds])],
      itemIds: [...new Set([...scene.itemIds, ...evidence.itemIds])],
      locationIds: [...new Set([...scene.locationIds, ...evidence.locationIds])],
      timeIds: [...new Set([...scene.timeIds, ...evidence.timeIds])],
      mentions: mergeLicense(scene.mentions, evidence.mentions),
      writerBrief: `Render these as ONE connected lived recollection, with the social action in the foreground and the physical observation arising naturally from it. Scene: ${scene.writerBrief} ${relationship}: ${evidenceRendering}`,
      noteSuitable: false,
      threadId: scene.threadId,
      episodeId: scene.episodeId,
      episodeRole: scene.episodeRole,
      // A fused changing-group scene already carries setup, departure, and
      // continuation. Adding a private subplot on top would make the brief
      // four facts wide and force bloated prose; simpler scenes receive it.
      sceneTexture: scene.episodeRole === "fused" ? undefined : scene.sceneTexture,
      sceneEvidenceMode: mode,
      questionedSuspectIds: scene.questionedSuspectIds ? [...scene.questionedSuspectIds] : undefined,
      questionedMovementPairs: scene.questionedMovementPairs
        ? scene.questionedMovementPairs.map((pair) => ({ ...pair }))
        : undefined,
      continuousSuspectIds: scene.continuousSuspectIds ? [...scene.continuousSuspectIds] : undefined,
      witnessVariant: scene.witnessVariant,
      components: [scene, evidence],
      componentFactIds: [scene.id, evidence.id],
    });
  };
  const roomModes = [
    {
      mode: "clearing_coda" as const,
      relationship: "As the activity ended, Ashe's ordinary clearing-up made the setting's condition a natural coda",
      evidence: (room: string) => `While removing the occasion materials, Ashe found the ${room} exactly as arranged, with nothing disturbed or missing.`,
    },
    {
      mode: "inspection_coda" as const,
      relationship: "After the company moved on, Inspector Brown's pass through the same place quietly completed the recollection",
      evidence: (room: string) => `Inspector Brown's check found the ${room} untouched, with every furnishing and display still where it belonged.`,
    },
    {
      mode: "material_handover" as const,
      relationship: "The counting and putting-away of that activity's own materials supplied the physical observation inside the scene",
      evidence: (room: string) => `Ashe's count at the close showed the ${room} undisturbed and nothing there missing.`,
    },
  ];
  const roomModeOffset = hashLocal(world.seed, world.attempt, 979) % roomModes.length;
  let roomCompositeCount = 0;
  sceneSources.forEach((scene, index) => {
    const roomCheck = singleRoomChecks.find((fact) => fact.locationIds[0] === scene.locationIds[0]);
    const itemSighting = localItemSightings.find((fact) =>
      fact.locationIds[0] === scene.locationIds[0] &&
      fact.timeIds.some((timeId) => scene.timeIds.includes(timeId))
    );
    // One strongest fusion per episode keeps the harvest compact. Alternate
    // when both are available so room evidence does not starve item texture
    // (or vice versa) across a corpus.
    const preferItem = (hashLocal(world.seed, world.attempt, 900 + index) & 1) === 1;
    if (itemSighting && (preferItem || !roomCheck)) {
      addComposite(
        scene,
        itemSighting,
        "Let the valuable be noticed inside that same action and hour — as part of the lived scene, not as a second inventory report",
        "same_hour_item"
      );
    } else if (roomCheck) {
      const chosenMode = roomModes[(roomModeOffset + roomCompositeCount) % roomModes.length];
      roomCompositeCount += 1;
      addComposite(
        scene,
        roomCheck,
        chosenMode.relationship,
        chosenMode.mode,
        chosenMode.evidence(names.location(scene.locationIds[0]))
      );
    }
  });

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
