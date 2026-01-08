-- Clue DVD Game - Initial Database Schema
-- Stores game sessions, player moves, and game history

-- ============================================
-- GAMES TABLE
-- Core game session data
-- ============================================
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  -- Game status
  status TEXT NOT NULL DEFAULT 'setup' CHECK (status IN ('setup', 'in_progress', 'solved', 'abandoned')),

  -- Solution (stored as JSON for flexibility)
  solution_suspect_id TEXT NOT NULL,
  solution_item_id TEXT NOT NULL,
  solution_location_id TEXT NOT NULL,
  solution_time_id TEXT NOT NULL,

  -- Theme and setup
  theme_id TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'intermediate' CHECK (difficulty IN ('beginner', 'intermediate', 'expert')),

  -- Player configuration
  player_count INTEGER NOT NULL DEFAULT 3 CHECK (player_count >= 1 AND player_count <= 6),

  -- AI-generated narrative (stored as JSON)
  narrative TEXT,

  -- Setup instructions (symbol-based for physical card mirroring)
  setup_instructions TEXT,

  -- Game seed for reproducibility
  seed INTEGER,

  -- Clues for this game (stored as JSON array)
  clues TEXT NOT NULL
);

-- ============================================
-- GAME_ACTIONS TABLE
-- Every action taken during gameplay
-- ============================================
CREATE TABLE IF NOT EXISTS game_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  -- Action sequence number (1, 2, 3...)
  sequence_number INTEGER NOT NULL,

  -- Who performed the action (player identifier or 'system')
  actor TEXT NOT NULL,

  -- Action type
  action_type TEXT NOT NULL CHECK (action_type IN (
    'game_started',
    'clue_revealed',
    'suggestion_made',
    'suggestion_disproved',
    'accusation_made',
    'accusation_correct',
    'accusation_wrong',
    'card_shown',
    'player_eliminated',
    'game_won',
    'game_abandoned',
    'dramatic_event',
    'note_taken'
  )),

  -- Action details (JSON, structure depends on action_type)
  details TEXT NOT NULL,

  -- Optional: which clue was revealed
  clue_index INTEGER,

  UNIQUE(game_id, sequence_number)
);

-- ============================================
-- GAME_STATE TABLE
-- Current state snapshot for quick resume
-- ============================================
CREATE TABLE IF NOT EXISTS game_state (
  game_id TEXT PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  -- Current clue index (how many clues have been revealed)
  current_clue_index INTEGER NOT NULL DEFAULT 0,

  -- Eliminated possibilities (JSON arrays)
  eliminated_suspects TEXT NOT NULL DEFAULT '[]',
  eliminated_items TEXT NOT NULL DEFAULT '[]',
  eliminated_locations TEXT NOT NULL DEFAULT '[]',
  eliminated_times TEXT NOT NULL DEFAULT '[]',

  -- Player notes (JSON object keyed by player)
  player_notes TEXT NOT NULL DEFAULT '{}',

  -- Current phase
  phase TEXT NOT NULL DEFAULT 'investigation' CHECK (phase IN ('setup', 'investigation', 'accusation', 'resolution')),

  -- Whose turn it is (if applicable)
  current_player TEXT,

  -- Number of wrong accusations made
  wrong_accusations INTEGER NOT NULL DEFAULT 0
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_created_at ON games(created_at);
CREATE INDEX IF NOT EXISTS idx_game_actions_game_id ON game_actions(game_id);
CREATE INDEX IF NOT EXISTS idx_game_actions_sequence ON game_actions(game_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_game_actions_type ON game_actions(action_type);
