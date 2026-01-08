/**
 * Clue DVD Game - Scenario Types
 * Types for AI-generated mystery scenarios
 */

import type { Suspect, Item, Location, TimePeriod, MysteryTheme } from "../data/game-elements";

// ============================================
// SOLUTION
// ============================================

export interface Solution {
  suspect: Suspect;
  item: Item;
  location: Location;
  time: TimePeriod;
}

// ============================================
// CLUES
// ============================================

export type ClueType = "butler" | "inspector_note" | "observation";

export interface Clue {
  id: string;
  type: ClueType;
  speaker: string;
  text: string;
  revealOrder: number;
  logic: ClueLogic;
}

export interface ClueLogic {
  eliminates: EliminationInfo[];
  reasoning: string;
}

export interface EliminationInfo {
  category: "suspect" | "item" | "location" | "time";
  ids: string[];
  reason: string;
}

// ============================================
// GAME SETUP
// ============================================

export interface LockedRoom {
  locationId: string;
  unlocksAfterClue: number;
}

export interface CardDistribution {
  caseFileEnvelope: {
    suspectId: string;
    itemId: string;
    locationId: string;
    timeId: string;
  };
  butlersPantry: string[]; // Item IDs for the deck
  availableForDealing: string[]; // Suspect, Location, Time IDs to deal to players
}

export interface GameSetup {
  lockedRooms: LockedRoom[];
  cardDistribution: CardDistribution;
  initialItemPlacements: ItemPlacement[];
}

export interface ItemPlacement {
  itemId: string;
  locationId: string;
  revealedAfterClue: number;
}

// ============================================
// SCENARIO
// ============================================

export interface Scenario {
  id: string;
  name: string;
  theme: MysteryTheme;
  narrative: ScenarioNarrative;
  solution: Solution;
  clues: Clue[];
  gameSetup: GameSetup;
  metadata: ScenarioMetadata;
}

export interface ScenarioNarrative {
  openingNarration: string;
  setting: string;
  atmosphericDescription: string;
  suspectBackstories: SuspectContext[];
  dramaticEvents: DramaticEvent[];
  closingNarration: string;
}

export interface SuspectContext {
  suspectId: string;
  motiveHint: string;
  alibiClaim: string;
  suspiciousBehavior: string;
}

export interface DramaticEvent {
  triggerAfterClue: number;
  description: string;
  affectedSuspects: string[];
}

export interface ScenarioMetadata {
  difficulty: "beginner" | "intermediate" | "expert";
  estimatedDuration: number; // minutes
  totalClues: number;
  createdAt: string;
  version: string;
}

// ============================================
// GENERATION REQUEST/RESPONSE
// ============================================

export interface GenerateScenarioRequest {
  theme?: string; // Optional theme ID, random if not specified
  difficulty?: "beginner" | "intermediate" | "expert";
  playerCount?: 3 | 4 | 5;
  excludeSuspects?: string[];
  excludeItems?: string[];
  excludeLocations?: string[];
  excludeTimes?: string[];
  seed?: number; // For reproducible generation
}

export interface GenerateScenarioResponse {
  success: boolean;
  scenario?: Scenario;
  error?: string;
}

// ============================================
// VALIDATION
// ============================================

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  code: string;
  message: string;
  field?: string;
}

export interface ValidationWarning {
  code: string;
  message: string;
  suggestion?: string;
}

// ============================================
// CLUE GENERATION
// ============================================

export interface ClueGenerationContext {
  solution: Solution;
  allSuspects: Suspect[];
  allItems: Item[];
  allLocations: Location[];
  allTimes: TimePeriod[];
  difficulty: "beginner" | "intermediate" | "expert";
  clueCount: number;
}

export interface GeneratedClue {
  text: string;
  type: ClueType;
  eliminates: EliminationInfo[];
}
