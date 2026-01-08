/**
 * Clue DVD Game - Game Session Types
 *
 * Types for persistent game sessions, actions, and state management.
 */

// ============================================
// GAME STATUS
// ============================================

export type GameStatus = "setup" | "in_progress" | "solved" | "abandoned";
export type GamePhase = "setup" | "investigation" | "accusation" | "resolution";
export type SetupType = "dvd" | "direct";
export type Difficulty = "beginner" | "intermediate" | "expert";

// ============================================
// ACTION TYPES
// ============================================

export type ActionType =
  | "game_started"
  | "clue_revealed"
  | "suggestion_made"
  | "suggestion_disproved"
  | "accusation_made"
  | "accusation_correct"
  | "accusation_wrong"
  | "card_shown"
  | "player_eliminated"
  | "game_won"
  | "game_abandoned"
  | "dramatic_event"
  | "note_taken";

// ============================================
// ACTION DETAILS (by type)
// ============================================

export interface GameStartedDetails {
  playerNames: string[];
  setupType: SetupType;
}

export interface ClueRevealedDetails {
  clueIndex: number;
  clueType: "butler" | "inspector" | "observation";
  clueText: string;
  speaker: string;
  eliminates?: {
    suspects?: string[];
    items?: string[];
    locations?: string[];
    times?: string[];
  };
}

export interface SuggestionDetails {
  suspectId: string;
  itemId: string;
  locationId: string;
  timeId: string;
  suspectName: string;
  itemName: string;
  locationName: string;
  timeName: string;
}

export interface SuggestionDisprovedDetails extends SuggestionDetails {
  disprovedBy: string;
  cardShown?: string; // Only visible to suggesting player
  cardCategory?: "suspect" | "item" | "location" | "time";
}

export interface AccusationDetails extends SuggestionDetails {
  correct: boolean;
}

export interface CardShownDetails {
  shownTo: string;
  shownBy: string;
  cardId: string;
  cardName: string;
  cardCategory: "suspect" | "item" | "location" | "time";
}

export interface DramaticEventDetails {
  description: string;
  affectedSuspects: string[];
  triggerAfterClue: number;
}

export interface NoteTakenDetails {
  player: string;
  note: string;
  category?: "suspect" | "item" | "location" | "time" | "general";
  relatedId?: string;
}

export type ActionDetails =
  | GameStartedDetails
  | ClueRevealedDetails
  | SuggestionDetails
  | SuggestionDisprovedDetails
  | AccusationDetails
  | CardShownDetails
  | DramaticEventDetails
  | NoteTakenDetails
  | Record<string, unknown>;

// ============================================
// GAME ACTION
// ============================================

export interface GameAction {
  id?: number;
  gameId: string;
  createdAt: string;
  sequenceNumber: number;
  actor: string;
  actionType: ActionType;
  details: ActionDetails;
  clueIndex?: number;
}

// ============================================
// GAME STATE
// ============================================

export interface GameState {
  gameId: string;
  updatedAt: string;
  currentClueIndex: number;
  eliminatedSuspects: string[];
  eliminatedItems: string[];
  eliminatedLocations: string[];
  eliminatedTimes: string[];
  playerNotes: Record<string, string[]>;
  phase: GamePhase;
  currentPlayer?: string;
  wrongAccusations: number;
}

// ============================================
// GAME SESSION (Full game record)
// ============================================

export interface GameSession {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: GameStatus;

  // Solution (hidden until game ends)
  solution: {
    suspectId: string;
    itemId: string;
    locationId: string;
    timeId: string;
  };

  // Configuration
  themeId: string;
  difficulty: Difficulty;
  playerCount: number;
  setupType: SetupType;
  seed?: number;

  // AI narrative
  narrative?: string;

  // Setup instructions
  setupInstructions?: string;

  // Clues for this game
  clues: GameClue[];
}

export interface GameClue {
  index: number;
  type: "butler" | "inspector" | "observation";
  speaker: string;
  text: string;
  revealed: boolean;
  eliminates?: {
    suspects?: string[];
    items?: string[];
    locations?: string[];
    times?: string[];
  };
}

// ============================================
// API REQUEST/RESPONSE TYPES
// ============================================

export interface CreateGameRequest {
  playerCount?: number;
  playerNames?: string[];
  difficulty?: Difficulty;
  themeId?: string;
  setupType?: SetupType;
  seed?: number;
}

export interface CreateGameResponse {
  success: boolean;
  gameId: string;
  setupInstructions: string[];
  narrative?: {
    opening: string;
    atmosphere: string;
  };
  playerCount: number;
  difficulty: Difficulty;
  theme: {
    id: string;
    name: string;
    description: string;
  };
}

export interface GameProgressResponse {
  gameId: string;
  status: GameStatus;
  phase: GamePhase;
  currentClueIndex: number;
  totalClues: number;
  eliminated: {
    suspects: string[];
    items: string[];
    locations: string[];
    times: string[];
  };
  remaining: {
    suspects: number;
    items: number;
    locations: number;
    times: number;
  };
  recentActions: GameAction[];
  canRevealClue: boolean;
  canMakeAccusation: boolean;
}

export interface RevealClueResponse {
  success: boolean;
  clue: GameClue;
  clueNumber: number;
  totalClues: number;
  dramaticEvent?: DramaticEventDetails;
  newEliminations?: {
    suspects?: string[];
    items?: string[];
    locations?: string[];
    times?: string[];
  };
}

export interface MakeAccusationRequest {
  suspectId: string;
  itemId: string;
  locationId: string;
  timeId: string;
  player: string;
}

export interface MakeAccusationResponse {
  success: boolean;
  correct: boolean;
  message: string;
  solution?: {
    suspect: { id: string; name: string };
    item: { id: string; name: string };
    location: { id: string; name: string };
    time: { id: string; name: string };
  };
  closingNarration?: string;
  wrongAccusations?: number;
}

export interface GameHistoryResponse {
  gameId: string;
  status: GameStatus;
  createdAt: string;
  endedAt?: string;
  duration?: string;
  solution: {
    suspect: string;
    item: string;
    location: string;
    time: string;
  };
  winner?: string;
  totalActions: number;
  cluesRevealed: number;
  totalClues: number;
  wrongAccusations: number;
  actions: GameAction[];
}
