-- Store last accusation outcome per player for phone feedback

ALTER TABLE phone_players
  ADD COLUMN last_accusation_correct INTEGER;

ALTER TABLE phone_players
  ADD COLUMN last_accusation_correct_count INTEGER;

ALTER TABLE phone_players
  ADD COLUMN last_accusation_at TEXT;

