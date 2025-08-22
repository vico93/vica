-- Manual migration script for adding message columns to existing database
-- Run this if the automatic migration fails

-- Add welcome message columns
ALTER TABLE guild_settings ADD COLUMN welcome_message TEXT;
ALTER TABLE guild_settings ADD COLUMN welcome_is_prompt INTEGER DEFAULT 0;

-- Add leave message columns
ALTER TABLE guild_settings ADD COLUMN leave_message TEXT;
ALTER TABLE guild_settings ADD COLUMN leave_is_prompt INTEGER DEFAULT 0;

-- Add kick message columns
ALTER TABLE guild_settings ADD COLUMN kick_message TEXT;
ALTER TABLE guild_settings ADD COLUMN kick_is_prompt INTEGER DEFAULT 0;

-- Add ban message columns
ALTER TABLE guild_settings ADD COLUMN ban_message TEXT;
ALTER TABLE guild_settings ADD COLUMN ban_is_prompt INTEGER DEFAULT 0;

-- Verify the changes
PRAGMA table_info(guild_settings);