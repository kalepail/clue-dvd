/**
 * Deterministic occasion spines for the V3 world simulator.
 *
 * These catalogs are authored story material, not runtime AI output. An
 * occasion is chosen before the answer-blind world simulation, and its nouns
 * become true of the day: scheduled beats, things guests do, props they handle,
 * and plausible reasons to step away. The renderer may embellish those truths,
 * but it does not invent a second, disconnected occasion afterward.
 */

import { SeededRandom } from "../services/seeded-random";

export const OCCASION_FAMILIES = [
  "charitable benefit",
  "private arts recital",
  "family commemoration",
  "county society exhibition",
  "weekend house tournament",
  "reception for a visiting dignitary",
  "engagement celebration",
  "scholarly demonstration",
  "costume fete",
  "reunion of old acquaintances",
  "horticultural prize gathering",
  "collector's private viewing",
  "amateur theatrical rehearsal",
  "subscription committee meeting",
] as const;

export type OccasionFamily = (typeof OCCASION_FAMILIES)[number];

export type OccasionBeatTemplate = {
  id: string;
  name: string;
  /** One authored range is chosen when the spine is instantiated. */
  timeOptions: string[][];
  gatheringLabels: string[];
  locationIds: string[];
  phrases: string[];
};

export type OccasionCatalogEntry = {
  family: string;
  mainEvent: string;
  beats: OccasionBeatTemplate[];
  groupActivities: string[];
  soloActivities: string[];
  excuses: string[];
  anonymityDevices: string[];
  setDressing: string[];
  threadCauses: string[];
};

export type OccasionBeat = {
  id: string;
  name: string;
  timeIds: string[];
  gatheringLabel: string;
  locationId: string;
  phrases: string[];
};

export type OccasionSpine = {
  family: string;
  mainEvent: string;
  beats: OccasionBeat[];
  groupActivities: string[];
  soloActivities: string[];
  excuses: string[];
  anonymityDevices: string[];
  setDressing: string[];
  threadCauses: string[];
};

type OccasionDetails = Omit<OccasionCatalogEntry, "family" | "beats"> & {
  /** Five chronological names: preparations, arrivals, central event, supper, finale. */
  beatNames: [string, string, string, string, string];
  gatheringLabels: [string[], string[], string[], string[], string[]];
  beatPhrases?: [string[], string[], string[], string[], string[]];
  preferredLocations: string[];
};

const DEFAULT_RANGES: string[][][] = [
  [["T01", "T02"]],
  [["T03", "T04"]],
  [["T05", "T06", "T07"]],
  [["T08"]],
  [["T09", "T10"]],
];

const DEFAULT_PHRASES = (names: [string, string, string, string, string]): [string[], string[], string[], string[], string[]] => [
  [`during ${names[0]}`, `as ${names[0]} got under way`],
  [`amid ${names[1]}`, `while ${names[1]} continued`],
  [`during ${names[2]}`, `in the thick of ${names[2]}`],
  [`over ${names[3]}`, `as ${names[3]} drew the company together`],
  [`just before ${names[4]}`, `during ${names[4]}`],
];

function defineOccasion(family: OccasionFamily, details: OccasionDetails): OccasionCatalogEntry {
  const phrases = details.beatPhrases ?? DEFAULT_PHRASES(details.beatNames);
  return {
    family,
    mainEvent: details.mainEvent,
    beats: details.beatNames.map((name, index) => ({
      id: `B${index + 1}`,
      name,
      timeOptions: DEFAULT_RANGES[index],
      gatheringLabels: details.gatheringLabels[index],
      locationIds: details.preferredLocations,
      phrases: phrases[index],
    })),
    groupActivities: details.groupActivities,
    soloActivities: details.soloActivities,
    excuses: details.excuses,
    anonymityDevices: details.anonymityDevices,
    setDressing: details.setDressing,
    threadCauses: details.threadCauses,
  };
}

