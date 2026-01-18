/**
 * Clue DVD Game (2006) - Game Constants
 *
 * Core constants and configuration for the game system.
 * These values are fixed and verified from the physical game.
 */

// ============================================
// CARD COUNTS
// ============================================

export const CARD_COUNTS = {
  suspects: 10,
  items: 11,
  locations: 11,
  times: 10,
  total: 42,
} as const;

// ============================================
// SOLUTION SPACE
// ============================================

export const SOLUTION_SPACE = {
  totalPossibilities: 10 * 11 * 11 * 10, // 12,100
  categories: 4, // WHO, WHAT, WHERE, WHEN
} as const;

// ============================================
// PLAYER CONFIGURATION
// ============================================

export const PLAYER_CONFIG = {
  minPlayers: 3,
  maxPlayers: 5,
  validPlayerCounts: [3, 4, 5] as const,
} as const;

// ============================================
// GAME SETTING
// ============================================

export const GAME_SETTING = {
  location: "Tudor Mansion",
  country: "England",
  era: "1920s",
  timeframe: "September 1925 - May 1926",
  crime: "theft", // NOT murder
} as const;

// ============================================
// NON-PLAYABLE CHARACTERS
// ============================================

export interface NPC {
  id: string;
  name: string;
  role: string;
  description: string;
  clueType: "inspector_note" | "butler" | "victim";
}

export const NPCS: NPC[] = [
  {
    id: "NPC01",
    name: "Inspector Brown",
    role: "Scotland Yard Detective",
    description: "The lead investigator from Scotland Yard, known for his keen eye and methodical approach to solving cases.",
    clueType: "inspector_note",
  },
  {
    id: "NPC02",
    name: "Ashe",
    role: "Butler",
    description: "Mr. Boddy's trusted butler who has served Tudor Mansion for decades. He knows all the secrets of the house and its guests.",
    clueType: "butler",
  },
  {
    id: "NPC03",
    name: "Mr. Boddy",
    role: "Victim",
    description: "The wealthy owner of Tudor Mansion and host of the weekend gathering. His prized collection has been targeted by a thief. (Known as Dr. Black in UK version)",
    clueType: "victim",
  },
];

export function getNPCByRole(role: NPC["clueType"]): NPC | undefined {
  return NPCS.find((npc) => npc.clueType === role);
}

export function getNPCById(id: string): NPC | undefined {
  return NPCS.find((npc) => npc.id === id);
}

// ============================================
// SPECIAL LOCATIONS
// ============================================

export interface SpecialLocation {
  id: string;
  name: string;
  description: string;
  purpose: string;
  isPlayableLocation: boolean;
}

export const SPECIAL_LOCATIONS: SpecialLocation[] = [
  {
    id: "SPECIAL01",
    name: "Evidence Room",
    description: "The central room of Tudor Mansion where players gather to review evidence and make accusations.",
    purpose: "Starting point for all players. Accusations can only be made from this room.",
    isPlayableLocation: false, // Cannot be the location of the theft
  },
  {
    id: "SPECIAL02",
    name: "Case File Envelope",
    description: "The sealed envelope containing the solution cards.",
    purpose: "Holds the 4 solution cards (1 suspect, 1 item, 1 location, 1 time) that players must deduce.",
    isPlayableLocation: false,
  },
  {
    id: "SPECIAL03",
    name: "Butler's Pantry",
    description: "Where item cards are stored before being dealt during the game.",
    purpose: "Item cards are dealt from here when players summon the butler.",
    isPlayableLocation: false,
  },
];

// ============================================
// CARD CATEGORIES
// ============================================

export const CARD_CATEGORIES = {
  suspect: {
    question: "WHO",
    description: "Which suspect committed the theft?",
  },
  item: {
    question: "WHAT",
    description: "Which valuable item was stolen?",
  },
  location: {
    question: "WHERE",
    description: "Which room was the item stolen from?",
  },
  time: {
    question: "WHEN",
    description: "At what time was the theft committed?",
  },
} as const;

// ============================================
// ITEM CATEGORIES
// ============================================

export const ITEM_CATEGORIES = {
  antique: {
    name: "Antiques",
    description: "Historical and collectible items from Mr. Boddy's collection",
  },
  desk: {
    name: "Desk Items",
    description: "Writing instruments and office accessories",
  },
  jewelry: {
    name: "Jewelry",
    description: "Precious ornamental items and accessories",
  },
} as const;

// ============================================
// TIME LIGHT CONDITIONS
// ============================================

export const LIGHT_CONDITIONS = {
  light: {
    name: "Daylight",
    description: "Full daylight hours, good visibility throughout the mansion",
  },
  dark: {
    name: "Darkness",
    description: "Night hours, limited visibility, candles and lamps required",
  },
  transitional: {
    name: "Transitional",
    description: "Dawn or dusk, shifting light conditions",
  },
} as const;

// ============================================
// SECRET PASSAGES
// ============================================

export const SECRET_PASSAGES = [
  { from: "Lounge", to: "Conservatory" },
  { from: "Conservatory", to: "Lounge" },
  { from: "Kitchen", to: "Study" },
  { from: "Study", to: "Kitchen" },
] as const;

// ============================================
// DIFFICULTY LEVELS
// ============================================

export const DIFFICULTY_LEVELS = {
  expert: {
    name: "Expert",
    description: "Fixed expert difficulty",
    clueCount: 7,
    estimatedMinutes: 75,
  },
} as const;
