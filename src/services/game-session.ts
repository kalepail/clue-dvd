/**
 * Clue DVD Game - Game Session Service
 *
 * Manages persistent game sessions, tracks actions, and maintains game state.
 * All games are saved for posterity and can be walked through step by step.
 */

import type {
  GameSession,
  GameState,
  GameAction,
  GameClue,
  GameStatus,
  GamePhase,
  ActionType,
  ActionDetails,
  CreateGameRequest,
  Difficulty,
  SetupType,
  ClueRevealedDetails,
  AccusationDetails,
  DramaticEventDetails,
} from "../types/game-session";
import { generateScenario } from "./scenario-generator";
import { generateDVDSetup, generateDirectSetup } from "./setup-generator";
import { SUSPECTS, ITEMS, LOCATIONS, TIME_PERIODS, MYSTERY_THEMES } from "../data/game-elements";

// ============================================
// ID GENERATION
// ============================================

function generateGameId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `game_${timestamp}_${random}`;
}

// ============================================
// GAME CREATION
// ============================================

export async function createGame(
  db: D1Database,
  request: CreateGameRequest = {}
): Promise<{ game: GameSession; setupInstructions: string[] }> {
  const {
    playerCount = 3,
    difficulty = "intermediate",
    themeId,
    setupType = "dvd",
    seed,
  } = request;

  const gameId = generateGameId();
  const now = new Date().toISOString();

  // Generate scenario
  // Cast playerCount to valid range (3-5) for scenario generator
  const validPlayerCount = Math.max(3, Math.min(5, playerCount)) as 3 | 4 | 5;
  const scenario = generateScenario({
    playerCount: validPlayerCount,
    difficulty,
    theme: themeId,
    seed,
  });

  // Generate setup instructions
  const setup = setupType === "dvd"
    ? generateDVDSetup(seed)
    : generateDirectSetup(seed);

  // Convert scenario clues to game clues
  const clues: GameClue[] = scenario.clues.map((clue, index) => {
    // Convert from Clue.logic.eliminates format to GameClue.eliminates format
    const eliminates: GameClue["eliminates"] = {};
    if (clue.logic?.eliminates) {
      for (const elim of clue.logic.eliminates) {
        switch (elim.category) {
          case "suspect":
            eliminates.suspects = elim.ids;
            break;
          case "item":
            eliminates.items = elim.ids;
            break;
          case "location":
            eliminates.locations = elim.ids;
            break;
          case "time":
            eliminates.times = elim.ids;
            break;
        }
      }
    }
    return {
      index,
      type: clue.type as "butler" | "inspector" | "observation",
      speaker: clue.speaker,
      text: clue.text,
      revealed: false,
      eliminates: Object.keys(eliminates).length > 0 ? eliminates : undefined,
    };
  });

  // Create game record
  const game: GameSession = {
    id: gameId,
    createdAt: now,
    updatedAt: now,
    status: "setup",
    solution: {
      suspectId: scenario.solution.suspect.id,
      itemId: scenario.solution.item.id,
      locationId: scenario.solution.location.id,
      timeId: scenario.solution.time.id,
    },
    themeId: scenario.theme.id,
    difficulty,
    playerCount,
    setupType,
    seed,
    narrative: JSON.stringify(scenario.narrative),
    clues,
  };

  // Get setup instructions as strings
  const setupInstructions = setupType === "dvd"
    ? (setup as ReturnType<typeof generateDVDSetup>).instructions.map(i => i.instruction)
    : (setup as ReturnType<typeof generateDirectSetup>).instructions;

  // Insert into database
  await db.prepare(`
    INSERT INTO games (
      id, created_at, updated_at, status,
      solution_suspect_id, solution_item_id, solution_location_id, solution_time_id,
      theme_id, difficulty, player_count, setup_type, setup_instructions, seed, clues
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    gameId,
    now,
    now,
    "setup",
    game.solution.suspectId,
    game.solution.itemId,
    game.solution.locationId,
    game.solution.timeId,
    game.themeId,
    difficulty,
    playerCount,
    setupType,
    JSON.stringify(setupInstructions),
    seed ?? null,
    JSON.stringify(clues)
  ).run();

  // Create initial game state
  await db.prepare(`
    INSERT INTO game_state (
      game_id, updated_at, current_clue_index,
      eliminated_suspects, eliminated_items, eliminated_locations, eliminated_times,
      player_notes, phase, wrong_accusations
    ) VALUES (?, ?, 0, '[]', '[]', '[]', '[]', '{}', 'setup', 0)
  `).bind(gameId, now).run();

  return { game, setupInstructions };
}

// ============================================
// GAME RETRIEVAL
// ============================================

export async function getGame(db: D1Database, gameId: string): Promise<GameSession | null> {
  const result = await db.prepare(`
    SELECT * FROM games WHERE id = ?
  `).bind(gameId).first();

  if (!result) return null;

  return {
    id: result.id as string,
    createdAt: result.created_at as string,
    updatedAt: result.updated_at as string,
    status: result.status as GameStatus,
    solution: {
      suspectId: result.solution_suspect_id as string,
      itemId: result.solution_item_id as string,
      locationId: result.solution_location_id as string,
      timeId: result.solution_time_id as string,
    },
    themeId: result.theme_id as string,
    difficulty: result.difficulty as Difficulty,
    playerCount: result.player_count as number,
    setupType: result.setup_type as SetupType,
    seed: result.seed as number | undefined,
    narrative: result.narrative as string | undefined,
    setupInstructions: result.setup_instructions as string | undefined,
    clues: JSON.parse(result.clues as string) as GameClue[],
  };
}

export async function getGameState(db: D1Database, gameId: string): Promise<GameState | null> {
  const result = await db.prepare(`
    SELECT * FROM game_state WHERE game_id = ?
  `).bind(gameId).first();

  if (!result) return null;

  return {
    gameId: result.game_id as string,
    updatedAt: result.updated_at as string,
    currentClueIndex: result.current_clue_index as number,
    eliminatedSuspects: JSON.parse(result.eliminated_suspects as string),
    eliminatedItems: JSON.parse(result.eliminated_items as string),
    eliminatedLocations: JSON.parse(result.eliminated_locations as string),
    eliminatedTimes: JSON.parse(result.eliminated_times as string),
    playerNotes: JSON.parse(result.player_notes as string),
    phase: result.phase as GamePhase,
    currentPlayer: result.current_player as string | undefined,
    wrongAccusations: result.wrong_accusations as number,
  };
}

// ============================================
// GAME ACTIONS
// ============================================

export async function recordAction(
  db: D1Database,
  gameId: string,
  actor: string,
  actionType: ActionType,
  details: ActionDetails,
  clueIndex?: number
): Promise<GameAction> {
  const now = new Date().toISOString();

  // Get next sequence number
  const seqResult = await db.prepare(`
    SELECT COALESCE(MAX(sequence_number), 0) + 1 as next_seq
    FROM game_actions WHERE game_id = ?
  `).bind(gameId).first();

  const sequenceNumber = (seqResult?.next_seq as number) || 1;

  await db.prepare(`
    INSERT INTO game_actions (game_id, created_at, sequence_number, actor, action_type, details, clue_index)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    gameId,
    now,
    sequenceNumber,
    actor,
    actionType,
    JSON.stringify(details),
    clueIndex ?? null
  ).run();

  return {
    gameId,
    createdAt: now,
    sequenceNumber,
    actor,
    actionType,
    details,
    clueIndex,
  };
}

