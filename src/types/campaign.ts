/**
 * Clue DVD Game - Campaign Types
 *
 * Type definitions for the narrative-driven campaign system.
 * These types support a 3-phase approach:
 * 1. Strategic Planning (what to eliminate, in what order)
 * 2. Clue Generation (generate text from the plan)
 * 3. Validation (ensure solvability and coherence)
 */

// ============================================
// CORE ENUMS AND TYPES
// ============================================

/**
 * Difficulty levels affect clue count, group sizes, and red herring behavior
 */
export type Difficulty = "beginner" | "intermediate" | "expert";

/**
 * Three-act narrative structure for pacing clues
 */
export type NarrativeAct = "act1_setup" | "act2_confrontation" | "act3_resolution";

/**
 * Categories of game elements that can be eliminated
 */
export type EliminationCategory = "suspect" | "item" | "location" | "time";

/**
 * Clue delivery methods
 */
export type ClueDeliveryType = "butler" | "inspector_note" | "observation";

/**
 * Speakers who can deliver clues
 */
export type ClueSpeaker = "Ashe" | "Inspector Brown";

/**
 * Narrative tone progression through the game
 */
export type ClueTone = "establishing" | "developing" | "escalating" | "revealing";

// ============================================
// ELIMINATION TYPES (17 total)
// ============================================

/**
 * Suspect elimination types (5)
 */
export type SuspectEliminationType =
  | "group_alibi"           // Multiple suspects were together
  | "individual_alibi"      // Single suspect has verified alibi
  | "witness_testimony"     // Witnesses saw suspect elsewhere
  | "physical_impossibility" // Suspect physically couldn't have done it
  | "motive_cleared";       // Suspect had no reason to steal

/**
 * Item elimination types (4)
 */
export type ItemEliminationType =
  | "category_secured"      // All items of a category were locked up
  | "item_sighting"         // Item was seen after theft time
  | "item_accounted"        // Item has been located and verified
  | "item_condition";       // Item's display case was undisturbed

/**
 * Location elimination types (4)
 */
export type LocationEliminationType =
  | "location_inaccessible" // Location was being renovated/locked
  | "location_undisturbed"  // Location shows no signs of tampering
  | "location_occupied"     // Location was continuously occupied
  | "location_visibility";  // Location had too much foot traffic

/**
 * Time elimination types (4)
 */
export type TimeEliminationType =
  | "all_together"          // All suspects were gathered during this time
  | "item_present"          // Item was verified present during this time
  | "staff_activity"        // Staff were everywhere during this time
  | "timeline_impossibility"; // Timeline rules out this period

/**
 * All elimination types combined
 */
export type EliminationType =
  | SuspectEliminationType
  | ItemEliminationType
  | LocationEliminationType
  | TimeEliminationType;

// ============================================
// ELIMINATION PLANNING
// ============================================

/**
 * A group of elements eliminated by a single clue
 */
export interface EliminationGroup {
  /** Unique index within the category */
  index: number;
  /** Element IDs to eliminate (e.g., ["S01", "S02", "S03"]) */
  elementIds: string[];
  /** How these elements are eliminated */
  eliminationType: EliminationType;
  /** Which act this elimination belongs to */
  targetAct: NarrativeAct;
  /** Priority within the act (lower = earlier) */
  priority: number;
  /** Optional context for clue generation */
  context?: {
    /** Location mentioned in the clue (for alibis) */
    alibiLocation?: string;
    /** Time mentioned in the clue */
    alibiTime?: string;
    /** Item category for category_secured */
    itemCategory?: string;
  };
}

/**
 * Elimination plan for a single category
 */
export interface CategoryEliminationPlan {
  /** Total elements to eliminate (excluding solution) */
  totalElements: number;
  /** Groups of elements to eliminate */
  groups: EliminationGroup[];
  /** Total clues needed for this category */
  clueCount: number;
}

// ============================================
// PLANNED CLUES
// ============================================

