-- Schema inicial da Vica (SQLite)

CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT NOT NULL,
    community_id TEXT NOT NULL,
    username TEXT,
    display_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, community_id)
);

CREATE TABLE IF NOT EXISTS xp (
    user_id TEXT NOT NULL,
    community_id TEXT NOT NULL,
    xp_total INTEGER DEFAULT 0,
    xp_voice INTEGER DEFAULT 0,
    xp_text INTEGER DEFAULT 0,
    last_message_at INTEGER DEFAULT 0,
    last_message_hash TEXT DEFAULT '',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, community_id),
    FOREIGN KEY (user_id, community_id) REFERENCES users(id, community_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
    community_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (community_id, key)
);

CREATE TABLE IF NOT EXISTS conversations (
    channel_id TEXT PRIMARY KEY,
    state TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
