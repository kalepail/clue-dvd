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
import { createActionToken, resolveCurrentActor } from "./turn-authority";

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
  // Butler summons stay pending until the physical Pantry draw is confirmed.
  // The token correlates an acknowledgement to this exact pending draw; the
  // source event id records which phone event initiated the summon (null for
  // host-local summons) so phone acknowledgements can be matched exactly.
  pendingPantryDrawClueNumber: number | null;
  pendingPantryDrawToken: string | null;
  pendingPantryDrawSourceEventId: number | null;

  // Player setup
  players: {
    name: string;
    suspectId: string;
  }[];

  // Phone companion session link (optional)
  phoneSessionCode?: string | null;

  // Turn order state
  turnOrder: {
    name: string;
    suspectId: string;
  }[];
  currentTurnIndex: number;
  turnCount: number;
  // Pawns removed from rotation after failing to pay an accusation penalty
  eliminatedSuspectIds: string[];
  // Wrong accusations stay pending until the item-card payment is resolved;
  // the token correlates a payment confirmation to this exact penalty
  pendingAccusationPenalty: {
    playerName: string;
    playerSuspectId: string;
    wrongCount: number;
    token: string;
    turnCount: number;
    // Phone event that initiated the accusation; null for host-local ones
    sourceEventId: number | null;
  } | null;
  // Turn number of the last turn-consuming action (one action per turn)
  turnActionTakenAt: number | null;

  // Secret passage tracking
  secretPassageUses: number;
  secretPassageTurnUsedAt: number | null;

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
  inspectorNoteTurnUsedAt: Record<string, number>;

  // Win state
  solvedBy: {
    playerName: string;
    suspectId: string;
  } | null;

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

export interface GenerationProgress {
  stage: string;
  message: string;
  progress: number;
  elapsedMs: number;
}

type ScenarioStreamEvent =
  | ({ type: "progress" } & GenerationProgress)
  | { type: "complete"; success: true; scenario: GeneratedScenario }
  | { type: "error"; success: false; error: string };

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
      const games = JSON.parse(stored) as Record<string, LocalGame>;
      // Migrate games saved before the physical-workflow fields existed
      for (const game of Object.values(games)) {
        game.pendingPantryDrawClueNumber ??= null;
        game.pendingPantryDrawToken ??= game.pendingPantryDrawClueNumber !== null
          ? createActionToken("pantry", game.turnCount ?? 0, game.actions?.length ?? 0)
          : null;
        game.pendingPantryDrawSourceEventId ??= null;
        game.eliminatedSuspectIds ??= [];
        game.pendingAccusationPenalty ??= null;
        if (game.pendingAccusationPenalty) {
          game.pendingAccusationPenalty.token ??= createActionToken(
            "penalty",
            game.turnCount ?? 0,
            game.actions?.length ?? 0
          );
          game.pendingAccusationPenalty.turnCount ??= game.turnCount ?? 0;
          game.pendingAccusationPenalty.sourceEventId ??= null;
        }
        game.turnActionTakenAt ??= null;
      }
      return games;
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

