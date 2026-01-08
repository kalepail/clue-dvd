/**
 * Clue DVD Game (2006) - Complete Game Elements
 *
 * VERIFICATION STATUS: ✅ VERIFIED FROM PHYSICAL CARDS (January 2026)
 * - All 10 suspects: VERIFIED
 * - All 11 items: VERIFIED
 * - All 11 locations: VERIFIED
 * - All 10 times: VERIFIED
 * - Total: 42 cards confirmed
 *
 * INFERRED FOR AI GENERATION (not from physical cards):
 * - Suspect roles, descriptions, traits
 * - Item categories (antique/desk/jewelry), descriptions, likelyLocations
 * - Location positions, adjacentRooms, descriptions
 * - Time hourRanges, lightConditions, typicalActivities
 * - Theme descriptions, typicalLockedRooms, atmosphericElements
 *
 * The inferred fields help AI generate coherent narratives but are NOT
 * printed on physical cards. Core card NAMES are what matter for gameplay.
 */

// ============================================
// SUSPECTS (10 Total)
// ============================================

export interface Suspect {
  id: string;
  name: string;
  displayName: string;
  color: string;
  role: string;
  description: string;
  traits: string[];
}

export const SUSPECTS: Suspect[] = [
  {
    id: "S01",
    name: "Miss Scarlet",
    displayName: "Miss Scarlet",
    color: "red",
    role: "Socialite",
    description: "Femme fatale, cunning socialite with a mysterious past",
    traits: ["charming", "secretive", "ambitious"],
  },
  {
    id: "S02",
    name: "Colonel Mustard",
    displayName: "Colonel Mustard",
    color: "yellow",
    role: "Military Officer",
    description: "Distinguished military officer with a decorated background",
    traits: ["disciplined", "proud", "experienced"],
  },
  {
    id: "S03",
    name: "Mrs. White",
    displayName: "Mrs. White",
    color: "white",
    role: "Housekeeper",
    description: "Long-serving housekeeper at Tudor Mansion with knowledge of its secrets",
    traits: ["observant", "discreet", "loyal"],
  },
  {
    id: "S04",
    name: "Mr. Green",
    displayName: "Mr. Green",
    color: "green",
    role: "Businessman",
    description: "Businessman with questionable connections (Reverend Green in UK)",
    traits: ["nervous", "calculating", "opportunistic"],
  },
  {
    id: "S05",
    name: "Mrs. Peacock",
    displayName: "Mrs. Peacock",
    color: "blue",
    role: "Socialite",
    description: "High society matron who values appearances above all",
    traits: ["proud", "influential", "judgmental"],
  },
  {
    id: "S06",
    name: "Professor Plum",
    displayName: "Professor Plum",
    color: "purple",
    role: "Scholar",
    description: "Intellectual academic with expertise in rare antiquities",
    traits: ["intelligent", "absent-minded", "curious"],
  },
  {
    id: "S07",
    name: "Mrs. Meadow-Brook",
    displayName: "Mrs. Meadow-Brook",
    color: "brown",
    role: "Widow",
    description: "Widow of Mr. Boddy's late solicitor Miles Meadow-Brook",
    traits: ["reserved", "knowledgeable", "connected"],
  },
  {
    id: "S08",
    name: "Prince Azure",
    displayName: "Prince Azure",
    color: "lightblue",
    role: "Aristocrat",
    description: "International art and arms dealer with aristocratic connections",
    traits: ["sophisticated", "worldly", "mysterious"],
  },
  {
    id: "S09",
    name: "Lady Lavender",
    displayName: "Lady Lavender",
    color: "lavender",
    role: "Herbalist",
    description: "Herbalist of Asian heritage, rumored to have poisoned her husband Sir Laurence",
    traits: ["enigmatic", "knowledgeable", "dangerous"],
  },
  {
    id: "S10",
    name: "Rusty Nayler",
    displayName: "Rusty",
    color: "rust",
    role: "Gardener",
    description: "Gardener at Tudor Mansion, knows the grounds intimately",
    traits: ["practical", "outdoor access", "early riser"],
  },
];

// ============================================
// ITEMS (11 Total)
// ============================================

