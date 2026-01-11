ALTER TABLE phone_sessions ADD COLUMN interruption_active INTEGER DEFAULT 0;
ALTER TABLE phone_sessions ADD COLUMN interruption_message TEXT DEFAULT '';