/**
 * A clue as planned before text generation
 */
export interface PlannedClue {
  /** Position in the clue sequence (1-based) */
  position: number;
  /** Which narrative act */
  act: NarrativeAct;
  /** Elimination details */
  elimination: {
    /** Which category this clue eliminates from */
    category: EliminationCategory;
    /** Index of the elimination group */
    groupIndex: number;
    /** Element IDs being eliminated */
    elementIds: string[];
    /** Elimination mechanism */
    type: EliminationType;
    /** Additional context */
    context?: EliminationGroup["context"];
  };
  /** How the clue is delivered */
  delivery: {
    type: ClueDeliveryType;
    speaker: ClueSpeaker;
  };
  /** Narrative connections */
  narrative: {
    /** References to earlier clue positions */
    references?: number[];
    /** Thread this clue belongs to */
    threadId?: string;
    /** Tone for this clue */
    tone: ClueTone;
  };
  /** Generated text (filled in Phase 2) */
  text?: string;
}

// ============================================
// NARRATIVE THREADS
// ============================================

/**
 * A story thread connecting multiple clues
 */
export interface NarrativeThread {
  /** Unique thread identifier */
  id: string;
  /** Human-readable thread name */
  name: string;
  /** Elements involved in this thread */
  involvedElements: {
    suspects?: string[];
    items?: string[];
    locations?: string[];
    times?: string[];
  };
  /** Positions of clues in this thread */
  cluePositions: number[];
  /** Whether this thread is a red herring */
  isRedHerring: boolean;
}

// ============================================
// RED HERRINGS
// ============================================

/**
 * Types of red herrings
 */
export type RedHerringType =
  | "false_suspicion"       // Cast suspicion on an innocent
  | "misleading_evidence"   // Suggest wrong item/location
  | "suspicious_behavior";  // Describe suspicious but innocent activity

/**
 * A red herring element in the narrative
 */
export interface RedHerring {
  /** Type of misdirection */
  type: RedHerringType;
  /** What element is being falsely implicated */
  target: {
    category: EliminationCategory;
    elementId: string;
  };
  /** Which clue introduces this red herring */
  introducedInClue: number;
  /** Which clue resolves this red herring (if any) */
  resolvedInClue?: number;
  /** Text hint for the red herring */
  hint?: string;
}

// ============================================
// DRAMATIC EVENTS
// ============================================

/**
 * Purpose of a dramatic event
 */
export type DramaticEventPurpose = "tension" | "misdirection" | "revelation" | "atmosphere";

/**
 * A planned dramatic event
 */
export interface PlannedDramaticEvent {
  /** Triggers after this clue number */
  afterClue: number;
  /** Type of event (power_outage, argument, etc.) */
  eventType: string;
  /** Suspects involved in the event */
  involvedSuspects: string[];
  /** Why this event exists in the narrative */
  purpose: DramaticEventPurpose;
  /** Generated description (filled in Phase 2) */
  description?: string;
}

// ============================================
// ACT INFORMATION
// ============================================

/**
 * Information about a narrative act
 */
export interface ActInfo {
  /** Which act */
  act: NarrativeAct;
  /** Number of clues in this act */
  clueCount: number;
  /** Starting clue position */
  startPosition: number;
  /** Ending clue position */
  endPosition: number;
  /** Focus of this act */
  focus: string;
  /** Dominant tone */
  tone: ClueTone;
}

// ============================================
// VALIDATION
// ============================================

/**
 * Validation error
 */
export interface ValidationError {
  code: string;
  message: string;
  field?: string;
}

/**
 * Validation warning
 */
export interface ValidationWarning {
  code: string;
  message: string;
  suggestion?: string;
}

/**
 * Result of campaign validation
 */
