-- Store inspector notes read per phone player

ALTER TABLE phone_players
  ADD COLUMN inspector_notes TEXT NOT NULL DEFAULT '[]';

ALTER TABLE phone_players
  ADD COLUMN inspector_note_texts TEXT NOT NULL DEFAULT '{}';