export interface Item {
  id: string;
  nameUS: string;
  nameUK: string;
  category: "antique" | "desk" | "jewelry";
  description: string;
  likelyLocations: string[];
}

export const ITEMS: Item[] = [
  {
    id: "I01",
    nameUS: "Spyglass",
    nameUK: "Telescope",
    category: "antique",
    description: "Optical instrument for observation, part of Mr. Boddy's collection",
    likelyLocations: ["Study", "Library", "Conservatory"],
  },
  {
    id: "I02",
    nameUS: "Revolver",
    nameUK: "Revolver",
    category: "antique",
    description: "Collectible antique firearm from the collection",
    likelyLocations: ["Study", "Billiard Room", "Library"],
  },
  {
    id: "I03",
    nameUS: "Rare Book",
    nameUK: "Rare Book",
    category: "antique",
    description: "Valuable book from Mr. Boddy's extensive library",
    likelyLocations: ["Library", "Study"],
  },
  {
    id: "I04",
    nameUS: "Medal",
    nameUK: "Medal",
    category: "antique",
    description: "Given to Mr. Boddy by his uncle Dr. Black",
    likelyLocations: ["Study", "Hall", "Dining Room"],
  },
  {
    id: "I05",
    nameUS: "Billfold",
    nameUK: "Wallet",
    category: "desk",
    description: "Leather accessory, may contain important documents",
    likelyLocations: ["Study", "Lounge", "Dining Room"],
  },
  {
    id: "I06",
    nameUS: "Gold Pen",
    nameUK: "Gold Pen",
    category: "desk",
    description: "Expensive writing instrument from Mr. Boddy's desk",
    likelyLocations: ["Study", "Library"],
  },
  {
    id: "I07",
    nameUS: "Letter Opener",
    nameUK: "Letter Opener",
    category: "desk",
    description: "Ornate desk accessory with a sharp blade",
    likelyLocations: ["Study", "Library", "Lounge"],
  },
  {
    id: "I08",
    nameUS: "Crystal Paperweight",
    nameUK: "Crystal Paperweight",
    category: "desk",
    description: "Decorative crystal desk ornament",
    likelyLocations: ["Study", "Library"],
  },
  {
    id: "I09",
    nameUS: "Pocket Watch",
    nameUK: "Pocket Watch",
    category: "jewelry",
    description: "A very nice timepiece from the collection",
    likelyLocations: ["Study", "Lounge", "Hall"],
  },
  {
    id: "I10",
    nameUS: "Jade Hairpin",
    nameUK: "Jade Hairpin",
    category: "jewelry",
    description: "Ornate jade jewelry piece of significant value",
    likelyLocations: ["Lounge", "Conservatory", "Hall"],
  },
  {
    id: "I11",
    nameUS: "Scarab Brooch",
    nameUK: "Scarab Brooch",
    category: "jewelry",
    description: "Egyptian-style decorative pin, rare and valuable",
    likelyLocations: ["Lounge", "Dining Room", "Hall"],
  },
];

// ============================================
// LOCATIONS (11 + Special)
// ============================================

export interface Location {
  id: string;
  name: string;
  type: "indoor" | "outdoor";
  position: string;
  secretPassageTo: string | null;
  canBeLocked: boolean;
  adjacentRooms: string[];
  description: string;
}