export interface ValidationResult {
  /** Whether the campaign is valid */
  valid: boolean;
  /** Critical errors that must be fixed */
  errors: ValidationError[];
  /** Non-critical warnings */
  warnings: ValidationWarning[];
  /** Coverage statistics */
  coverage?: {
    suspects: { total: number; covered: number; missing: string[] };
    items: { total: number; covered: number; missing: string[] };
    locations: { total: number; covered: number; missing: string[] };
    times: { total: number; covered: number; missing: string[] };
  };
}

// ============================================
// CAMPAIGN PLAN (Master Type)
// ============================================

/**
 * Complete campaign plan - the source of truth for scenario generation
 */
export interface CampaignPlan {
  /** Unique campaign identifier */
  id: string;
  /** Random seed for reproducibility */
  seed: number;
  /** The solution (WHO/WHAT/WHERE/WHEN) */
  solution: {
    suspectId: string;
    itemId: string;
    locationId: string;
    timeId: string;
  };
  /** Selected theme */
  themeId: string;
  /** Difficulty level */
  difficulty: Difficulty;
  /** Elimination plans for each category */
  eliminationPlans: {
    suspects: CategoryEliminationPlan;
    items: CategoryEliminationPlan;
    locations: CategoryEliminationPlan;
    times: CategoryEliminationPlan;
  };
  /** Narrative arc structure */
  narrativeArc: {
    act1: ActInfo;
    act2: ActInfo;
    act3: ActInfo;
  };
  /** Sequenced clues (Phase 1 output) */
  clues: PlannedClue[];
  /** Narrative threads */
  threads: NarrativeThread[];
  /** Red herrings */
  redHerrings: RedHerring[];
  /** Dramatic events */
  dramaticEvents: PlannedDramaticEvent[];
  /** Validation result */
  validation: ValidationResult;
}

// ============================================
// API REQUEST/RESPONSE TYPES
// ============================================

/**
 * Request to generate a campaign/scenario
 */
export interface GenerateCampaignRequest {
  /** Desired difficulty */
  difficulty?: Difficulty;
  /** Specific theme ID */
  themeId?: string;
  /** Random seed for reproducibility */
  seed?: number;
  /** Exclude specific suspects from solution */
  excludeSuspects?: string[];
  /** Exclude specific items from solution */
  excludeItems?: string[];
  /** Exclude specific locations from solution */
  excludeLocations?: string[];
  /** Exclude specific times from solution */
  excludeTimes?: string[];
}

/**
 * Generated clue for the scenario
 */
export interface GeneratedClue {
  /** Clue ID */
  id: string;
  /** Position in sequence (1-based) */
  position: number;
  /** Delivery type */
  type: ClueDeliveryType;
  /** Who speaks this clue */
  speaker: ClueSpeaker;
  /** The clue text */
  text: string;
  /** Which act */
  act: NarrativeAct;
  /** What this clue eliminates */
  eliminates: {
    category: EliminationCategory;
    ids: string[];
    reason: string;
  };
}

/**
 * Dramatic event for the scenario
 */
export interface GeneratedDramaticEvent {
  /** Triggers after this clue number */
  afterClue: number;
  /** Event description */
  description: string;
  /** Suspects involved */
  affectedSuspects: string[];
}

/**
 * Complete generated scenario
 */
export interface GeneratedScenario {
  /** Scenario ID */
  id: string;
  /** Campaign plan this was generated from */
  campaignId: string;
  /** Theme information */
  theme: {
    id: string;
    name: string;
    description: string;
  };
  /** Solution (hidden from players) */
  solution: {
    suspectId: string;
    itemId: string;
    locationId: string;
    timeId: string;
  };
  /** Generated clues */
  clues: GeneratedClue[];
  /** Dramatic events */
  dramaticEvents: GeneratedDramaticEvent[];
  /** Narrative elements */
  narrative: {
    opening: string;
    setting: string;
    atmosphere: string;
    closing: string;
  };
  /** Metadata */
  metadata: {
    difficulty: Difficulty;
    totalClues: number;
    seed: number;
    createdAt: string;
    version: string;
  };
}
