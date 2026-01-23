/**
 * Clue DVD Game - Campaign Settings
 *
 * Difficulty-specific settings for the narrative-driven campaign system.
 * Controls pacing, elimination group sizes, red herrings, and act distribution.
 */

import type { Difficulty, NarrativeAct, ClueTone, EliminationType } from "../types/campaign";

// ============================================
// DIFFICULTY SETTINGS
// ============================================

export interface DifficultySettings {
  /** Total number of clues in the campaign */
  clueCount: number;
  /** Distribution of clues across the three acts */
  actDistribution: {
    act1: number;
    act2: number;
    act3: number;
  };
  /** Red herring configuration */
  redHerrings: {
    /** Number of red herrings to include */
    count: number;
    /** Whether red herrings must be resolved by end of game */
    mustResolve: boolean;
  };
  /** Number of dramatic events */
  dramaticEventCount: number;
  /** Maximum group size for eliminations by category */
  maxGroupSize: {
    suspects: number;
    items: number;
    locations: number;
    times: number;
  };
  /** Minimum group size (1 = single eliminations allowed) */
  minGroupSize: number;
}

export const DIFFICULTY_SETTINGS: Record<Difficulty, DifficultySettings> = {
  beginner: {
    clueCount: 12,
    actDistribution: { act1: 4, act2: 5, act3: 3 },
    redHerrings: { count: 1, mustResolve: true },
    dramaticEventCount: 2,
    maxGroupSize: { suspects: 4, items: 4, locations: 3, times: 3 },
    minGroupSize: 1,
  },
  intermediate: {
    clueCount: 10,
    actDistribution: { act1: 3, act2: 4, act3: 3 },
    redHerrings: { count: 2, mustResolve: false },
    dramaticEventCount: 3,
    maxGroupSize: { suspects: 3, items: 3, locations: 3, times: 3 },
    minGroupSize: 1,
  },
  expert: {
    clueCount: 10,
    actDistribution: { act1: 4, act2: 4, act3: 2 },
    redHerrings: { count: 3, mustResolve: false },
    dramaticEventCount: 3,
    maxGroupSize: { suspects: 2, items: 2, locations: 2, times: 2 },
    minGroupSize: 1,
  },
};

// ============================================
// ACT SETTINGS
// ============================================

export interface ActSettings {
  /** Act identifier */
  act: NarrativeAct;
  /** Human-readable name */
  name: string;
  /** Focus of this act */
  focus: string;
  /** Dominant tone for clues in this act */
  dominantTone: ClueTone;
  /** Preferred elimination types for this act */
  preferredEliminationTypes: EliminationType[];
  /** Preferred group sizes (larger = easier eliminations) */
  preferredGroupSizes: "large" | "medium" | "small";
}

export const ACT_SETTINGS: Record<NarrativeAct, ActSettings> = {
  act1_setup: {
    act: "act1_setup",
    name: "Act 1: Setup",
    focus: "Scene-setting, easy eliminations, establishing the mystery",
    dominantTone: "establishing",
    preferredEliminationTypes: [
      // Large group eliminations - easier
      "category_secured",
      "location_inaccessible",
      "all_together",
      "group_alibi",
      "staff_activity",
    ],
    preferredGroupSizes: "large",
  },
  act2_confrontation: {
    act: "act2_confrontation",
    name: "Act 2: Confrontation",
    focus: "Complications, red herrings, narrowing the field",
    dominantTone: "developing",
    preferredEliminationTypes: [
      // Medium complexity
      "group_alibi",
      "item_sighting",
      "witness_testimony",
      "location_occupied",
      "location_visibility",
      "item_present",
    ],
    preferredGroupSizes: "medium",
  },
  act3_resolution: {
    act: "act3_resolution",
    name: "Act 3: Resolution",
    focus: "Decisive clues enabling the solution",
    dominantTone: "revealing",
    preferredEliminationTypes: [
      // Single element, decisive eliminations
      "individual_alibi",
      "timeline_impossibility",
      "physical_impossibility",
      "motive_cleared",
      "item_accounted",
      "location_undisturbed",
      "item_condition",
    ],
    preferredGroupSizes: "small",
  },
};

// ============================================
// ELIMINATION TYPE METADATA
// ============================================

export interface EliminationTypeInfo {
  /** The elimination type */
  type: EliminationType;
  /** Which category this type applies to */
  category: "suspect" | "item" | "location" | "time";
  /** Human-readable description */
  description: string;
  /** Typical group size this type supports */
  typicalGroupSize: "single" | "small" | "medium" | "large";
  /** Which speaker typically delivers this type */
  preferredSpeaker: "Ashe" | "Inspector Brown" | "either";
}