export class GameStore {
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
    phoneSessionCode?: string | null;
    onGenerationProgress?: (progress: GenerationProgress) => void;
  }): Promise<LocalGame> {
    const {
      themeId,
      difficulty = "expert",
      playerCount = 3,
      players = [],
      useAI: _useAI = true,
      phoneSessionCode = null,
      onGenerationProgress,
    } = options;

    const recentGames = Object.values(this.games)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 5);
    const recentMysterySignatures = recentGames
      .map((game) => game.scenario.metadata.mysterySignature)
      .filter((signature): signature is string => Boolean(signature))
      .slice(0, 5);
    const recentCluePatternSignatures = recentGames
      .map((game) => game.scenario.metadata.cluePatternSignature)
      .filter((signature): signature is string => Boolean(signature))
      .slice(0, 5);

    // The streamed endpoint has no arbitrary overall timeout. It reports the
    // provider stage that is actually active and finishes with one scenario.
    const endpoint = "/api/scenarios/generate-stream";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ themeId, difficulty, recentMysterySignatures, recentCluePatternSignatures }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(error.error || "Failed to generate scenario");
    }

    if (!response.body) throw new Error("Mystery generation stream was unavailable.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let scenario: GeneratedScenario | null = null;
    let streamError: string | null = null;

    const consumeLine = (line: string) => {
      if (!line.trim()) return;
      let event: ScenarioStreamEvent;
      try {
        event = JSON.parse(line) as ScenarioStreamEvent;
      } catch {
        throw new Error("Mystery generation returned an invalid progress event.");
      }
      if (event.type === "progress") onGenerationProgress?.(event);
      if (event.type === "complete") scenario = event.scenario;
      if (event.type === "error") streamError = event.error;
    };

    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(consumeLine);
      if (done) break;
    }
    consumeLine(buffer);
    if (streamError) throw new Error(streamError);
    const completedScenario = scenario as GeneratedScenario | null;
    if (!completedScenario) throw new Error("Mystery generation ended before the case was ready.");

    const theme = THEMES.find((t) => t.id === completedScenario.theme.id);

    const game: LocalGame = {
      id: generateId(),
      status: "setup",
      theme: theme ? { id: theme.id, name: theme.name, description: theme.description } : null,
      difficulty: completedScenario.metadata.difficulty,
      playerCount,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      scenario: completedScenario,
      currentClueIndex: 0,
      phase: "setup",
      wrongAccusations: 0,
      currentPlayer: null,
      startedAt: null,
      revealedClueIds: [],
      pendingPantryDrawClueNumber: null,
      pendingPantryDrawToken: null,
      pendingPantryDrawSourceEventId: null,
      players,
      phoneSessionCode,
      turnOrder: [],
      currentTurnIndex: 0,
      turnCount: 0,
      eliminatedSuspectIds: [],
      pendingAccusationPenalty: null,
      turnActionTakenAt: null,
      secretPassageUses: 0,
      secretPassageTurnUsedAt: null,
      interruptionCount: 0,
      nextInterruptionAtMinutes: null,
      roomsUnlocked: false,
      readInspectorNotes: {},
      inspectorNoteAnnouncements: { note1: false, note2: false },
      inspectorNoteTurnUsedAt: {},
      solvedBy: null,
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
    game.pendingPantryDrawClueNumber = null;
    game.pendingPantryDrawToken = null;
    game.pendingPantryDrawSourceEventId = null;
    game.eliminatedSuspectIds = [];
    game.pendingAccusationPenalty = null;
    game.turnActionTakenAt = null;
    game.nextInterruptionAtMinutes = getNextInterruptionMinute(0);
    game.roomsUnlocked = false;
    game.turnCount = 0;
    game.readInspectorNotes = {};
    game.inspectorNoteAnnouncements = { note1: false, note2: false };
    game.solvedBy = null;
    game.secretPassageTurnUsedAt = null;
    game.inspectorNoteTurnUsedAt = {};

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

  // Reveal next clue. options.sourceEventId records the phone event that
  // initiated the summon so acknowledgements can be correlated exactly.
  revealNextClue(
    id: string,
    options?: { sourceEventId?: number | null }
  ): { game: LocalGame; clue: GeneratedClue | null; dramaticEvent?: { description: string; affectedSuspects: string[] } } {
    const game = this.games[id];
    if (!game) throw new Error("Game not found");
    if (game.status !== "in_progress") throw new Error("Game not in progress");
    if (game.pendingPantryDrawClueNumber !== null) {
      throw new Error("Acknowledge the previous Butler's Pantry draw first");
    }
    if (game.pendingAccusationPenalty) {
      throw new Error("Resolve the pending accusation's item-card payment first");
    }

    const clueIndex = game.currentClueIndex;
    if (clueIndex >= game.scenario.clues.length) {
      return { game, clue: null };
    }

    this.markTurnAction(game);
    const clue = game.scenario.clues[clueIndex];
    game.currentClueIndex++;
    game.revealedClueIds.push(clue.id);
    game.pendingPantryDrawClueNumber = clue.position;
    game.pendingPantryDrawToken = createActionToken("pantry", game.turnCount, game.actions.length);
    game.pendingPantryDrawSourceEventId = options?.sourceEventId ?? null;
    game.updatedAt = new Date().toISOString();

    // Add clue revealed action
    this.addAction(game, "clue_revealed", clue.speaker, {
      clueNumber: clue.position,
      clueType: clue.type,
      clueText: clue.text,
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

  /**
   * Records that the summoner physically took the top Butler's Pantry item
   * card. The card's identity is never entered into the app. The turn only
   * advances here, so a summon stays pending until the table confirms the
   * draw.
   *
   * The token must match the pending draw's token, so a delayed or replayed
   * acknowledgement can never resolve a later pending draw. Repeat
   * acknowledgements after resolution are no-ops.
   */
  acknowledgePantryDraw(id: string, token: string): void {
    const game = this.games[id];
    if (!game) throw new Error("Game not found");
    const clueNumber = game.pendingPantryDrawClueNumber;
    if (clueNumber === null) return;
    if (token !== game.pendingPantryDrawToken) {
      throw new Error("This acknowledgement does not match the pending Pantry draw");
    }
    this.addAction(game, "pantry_draw_acknowledged", "system", {
      clueNumber,
      identityTracked: false,
    });
    game.pendingPantryDrawClueNumber = null;
    game.pendingPantryDrawToken = null;
    game.pendingPantryDrawSourceEventId = null;
    if (game.status === "in_progress") this.advanceTurn(game);
    saveGamesToStorage(this.games);
  }

  /**
   * Records the physical suggestion ritual and ends the turn in one step.
   * Only the three categories are logged; card identities and the table's
   * response stay at the table. Pass expectedTurnCount to reject a
   * double-submitted suggestion after the turn already advanced.
   */
  recordSuggestion(id: string, categories: string[], expectedTurnCount?: number): void {
    const game = this.games[id];
    if (!game) throw new Error("Game not found");
    if (game.status !== "in_progress") throw new Error("Game not in progress");
    if (game.pendingPantryDrawClueNumber !== null || game.pendingAccusationPenalty) {
      throw new Error("Complete the current physical action before making a suggestion");
    }
    if (expectedTurnCount !== undefined && expectedTurnCount !== game.turnCount) {
      throw new Error("The turn already advanced; this suggestion was not recorded twice");
    }
    const allowed = new Set(["suspect", "item", "location", "time"]);
    const distinct = [...new Set(categories)];
    if (categories.length !== 3 || distinct.length !== 3 || distinct.some((category) => !allowed.has(category))) {
      throw new Error("A suggestion must name cards from exactly three different categories");
    }
    this.markTurnAction(game);
    this.addAction(game, "suggestion_made", game.turnOrder[game.currentTurnIndex]?.name ?? "Detective", {
      categories: distinct,
      omittedCategory: [...allowed].find((category) => !distinct.includes(category)),
      cardIdentitiesTracked: false,
    });
    this.advanceTurn(game);
    saveGamesToStorage(this.games);
  }

  useSecretPassage(id: string): {
    outcome: "good" | "neutral" | "bad";
    description: string;
  } {
    const game = this.games[id];
    if (!game) throw new Error("Game not found");
    if (game.status !== "in_progress") throw new Error("Game not in progress");
    if (game.pendingPantryDrawClueNumber !== null || game.pendingAccusationPenalty) {
      throw new Error("Complete the current physical action before using a passage");
    }

    if (game.secretPassageTurnUsedAt === game.turnCount) {
      throw new Error("Secret passage already used this turn");
    }
    // Deterministic physical movement: the printed passage on the board,
    // no random minigame outcome.
    const outcome = "neutral" as const;
    const description = "Move your pawn through the printed secret passage to its paired room. This is movement, not your turn action; choose one action after moving.";
    game.secretPassageUses += 1;
    game.secretPassageTurnUsedAt = game.turnCount;

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
    if (game.pendingPantryDrawClueNumber !== null || game.pendingAccusationPenalty) {
      throw new Error("Complete the current physical action before an Inspector interruption");
    }

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

  /**
   * Reads an inspector note. A first-time read is the turn's official action
   * and atomically ends the turn in the same committed state change, so a
   * refresh or failed result delivery can never strand the game with the
   * action marked but the turn never advanced. Re-reads of an already-read
   * note stay free and never advance the turn.
   */
  readInspectorNote(
    id: string,
    noteId: string,
    readerId: string
  ): { noteId: string; text: string; firstRead: boolean } {
    const game = this.games[id];
    if (!game) throw new Error("Game not found");
    if (game.status !== "in_progress") throw new Error("Game not in progress");

    const note = game.scenario.inspectorNotes?.find((item) => item.id === noteId);
    if (!note) throw new Error("Inspector note not found");
    const alreadyRead = game.readInspectorNotes[readerId] || [];
    if (alreadyRead.includes(noteId)) {
      return { noteId, text: note.text, firstRead: false };
    }
    if (game.pendingPantryDrawClueNumber !== null || game.pendingAccusationPenalty) {
      throw new Error("Complete the current physical action before reading a note");
    }
    const progress = game.scenario.clues.length > 0
      ? game.currentClueIndex / game.scenario.clues.length
      : 0;
    const noteAvailable = noteId === "N1" ? progress >= 0.5 : progress >= 0.65;
    if (!noteAvailable) {
      throw new Error("Inspector note not available yet");
    }
    if (game.inspectorNoteTurnUsedAt[readerId] === game.turnCount) {
      throw new Error("Inspector note already used this turn");
    }
    this.markTurnAction(game);

    game.readInspectorNotes = {
      ...game.readInspectorNotes,
      [readerId]: [...alreadyRead, noteId],
    };
    game.inspectorNoteTurnUsedAt = {
      ...game.inspectorNoteTurnUsedAt,
      [readerId]: game.turnCount,
    };
    this.addAction(game, "inspector_interruption", "Inspector Brown", {
      type: "inspector_note",
      message: `Inspector's Note ${noteId} was reviewed.`,
      noteId,
      readerId,
    });
    this.advanceTurn(game);

    saveGamesToStorage(this.games);

    return { noteId, text: note.text, firstRead: true };
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
      playerSuspectId: string;
      suspectId: string;
      itemId: string;
      locationId: string;
      timeId: string;
    },
    options?: { sourceEventId?: number | null }
  ): {
    correct: boolean;
    message: string;
    correctCount: number;
    wrongCount: number;
    penaltyToken?: string;
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
    if (game.pendingPantryDrawClueNumber !== null) {
      throw new Error("Acknowledge the Butler's Pantry draw before making an accusation");
    }
    if (game.pendingAccusationPenalty) {
      throw new Error("Resolve the previous accusation's item-card payment first");
    }
    if (typeof accusation.playerSuspectId !== "string") {
      throw new Error("An accusation must identify the accusing detective's pawn");
    }
    if (game.eliminatedSuspectIds.includes(accusation.playerSuspectId)) {
      throw new Error("An eliminated detective cannot make an accusation");
    }
    const currentActor = resolveCurrentActor(game);
    if (!currentActor) {
      throw new Error("No detective currently holds the turn");
    }
    if (currentActor.suspectId !== accusation.playerSuspectId) {
      throw new Error("Only the detective whose turn it is may make an accusation");
    }
    this.markTurnAction(game);

    const solution = game.scenario.solution;
    const correct =
      accusation.suspectId === solution.suspectId &&
      accusation.itemId === solution.itemId &&
      accusation.locationId === solution.locationId &&
      accusation.timeId === solution.timeId;

    const correctCount =
      (accusation.suspectId === solution.suspectId ? 1 : 0) +
      (accusation.itemId === solution.itemId ? 1 : 0) +
      (accusation.locationId === solution.locationId ? 1 : 0) +
      (accusation.timeId === solution.timeId ? 1 : 0);
    const wrongCount = 4 - correctCount;

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
      game.solvedBy = {
        playerName: accusation.player,
        suspectId: accusation.playerSuspectId || "",
      };
      this.addAction(game, "accusation_correct", accusation.player, {
        message: "The mystery has been solved!",
      });
    } else {
      game.wrongAccusations++;
      game.pendingAccusationPenalty = {
        playerName: accusation.player,
        playerSuspectId: accusation.playerSuspectId,
        wrongCount,
        token: createActionToken("penalty", game.turnCount, game.actions.length),
        turnCount: game.turnCount,
        sourceEventId: options?.sourceEventId ?? null,
      };
      this.addAction(game, "accusation_wrong", accusation.player, {
        message: "Wrong accusation!",
        wrongAccusations: game.wrongAccusations,
        itemCardsDue: wrongCount,
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
      correctCount,
      wrongCount,
      penaltyToken: game.pendingAccusationPenalty?.token,
      solution: correct ? fullSolution : undefined,
    };
  }

  /**
   * Completes the physical wrong-accusation ritual without recording card
   * identities. The host/player declares whether the required item cards were
   * paid; inability to pay removes that pawn from turn rotation.
   *
   * The token must match the pending penalty's token, so a delayed or
   * replayed confirmation can never resolve a later penalty. Repeat
   * resolutions after the penalty cleared are no-ops.
   */
  resolveAccusationPenalty(id: string, resolution: "paid" | "unable", token: string): void {
    const game = this.games[id];
    if (!game) throw new Error("Game not found");
    const pending = game.pendingAccusationPenalty;
    if (!pending) return;
    if (token !== pending.token) {
      throw new Error("This payment confirmation does not match the pending accusation penalty");
    }

    if (resolution === "paid") {
      this.addAction(game, "card_shown", pending.playerName, {
        destination: "Evidence Room",
        itemCardCount: pending.wrongCount,
        identitiesTracked: false,
        reason: "wrong_accusation",
      });
      game.pendingAccusationPenalty = null;
      this.advanceTurn(game);
    } else {
      if (pending.playerSuspectId) {
        if (!game.eliminatedSuspectIds.includes(pending.playerSuspectId)) {
          game.eliminatedSuspectIds.push(pending.playerSuspectId);
        }
        const removedIndex = game.turnOrder.findIndex((player) => player.suspectId === pending.playerSuspectId);
        if (removedIndex >= 0) {
          game.turnOrder = game.turnOrder.filter((player) => player.suspectId !== pending.playerSuspectId);
          if (removedIndex < game.currentTurnIndex) game.currentTurnIndex -= 1;
          if (game.turnOrder.length > 0) game.currentTurnIndex %= game.turnOrder.length;
          else game.currentTurnIndex = 0;
        }
      }
      this.addAction(game, "player_eliminated", pending.playerName, {
        suspectId: pending.playerSuspectId,
        reason: "unable_to_pay_item_card_penalty",
        itemCardsDue: pending.wrongCount,
      });
      game.pendingAccusationPenalty = null;
      if (game.turnOrder.length === 0 && game.players.length > 0) {
        // Every pawn is out of rotation: the case goes unsolved.
        game.status = "abandoned";
        game.phase = "resolution";
        this.addAction(game, "game_abandoned", "system", {
          message: "All detectives have been eliminated. The case goes unsolved.",
          cluesRevealed: game.revealedClueIds.length,
          totalClues: game.scenario.clues.length,
        });
      } else {
        game.turnCount += 1;
      }
      game.updatedAt = new Date().toISOString();
    }
    saveGamesToStorage(this.games);
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

  // One turn-consuming action (summon, suggestion, accusation) per turn
  private markTurnAction(game: LocalGame): void {
    if (game.turnActionTakenAt === game.turnCount) {
      throw new Error("An action has already been taken this turn");
    }
    game.turnActionTakenAt = game.turnCount;
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
    if (game.pendingPantryDrawClueNumber !== null || game.pendingAccusationPenalty) {
      throw new Error("Complete the current physical action before ending the turn");
    }
    this.advanceTurn(game);
    saveGamesToStorage(this.games);
  }

  // Get full game data formatted for frontend
  getGameData(id: string): GameDataFormatted | null {
    const game = this.games[id];
    if (!game) return null;

    const scenario = game.scenario;
    const solution = scenario.solution;

    // AI evidence is interpreted by players. Revealing a clue never marks a
    // card or publishes private validation effects automatically.
    const eliminated: EliminationState = {
      suspects: [],
      items: [],
      locations: [],
      times: [],
    };

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
      secretPassageTurnUsedAt: game.secretPassageTurnUsedAt ?? null,
      interruptionCount: game.interruptionCount,
      nextInterruptionAtMinutes: game.nextInterruptionAtMinutes,
      roomsUnlocked: game.roomsUnlocked,
      lockedRooms: scenario.lockedRooms || [],
      inspectorNotes: scenario.inspectorNotes || [],
      readInspectorNotes: game.readInspectorNotes,
      inspectorNoteAnnouncements: game.inspectorNoteAnnouncements,
      inspectorNoteTurnUsedAt: game.inspectorNoteTurnUsedAt,
      solvedBy: game.solvedBy,
      phoneSessionCode: game.phoneSessionCode ?? null,
      currentClueIndex: game.currentClueIndex,
      totalClues: scenario.clues.length,
      cluesRemaining: scenario.clues.length - game.currentClueIndex,
      pendingPantryDrawClueNumber: game.pendingPantryDrawClueNumber ?? null,
      pendingPantryDrawToken: game.pendingPantryDrawToken ?? null,
      phase: game.phase,
      wrongAccusations: game.wrongAccusations,
      eliminatedSuspectIds: game.eliminatedSuspectIds ?? [],
      pendingAccusationPenalty: game.pendingAccusationPenalty ?? null,
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
  phoneSessionCode?: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  turnOrder: { name: string; suspectId: string }[];
  currentTurnIndex: number;
  currentTurn: { suspectId: string; suspectName: string; playerName: string } | null;
  turnCount: number;
  secretPassageUses: number;
  secretPassageTurnUsedAt: number | null;
  interruptionCount: number;
  nextInterruptionAtMinutes: number | null;
  roomsUnlocked: boolean;
  lockedRooms: string[];
  inspectorNotes: { id: string; text: string; relatedClues?: number[] }[];
  readInspectorNotes: Record<string, string[]>;
  inspectorNoteAnnouncements: { note1: boolean; note2: boolean };
  inspectorNoteTurnUsedAt: Record<string, number>;
  solvedBy: { playerName: string; suspectId: string } | null;
  currentClueIndex: number;
  totalClues: number;
  cluesRemaining: number;
  pendingPantryDrawClueNumber: number | null;
  pendingPantryDrawToken: string | null;
  phase: GamePhase;
  wrongAccusations: number;
  eliminatedSuspectIds: string[];
  pendingAccusationPenalty: {
    playerName: string;
    playerSuspectId: string;
    wrongCount: number;
    token: string;
    turnCount: number;
    sourceEventId: number | null;
  } | null;
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