export const LOCATIONS: Location[] = [
  {
    id: "L01",
    name: "Hall",
    type: "indoor",
    position: "center-north",
    secretPassageTo: null,
    canBeLocked: false,
    adjacentRooms: ["Lounge", "Study", "Library", "Dining Room"],
    description: "Grand entrance hall of Tudor Mansion",
  },
  {
    id: "L02",
    name: "Lounge",
    type: "indoor",
    position: "corner-NE",
    secretPassageTo: "Conservatory",
    canBeLocked: true,
    adjacentRooms: ["Hall", "Dining Room"],
    description: "Comfortable sitting room for guests",
  },
  {
    id: "L03",
    name: "Dining Room",
    type: "indoor",
    position: "east",
    secretPassageTo: null,
    canBeLocked: true,
    adjacentRooms: ["Lounge", "Kitchen", "Hall"],
    description: "Formal dining room for meals and gatherings",
  },
  {
    id: "L04",
    name: "Kitchen",
    type: "indoor",
    position: "corner-SE",
    secretPassageTo: "Study",
    canBeLocked: true,
    adjacentRooms: ["Dining Room", "Ballroom"],
    description: "Service kitchen where staff prepare meals",
  },
  {
    id: "L05",
    name: "Ballroom",
    type: "indoor",
    position: "south",
    secretPassageTo: null,
    canBeLocked: true,
    adjacentRooms: ["Kitchen", "Conservatory"],
    description: "Grand ballroom for dances and formal events",
  },
  {
    id: "L06",
    name: "Conservatory",
    type: "indoor",
    position: "corner-SW",
    secretPassageTo: "Lounge",
    canBeLocked: true,
    adjacentRooms: ["Ballroom", "Billiard Room"],
    description: "Glass-enclosed room filled with exotic plants",
  },
  {
    id: "L07",
    name: "Billiard Room",
    type: "indoor",
    position: "west",
    secretPassageTo: null,
    canBeLocked: true,
    adjacentRooms: ["Conservatory", "Library"],
    description: "Gentlemen's gaming room with billiard table",
  },
  {
    id: "L08",
    name: "Library",
    type: "indoor",
    position: "north-west",
    secretPassageTo: null,
    canBeLocked: true,
    adjacentRooms: ["Billiard Room", "Study", "Hall"],
    description: "Extensive collection of rare books and manuscripts",
  },
  {
    id: "L09",
    name: "Study",
    type: "indoor",
    position: "corner-NW",
    secretPassageTo: "Kitchen",
    canBeLocked: true,
    adjacentRooms: ["Library", "Hall"],
    description: "Mr. Boddy's private study and office",
  },
  {
    id: "L10",
    name: "Rose Garden",
    type: "outdoor",
    position: "exterior-south",
    secretPassageTo: null,
    canBeLocked: true,
    adjacentRooms: ["Conservatory", "Fountain"],
    description: "Beautifully maintained outdoor rose garden",
  },
  {
    id: "L11",
    name: "Fountain",
    type: "outdoor",
    position: "exterior-east",
    secretPassageTo: null,
    canBeLocked: true,
    adjacentRooms: ["Rose Garden", "Kitchen"],
    description: "Ornate outdoor water feature and gathering spot",
  },
];

// ============================================
// TIME PERIODS (10 Total)
// ============================================

export interface TimePeriod {
  id: string;
  name: string;
  order: number;
  hourRange: string;
  lightCondition: "light" | "dark" | "transitional";
  typicalActivities: string[];
}

export const TIME_PERIODS: TimePeriod[] = [
  {
    id: "T01",
    name: "Dawn",
    order: 1,
    hourRange: "5:00 AM - 7:00 AM",
    lightCondition: "transitional",
    typicalActivities: ["staff beginning duties", "early risers walking grounds"],
  },
  {
    id: "T02",
    name: "Breakfast",
    order: 2,
    hourRange: "7:00 AM - 9:00 AM",
    lightCondition: "light",
    typicalActivities: ["morning meal", "reading newspapers", "planning the day"],
  },
  {
    id: "T03",
    name: "Late Morning",
    order: 3,
    hourRange: "9:00 AM - 11:00 AM",
    lightCondition: "light",
    typicalActivities: ["correspondence", "receiving visitors", "garden strolls"],
  },
  {
    id: "T04",
    name: "Lunch",
    order: 4,
    hourRange: "11:00 AM - 1:00 PM",
    lightCondition: "light",
    typicalActivities: ["midday meal", "casual conversation", "rest"],
  },
  {
    id: "T05",
    name: "Early Afternoon",
    order: 5,
    hourRange: "1:00 PM - 3:00 PM",
    lightCondition: "light",
    typicalActivities: ["games", "reading", "outdoor activities"],
  },
  {
    id: "T06",
    name: "Tea Time",
    order: 6,
    hourRange: "3:00 PM - 5:00 PM",
    lightCondition: "light",
    typicalActivities: ["afternoon tea", "social gathering", "music"],
  },
  {
    id: "T07",
    name: "Dusk",
    order: 7,
    hourRange: "5:00 PM - 7:00 PM",
    lightCondition: "transitional",
    typicalActivities: ["changing for dinner", "cocktails", "quiet reflection"],
  },
  {
    id: "T08",
    name: "Dinner",
    order: 8,
    hourRange: "7:00 PM - 9:00 PM",
    lightCondition: "dark",
    typicalActivities: ["formal dinner", "toasts", "announcements"],
  },
  {
    id: "T09",
    name: "Night",
    order: 9,
    hourRange: "9:00 PM - 12:00 AM",
    lightCondition: "dark",
    typicalActivities: ["after-dinner drinks", "card games", "retiring to rooms"],
  },
  {
    id: "T10",
    name: "Midnight",
    order: 10,
    hourRange: "12:00 AM - 2:00 AM",
    lightCondition: "dark",
    typicalActivities: ["everyone asleep", "staff retired", "quiet mansion"],
  },
];

