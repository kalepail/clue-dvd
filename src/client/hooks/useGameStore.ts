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
  startedAt: string | null;

  // Revealed clues tracking
  revealedClueIds: string[];

  // Player setup
  players: {
    name: string;
    suspectId: string;
  }[];

  // Turn order state
  turnOrder: {
    name: string;
    suspectId: string;
  }[];
  currentTurnIndex: number;
  turnCount: number;

  // Secret passage tracking
  secretPassageUses: number;

  // Inspector interruptions
  interruptionCount: number;
  nextInterruptionAtMinutes: number | null;
  roomsUnlocked: boolean;

  // Inspector notes (private)
  readInspectorNotes: Record<string, string[]>;
  inspectorNoteAnnouncements: {
    note1: boolean;
    note2: boolean;
  };

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

function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function getNextInterruptionMinute(interruptionCount: number): number {
  if (interruptionCount <= 0) return 60;
  if (interruptionCount === 1) return 70;
  if (interruptionCount === 2) return 80;
  return 80 + 7 * (interruptionCount - 2);
}

function buildInterruptionMessage(game: LocalGame): string {
  const themeName = game.theme?.name || "the evening";
  const intros = [
    `Inspector Brown interrupts ${themeName}.`,
    `A firm knock interrupts ${themeName}.`,
    `Inspector Brown calls a halt to ${themeName}.`,
  ];
  const intro = intros[Math.floor(Math.random() * intros.length)];

  if (game.interruptionCount === 0) {
    return `${intro} The player with the most cards must turn in one card face up in the Evidence Room. If two or more players are tied for the most cards, each tied player must turn in one card. If you have no cards left, you are eliminated.`;
  }

  return `${intro} Each player must turn in one card face up in the Evidence Room. If you have no cards left, you are eliminated.`;
}

