/**
 * Shared Game Elements
 *
 * Simple display data for suspects, items, locations, times, and themes.
 * Used by both frontend and backend for consistent naming.
 *
 * VERIFIED FROM PHYSICAL CARDS (January 2026)
 */

// ============================================
// SIMPLE TYPES (for display purposes)
// ============================================

export interface GameElement {
  id: string;
  name: string;
}

export interface ThemeElement extends GameElement {
  description: string;
  period: string;
}

export interface DifficultyLevel {
  id: string;
  name: string;
  description: string;
  clueCount: number;
}

// ============================================
// SUSPECTS (10 Total)
// ============================================

export const SUSPECTS: GameElement[] = [
  { id: "S01", name: "Miss Scarlet" },
  { id: "S02", name: "Colonel Mustard" },
  { id: "S03", name: "Mrs. White" },
  { id: "S04", name: "Mr. Green" },
  { id: "S05", name: "Mrs. Peacock" },
  { id: "S06", name: "Professor Plum" },
  { id: "S07", name: "Mrs. Meadow-Brook" },
  { id: "S08", name: "Prince Azure" },
  { id: "S09", name: "Lady Lavender" },
  { id: "S10", name: "Rusty" },
];

// ============================================
// ITEMS (11 Total)
// ============================================

export const ITEMS: GameElement[] = [
  { id: "I01", name: "Spyglass" },
  { id: "I02", name: "Revolver" },
  { id: "I03", name: "Rare Book" },
  { id: "I04", name: "Medal" },
  { id: "I05", name: "Billfold" },
  { id: "I06", name: "Gold Pen" },
  { id: "I07", name: "Letter Opener" },
  { id: "I08", name: "Crystal Paperweight" },
  { id: "I09", name: "Pocket Watch" },
  { id: "I10", name: "Jade Hairpin" },
  { id: "I11", name: "Scarab Brooch" },
];

// ============================================
// LOCATIONS (11 Total)
// ============================================

export const LOCATIONS: GameElement[] = [
  { id: "L01", name: "Hall" },
  { id: "L02", name: "Lounge" },
  { id: "L03", name: "Dining Room" },
  { id: "L04", name: "Kitchen" },
  { id: "L05", name: "Ballroom" },
  { id: "L06", name: "Conservatory" },
  { id: "L07", name: "Billiard Room" },
  { id: "L08", name: "Library" },
  { id: "L09", name: "Study" },
  { id: "L10", name: "Rose Garden" },
  { id: "L11", name: "Fountain" },
];

// ============================================
// TIME PERIODS (10 Total)
// ============================================

export const TIMES: GameElement[] = [
  { id: "T01", name: "Dawn" },
  { id: "T02", name: "Breakfast" },
  { id: "T03", name: "Late Morning" },
  { id: "T04", name: "Lunch" },
  { id: "T05", name: "Early Afternoon" },
  { id: "T06", name: "Tea Time" },
  { id: "T07", name: "Dusk" },
  { id: "T08", name: "Dinner" },
  { id: "T09", name: "Night" },
  { id: "T10", name: "Midnight" },
];

// ============================================
// MYSTERY THEMES (12 Total)
// ============================================

export const THEMES: ThemeElement[] = [
  { id: "DEV01", name: "Developer Test Case", description: "Fixed-solution test theme", period: "Testing Window" },
  { id: "M01", name: "The Monte Carlo Affair", description: "A gambling-themed weekend with high stakes and higher tensions", period: "September 1925" },
  { id: "M02", name: "The Garden Party", description: "An outdoor celebration turns sinister when something goes missing", period: "Fall 1925" },
  { id: "M03", name: "A Bad Sport", description: "Competitive games bring out the worst in the guests", period: "Fall 1925" },
  { id: "M04", name: "The Hunt", description: "A hunting weekend where the prey isn't just foxes", period: "Fall 1925" },
  { id: "M05", name: "The Autumn Leaves", description: "As leaves fall, so do secrets long buried", period: "Late Fall 1925" },
  { id: "M06", name: "The Costume Party", description: "Behind the masks, someone hides a guilty secret", period: "Winter 1925" },
  { id: "M07", name: "Spring Cleaning", description: "Cleaning house uncovers more than dust", period: "Spring 1926" },
  { id: "M08", name: "A Princess Is Born", description: "A royal visit brings glamour and danger to Tudor Mansion", period: "Spring 1926" },
  { id: "M09", name: "A Grand Ball", description: "The social event of the season ends in scandal", period: "Spring 1926" },
  { id: "M10", name: "The Last Straw", description: "Tensions finally boil over in this dramatic finale", period: "May 1926" },
  { id: "M11", name: "Christmas at the Mansion", description: "Holiday cheer can't hide the darkness within", period: "December 1925" },
  { id: "M12", name: "A Dark and Stormy Night", description: "Trapped by the storm, secrets come to light", period: "Winter 1925-1926" },
];

// ============================================
// DIFFICULTY LEVELS
// ============================================

export const DIFFICULTIES: DifficultyLevel[] = [
  { id: "beginner", name: "Beginner", description: "More clues, easier deduction", clueCount: 12 },
  { id: "intermediate", name: "Intermediate", description: "Balanced challenge", clueCount: 10 },
  { id: "expert", name: "Expert", description: "Fewer clues, harder deduction", clueCount: 8 },
];

// ============================================
// HELPER FUNCTIONS
// ============================================

export function getSuspectName(id: string): string {
  return SUSPECTS.find(s => s.id === id)?.name ?? id;
}

export function getItemName(id: string): string {
  return ITEMS.find(i => i.id === id)?.name ?? id;
}

export function getLocationName(id: string): string {
  return LOCATIONS.find(l => l.id === id)?.name ?? id;
}

export function getTimeName(id: string): string {
  return TIMES.find(t => t.id === id)?.name ?? id;
}

export function getThemeName(id: string): string {
  return THEMES.find(t => t.id === id)?.name ?? id;
}

// ============================================
// COUNTS
// ============================================

export const CARD_COUNTS = {
  suspects: SUSPECTS.length,
  items: ITEMS.length,
  locations: LOCATIONS.length,
  times: TIMES.length,
  themes: THEMES.length,
  total: SUSPECTS.length + ITEMS.length + LOCATIONS.length + TIMES.length,
} as const;

// ============================================
// PLAYER CONFIGURATION
// ============================================

export const PLAYER_COUNTS = [1, 2, 3, 4, 5, 6] as const;
export type PlayerCount = typeof PLAYER_COUNTS[number];