// ============================================
// MYSTERY THEMES
// ============================================

export interface MysteryTheme {
  id: string;
  name: string;
  period: string;
  description: string;
  typicalLockedRooms: string[];
  atmosphericElements: string[];
}

export const MYSTERY_THEMES: MysteryTheme[] = [
  {
    id: "M01",
    name: "The Monte Carlo Affair",
    period: "September 1925",
    description: "A gambling-themed weekend with high stakes and higher tensions",
    typicalLockedRooms: ["Rose Garden", "Fountain"],
    atmosphericElements: ["card games", "betting", "fortunes won and lost"],
  },
  {
    id: "M02",
    name: "The Garden Party",
    period: "Fall 1925",
    description: "An outdoor celebration turns sinister when something goes missing",
    typicalLockedRooms: ["Study"],
    atmosphericElements: ["outdoor festivities", "croquet", "garden decorations"],
  },
  {
    id: "M03",
    name: "A Bad Sport",
    period: "Fall 1925",
    description: "Competitive games bring out the worst in the guests",
    typicalLockedRooms: ["Conservatory"],
    atmosphericElements: ["athletic competition", "rivalry", "accusations"],
  },
  {
    id: "M04",
    name: "The Hunt",
    period: "Fall 1925",
    description: "A hunting weekend where the prey isn't just foxes",
    typicalLockedRooms: ["Ballroom"],
    atmosphericElements: ["hunting party", "outdoor pursuits", "hunting attire"],
  },
  {
    id: "M05",
    name: "The Autumn Leaves",
    period: "Late Fall 1925",
    description: "As leaves fall, so do secrets long buried",
    typicalLockedRooms: ["Kitchen"],
    atmosphericElements: ["falling leaves", "melancholy mood", "fireplaces"],
  },
  {
    id: "M06",
    name: "The Costume Party",
    period: "Winter 1925",
    description: "Behind the masks, someone hides a guilty secret",
    typicalLockedRooms: ["Library"],
    atmosphericElements: ["masquerade", "costumes", "hidden identities"],
  },
  {
    id: "M07",
    name: "Spring Cleaning",
    period: "Spring 1926",
    description: "Cleaning house uncovers more than dust",
    typicalLockedRooms: ["Dining Room"],
    atmosphericElements: ["renovation", "discoveries", "fresh starts"],
  },
  {
    id: "M08",
    name: "A Princess Is Born",
    period: "Spring 1926",
    description: "A royal visit brings glamour and danger to Tudor Mansion",
    typicalLockedRooms: ["Billiard Room"],
    atmosphericElements: ["royalty", "ceremony", "protocol"],
  },
  {
    id: "M09",
    name: "A Grand Ball",
    period: "Spring 1926",
    description: "The social event of the season ends in scandal",
    typicalLockedRooms: [],
    atmosphericElements: ["dancing", "orchestra", "evening gowns"],
  },
  {
    id: "M10",
    name: "The Last Straw",
    period: "May 1926",
    description: "Tensions finally boil over in this dramatic finale",
    typicalLockedRooms: ["Lounge"],
    atmosphericElements: ["confrontation", "revelations", "final gathering"],
  },
  {
    id: "M11",
    name: "Christmas at the Mansion",
    period: "December 1925",
    description: "Holiday cheer can't hide the darkness within",
    typicalLockedRooms: ["Rose Garden", "Fountain"],
    atmosphericElements: ["Christmas decorations", "gift giving", "winter weather"],
  },
  {
    id: "M12",
    name: "A Dark and Stormy Night",
    period: "Winter 1925-1926",
    description: "Trapped by the storm, secrets come to light",
    typicalLockedRooms: ["Rose Garden", "Fountain"],
    atmosphericElements: ["thunderstorm", "power outage", "trapped indoors"],
  },
];

