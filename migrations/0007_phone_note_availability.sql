-- Track inspector note availability in phone sessions

ALTER TABLE phone_sessions
  ADD COLUMN note1_available INTEGER NOT NULL DEFAULT 0;

ALTER TABLE phone_sessions
  ADD COLUMN note2_available INTEGER NOT NULL DEFAULT 0;