export async function getGameActions(
  db: D1Database,
  gameId: string,
  limit?: number
): Promise<GameAction[]> {
  const query = limit
    ? `SELECT * FROM game_actions WHERE game_id = ? ORDER BY sequence_number DESC LIMIT ?`
    : `SELECT * FROM game_actions WHERE game_id = ? ORDER BY sequence_number ASC`;

  const results = limit
    ? await db.prepare(query).bind(gameId, limit).all()
    : await db.prepare(query).bind(gameId).all();

  return (results.results || []).map(row => ({
    id: row.id as number,
    gameId: row.game_id as string,
    createdAt: row.created_at as string,
    sequenceNumber: row.sequence_number as number,
    actor: row.actor as string,
    actionType: row.action_type as ActionType,
    details: JSON.parse(row.details as string),
    clueIndex: row.clue_index as number | undefined,
  }));
}

// ============================================
// GAME STATE UPDATES
// ============================================

export async function startGame(
  db: D1Database,
  gameId: string,
  playerNames: string[]
): Promise<void> {
  const now = new Date().toISOString();

  // Update game status
  await db.prepare(`
    UPDATE games SET status = 'in_progress', updated_at = ? WHERE id = ?
  `).bind(now, gameId).run();

  // Update game state
  await db.prepare(`
    UPDATE game_state SET phase = 'investigation', updated_at = ?, current_player = ?
    WHERE game_id = ?
  `).bind(now, playerNames[0] || null, gameId).run();

  // Record action
  await recordAction(db, gameId, "system", "game_started", {
    playerNames,
    setupType: "dvd",
  });
}

