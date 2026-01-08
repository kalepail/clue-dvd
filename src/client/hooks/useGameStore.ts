/**
 * Client-Side Game State Manager
 *
 * Manages game state locally using localStorage.
 * Games are created by calling the scenario generation API,
 * then all gameplay (clue revelation, accusations) happens client-side.
 */

import type { GeneratedScenario, GeneratedClue, Difficulty } from "../../types/campaign";
import {
  SUSPECTS,
  ITEMS,
  LOCATIONS,
  TIMES,
  THEMES,
  getSuspectName,
  getItemName,
  getLocationName,
  getTimeName,
} from "../../shared/game-elements";
import type {
  GameStatus,
  GamePhase,
  EliminationState,
  RemainingCounts,
  GameAction,
  ActionType,
} from "../../shared/api-types";

// ============================================
// LOCAL GAME TYPES
// ============================================

export interface LocalGame {
  // Core info
  id: string;
  status: GameStatus;
  theme: {
    id: string;
    name: string;
    description: string;
  } | null;
  difficulty: Difficulty;
  playerCount: number;
  createdAt: string;
  updatedAt: string;

  // The generated scenario (contains clues, solution, etc.)
  scenario: GeneratedScenario;

  // Current game state
  currentClueIndex: number;
  phase: GamePhase;
  wrongAccusations: number;
  currentPlayer: string | null;

  // Revealed clues tracking
  revealedClueIds: string[];

  // Action history (local)
  actions: GameAction[];
}

export interface LocalGameListItem {
  id: string;
  status: GameStatus;
  theme: { id: string; name: string; description: string } | null;
  difficulty: Difficulty;
  playerCount: number;
  createdAt: string;
  cluesRevealed: number;
  totalClues: number;
}

// ============================================
// LOCAL STORAGE KEY
// ============================================

const GAMES_STORAGE_KEY = "clue-dvd-games";

// ============================================
// STORAGE FUNCTIONS
// ============================================