function buildRoomUnlockMessage(game: LocalGame): string {
  const lockedRooms = game.scenario.lockedRooms || [];
  const roomNames = lockedRooms.map((id) => getLocationName(id));

  if (roomNames.length === 0) {
    return "Inspector Brown announces that any locked doors may now be opened.";
  }

  return `Inspector Brown announces that the following locked rooms may now be opened: ${roomNames.join(", ")}.`;
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
    players?: { name: string; suspectId: string }[];
    useAI?: boolean;
  }): Promise<LocalGame> {
    const {
      themeId,
      difficulty = "intermediate",
      playerCount = 3,
      players = [],
      useAI = false,
    } = options;

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
      startedAt: null,
      revealedClueIds: [],
      players,
      turnOrder: [],
      currentTurnIndex: 0,
      turnCount: 0,
      secretPassageUses: 0,
      interruptionCount: 0,
      nextInterruptionAtMinutes: null,
      roomsUnlocked: false,
      readInspectorNotes: {},
      inspectorNoteAnnouncements: { note1: false, note2: false },
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
    game.startedAt = new Date().toISOString();
    game.updatedAt = new Date().toISOString();
    game.interruptionCount = 0;
    game.nextInterruptionAtMinutes = getNextInterruptionMinute(0);
    game.roomsUnlocked = false;
    game.turnCount = 0;
    game.readInspectorNotes = {};
    game.inspectorNoteAnnouncements = { note1: false, note2: false };

    const resolvedPlayers = game.players.length > 0
      ? game.players
      : [{ name: "Detective", suspectId: "" }];
    game.turnOrder = shuffleArray(resolvedPlayers);
    game.currentTurnIndex = 0;

    // Add game started action
    const resolvedPlayerNames =
      playerNames ||
      game.players
        .map((player) => player.name.trim())
        .filter((name) => name.length > 0);
    this.addAction(game, "game_started", "system", {
      playerNames: resolvedPlayerNames.length > 0 ? resolvedPlayerNames : ["Detective"],
      playerSuspects: game.players.map((player) => ({
        suspectId: player.suspectId,
        suspectName: getSuspectName(player.suspectId),
      })),
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

    if (game.status === "in_progress") {
      this.advanceTurn(game);
    }

    saveGamesToStorage(this.games);
    return { game, clue, dramaticEvent };
  }

  useSecretPassage(id: string): {
    outcome: "good" | "neutral" | "bad";
    description: string;
  } {
    const game = this.games[id];
    if (!game) throw new Error("Game not found");
    if (game.status !== "in_progress") throw new Error("Game not in progress");

    const outcome = this.rollSecretPassageOutcome();
    const description = this.buildSecretPassageDescription(game, outcome);
    game.secretPassageUses += 1;

    this.addAction(game, "secret_passage", "system", {
      outcome,
      description,
    });
    saveGamesToStorage(this.games);

    return { outcome, description };
  }

  triggerInspectorInterruption(id: string): {
    message: string;
    nextAtMinutes: number;
  } {
    const game = this.games[id];
    if (!game) throw new Error("Game not found");
    if (game.status !== "in_progress") throw new Error("Game not in progress");

    const message = buildInterruptionMessage(game);
    const currentCount = game.interruptionCount;
    const nextAtMinutes = getNextInterruptionMinute(currentCount + 1);

    game.interruptionCount += 1;
    game.nextInterruptionAtMinutes = nextAtMinutes;

    this.addAction(game, "inspector_interruption", "Inspector Brown", {
      type: "turn_in_card",
      message,
      nextAtMinutes,
      interruptionCount: game.interruptionCount,
    });

    saveGamesToStorage(this.games);
    return { message, nextAtMinutes };
  }

  triggerRoomUnlock(id: string): {
    message: string;
  } {
    const game = this.games[id];
    if (!game) throw new Error("Game not found");
    if (game.status !== "in_progress") throw new Error("Game not in progress");
    if (game.roomsUnlocked) {
      return { message: "All locked rooms are already unlocked." };
    }

    const message = buildRoomUnlockMessage(game);
    game.roomsUnlocked = true;

    this.addAction(game, "room_unlocked", "Inspector Brown", {
      message,
      rooms: game.scenario.lockedRooms || [],
    });

    saveGamesToStorage(this.games);
    return { message };
  }

  readInspectorNote(
    id: string,
    noteId: string,
    readerId: string
  ): { noteId: string; text: string } {
    const game = this.games[id];
    if (!game) throw new Error("Game not found");
    if (game.status !== "in_progress") throw new Error("Game not in progress");

    const note = game.scenario.inspectorNotes?.find((item) => item.id === noteId);
    if (!note) throw new Error("Inspector note not found");
    const alreadyRead = game.readInspectorNotes[readerId] || [];
    if (alreadyRead.includes(noteId)) {
      throw new Error("Inspector note already read");
    }

    game.readInspectorNotes = {
      ...game.readInspectorNotes,
      [readerId]: [...alreadyRead, noteId],
    };
    this.addAction(game, "inspector_interruption", "Inspector Brown", {
      type: "inspector_note",
      message: `Inspector's Note ${noteId} was reviewed.`,
      noteId,
      readerId,
    });

    saveGamesToStorage(this.games);

    return { noteId, text: note.text };
  }

  announceInspectorNote(id: string, noteId: "N1" | "N2"): { message: string } {
    const game = this.games[id];
    if (!game) throw new Error("Game not found");
    if (game.status !== "in_progress") throw new Error("Game not in progress");

    const key = noteId === "N1" ? "note1" : "note2";
    if (game.inspectorNoteAnnouncements[key]) {
      return { message: "Inspector Brown has already announced this note." };
    }

    game.inspectorNoteAnnouncements = {
      ...game.inspectorNoteAnnouncements,
      [key]: true,
    };

    const message = `Inspector Brown has discovered an important note that may help your investigation. Note ${noteId === "N1" ? "1" : "2"} is now available.`;
    this.addAction(game, "inspector_interruption", "Inspector Brown", {
      type: "inspector_note_available",
      message,
      noteId,
    });

    saveGamesToStorage(this.games);
    return { message };
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

    if (game.status === "in_progress") {
      this.advanceTurn(game);
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

  // Turn advance helper
  private advanceTurn(game: LocalGame): void {
    const order = game.turnOrder.length > 0 ? game.turnOrder : game.players;
    if (order.length === 0) return;
    game.turnOrder = order;
    game.currentTurnIndex = (game.currentTurnIndex + 1) % order.length;
    game.turnCount += 1;
    game.updatedAt = new Date().toISOString();
  }

  endTurn(id: string): void {
    const game = this.games[id];
    if (!game) throw new Error("Game not found");
    if (game.status !== "in_progress") throw new Error("Game not in progress");
    this.advanceTurn(game);
    saveGamesToStorage(this.games);
  }

  private rollSecretPassageOutcome(): "good" | "neutral" | "bad" {
    const roll = Math.random();
    if (roll < 0.2) return "good";
    if (roll < 0.8) return "neutral";
    return "bad";
  }

  private buildSecretPassageDescription(
    game: LocalGame,
    outcome: "good" | "neutral" | "bad"
  ): string {
    const themeName = game.theme?.name || "the evening";
    const openers = [
      `A hidden panel slides aside during ${themeName}.`,
      `You discover a concealed passage during ${themeName}.`,
      `The wall shifts in silence as ${themeName} unfolds.`,
    ];
    const intro = openers[Math.floor(Math.random() * openers.length)];

    if (outcome === "good") {
      return `${intro} You may privately examine one card from any player of your choosing.`;
    }
    if (outcome === "bad") {
      return `${intro} A misstep costs you. Reveal one of your own cards face up in the Evidence Room.`;
    }
    return `${intro} You slip through safely with no further consequence.`;
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

    const totalButlerClues = scenario.clues.filter((clue) => clue.type === "butler").length;
    const revealedButlerClues = revealedClues.filter((clue) => clue.type === "butler").length;

    const turnOrder = game.turnOrder.length > 0 ? game.turnOrder : game.players;
    const currentTurn = turnOrder.length > 0
      ? turnOrder[game.currentTurnIndex % turnOrder.length]
      : null;
    const currentTurnLabel = currentTurn?.suspectId
      ? getSuspectName(currentTurn.suspectId)
      : currentTurn?.name || null;

    return {
      id: game.id,
      status: game.status,
      theme: game.theme,
      difficulty: game.difficulty,
      playerCount: game.playerCount,
      createdAt: game.createdAt,
      updatedAt: game.updatedAt,
      startedAt: game.startedAt,
      turnOrder,
      currentTurnIndex: turnOrder.length > 0 ? game.currentTurnIndex : 0,
      currentTurn: currentTurn && currentTurnLabel ? {
        suspectId: currentTurn.suspectId,
        suspectName: currentTurnLabel,
        playerName: currentTurn.name,
      } : null,
      turnCount: game.turnCount,
      secretPassageUses: game.secretPassageUses,
      interruptionCount: game.interruptionCount,
      nextInterruptionAtMinutes: game.nextInterruptionAtMinutes,
      roomsUnlocked: game.roomsUnlocked,
      lockedRooms: scenario.lockedRooms || [],
      inspectorNotes: scenario.inspectorNotes || [],
      readInspectorNotes: game.readInspectorNotes,
      inspectorNoteAnnouncements: game.inspectorNoteAnnouncements,
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
      totalButlerClues,
      revealedButlerClues,
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
  startedAt: string | null;
  turnOrder: { name: string; suspectId: string }[];
  currentTurnIndex: number;
  currentTurn: { suspectId: string; suspectName: string; playerName: string } | null;
  turnCount: number;
  secretPassageUses: number;
  interruptionCount: number;
  nextInterruptionAtMinutes: number | null;
  roomsUnlocked: boolean;
  lockedRooms: string[];
  inspectorNotes: { id: string; text: string; relatedClues?: number[] }[];
  readInspectorNotes: Record<string, string[]>;
  inspectorNoteAnnouncements: { note1: boolean; note2: boolean };
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
  totalButlerClues: number;
  revealedButlerClues: number;
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