export const ELIMINATION_TYPE_INFO: Record<EliminationType, EliminationTypeInfo> = {
  // Suspect types (5)
  group_alibi: {
    type: "group_alibi",
    category: "suspect",
    description: "Multiple suspects were together and alibied each other",
    typicalGroupSize: "large",
    preferredSpeaker: "either",
  },
  individual_alibi: {
    type: "individual_alibi",
    category: "suspect",
    description: "Single suspect has a verified alibi",
    typicalGroupSize: "single",
    preferredSpeaker: "Inspector Brown",
  },
  witness_testimony: {
    type: "witness_testimony",
    category: "suspect",
    description: "Witnesses saw the suspect elsewhere",
    typicalGroupSize: "small",
    preferredSpeaker: "either",
  },
  physical_impossibility: {
    type: "physical_impossibility",
    category: "suspect",
    description: "Suspect physically could not have committed the theft",
    typicalGroupSize: "single",
    preferredSpeaker: "Inspector Brown",
  },
  motive_cleared: {
    type: "motive_cleared",
    category: "suspect",
    description: "Suspect had no reason to steal",
    typicalGroupSize: "single",
    preferredSpeaker: "Ashe",
  },

  // Item types (4)
  category_secured: {
    type: "category_secured",
    category: "item",
    description: "All items of a category were locked up",
    typicalGroupSize: "large",
    preferredSpeaker: "Ashe",
  },
  item_sighting: {
    type: "item_sighting",
    category: "item",
    description: "Item was seen after the theft time",
    typicalGroupSize: "single",
    preferredSpeaker: "either",
  },
  item_accounted: {
    type: "item_accounted",
    category: "item",
    description: "Item has been located and verified",
    typicalGroupSize: "single",
    preferredSpeaker: "Inspector Brown",
  },
  item_condition: {
    type: "item_condition",
    category: "item",
    description: "Item's display case was undisturbed",
    typicalGroupSize: "single",
    preferredSpeaker: "Inspector Brown",
  },

  // Location types (4)
  location_inaccessible: {
    type: "location_inaccessible",
    category: "location",
    description: "Location was being renovated or locked",
    typicalGroupSize: "single",
    preferredSpeaker: "either",
  },
  location_undisturbed: {
    type: "location_undisturbed",
    category: "location",
    description: "Location shows no signs of tampering",
    typicalGroupSize: "single",
    preferredSpeaker: "Inspector Brown",
  },
  location_occupied: {
    type: "location_occupied",
    category: "location",
    description: "Location was continuously occupied",
    typicalGroupSize: "small",
    preferredSpeaker: "Ashe",
  },
  location_visibility: {
    type: "location_visibility",
    category: "location",
    description: "Location had too much foot traffic",
    typicalGroupSize: "medium",
    preferredSpeaker: "Ashe",
  },

  // Time types (4)
  all_together: {
    type: "all_together",
    category: "time",
    description: "All suspects were gathered during this time",
    typicalGroupSize: "single",
    preferredSpeaker: "either",
  },
  item_present: {
    type: "item_present",
    category: "time",
    description: "Item was verified present during this time",
    typicalGroupSize: "single",
    preferredSpeaker: "Ashe",
  },
  staff_activity: {
    type: "staff_activity",
    category: "time",
    description: "Staff were everywhere during this time",
    typicalGroupSize: "medium",
    preferredSpeaker: "Ashe",
  },
  timeline_impossibility: {
    type: "timeline_impossibility",
    category: "time",
    description: "Timeline rules out this period",
    typicalGroupSize: "single",
    preferredSpeaker: "Inspector Brown",
  },
};

// ============================================
// DRAMATIC EVENT TYPES
// ============================================

export interface DramaticEventType {
  id: string;
  name: string;
  description: string;
  requiresSuspects: number; // How many suspects must be involved
  suitableActs: NarrativeAct[];
}

export const DRAMATIC_EVENT_TYPES: DramaticEventType[] = [
  {
    id: "power_outage",
    name: "Power Outage",
    description: "The lights flicker and go out momentarily",
    requiresSuspects: 0,
    suitableActs: ["act2_confrontation", "act3_resolution"],
  },
  {
    id: "argument",
    name: "Heated Argument",
    description: "Two suspects have a heated exchange",
    requiresSuspects: 2,
    suitableActs: ["act2_confrontation"],
  },
  {
    id: "scream",
    name: "A Scream in the Night",
    description: "A scream echoes through the mansion",
    requiresSuspects: 1,
    suitableActs: ["act2_confrontation", "act3_resolution"],
  },
  {
    id: "discovery",
    name: "Suspicious Discovery",
    description: "Something unusual is found",
    requiresSuspects: 1,
    suitableActs: ["act2_confrontation"],
  },
  {
    id: "arrival",
    name: "Unexpected Arrival",
    description: "Someone arrives unexpectedly",
    requiresSuspects: 1,
    suitableActs: ["act1_setup", "act2_confrontation"],
  },
  {
    id: "crash",
    name: "Crashing Sound",
    description: "A loud crash echoes through the halls",
    requiresSuspects: 0,
    suitableActs: ["act1_setup", "act2_confrontation"],
  },
  {
    id: "secret_passage",
    name: "Secret Passage Found",
    description: "A hidden passage is discovered",
    requiresSuspects: 0,
    suitableActs: ["act2_confrontation", "act3_resolution"],
  },
  {
    id: "confrontation",
    name: "Direct Confrontation",
    description: "A suspect is directly confronted about their behavior",
    requiresSuspects: 1,
    suitableActs: ["act3_resolution"],
  },
];