const ENTRIES: OccasionCatalogEntry[] = [
  defineOccasion("charitable benefit", {
    mainEvent: "the evening pledge announcement",
    beatNames: ["the volunteers' preparations", "the first subscriptions", "the charity auction", "the patrons' supper", "the pledge announcement"],
    gatheringLabels: [["sorting benefit parcels"], ["welcoming the first subscribers"], ["the charity auction"], ["the patrons' supper"], ["the final pledge announcement"]],
    preferredLocations: ["L01", "L02", "L03", "L05", "L10"],
    groupActivities: ["sorting pledge cards", "wrapping auction lots", "comparing subscription lists", "practising the appeal", "arranging donated prizes", "tallying promised gifts", "pinning benefit ribbons"],
    soloActivities: ["checking a private pledge", "rewriting the appeal", "counting unused bid cards", "mending a benefit ribbon"],
    excuses: ["I must fetch the pledge book", "I promised to find more bid cards", "I ought to check the parcels", "I spilled punch on my benefit ribbon", "I must telephone a promised donor"],
    anonymityDevices: ["the crush around the auction table", "matching benefit ribbons", "the garden lanterns beyond the terrace"],
    setDressing: ["pledge cards", "bid paddles", "wrapped lots", "benefit ribbons", "donation tins", "the prize table"],
    threadCauses: ["quietly correcting a disputed pledge", "preparing an anonymous donation", "re-wrapping a damaged auction lot"],
  }),
  defineOccasion("private arts recital", {
    mainEvent: "the candlelit recital",
    beatNames: ["the tuning and rehearsals", "the guests' musical calls", "the afternoon programme", "the performers' supper", "the candlelit recital"],
    gatheringLabels: [["the morning tuning"], ["the musicians' welcome"], ["the private programme"], ["the performers' supper"], ["the candlelit recital"]],
    preferredLocations: ["L02", "L05", "L06", "L08", "L10"],
    groupActivities: ["marking their programmes", "rehearsing a difficult passage", "turning pages at the piano", "comparing interpretations", "arranging music stands", "testing the room's acoustics", "practising a final bow"],
    soloActivities: ["copying a bar of music", "tuning a stubborn instrument", "resting their voice", "searching for a lost score"],
    excuses: ["I must fetch the missing score", "I ought to tune before the next piece", "I left my programme elsewhere", "I spilled water on my cuff", "I promised to move a music stand"],
    anonymityDevices: ["the dim light beyond the music stands", "the screen of seated listeners", "the confusion during an encore"],
    setDressing: ["marked programmes", "music stands", "loose scores", "candle shades", "instrument cases", "the recital dais"],
    threadCauses: ["privately rehearsing an unannounced encore", "repairing a torn score", "settling an argument over the programme order"],
  }),
  defineOccasion("family commemoration", {
    mainEvent: "the evening remembrance toast",
    beatNames: ["the arranging of the family display", "the arrival of old relations", "the sharing of remembrances", "the family supper", "the remembrance toast"],
    gatheringLabels: [["arranging the family display"], ["welcoming the relations"], ["the sharing of remembrances"], ["the family supper"], ["the remembrance toast"]],
    preferredLocations: ["L01", "L02", "L03", "L08", "L10"],
    groupActivities: ["sorting old photographs", "comparing family letters", "identifying faces in an album", "rehearsing the remembrance toast", "mounting keepsakes for display", "trading stories about earlier summers", "putting family papers in order"],
    soloActivities: ["reading an old letter alone", "copying a family inscription", "straightening the memorial display", "looking for a missing photograph"],
    excuses: ["I must fetch the photograph album", "I promised to find an old letter", "I ought to compose myself", "I left the toast upstairs", "I must straighten the display"],
    anonymityDevices: ["the crowd around the photograph display", "the darkened family portraits", "the lantern-lit garden walk"],
    setDressing: ["photograph albums", "framed letters", "black-edged programmes", "family ribbons", "memory cards", "the keepsake table"],
    threadCauses: ["hiding a painful family letter", "preparing a private remembrance", "correcting a disputed photograph caption"],
  }),
  defineOccasion("county society exhibition", {
    mainEvent: "the judges' evening awards",
    beatNames: ["the setting of exhibits", "the exhibitors' arrivals", "the county judging", "the judges' supper", "the awards presentation"],
    gatheringLabels: [["setting the exhibition tables"], ["receiving the exhibitors"], ["the county judging"], ["the judges' supper"], ["the awards presentation"]],
    preferredLocations: ["L01", "L05", "L06", "L10", "L11"],
    groupActivities: ["arranging exhibit cards", "comparing judging sheets", "polishing display stands", "debating the prize classes", "measuring an entry", "pinning award rosettes", "guiding guests between exhibits"],
    soloActivities: ["relabeling an exhibit", "checking a judge's mark", "repairing a display stand", "counting spare rosettes"],
    excuses: ["I must fetch another exhibit card", "I promised to check the judges' book", "I ought to mend that display", "I spilled tea on my rosette", "I must measure an entry again"],
    anonymityDevices: ["the crowd between exhibition screens", "identical steward badges", "the glare on the glass display cases"],
    setDressing: ["exhibit cards", "judging sheets", "award rosettes", "display stands", "measuring tapes", "the judges' table"],
    threadCauses: ["quietly correcting a judge's total", "concealing damage to an exhibit", "preparing an unofficial consolation prize"],
  }),
  defineOccasion("weekend house tournament", {
    mainEvent: "the championship final",
    beatNames: ["the drawing of the matches", "the opening rounds", "the afternoon contests", "the players' supper", "the championship final"],
    gatheringLabels: [["drawing the tournament pairs"], ["the opening rounds"], ["the afternoon contests"], ["the players' supper"], ["the championship final"]],
    preferredLocations: ["L02", "L05", "L07", "L10", "L11"],
    groupActivities: ["comparing scorecards", "practising their opening moves", "arguing over tournament rules", "keeping a running tally", "replaying a disputed point", "polishing the prize cup", "studying the match board"],
    soloActivities: ["checking a private score", "practising a difficult shot", "rewriting the match board", "looking for a misplaced counter"],
    excuses: ["I left my scorecard behind", "I must fetch another counter", "I promised to check the match board", "I spilled lemonade on my blazer", "I ought to practise before the final"],
    anonymityDevices: ["matching players' blazers", "the spectators crowding the score table", "the failing light beyond the garden boundary"],
    setDressing: ["scorecards", "match counters", "players' ribbons", "the prize cup", "rule books", "the tournament board"],
    threadCauses: ["quietly checking a disputed score", "practising for a surprise rematch", "searching for a missing tournament counter"],
  }),
  defineOccasion("reception for a visiting dignitary", {
    mainEvent: "the formal address",
    beatNames: ["the household inspection", "the receiving line", "the garden reception", "the state supper", "the formal address"],
    gatheringLabels: [["preparing the receiving rooms"], ["the receiving line"], ["the garden reception"], ["the state supper"], ["the formal address"]],
    preferredLocations: ["L01", "L02", "L03", "L05", "L10"],
    groupActivities: ["rehearsing the receiving order", "folding place cards", "comparing protocol notes", "arranging presentation bouquets", "practising the formal address", "checking the guest list", "pinning reception badges"],
    soloActivities: ["rewriting a line of welcome", "checking a place card", "straightening a presentation ribbon", "searching for a protocol note"],
    excuses: ["I must fetch the protocol book", "I promised to check the motorcar arrival", "I ought to correct a place card", "I spilled wine on my sash", "I left the address upstairs"],
    anonymityDevices: ["matching reception sashes", "the dense receiving line", "the flash of photographers' lamps"],
    setDressing: ["protocol cards", "reception sashes", "presentation bouquets", "place cards", "guest books", "the receiving dais"],
    threadCauses: ["privately correcting a breach of protocol", "preparing an unofficial welcome gift", "hiding an embarrassing error in the guest list"],
  }),
  defineOccasion("engagement celebration", {
    mainEvent: "the couple's ceremonial toast",
    beatNames: ["the decorating of the house", "the arrival of well-wishers", "the garden celebration", "the engagement supper", "the couple's toast"],
    gatheringLabels: [["arranging the engagement flowers"], ["welcoming the well-wishers"], ["the garden celebration"], ["the engagement supper"], ["the couple's toast"]],
    preferredLocations: ["L01", "L02", "L03", "L05", "L10"],
    groupActivities: ["tying celebration ribbons", "addressing gift cards", "rehearsing affectionate toasts", "arranging flowers for the couple", "comparing dance cards", "wrapping small favors", "choosing records for the dance"],
    soloActivities: ["rewriting a private toast", "mending a celebration ribbon", "checking an unsigned gift card", "looking for a misplaced dance card"],
    excuses: ["I must fetch the gift list", "I promised to find another dance record", "I ought to mend this ribbon", "I spilled punch on my evening clothes", "I left my toast upstairs"],
    anonymityDevices: ["matching favor ribbons", "the crowded dance floor", "the garden lanterns behind the dancers"],
    setDressing: ["celebration ribbons", "gift cards", "dance cards", "flower garlands", "wrapped favors", "the presents table"],
    threadCauses: ["hiding an unsigned engagement gift", "preparing a private toast", "quietly settling a dispute over the guest list"],
  }),
  defineOccasion("scholarly demonstration", {
    mainEvent: "the public unveiling of the experiment",
    beatNames: ["the setting of instruments", "the scholars' consultations", "the preliminary trials", "the fellows' supper", "the public demonstration"],
    gatheringLabels: [["setting the demonstration instruments"], ["the scholars' consultation"], ["the preliminary trials"], ["the fellows' supper"], ["the public demonstration"]],
    preferredLocations: ["L06", "L08", "L09", "L03", "L05"],
    groupActivities: ["comparing laboratory notes", "calibrating demonstration instruments", "arguing over a diagram", "labeling specimen trays", "rehearsing the explanation", "checking one another's calculations", "arranging the lecture cards"],
    soloActivities: ["reworking a calculation", "cleaning a demonstration lens", "copying a diagram", "searching for a missing note card"],
    excuses: ["I must fetch the missing diagram", "I ought to check my calculation", "I promised to clean the lens", "I spilled ink on my notes", "I left the specimen list elsewhere"],
    anonymityDevices: ["the screening cloth around the apparatus", "identical scholars' gowns", "the smoke from the demonstration"],
    setDressing: ["lecture cards", "chalk diagrams", "specimen trays", "measuring instruments", "protective cloths", "the demonstration bench"],
    threadCauses: ["quietly correcting a flawed calculation", "concealing a cracked demonstration lens", "preparing an unannounced experimental variation"],
  }),
  defineOccasion("costume fete", {
    mainEvent: "the grand unmasking",
    beatNames: ["the costume fittings", "the masked arrivals", "the grand costume parade", "the masquerade supper", "the grand unmasking"],
    gatheringLabels: [["the final costume fittings"], ["the masked arrivals"], ["the grand costume parade"], ["the masquerade supper"], ["the grand unmasking"]],
    beatPhrases: [["during the last fittings", "before the masks went on"], ["amid the masked arrivals", "as the disguises first filled the house"], ["during the party's most exciting moments", "in the thick of the costume parade"], ["over the masquerade supper", "as the masked company sat down together"], ["just before the unmasking", "during the grand unmasking"]],
    preferredLocations: ["L01", "L02", "L03", "L05", "L10"],
    groupActivities: ["admiring one another's costumes", "repairing loose mask ribbons", "guessing one another's disguises", "practising their parade entrance", "comparing elaborate masks", "choosing prizes for the costumes", "rehearsing the unmasking"],
    soloActivities: ["repairing a torn costume", "adjusting a stubborn mask", "looking for a missing cloak", "changing a stained cuff"],
    excuses: ["I must change my costume", "I spilled something on my sleeve", "I ought to mend my mask", "I left my cloak elsewhere", "I promised to fetch the costume prizes"],
    anonymityDevices: ["the guests' elaborate masks", "identical domino cloaks", "the crush of costumed figures", "the garden seen through colored lanterns"],
    setDressing: ["mask ribbons", "domino cloaks", "costume prizes", "colored lanterns", "dance cards", "the judging table"],
    threadCauses: ["secretly repairing a damaged costume", "preparing an unannounced disguise", "settling a private dispute over the costume prize"],
  }),
  defineOccasion("reunion of old acquaintances", {
    mainEvent: "the after-hours reunion toast",
    beatNames: ["the laying out of old keepsakes", "the returning guests", "the afternoon reminiscences", "the reunion supper", "the old friends' toast"],
    gatheringLabels: [["laying out old keepsakes"], ["welcoming the returning friends"], ["the afternoon reminiscences"], ["the reunion supper"], ["the old friends' toast"]],
    preferredLocations: ["L01", "L02", "L03", "L08", "L10"],
    groupActivities: ["comparing old photographs", "retelling school-day adventures", "matching names to faded signatures", "rehearsing an old club song", "sorting letters from earlier years", "arguing over a remembered wager", "signing the reunion album"],
    soloActivities: ["reading an old note alone", "looking for a familiar signature", "copying an address", "straightening the reunion album"],
    excuses: ["I must fetch an old photograph", "I promised to find the club song", "I ought to look up an address", "I spilled tea on the reunion album", "I left a letter upstairs"],
    anonymityDevices: ["the crowd around the photograph boards", "the dim lanterns over the garden walk", "old portraits mistaken for living guests at a distance"],
    setDressing: ["old photographs", "reunion albums", "faded letters", "name cards", "club ribbons", "the keepsake display"],
    threadCauses: ["hiding an awkward old letter", "preparing a surprise reunion song", "privately settling a decades-old wager"],
  }),
  defineOccasion("horticultural prize gathering", {
    mainEvent: "the presentation of the silver rose",
    beatNames: ["the staging of the entries", "the growers' arrivals", "the judging of the blooms", "the exhibitors' supper", "the silver rose presentation"],
    gatheringLabels: [["staging the prize blooms"], ["welcoming the growers"], ["the judging of the blooms"], ["the exhibitors' supper"], ["the silver rose presentation"]],
    preferredLocations: ["L06", "L10", "L11", "L01", "L03"],
    groupActivities: ["labeling prize blooms", "comparing cultivation notes", "arranging flower stands", "debating the judges' marks", "tying award rosettes", "misting delicate specimens", "preparing the silver rose display"],
    soloActivities: ["trimming a damaged stem", "checking a specimen label", "mixing flower preservative", "searching for a missing rosette"],
    excuses: ["I must fetch the flower shears", "I promised to mist the orchids", "I ought to correct a specimen label", "I spilled water on my rosette", "I left the judging sheet elsewhere"],
    anonymityDevices: ["the tall banks of exhibition flowers", "matching exhibitors' aprons", "the half-light among the garden marquees"],
    setDressing: ["specimen labels", "award rosettes", "flower stands", "watering cans", "judging sheets", "the silver rose dais"],
    threadCauses: ["quietly replacing a damaged bloom", "concealing an error on a specimen card", "preparing an unofficial consolation bouquet"],
  }),
  defineOccasion("collector's private viewing", {
    mainEvent: "the unveiling of the star acquisition",
    beatNames: ["the arranging of the collection", "the collectors' preview", "the private viewing", "the connoisseurs' supper", "the star unveiling"],
    gatheringLabels: [["arranging the display cabinets"], ["the collectors' preview"], ["the private viewing"], ["the connoisseurs' supper"], ["the star unveiling"]],
    preferredLocations: ["L01", "L02", "L08", "L09", "L05"],
    groupActivities: ["comparing catalogue notes", "examining makers' marks", "arranging display labels", "debating an object's provenance", "polishing empty display stands", "marking favorite lots", "rehearsing the unveiling"],
    soloActivities: ["checking a catalogue entry", "studying a maker's mark", "straightening a display label", "looking for a missing magnifying glass"],
    excuses: ["I must fetch the catalogue", "I promised to check a provenance note", "I ought to clean my spectacles", "I spilled wine on my viewing card", "I left my magnifying glass elsewhere"],
    anonymityDevices: ["the reflection in the display glass", "the crowd around the star cabinet", "the curtained viewing alcoves"],
    setDressing: ["viewing catalogues", "display labels", "magnifying glasses", "velvet stands", "provenance cards", "the star cabinet"],
    threadCauses: ["privately checking a doubtful provenance", "concealing damage to a display stand", "preparing an unannounced addition to the viewing"],
  }),
  defineOccasion("amateur theatrical rehearsal", {
    mainEvent: "the full-dress performance",
    beatNames: ["the setting of the stage", "the company call", "the full rehearsal", "the players' supper", "the dress performance"],
    gatheringLabels: [["setting the makeshift stage"], ["the company call"], ["the full rehearsal"], ["the players' supper"], ["the dress performance"]],
    preferredLocations: ["L01", "L02", "L05", "L08", "L10"],
    groupActivities: ["rehearsing their musical number", "running a difficult scene", "marking positions in the script", "practising an entrance", "repairing a stage prop", "comparing costume notes", "repeating the final chorus"],
    soloActivities: ["learning a troublesome line", "repairing a stage costume", "checking a cue sheet", "looking for a missing prop"],
    excuses: ["I must fetch the missing script", "I promised to check the props", "I ought to change for the next scene", "I spilled greasepaint on my cuff", "I left my cue sheet elsewhere"],
    anonymityDevices: ["the actors' borrowed costumes", "the scenery blocking the wings", "the confusion during a scene change"],
    setDressing: ["marked scripts", "cue sheets", "stage costumes", "painted scenery", "prop baskets", "the makeshift stage"],
    threadCauses: ["privately rehearsing an unannounced solo", "concealing damage to a stage prop", "settling an argument over the final scene"],
  }),
  defineOccasion("subscription committee meeting", {
    mainEvent: "the adoption of the final resolution",
    beatNames: ["the sorting of committee papers", "the members' consultations", "the formal sitting", "the committee supper", "the final resolution"],
    gatheringLabels: [["sorting the committee papers"], ["the members' consultations"], ["the formal sitting"], ["the committee supper"], ["the final resolution"]],
    preferredLocations: ["L01", "L02", "L03", "L08", "L09"],
    groupActivities: ["sorting subscription forms", "comparing committee minutes", "drafting the resolution", "tallying promised subscriptions", "arguing over an amendment", "addressing reminder envelopes", "checking the attendance book"],
    soloActivities: ["rewriting an amendment", "checking a private subscription", "copying the minutes", "looking for a missing committee paper"],
    excuses: ["I must fetch the minute book", "I promised to check a subscription", "I ought to redraft the amendment", "I spilled ink on my papers", "I left the attendance list elsewhere"],
    anonymityDevices: ["the crush around the committee table", "matching committee folders", "the screen of raised papers during the vote"],
    setDressing: ["subscription forms", "minute books", "committee folders", "reminder envelopes", "voting slips", "the chairman's table"],
    threadCauses: ["quietly correcting the subscription total", "concealing an unsigned amendment", "preparing a private compromise resolution"],
  }),
];

