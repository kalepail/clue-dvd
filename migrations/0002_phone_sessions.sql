-- Phone Companion Sessions
-- Stores lightweight phone-session data and player state

CREATE TABLE IF NOT EXISTS phone_sessions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby', 'active', 'closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS phone_players (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES phone_sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  suspect_id TEXT NOT NULL,
  reconnect_token TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  eliminations TEXT NOT NULL DEFAULT '{"suspects":[],"items":[],"locations":[],"times":[]}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_phone_players_unique_suspect
  ON phone_players(session_id, suspect_id);

CREATE TABLE IF NOT EXISTS phone_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES phone_sessions(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES phone_players(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('turn_action', 'accusation')),
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  consumed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_phone_events_session
  ON phone_events(session_id, id);