// ============================================
// NARRATIVE THREAD TEMPLATES
// ============================================

export interface NarrativeThreadTemplate {
  id: string;
  name: string;
  description: string;
  minClues: number;
  maxClues: number;
  isRedHerring: boolean;
}

export const NARRATIVE_THREAD_TEMPLATES: NarrativeThreadTemplate[] = [
  {
    id: "true_timeline",
    name: "The True Timeline",
    description: "Clues that establish when the theft actually occurred",
    minClues: 2,
    maxClues: 4,
    isRedHerring: false,
  },
  {
    id: "alibi_network",
    name: "The Alibi Network",
    description: "Interconnected alibis between suspects",
    minClues: 2,
    maxClues: 3,
    isRedHerring: false,
  },
  {
    id: "item_trail",
    name: "The Item Trail",
    description: "Tracking where items were seen or stored",
    minClues: 2,
    maxClues: 4,
    isRedHerring: false,
  },
  {
    id: "location_story",
    name: "The Location Story",
    description: "What happened in various locations throughout the event",
    minClues: 2,
    maxClues: 3,
    isRedHerring: false,
  },
  {
    id: "false_lead",
    name: "A False Lead",
    description: "Misleading clues that point in the wrong direction",
    minClues: 1,
    maxClues: 2,
    isRedHerring: true,
  },
  {
    id: "suspicious_behavior",
    name: "Suspicious Behavior",
    description: "A suspect acting strangely but innocently",
    minClues: 1,
    maxClues: 2,
    isRedHerring: true,
  },
];

// ============================================
// ELEMENT COUNTS (for mathematical coverage)
// ============================================

export const ELEMENT_COUNTS = {
  suspects: 10,
  items: 11,
  locations: 11,
  times: 10,
} as const;

/**
 * Non-solution elements that must be covered by clues
 * Total = (10-1) + (11-1) + (11-1) + (10-1) = 9 + 10 + 10 + 9 = 38
 */
export const NON_SOLUTION_COUNTS = {
  suspects: ELEMENT_COUNTS.suspects - 1, // 9
  items: ELEMENT_COUNTS.items - 1, // 10
  locations: ELEMENT_COUNTS.locations - 1, // 10
  times: ELEMENT_COUNTS.times - 1, // 9
  total: 38,
} as const;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get settings for a specific difficulty
 */
export function getDifficultySettings(difficulty: Difficulty): DifficultySettings {
  return DIFFICULTY_SETTINGS[difficulty];
}

/**
 * Get settings for a specific act
 */
export function getActSettings(act: NarrativeAct): ActSettings {
  return ACT_SETTINGS[act];
}

/**
 * Get info about an elimination type
 */
export function getEliminationTypeInfo(type: EliminationType): EliminationTypeInfo {
  return ELIMINATION_TYPE_INFO[type];
}

/**
 * Get elimination types suitable for a category
 */
export function getEliminationTypesForCategory(
  category: "suspect" | "item" | "location" | "time"
): EliminationType[] {
  return Object.values(ELIMINATION_TYPE_INFO)
    .filter(info => info.category === category)
    .map(info => info.type);
}

/**
 * Get elimination types preferred for an act
 */
export function getPreferredEliminationTypesForAct(act: NarrativeAct): EliminationType[] {
  return ACT_SETTINGS[act].preferredEliminationTypes;
}

/**
 * Calculate average elements per clue for a difficulty
 */
export function calculateAverageElementsPerClue(difficulty: Difficulty): number {
  const settings = DIFFICULTY_SETTINGS[difficulty];
  return NON_SOLUTION_COUNTS.total / settings.clueCount;
}

/**
 * Get tone for a clue position within the campaign
 */
export function getToneForPosition(
  position: number,
  totalClues: number,
  actDistribution: DifficultySettings["actDistribution"]
): { act: NarrativeAct; tone: ClueTone } {
  const act1End = actDistribution.act1;
  const act2End = act1End + actDistribution.act2;

  if (position <= act1End) {
    return { act: "act1_setup", tone: "establishing" };
  } else if (position <= act2End) {
    // Act 2 transitions from developing to escalating
    const act2Position = position - act1End;
    const act2Midpoint = Math.ceil(actDistribution.act2 / 2);
    const tone = act2Position <= act2Midpoint ? "developing" : "escalating";
    return { act: "act2_confrontation", tone };
  } else {
    return { act: "act3_resolution", tone: "revealing" };
  }
}