export async function revealClue(
  db: D1Database,
  gameId: string
): Promise<{ clue: GameClue; dramaticEvent?: DramaticEventDetails } | null> {
  const now = new Date().toISOString();

  // Get current state
  const state = await getGameState(db, gameId);
  const game = await getGame(db, gameId);

  if (!state || !game) return null;

  const clueIndex = state.currentClueIndex;
  if (clueIndex >= game.clues.length) return null;

  const clue = game.clues[clueIndex];

  // Update clue as revealed
  const updatedClues = [...game.clues];
  updatedClues[clueIndex] = { ...clue, revealed: true };

  // Process eliminations
  const newEliminated = {
    suspects: [...state.eliminatedSuspects, ...(clue.eliminates?.suspects || [])],
    items: [...state.eliminatedItems, ...(clue.eliminates?.items || [])],
    locations: [...state.eliminatedLocations, ...(clue.eliminates?.locations || [])],
    times: [...state.eliminatedTimes, ...(clue.eliminates?.times || [])],
  };

  // Update game with revealed clue
  await db.prepare(`
    UPDATE games SET clues = ?, updated_at = ? WHERE id = ?
  `).bind(JSON.stringify(updatedClues), now, gameId).run();

  // Update game state
  await db.prepare(`
    UPDATE game_state SET
      current_clue_index = ?,
      eliminated_suspects = ?,
      eliminated_items = ?,
      eliminated_locations = ?,
      eliminated_times = ?,
      updated_at = ?
    WHERE game_id = ?
  `).bind(
    clueIndex + 1,
    JSON.stringify([...new Set(newEliminated.suspects)]),
    JSON.stringify([...new Set(newEliminated.items)]),
    JSON.stringify([...new Set(newEliminated.locations)]),
    JSON.stringify([...new Set(newEliminated.times)]),
    now,
    gameId
  ).run();

  // Record action
  const clueDetails: ClueRevealedDetails = {
    clueIndex,
    clueType: clue.type,
    clueText: clue.text,
    speaker: clue.speaker,
    eliminates: clue.eliminates,
  };
  await recordAction(db, gameId, clue.speaker, "clue_revealed", clueDetails, clueIndex);

  // Check for dramatic events (from narrative)
  let dramaticEvent: DramaticEventDetails | undefined;
  if (game.narrative) {
    try {
      const narrative = JSON.parse(game.narrative);
      const event = narrative.dramaticEvents?.find(
        (e: { triggerAfterClue: number }) => e.triggerAfterClue === clueIndex + 1
      );
      if (event) {
        dramaticEvent = event;
        await recordAction(db, gameId, "system", "dramatic_event", event);
      }
    } catch {
      // Ignore parse errors
    }
  }

  return { clue: { ...clue, revealed: true }, dramaticEvent };
}

export async function makeAccusation(
  db: D1Database,
  gameId: string,
  player: string,
  accusation: {
    suspectId: string;
    itemId: string;
    locationId: string;
    timeId: string;
  }
): Promise<{ correct: boolean; solution?: GameSession["solution"] }> {
  const now = new Date().toISOString();

  const game = await getGame(db, gameId);
  const state = await getGameState(db, gameId);

  if (!game || !state) {
    throw new Error("Game not found");
  }

  // Check if accusation is correct
  const correct =
    accusation.suspectId === game.solution.suspectId &&
    accusation.itemId === game.solution.itemId &&
    accusation.locationId === game.solution.locationId &&
    accusation.timeId === game.solution.timeId;

  // Get names for the accusation
  const suspect = SUSPECTS.find(s => s.id === accusation.suspectId);
  const item = ITEMS.find(i => i.id === accusation.itemId);
  const location = LOCATIONS.find(l => l.id === accusation.locationId);
  const time = TIME_PERIODS.find(t => t.id === accusation.timeId);

  const accusationDetails: AccusationDetails = {
    suspectId: accusation.suspectId,
    itemId: accusation.itemId,
    locationId: accusation.locationId,
    timeId: accusation.timeId,
    suspectName: suspect?.displayName || accusation.suspectId,
    itemName: item?.nameUS || accusation.itemId,
    locationName: location?.name || accusation.locationId,
    timeName: time?.name || accusation.timeId,
    correct,
  };

  // Record accusation
  await recordAction(db, gameId, player, "accusation_made", accusationDetails);

  if (correct) {
    // Game won!
    await db.prepare(`
      UPDATE games SET status = 'solved', updated_at = ? WHERE id = ?
    `).bind(now, gameId).run();

    await db.prepare(`
      UPDATE game_state SET phase = 'resolution', updated_at = ? WHERE game_id = ?
    `).bind(now, gameId).run();

    await recordAction(db, gameId, player, "accusation_correct", accusationDetails);
    await recordAction(db, gameId, player, "game_won", { winner: player });

    return { correct: true, solution: game.solution };
  } else {
    // Wrong accusation
    const wrongAccusations = state.wrongAccusations + 1;

    await db.prepare(`
      UPDATE game_state SET wrong_accusations = ?, updated_at = ? WHERE game_id = ?
    `).bind(wrongAccusations, now, gameId).run();

    await recordAction(db, gameId, player, "accusation_wrong", accusationDetails);

    return { correct: false };
  }
}

