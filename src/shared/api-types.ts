/**
 * Shared API Types
 *
 * Request and response types for all API endpoints.
 * Used by both frontend and backend for type safety.
 */

// ============================================
// COMMON TYPES
// ============================================

export type GameStatus = "setup" | "in_progress" | "solved" | "abandoned";
export type GamePhase = "setup" | "investigation" | "accusation" | "resolution";
export type Difficulty = "beginner" | "intermediate" | "expert";
export type ClueType = "butler" | "inspector" | "observation";

// ============================================
// SOLUTION
// ============================================

export interface Solution {
  suspectId: string;
  suspectName: string;
  itemId: string;
  itemName: string;
  locationId: string;
  locationName: string;
  timeId: string;
  timeName: string;
}

// ============================================
// THEME
// ============================================

export interface ThemeInfo {
  id: string;
  name: string;
  description: string;
  period?: string;
}

// ============================================
// ELIMINATION STATE
// ============================================

export interface EliminationState {
  suspects: string[];
  items: string[];
  locations: string[];
  times: string[];
}

export interface RemainingCounts {
  suspects: number;
  items: number;
  locations: number;
  times: number;
}

// ============================================
// CLUE
// ============================================

export interface ClueData {
  index: number;
  type: ClueType;
  speaker: string;
  text: string;
  revealed: boolean;
  eliminates?: EliminationState;
}

export interface RevealedClue {
  index: number;
  type: ClueType;
  speaker: string;
  text: string;
  enhancedText?: string;
  eliminates?: EliminationState;
}

// ============================================
// GAME LIST ITEM (for homepage)
// ============================================

export interface GameListItem {
  id: string;
  status: GameStatus;
  theme: ThemeInfo | null;
  difficulty: Difficulty;
  playerCount: number;
  createdAt: string;
  cluesRevealed: number;
  totalClues: number;
}

// ============================================
// FULL GAME DATA (for game page)
// ============================================

export interface GameInfo {
  id: string;
  status: GameStatus;
  theme: ThemeInfo | null;
  difficulty: Difficulty;
  playerCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface GameState {
  currentClueIndex: number;
  totalClues: number;
  cluesRemaining: number;
  phase: GamePhase;
  wrongAccusations: number;
  currentPlayer: string | null;
}

export interface GameData {
  /** Core game info */
  id: string;
  status: GameStatus;
  theme: ThemeInfo | null;
  difficulty: Difficulty;
  playerCount: number;
  createdAt: string;
  updatedAt: string;

  /** Current game state */
  currentClueIndex: number;
  totalClues: number;
  cluesRemaining: number;
  phase: GamePhase;
  wrongAccusations: number;
  currentPlayer: string | null;

  /** Elimination tracking */
  eliminated: EliminationState;
  remaining: RemainingCounts;

  /** Revealed clues */
  revealedClues: RevealedClue[];

  /** Solution (only when game is solved) */
  solution: Solution | null;
}

// ============================================
// API REQUESTS
// ============================================

export interface CreateGameRequest {
  themeId?: string;
  difficulty?: Difficulty;
  playerCount?: number;
  seed?: number;
}

export interface StartGameRequest {
  playerNames?: string[];
}

export interface MakeAccusationRequest {
  player: string;
  suspectId: string;
  itemId: string;
  locationId: string;
  timeId: string;
}

export interface AddNoteRequest {
  player: string;
  note: string;
}

export type MarkCategory = "suspect" | "item" | "location" | "time";

export interface ToggleMarkRequest {
  category: MarkCategory;
  elementId: string;
}

// ============================================
// API RESPONSES
// ============================================

export interface ApiResponse {
  success: boolean;
  error?: string;
}

export interface ListGamesResponse extends ApiResponse {
  count: number;
  total: number;
  games: GameListItem[];
}

export interface CreateGameResponse extends ApiResponse {
  gameId: string;
  status: GameStatus;
  setupInstructions: string[];
  playerCount: number;
  difficulty: Difficulty;
  theme: ThemeInfo | null;
  totalClues: number;
  message: string;
}

export interface GetGameResponse extends ApiResponse, GameData {}

export interface StartGameResponse extends ApiResponse {
  message: string;
  gameId: string;
  status: GameStatus;
  phase: GamePhase;
  opening?: string;
  nextAction: string;
}

export interface RevealClueResponse extends ApiResponse {
  clue: {
    number: number;
    totalClues: number;
    type: ClueType;
    speaker: string;
    text: string;
    enhancedText?: string;
    eliminates?: EliminationState;
  };
  eliminated?: {
    type: string;
    id: string;
    name: string;
  };
  dramaticEvent?: {
    description: string;
    affectedSuspects: string[];
  } | null;
  cluesRemaining: number;
  aiEnhanced: boolean;
}

export interface MakeAccusationResponse extends ApiResponse {
  correct: boolean;
  message: string;
  aiResponse?: string;
  solution?: Solution;
  wrongAccusations?: number;
  closingNarration?: string;
}

export interface ToggleMarkResponse extends ApiResponse {
  marked: boolean;
  eliminated: string[];
}

// ============================================
// GAME HISTORY
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

export interface GameAction {
  id?: number;
  gameId: string;
  createdAt: string;
  sequenceNumber: number;
  actor: string;
  actionType: ActionType;
  details: Record<string, unknown>;
  clueIndex?: number;
}

export interface GameHistoryResponse extends ApiResponse {
  gameId: string;
  actions: GameAction[];
}
