-- Add suspect_name to phone players for display

ALTER TABLE phone_players
  ADD COLUMN suspect_name TEXT NOT NULL DEFAULT '';