const FALLBACK = defineOccasion("reunion of old acquaintances", {
  mainEvent: "the evening's principal gathering",
  beatNames: ["the household preparations", "the guests' arrivals", "the day's principal gathering", "the company supper", "the evening finale"],
  gatheringLabels: [["the household preparations"], ["welcoming the guests"], ["the day's principal gathering"], ["the company supper"], ["the evening finale"]],
  preferredLocations: ["L01", "L02", "L03", "L05", "L10"],
  groupActivities: ["reviewing the day's programme", "helping with the arrangements", "preparing a short presentation", "comparing invitation cards", "arranging the principal display"],
  soloActivities: ["checking the programme", "straightening the display", "looking for a missing invitation"],
  excuses: ["I must fetch the programme", "I promised to check the arrangements", "I left my invitation elsewhere"],
  anonymityDevices: [],
  setDressing: ["programmes", "invitation cards", "ribbons", "the principal display"],
  threadCauses: ["quietly correcting the programme", "preparing an unannounced presentation"],
});

export const OCCASION_CATALOG: Readonly<Record<string, OccasionCatalogEntry>> = Object.freeze(
  Object.fromEntries(ENTRIES.map((entry) => [entry.family, entry]))
);

export function occasionCatalogEntry(family: string): OccasionCatalogEntry {
  return OCCASION_CATALOG[family] ?? { ...FALLBACK, family };
}