function loadGamesFromStorage(): Record<string, LocalGame> {
  try {
    const stored = localStorage.getItem(GAMES_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error("Failed to load games from storage:", e);
  }
  return {};
}

function saveGamesToStorage(games: Record<string, LocalGame>): void {
  try {
    localStorage.setItem(GAMES_STORAGE_KEY, JSON.stringify(games));
  } catch (e) {
    console.error("Failed to save games to storage:", e);
  }
}

function generateId(): string {
  return `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================
// GAME STORE CLASS
// ============================================

class GameStore {
  private games: Record<string, LocalGame>;

  constructor() {
    this.games = loadGamesFromStorage();
  }

  // List all games
  listGames(): LocalGameListItem[] {
    return Object.values(this.games)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((game) => ({
        id: game.id,
        status: game.status,
        theme: game.theme,
        difficulty: game.difficulty,
        playerCount: game.playerCount,
        createdAt: game.createdAt,
        cluesRevealed: game.revealedClueIds.length,
        totalClues: game.scenario.clues.length,
      }));
  }

  // Get a single game
  getGame(id: string): LocalGame | null {
    return this.games[id] || null;
  }

  // Create a new game from a scenario
  async createGame(options: {
    themeId?: string;
    difficulty?: Difficulty;
    playerCount?: number;
    useAI?: boolean;
  }): Promise<LocalGame> {
    const { themeId, difficulty = "intermediate", playerCount = 3, useAI = false } = options;

    // Call the scenario generation API
    const endpoint = useAI ? "/api/scenarios/generate-enhanced" : "/api/scenarios/generate";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ themeId, difficulty }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(error.error || "Failed to generate scenario");
    }

    const result = await response.json() as { success: boolean; scenario?: GeneratedScenario; error?: string };
    if (!result.success || !result.scenario) {
      throw new Error(result.error || "Failed to generate scenario");
    }

    const scenario = result.scenario;
    const theme = THEMES.find((t) => t.id === scenario.theme.id);

    const game: LocalGame = {
      id: generateId(),
      status: "setup",
      theme: theme ? { id: theme.id, name: theme.name, description: theme.description } : null,
      difficulty: scenario.metadata.difficulty,
      playerCount,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      scenario,
      currentClueIndex: 0,
      phase: "setup",
      wrongAccusations: 0,
      currentPlayer: null,
      revealedClueIds: [],
      actions: [],
    };

    this.games[game.id] = game;
    saveGamesToStorage(this.games);

    return game;
  }

  // Start a game
  startGame(id: string, playerNames?: string[]): LocalGame {
    const game = this.games[id];
    if (!game) throw new Error("Game not found");
    if (game.status !== "setup") throw new Error("Game already started");

    game.status = "in_progress";
    game.phase = "investigation";
    game.updatedAt = new Date().toISOString();

    // Add game started action
    this.addAction(game, "game_started", "system", {
      playerNames: playerNames || ["Detective"],
      difficulty: game.difficulty,
      totalClues: game.scenario.clues.length,
    });

    saveGamesToStorage(this.games);
    return game;
  }

  // Reveal next clue
  revealNextClue(id: string): { game: LocalGame; clue: GeneratedClue | null; dramaticEvent?: { description: string; affectedSuspects: string[] } } {
    const game = this.games[id];
    if (!game) throw new Error("Game not found");
    if (game.status !== "in_progress") throw new Error("Game not in progress");

    const clueIndex = game.currentClueIndex;
    if (clueIndex >= game.scenario.clues.length) {
      return { game, clue: null };
    }

    const clue = game.scenario.clues[clueIndex];
    game.currentClueIndex++;
    game.revealedClueIds.push(clue.id);
    game.updatedAt = new Date().toISOString();

    // Add clue revealed action
    this.addAction(game, "clue_revealed", clue.speaker, {
      clueNumber: clue.position,
      clueType: clue.type,
      clueText: clue.text,
      eliminates: clue.eliminates,
    });

    // Check for dramatic event
    const dramaticEvent = game.scenario.dramaticEvents.find(
      (e) => e.afterClue === clueIndex + 1
    );

    if (dramaticEvent) {
      this.addAction(game, "dramatic_event", "system", {
        description: dramaticEvent.description,
        affectedSuspects: dramaticEvent.affectedSuspects,
      });
    }

    saveGamesToStorage(this.games);
    return { game, clue, dramaticEvent };
  }

  // Make an accusation
  makeAccusation(
    id: string,
    accusation: {
      player: string;
      suspectId: string;
      itemId: string;
      locationId: string;
      timeId: string;
    }
  ): {
    correct: boolean;
    message: string;
    solution?: {
      suspectId: string;
      suspectName: string;
      itemId: string;
      itemName: string;
      locationId: string;
      locationName: string;
      timeId: string;
      timeName: string;
    };
  } {
    const game = this.games[id];
    if (!game) throw new Error("Game not found");
    if (game.status !== "in_progress") throw new Error("Game not in progress");

    const solution = game.scenario.solution;
    const correct =
      accusation.suspectId === solution.suspectId &&
      accusation.itemId === solution.itemId &&
      accusation.locationId === solution.locationId &&
      accusation.timeId === solution.timeId;

    // Add accusation action
    this.addAction(game, "accusation_made", accusation.player, {
      suspectId: accusation.suspectId,
      suspectName: getSuspectName(accusation.suspectId),
      itemId: accusation.itemId,
      itemName: getItemName(accusation.itemId),
      locationId: accusation.locationId,
      locationName: getLocationName(accusation.locationId),
      timeId: accusation.timeId,
      timeName: getTimeName(accusation.timeId),
    });

    if (correct) {
      game.status = "solved";
      game.phase = "resolution";
      this.addAction(game, "accusation_correct", accusation.player, {
        message: "The mystery has been solved!",
      });
    } else {
      game.wrongAccusations++;
      this.addAction(game, "accusation_wrong", accusation.player, {
        message: "Wrong accusation!",
        wrongAccusations: game.wrongAccusations,
      });
    }

    game.updatedAt = new Date().toISOString();
    saveGamesToStorage(this.games);

    const fullSolution = {
      suspectId: solution.suspectId,
      suspectName: getSuspectName(solution.suspectId),
      itemId: solution.itemId,
      itemName: getItemName(solution.itemId),
      locationId: solution.locationId,
      locationName: getLocationName(solution.locationId),
      timeId: solution.timeId,
      timeName: getTimeName(solution.timeId),
    };

    return {
      correct,
      message: correct
        ? "Congratulations! You solved the mystery!"
        : "That's not correct. The investigation continues...",
      solution: correct ? fullSolution : undefined,
    };
  }

  // Get game history
  getHistory(id: string): GameAction[] {
    const game = this.games[id];
    if (!game) return [];
    return game.actions;
  }

  // Delete a game
  deleteGame(id: string): void {
    delete this.games[id];
    saveGamesToStorage(this.games);
  }

  // Abandon a game
  abandonGame(id: string): LocalGame {
    const game = this.games[id];
    if (!game) throw new Error("Game not found");

    game.status = "abandoned";
    game.phase = "resolution";
    game.updatedAt = new Date().toISOString();

    this.addAction(game, "game_abandoned", "system", {
      message: "Game abandoned",
      cluesRevealed: game.revealedClueIds.length,
      totalClues: game.scenario.clues.length,
    });

    saveGamesToStorage(this.games);
    return game;
  }

  // Helper to add action
  private addAction(
    game: LocalGame,
    actionType: ActionType,
    actor: string,
    details: Record<string, unknown>
  ): void {
    const action: GameAction = {
      gameId: game.id,
      createdAt: new Date().toISOString(),
      sequenceNumber: game.actions.length + 1,
      actor,
      actionType,
      details,
      clueIndex: game.currentClueIndex,
    };
    game.actions.push(action);
  }

  // Get full game data formatted for frontend
  getGameData(id: string): GameDataFormatted | null {
    const game = this.games[id];
    if (!game) return null;

    const scenario = game.scenario;
    const solution = scenario.solution;

    // Calculate eliminated elements from revealed clues
    const eliminated: EliminationState = {
      suspects: [],
      items: [],
      locations: [],
      times: [],
    };

    for (const clueId of game.revealedClueIds) {
      const clue = scenario.clues.find((c) => c.id === clueId);
      if (clue?.eliminates) {
        const categoryKey = `${clue.eliminates.category}s` as keyof EliminationState;
        eliminated[categoryKey] = [...eliminated[categoryKey], ...clue.eliminates.ids];
      }
    }

    // Deduplicate
    eliminated.suspects = [...new Set(eliminated.suspects)];
    eliminated.items = [...new Set(eliminated.items)];
    eliminated.locations = [...new Set(eliminated.locations)];
    eliminated.times = [...new Set(eliminated.times)];

    const remaining: RemainingCounts = {
      suspects: SUSPECTS.length - eliminated.suspects.length,
      items: ITEMS.length - eliminated.items.length,
      locations: LOCATIONS.length - eliminated.locations.length,
      times: TIMES.length - eliminated.times.length,
    };

    const revealedClues = game.revealedClueIds.map((clueId) => {
      const clue = scenario.clues.find((c) => c.id === clueId)!;
      return {
        index: clue.position,
        type: clue.type as "butler" | "inspector" | "observation",
        speaker: clue.speaker,
        text: clue.text,
        eliminates: clue.eliminates ? {
          suspects: clue.eliminates.category === "suspect" ? clue.eliminates.ids : [],
          items: clue.eliminates.category === "item" ? clue.eliminates.ids : [],
          locations: clue.eliminates.category === "location" ? clue.eliminates.ids : [],
          times: clue.eliminates.category === "time" ? clue.eliminates.ids : [],
        } : undefined,
      };
    });

    return {
      id: game.id,
      status: game.status,
      theme: game.theme,
      difficulty: game.difficulty,
      playerCount: game.playerCount,
      createdAt: game.createdAt,
      updatedAt: game.updatedAt,
      currentClueIndex: game.currentClueIndex,
      totalClues: scenario.clues.length,
      cluesRemaining: scenario.clues.length - game.currentClueIndex,
      phase: game.phase,
      wrongAccusations: game.wrongAccusations,
      currentPlayer: game.currentPlayer,
      eliminated,
      remaining,
      revealedClues,
      solution: game.status === "solved" || game.status === "setup" ? {
        suspectId: solution.suspectId,
        suspectName: getSuspectName(solution.suspectId),
        itemId: solution.itemId,
        itemName: getItemName(solution.itemId),
        locationId: solution.locationId,
        locationName: getLocationName(solution.locationId),
        timeId: solution.timeId,
        timeName: getTimeName(solution.timeId),
      } : null,
      narrative: scenario.narrative,
    };
  }
}

// Extended type for formatted game data
export interface GameDataFormatted {
  id: string;
  status: GameStatus;
  theme: { id: string; name: string; description: string } | null;
  difficulty: Difficulty;
  playerCount: number;
  createdAt: string;
  updatedAt: string;
  currentClueIndex: number;
  totalClues: number;
  cluesRemaining: number;
  phase: GamePhase;
  wrongAccusations: number;
  currentPlayer: string | null;
  eliminated: EliminationState;
  remaining: RemainingCounts;
  revealedClues: {
    index: number;
    type: "butler" | "inspector" | "observation";
    speaker: string;
    text: string;
    eliminates?: EliminationState;
  }[];
  solution: {
    suspectId: string;
    suspectName: string;
    itemId: string;
    itemName: string;
    locationId: string;
    locationName: string;
    timeId: string;
    timeName: string;
  } | null;
  narrative: {
    opening: string;
    setting: string;
    atmosphere: string;
    closing: string;
  };
}

// Singleton instance
export const gameStore = new GameStore();
