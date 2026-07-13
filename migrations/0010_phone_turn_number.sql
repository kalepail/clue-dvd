-- Durable turn number for phone sessions
--
-- Mirrors the host's authoritative LocalGame.turnCount so phones can key
-- turn-scoped state (passage pending/used) to a monotonic number instead of
-- the current suspect, which repeats across rounds.

ALTER TABLE phone_sessions
  ADD COLUMN current_turn_number INTEGER;