export function instantiateOccasionSpine(family: string, seed: number): OccasionSpine {
  const entry = occasionCatalogEntry(family);
  const rng = new SeededRandom(hashOccasionSeed(seed, family));
  return {
    family,
    mainEvent: entry.mainEvent,
    beats: entry.beats.map((beat) => ({
      id: beat.id,
      name: beat.name,
      timeIds: [...rng.pick(beat.timeOptions)],
      gatheringLabel: rng.pick(beat.gatheringLabels),
      locationId: rng.pick(beat.locationIds),
      phrases: rng.shuffle([...beat.phrases]),
    })),
    groupActivities: rng.shuffle([...entry.groupActivities]),
    soloActivities: rng.shuffle([...entry.soloActivities]),
    excuses: rng.shuffle([...entry.excuses]),
    anonymityDevices: rng.shuffle([...entry.anonymityDevices]),
    setDressing: rng.shuffle([...entry.setDressing]),
    threadCauses: rng.shuffle([...entry.threadCauses]),
  };
}

export function beatPhrasesForTime(spine: OccasionSpine, timeId: string): string[] {
  return spine.beats
    .filter((beat) => beat.timeIds.includes(timeId))
    .flatMap((beat) => beat.phrases);
}

export function occasionSpinePromptSummary(spine: OccasionSpine): string[] {
  return [
    `Main event: ${spine.mainEvent}.`,
    ...spine.beats.map((beat) => `${beat.name}: ${beat.gatheringLabel}.`),
    `Recurring activities: ${spine.groupActivities.slice(0, 5).join(", ")}.`,
    `Recurring props and set dressing: ${spine.setDressing.slice(0, 6).join(", ")}.`,
  ];
}

function hashOccasionSeed(seed: number, family: string): number {
  let hash = Math.abs(Math.trunc(seed)) >>> 0;
  for (let index = 0; index < family.length; index += 1) {
    hash ^= family.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash & 0x7fffffff;
}
