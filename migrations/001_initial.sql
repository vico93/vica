CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id INTEGER PRIMARY KEY,
    chatbot_emoji TEXT,
    vica_multiplier REAL NOT NULL DEFAULT 1.0
);

CREATE TABLE IF NOT EXISTS chat_contexts (
    channel_id INTEGER NOT NULL,
    provider_name TEXT NOT NULL,
    response_id TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (channel_id, provider_name)
);

CREATE TABLE IF NOT EXISTS member_experience (
    guild_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    xp INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS role_multipliers (
    guild_id INTEGER NOT NULL,
    role_id INTEGER NOT NULL,
    multiplier REAL NOT NULL,
    PRIMARY KEY (guild_id, role_id)
);

CREATE TABLE IF NOT EXISTS blacklisted_channels (
    guild_id INTEGER NOT NULL,
    channel_id INTEGER NOT NULL,
    PRIMARY KEY (guild_id, channel_id)
);

CREATE TABLE IF NOT EXISTS access_entries (
    guild_id INTEGER NOT NULL,
    access_level TEXT NOT NULL CHECK (access_level IN ('admin', 'mod')),
    subject_type TEXT NOT NULL CHECK (subject_type IN ('member', 'role')),
    subject_id INTEGER NOT NULL,
    PRIMARY KEY (guild_id, access_level, subject_type, subject_id)
);