// ============================================
// CLUE TEMPLATES
// ============================================

export type ClueType = "butler" | "inspector_note" | "observation";

export interface ClueTemplate {
  type: ClueType;
  template: string;
  eliminates: {
    category: "suspect" | "item" | "location" | "time";
    logic: string;
  };
}

export const CLUE_TEMPLATES: ClueTemplate[] = [
  // Butler clues - eliminate suspects
  {
    type: "butler",
    template: "I overheard {suspect1}, {suspect2}, and {suspect3} arguing over who had the best collection of antiques.",
    eliminates: { category: "suspect", logic: "suspects_mentioned_together" },
  },
  {
    type: "butler",
    template: "{suspect} asked me where Mr. Boddy kept his {item_category} collection.",
    eliminates: { category: "suspect", logic: "suspect_interested_in_category" },
  },
  {
    type: "butler",
    template: "By the time I went to bed after midnight, all of the {item_category} had been locked up and accounted for.",
    eliminates: { category: "item", logic: "items_secured_by_time" },
  },
  {
    type: "butler",
    template: "I had complimented {suspect} on the jewelry she was wearing when she arrived. She told me Mr. Boddy had let her borrow it for the weekend.",
    eliminates: { category: "suspect", logic: "suspect_already_had_jewelry" },
  },

  // Inspector notes - various eliminations
  {
    type: "inspector_note",
    template: "Around {time}, {suspect} discovered that one of the antiques was missing from its display case in the {location}.",
    eliminates: { category: "time", logic: "theft_already_occurred" },
  },
  {
    type: "inspector_note",
    template: "{suspect1} and {suspect2} left during dinner even before dessert was served, hardly said goodbye to anyone. Strange.",
    eliminates: { category: "suspect", logic: "suspects_left_early" },
  },
  {
    type: "inspector_note",
    template: "During {time} all guests were sitting around the {location} sunning themselves.",
    eliminates: { category: "time", logic: "all_suspects_together" },
  },
  {
    type: "inspector_note",
    template: "The {location} was being renovated and no one could enter it all weekend.",
    eliminates: { category: "location", logic: "location_inaccessible" },
  },
  {
    type: "inspector_note",
    template: "{suspect} never left the {location} between {time1} and {time2}.",
    eliminates: { category: "suspect", logic: "suspect_has_alibi" },
  },

  // Observation clues
  {
    type: "observation",
    template: "I noticed muddy footprints leading from the {location} to the garden.",
    eliminates: { category: "location", logic: "location_had_activity" },
  },
  {
    type: "observation",
    template: "The display case in the {location} appears undisturbed.",
    eliminates: { category: "location", logic: "location_not_crime_scene" },
  },
];

// ============================================
// HELPER FUNCTIONS
// ============================================

export function getRandomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

export function getRandomElements<T>(array: T[], count: number): T[] {
  const shuffled = [...array].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function getSuspectById(id: string): Suspect | undefined {
  return SUSPECTS.find((s) => s.id === id);
}

export function getItemById(id: string): Item | undefined {
  return ITEMS.find((i) => i.id === id);
}

export function getLocationById(id: string): Location | undefined {
  return LOCATIONS.find((l) => l.id === id);
}

export function getTimeById(id: string): TimePeriod | undefined {
  return TIME_PERIODS.find((t) => t.id === id);
}

export function getItemsByCategory(category: Item["category"]): Item[] {
  return ITEMS.filter((i) => i.category === category);
}

export function getLocationsByType(type: Location["type"]): Location[] {
  return LOCATIONS.filter((l) => l.type === type);
}

export function getTimesByLightCondition(condition: TimePeriod["lightCondition"]): TimePeriod[] {
  return TIME_PERIODS.filter((t) => t.lightCondition === condition);
}
