-- Host authentication token and per-player turn-action results
--
-- host_token is generated at session creation, returned only to the creating
-- host, and required on host-only mutation routes. It is never included in
-- session snapshots sent to players.
--
-- last_action_result mirrors the existing last_accusation_* pattern: the host
-- reports the authoritative outcome of a player's physical turn action (e.g.
-- a rejected duplicate secret passage) and phones read it from the snapshot.

ALTER TABLE phone_sessions
  ADD COLUMN host_token TEXT;

ALTER TABLE phone_players
  ADD COLUMN last_action_result TEXT;
