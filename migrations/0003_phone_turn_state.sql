-- Track current turn for phone sessions

ALTER TABLE phone_sessions
  ADD COLUMN current_turn_suspect_id TEXT;