// ============================================
// GAME LISTING
// ============================================

export async function listGames(
  db: D1Database,
  options: {
    status?: GameStatus;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ games: GameSession[]; total: number }> {
  const { status, limit = 20, offset = 0 } = options;

  let countQuery = "SELECT COUNT(*) as total FROM games";
  let selectQuery = "SELECT * FROM games";

  if (status) {
    countQuery += " WHERE status = ?";
    selectQuery += " WHERE status = ?";
  }

  selectQuery += " ORDER BY created_at DESC LIMIT ? OFFSET ?";

  const countResult = status
    ? await db.prepare(countQuery).bind(status).first()
    : await db.prepare(countQuery).first();

  const results = status
    ? await db.prepare(selectQuery).bind(status, limit, offset).all()
    : await db.prepare(selectQuery).bind(limit, offset).all();

  const games = (results.results || []).map(row => ({
    id: row.id as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    status: row.status as GameStatus,
    solution: {
      suspectId: row.solution_suspect_id as string,
      itemId: row.solution_item_id as string,
      locationId: row.solution_location_id as string,
      timeId: row.solution_time_id as string,
    },
    themeId: row.theme_id as string,
    difficulty: row.difficulty as Difficulty,
    playerCount: row.player_count as number,
    setupType: row.setup_type as SetupType,
    seed: row.seed as number | undefined,
    clues: JSON.parse(row.clues as string) as GameClue[],
  }));

  return {
    games,
    total: (countResult?.total as number) || 0,
  };
}

// ============================================
// GAME HISTORY
// ============================================

export async function getGameHistory(
  db: D1Database,
  gameId: string
): Promise<{
  game: GameSession;
  state: GameState;
  actions: GameAction[];
  solutionDetails: {
    suspect: { id: string; name: string; role: string };
    item: { id: string; name: string; category: string };
    location: { id: string; name: string; type: string };
    time: { id: string; name: string; hourRange: string };
  };
} | null> {
  const game = await getGame(db, gameId);
  const state = await getGameState(db, gameId);
  const actions = await getGameActions(db, gameId);

  if (!game || !state) return null;

  // Get solution details
  const suspect = SUSPECTS.find(s => s.id === game.solution.suspectId);
  const item = ITEMS.find(i => i.id === game.solution.itemId);
  const location = LOCATIONS.find(l => l.id === game.solution.locationId);
  const time = TIME_PERIODS.find(t => t.id === game.solution.timeId);

  return {
    game,
    state,
    actions,
    solutionDetails: {
      suspect: {
        id: game.solution.suspectId,
        name: suspect?.displayName || "Unknown",
        role: suspect?.role || "Unknown",
      },
      item: {
        id: game.solution.itemId,
        name: item?.nameUS || "Unknown",
        category: item?.category || "Unknown",
      },
      location: {
        id: game.solution.locationId,
        name: location?.name || "Unknown",
        type: location?.type || "Unknown",
      },
      time: {
        id: game.solution.timeId,
        name: time?.name || "Unknown",
        hourRange: time?.hourRange || "Unknown",
      },
    },
  };
}

// ============================================
// PLAYER NOTES
// ============================================

export async function addPlayerNote(
  db: D1Database,
  gameId: string,
  player: string,
  note: string
): Promise<void> {
  const now = new Date().toISOString();
  const state = await getGameState(db, gameId);

  if (!state) throw new Error("Game not found");

  const notes = state.playerNotes;
  if (!notes[player]) notes[player] = [];
  notes[player].push(note);

  await db.prepare(`
    UPDATE game_state SET player_notes = ?, updated_at = ? WHERE game_id = ?
  `).bind(JSON.stringify(notes), now, gameId).run();

  await recordAction(db, gameId, player, "note_taken", { player, note });
}

// ============================================
// GAME ABANDONMENT
// ============================================

export async function abandonGame(db: D1Database, gameId: string): Promise<void> {
  const now = new Date().toISOString();

  await db.prepare(`
    UPDATE games SET status = 'abandoned', updated_at = ? WHERE id = ?
  `).bind(now, gameId).run();

  await db.prepare(`
    UPDATE game_state SET phase = 'resolution', updated_at = ? WHERE game_id = ?
  `).bind(now, gameId).run();

  await recordAction(db, gameId, "system", "game_abandoned", {});
}
