/*
** caminho: core/database.js
** últimaMod: 2025-09-13 01:12
** autor: Vico
** colaboração: Roo Sonic (xai/grok-code-fast-1), Copilot (gpt-4o), GLM 4.5 Air
*/

/*
  Módulo de acesso ao banco de dados.
  Utiliza better-sqlite3 para alta performance.
  Todas as funções são síncronas (non-blocking graças ao driver).
  Mantém prepared statements para evitar re-parsing de SQL.
*/

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'database.db');
const db = new Database(dbPath);

// Lazy import to avoid circular dependency
let gerarEmbedding = null;
function getGerarEmbedding() {
  if (!gerarEmbedding) {
    const { gerarEmbedding: embedFunc } = require('./oai_interface');
    gerarEmbedding = embedFunc;
  }
  return gerarEmbedding;
}

/* ----------------------------------------------------------
   Tuning de performance
---------------------------------------------------------- */
db.pragma('journal_mode = WAL');      // concorrente e rápido
db.pragma('synchronous = NORMAL');    // commits mais rápidos

/* ----------------------------------------------------------
   Criação de tabelas (idempotente) + migração para novo esquema de mensagens
---------------------------------------------------------- */
(() => {
  // Se a tabela 'mensagens' antiga existir (com coluna 'conteudo'), derruba para recriar no novo formato
  try {
    const cols = db.prepare('PRAGMA table_info(mensagens)').all();
    const hasConteudo = cols.some(c => c.name === 'conteudo');
    const missingMessageId = cols.length > 0 && !cols.some(c => c.name === 'message_id');
    if (hasConteudo || missingMessageId) {
      console.warn('[DB] Migrando tabela mensagens -> utilizando message_id (resetando dados antigos).');
      db.exec('DROP TABLE IF EXISTS mensagens');
    }
  } catch (e) {
    // tabela ainda não existe
  }

  // Migração para adicionar colunas de role congrats na tabela guild_settings
  try {
    const settingsCols = db.prepare('PRAGMA table_info(guild_settings)').all();
    const hasRoleCongratsRole = settingsCols.some(c => c.name === 'role_congrats_role_id');
    const hasRoleCongratsPrompt = settingsCols.some(c => c.name === 'role_congrats_prompt');

    if (settingsCols.length > 0 && (!hasRoleCongratsRole || !hasRoleCongratsPrompt)) {
      console.warn('[DB] Migrando tabela guild_settings -> adicionando colunas role_congrats.');
      if (!hasRoleCongratsRole) {
        db.exec('ALTER TABLE guild_settings ADD COLUMN role_congrats_role_id TEXT');
      }
      if (!hasRoleCongratsPrompt) {
        db.exec('ALTER TABLE guild_settings ADD COLUMN role_congrats_prompt TEXT');
      }
    }
  } catch (e) {
    // tabela ainda não existe, será criada abaixo
  }

  // Migração para adicionar colunas de mensagens de boas-vindas/saída na tabela guild_settings
  try {
    const settingsCols = db.prepare('PRAGMA table_info(guild_settings)').all();
    const hasWelcomeMessage = settingsCols.some(c => c.name === 'welcome_message');
    const hasWelcomeIsPrompt = settingsCols.some(c => c.name === 'welcome_is_prompt');
    const hasLeaveMessage = settingsCols.some(c => c.name === 'leave_message');
    const hasLeaveIsPrompt = settingsCols.some(c => c.name === 'leave_is_prompt');
    const hasKickMessage = settingsCols.some(c => c.name === 'kick_message');
    const hasKickIsPrompt = settingsCols.some(c => c.name === 'kick_is_prompt');
    const hasBanMessage = settingsCols.some(c => c.name === 'ban_message');
    const hasBanIsPrompt = settingsCols.some(c => c.name === 'ban_is_prompt');

    if (settingsCols.length > 0) {
      const missingColumns = [];
      if (!hasWelcomeMessage) missingColumns.push('welcome_message TEXT');
      if (!hasWelcomeIsPrompt) missingColumns.push('welcome_is_prompt INTEGER DEFAULT 0');
      if (!hasLeaveMessage) missingColumns.push('leave_message TEXT');
      if (!hasLeaveIsPrompt) missingColumns.push('leave_is_prompt INTEGER DEFAULT 0');
      if (!hasKickMessage) missingColumns.push('kick_message TEXT');
      if (!hasKickIsPrompt) missingColumns.push('kick_is_prompt INTEGER DEFAULT 0');
      if (!hasBanMessage) missingColumns.push('ban_message TEXT');
      if (!hasBanIsPrompt) missingColumns.push('ban_is_prompt INTEGER DEFAULT 0');

      if (missingColumns.length > 0) {
        console.warn('[DB] Migrando tabela guild_settings -> adicionando colunas de mensagens.');
        for (const column of missingColumns) {
          try {
            db.exec(`ALTER TABLE guild_settings ADD COLUMN ${column}`);
            console.log(`[DB] Adicionada coluna: ${column}`);
          } catch (colError) {
            console.error(`[DB] Erro ao adicionar coluna ${column}:`, colError.message);
          }
        }
      }
    }
  } catch (e) {
    console.error('[DB] Erro durante migração das colunas de mensagens:', e.message);
    // tabela ainda não existe, será criada abaixo
  }

  // Migração para adicionar coluna importance na tabela user_memories
  try {
    const memoryCols = db.prepare('PRAGMA table_info(user_memories)').all();
    const hasImportance = memoryCols.some(c => c.name === 'importance');

    if (memoryCols.length > 0 && !hasImportance) {
      console.warn('[DB] Migrando tabela user_memories -> adicionando coluna importance.');
      db.exec('ALTER TABLE user_memories ADD COLUMN importance INTEGER');
      console.log('[DB] Adicionada coluna importance à tabela user_memories');
    }
  } catch (e) {
    console.error('[DB] Erro durante migração da coluna importance:', e.message);
    // tabela ainda não existe, será criada abaixo
  }

  // Migração para adicionar coluna embedding na tabela user_memories
  try {
    const memoryCols = db.prepare('PRAGMA table_info(user_memories)').all();
    const hasEmbedding = memoryCols.some(c => c.name === 'embedding');

    if (memoryCols.length > 0 && !hasEmbedding) {
      console.warn('[DB] Migrando tabela user_memories -> adicionando coluna embedding.');
      db.exec('ALTER TABLE user_memories ADD COLUMN embedding TEXT');
      console.log('[DB] Adicionada coluna embedding à tabela user_memories');
    }
  } catch (e) {
    console.error('[DB] Erro durante migração da coluna embedding:', e.message);
    // tabela ainda não existe, será criada abaixo
  }

  // Migração para adicionar coluna embedding na tabela guild_memories
  try {
    const guildCols = db.prepare('PRAGMA table_info(guild_memories)').all();
    const hasEmbedding = guildCols.some(c => c.name === 'embedding');

    if (guildCols.length > 0 && !hasEmbedding) {
      console.warn('[DB] Migrando tabela guild_memories -> adicionando coluna embedding.');
      db.exec('ALTER TABLE guild_memories ADD COLUMN embedding TEXT');
      console.log('[DB] Adicionada coluna embedding à tabela guild_memories');
    }
  } catch (e) {
    console.error('[DB] Erro durante migração da coluna embedding:', e.message);
    // tabela ainda não existe, será criada abaixo
  }

  // Migração para adicionar coluna is_prompt na tabela role_congrats
  try {
    const roleCongratsCols = db.prepare('PRAGMA table_info(role_congrats)').all();
    const hasIsPrompt = roleCongratsCols.some(c => c.name === 'is_prompt');

    if (roleCongratsCols.length > 0 && !hasIsPrompt) {
      console.warn('[DB] Migrando tabela role_congrats -> adicionando coluna is_prompt.');
      db.exec('ALTER TABLE role_congrats ADD COLUMN is_prompt INTEGER DEFAULT 0');
      // Definir is_prompt = 0 para registros existentes
      db.exec('UPDATE role_congrats SET is_prompt = 0 WHERE is_prompt IS NULL');
      console.log('[DB] Adicionada coluna is_prompt à tabela role_congrats');
    }
  } catch (e) {
    console.error('[DB] Erro durante migração da coluna is_prompt:', e.message);
    // tabela ainda não existe, será criada abaixo
  }

  // Migração para reaction_emojis: permitir múltiplos emojis por guild (de one-to-one para one-to-many)
  try {
    const reactionCols = db.prepare('PRAGMA table_info(reaction_emojis)').all();
    const hasIdColumn = reactionCols.some(c => c.name === 'id');

    if (reactionCols.length > 0 && !hasIdColumn) {
      console.warn('[DB] Migrando tabela reaction_emojis -> convertendo para múltiplos emojis por guild.');
      // Copiar dados existentes para tabela temporária
      db.exec('CREATE TABLE reaction_emojis_temp AS SELECT * FROM reaction_emojis');
      // Dropar tabela antiga
      db.exec('DROP TABLE reaction_emojis');
      // Criar nova tabela com estrutura atualizada
      db.exec(`CREATE TABLE reaction_emojis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        reaction_emoji_id TEXT NOT NULL,
        UNIQUE(guild_id, reaction_emoji_id)
      )`);
      // Inserir dados da tabela temporária na nova
      db.exec('INSERT INTO reaction_emojis (guild_id, reaction_emoji_id) SELECT guild_id, reaction_emoji_id FROM reaction_emojis_temp');
      // Dropar tabela temporária
      db.exec('DROP TABLE reaction_emojis_temp');
      console.log('[DB] Migração da tabela reaction_emojis concluída');
    }
  } catch (e) {
    console.error('[DB] Erro durante migração da tabela reaction_emojis:', e.message);
    // tabela ainda não existe, será criada abaixo
  }

  db.exec(`
CREATE TABLE IF NOT EXISTS mensagens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  canal_id TEXT NOT NULL,
  usuario_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  response_id TEXT,
  UNIQUE (guild_id, canal_id, message_id) ON CONFLICT IGNORE
);

CREATE TABLE IF NOT EXISTS rank_xp (
  guild_id  TEXT NOT NULL,
  usuario_id TEXT NOT NULL,
  xp INTEGER DEFAULT 0,
  nivel INTEGER DEFAULT 0,
  total_mensagens INTEGER DEFAULT 0,
  ultima_mensagem_timestamp INTEGER DEFAULT 0,
  PRIMARY KEY (guild_id, usuario_id)
);

CREATE TABLE IF NOT EXISTS blacklist_chatbot_canais (
  guild_id TEXT NOT NULL,
  canal_id TEXT NOT NULL,
  PRIMARY KEY (guild_id, canal_id)
);

CREATE TABLE IF NOT EXISTS blacklist_xp_canais (
  guild_id TEXT NOT NULL,
  canal_id TEXT NOT NULL,
  PRIMARY KEY (guild_id, canal_id)
);

CREATE TABLE IF NOT EXISTS rank_role_multipliers (
  guild_id  TEXT NOT NULL,
  role_id   TEXT NOT NULL,
  multiplier REAL NOT NULL,
  PRIMARY KEY (guild_id, role_id)
);

-- NOVA TABELA PARA CONFIGURAÇÕES DO SERVIDOR --
CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT PRIMARY KEY,
  system_channel_id TEXT,
  welcome_message TEXT,
  welcome_is_prompt INTEGER DEFAULT 0,
  leave_message TEXT,
  leave_is_prompt INTEGER DEFAULT 0,
  kick_message TEXT,
  kick_is_prompt INTEGER DEFAULT 0,
  ban_message TEXT,
  ban_is_prompt INTEGER DEFAULT 0,
  role_congrats_role_id TEXT,
  role_congrats_prompt TEXT
);

-- TABELA DE MEMÓRIAS DE USUÁRIO (por guild) --
CREATE TABLE IF NOT EXISTS user_memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  fact TEXT NOT NULL,
  fact_key TEXT NOT NULL,
  confidence REAL,
  source_message_id TEXT,
  importance INTEGER,
  embedding TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (guild_id, user_id, fact_key) ON CONFLICT IGNORE
);
CREATE INDEX IF NOT EXISTS idx_user_memories_guild_user_created
  ON user_memories (guild_id, user_id, created_at DESC);

-- TABELA PARA MÚLTIPLAS CONFIGURAÇÕES DE PARABÉNS POR CARGO --
CREATE TABLE IF NOT EXISTS role_congrats (
  guild_id TEXT NOT NULL,
  role_id  TEXT NOT NULL,
  prompt   TEXT NOT NULL,
  is_prompt INTEGER DEFAULT 0,
  PRIMARY KEY (guild_id, role_id)
);

-- Migrações: se existir configuração legada em guild_settings, copie para role_congrats
INSERT OR IGNORE INTO role_congrats (guild_id, role_id, prompt, is_prompt)
  SELECT guild_id, role_congrats_role_id, role_congrats_prompt, 0
  FROM guild_settings
  WHERE role_congrats_role_id IS NOT NULL AND role_congrats_prompt IS NOT NULL;

-- TABELA DE MEMÓRIAS DA GUILD --
CREATE TABLE IF NOT EXISTS guild_memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  fact TEXT NOT NULL,
  embedding TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_guild_memories_guild_created
 ON guild_memories (guild_id, created_at DESC);

-- TABELA PARA EMOJIS DE REAÇÃO POR SERVIDOR --
CREATE TABLE IF NOT EXISTS reaction_emojis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  reaction_emoji_id TEXT NOT NULL,
  UNIQUE(guild_id, reaction_emoji_id)
);
`);
})();

/* ----------------------------------------------------------
  Prepared statements
---------------------------------------------------------- */
const stmts = {
  /* --- Chatbot blacklist --- */
  chatbotExists: db.prepare('SELECT 1 FROM blacklist_chatbot_canais WHERE guild_id=? AND canal_id=? LIMIT 1'),
  chatbotAdd:    db.prepare('INSERT OR IGNORE INTO blacklist_chatbot_canais (guild_id, canal_id) VALUES (?, ?)'),
  chatbotDel:    db.prepare('DELETE FROM blacklist_chatbot_canais WHERE guild_id=? AND canal_id=?'),
  chatbotList:   db.prepare('SELECT canal_id FROM blacklist_chatbot_canais WHERE guild_id=?'),

  /* --- XP blacklist --- */
  xpExists: db.prepare('SELECT 1 FROM blacklist_xp_canais WHERE guild_id=? AND canal_id=? LIMIT 1'),
  xpAdd:    db.prepare('INSERT OR IGNORE INTO blacklist_xp_canais (guild_id, canal_id) VALUES (?, ?)'),
  xpDel:    db.prepare('DELETE FROM blacklist_xp_canais WHERE guild_id=? AND canal_id=?'),
  xpList:   db.prepare('SELECT canal_id FROM blacklist_xp_canais WHERE guild_id=?'),

  /* --- Multiplicadores de XP por cargo --- */
  multSet:   db.prepare(`INSERT INTO rank_role_multipliers (guild_id, role_id, multiplier)
                         VALUES (?, ?, ?)
                         ON CONFLICT(guild_id, role_id) DO UPDATE SET multiplier=excluded.multiplier`),
  multDel:   db.prepare('DELETE FROM rank_role_multipliers WHERE guild_id=? AND role_id=?'),
  multList:  db.prepare('SELECT role_id, multiplier FROM rank_role_multipliers WHERE guild_id=?'),
  multByIds: db.prepare(`SELECT multiplier FROM rank_role_multipliers
                         WHERE guild_id=? AND role_id IN (SELECT value FROM json_each(?))`),

  /* --- XP do usuário --- */
  xpGet:        db.prepare('SELECT * FROM rank_xp WHERE guild_id=? AND usuario_id=?'),
  xpUpsert:     db.prepare(`INSERT INTO rank_xp (guild_id, usuario_id, xp, nivel, ultima_mensagem_timestamp)
                            VALUES (?, ?, ?, ?, ?)
                            ON CONFLICT(guild_id, usuario_id) DO UPDATE
                              SET xp = xp + excluded.xp,
                                  nivel = excluded.nivel,
                                  total_mensagens = total_mensagens + 1,
                                  ultima_mensagem_timestamp = excluded.ultima_mensagem_timestamp`),
  xpSet:        db.prepare(`INSERT INTO rank_xp (guild_id, usuario_id, xp, nivel)
                            VALUES (?, ?, ?, ?)
                            ON CONFLICT(guild_id, usuario_id) DO UPDATE
                              SET xp=excluded.xp, nivel=excluded.nivel`),
  xpResetGuild: db.prepare('DELETE FROM rank_xp WHERE guild_id=?'),
  xpDelUser:    db.prepare('DELETE FROM rank_xp WHERE guild_id=? AND usuario_id=?'),
  rankTop:      db.prepare('SELECT usuario_id, xp, nivel FROM rank_xp WHERE guild_id=? ORDER BY xp DESC LIMIT ?'),

  /* --- Mensagens para histórico da IA (agora armazena message_id) --- */
  msgInsert:  db.prepare('INSERT OR IGNORE INTO mensagens (guild_id, canal_id, usuario_id, message_id, timestamp) VALUES (?, ?, ?, ?, ?)'),
  msgHistory: db.prepare('SELECT message_id FROM mensagens WHERE guild_id=? AND canal_id=? AND usuario_id=? ORDER BY timestamp DESC LIMIT ?'),
  channelMsgHistory: db.prepare('SELECT message_id, usuario_id FROM mensagens WHERE guild_id=? AND canal_id=? ORDER BY timestamp DESC LIMIT ?'),
  channelMsgHistoryRange: db.prepare('SELECT message_id, usuario_id FROM mensagens WHERE guild_id=? AND canal_id=? ORDER BY timestamp DESC LIMIT ? OFFSET ?'),
  
  /* --- NOVAS STATEMENTS PARA CONFIGURAÇÕES DO SERVIDOR --- */
  settingsGetChannel: db.prepare('SELECT system_channel_id FROM guild_settings WHERE guild_id = ?'),
  settingsSetChannel: db.prepare(`INSERT INTO guild_settings (guild_id, system_channel_id)
                                  VALUES (?, ?)
                                  ON CONFLICT(guild_id) DO UPDATE SET system_channel_id = excluded.system_channel_id`),

  /* --- STATEMENTS PARA ROLE CONGRATS --- */
  settingsGetRoleCongrats: db.prepare('SELECT role_congrats_role_id, role_congrats_prompt FROM guild_settings WHERE guild_id = ?'),
  settingsSetRoleCongrats: db.prepare(`INSERT INTO guild_settings (guild_id, role_congrats_role_id, role_congrats_prompt)
                                       VALUES (?, ?, ?)
                                       ON CONFLICT(guild_id) DO UPDATE SET
                                         role_congrats_role_id = excluded.role_congrats_role_id,
                                         role_congrats_prompt = excluded.role_congrats_prompt`),
  settingsClearRoleCongrats: db.prepare(`UPDATE guild_settings SET
                                         role_congrats_role_id = NULL,
                                         role_congrats_prompt = NULL
                                         WHERE guild_id = ?`),

  /* --- NOVA TABELA: MULTIPLAS CONFIGS role_congrats --- */
  rcInsert:   db.prepare(`INSERT INTO role_congrats (guild_id, role_id, prompt, is_prompt)
                          VALUES (?, ?, ?, ?)
                          ON CONFLICT(guild_id, role_id) DO UPDATE SET
                            prompt=excluded.prompt,
                            is_prompt=excluded.is_prompt`),
  rcDelete:   db.prepare('DELETE FROM role_congrats WHERE guild_id=? AND role_id=?'),
  rcDeleteAll:db.prepare('DELETE FROM role_congrats WHERE guild_id=?'),
  rcList:     db.prepare('SELECT role_id, prompt, is_prompt FROM role_congrats WHERE guild_id=?'),

  /* --- MEMÓRIAS DE USUÁRIO --- */
  memInsert: db.prepare(`INSERT OR IGNORE INTO user_memories
                        (guild_id, user_id, fact, fact_key, confidence, source_message_id, importance, embedding, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  memList:   db.prepare(`SELECT id, fact, confidence, importance, source_message_id, created_at
                        FROM user_memories
                        WHERE guild_id = ? AND user_id = ?
                        ORDER BY created_at DESC
                        LIMIT ? OFFSET ?`),
  memDelete: db.prepare('DELETE FROM user_memories WHERE guild_id = ? AND user_id = ? AND fact_key = ?'),
  /* --- Novo prepared statements para embeddings --- */
  memUpdateEmbedding: db.prepare('UPDATE user_memories SET embedding = ? WHERE id = ?'),
  memGetWithEmbedding: db.prepare(`SELECT id, fact, embedding, confidence, importance, source_message_id, created_at FROM user_memories WHERE guild_id = ? AND user_id = ? AND embedding IS NOT NULL ORDER BY created_at DESC LIMIT ? OFFSET ?`),

 /* --- MEMÓRIAS DE GUILD --- */
 guildMemInsert: db.prepare('INSERT INTO guild_memories (guild_id, fact, embedding, created_at) VALUES (?, ?, ?, ?)'),
 guildMemList:   db.prepare(`SELECT id, fact, created_at FROM guild_memories WHERE guild_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`),
 guildMemDelete: db.prepare('DELETE FROM guild_memories WHERE guild_id = ? AND id = ?'),

 /* --- Prepared statements para embeddings de guild --- */
 guildMemUpdateEmbedding: db.prepare('UPDATE guild_memories SET embedding = ? WHERE id = ?'),
 guildMemGetWithEmbedding: db.prepare(`SELECT id, fact, embedding, created_at FROM guild_memories WHERE guild_id = ? AND embedding IS NOT NULL ORDER BY created_at DESC LIMIT ? OFFSET ?`),

 /* --- Welcome/Leave Messages --- */
 welcomeSettingsSet: db.prepare(`
   INSERT INTO guild_settings (guild_id, welcome_message, welcome_is_prompt)
   VALUES (:guild_id, :message, :is_prompt)
   ON CONFLICT(guild_id) DO UPDATE SET
     welcome_message = :message,
     welcome_is_prompt = :is_prompt
 `),
 leaveSettingsSet: db.prepare(`
   INSERT INTO guild_settings (guild_id, leave_message, leave_is_prompt)
   VALUES (:guild_id, :message, :is_prompt)
   ON CONFLICT(guild_id) DO UPDATE SET
     leave_message = :message,
     leave_is_prompt = :is_prompt
 `),
 kickSettingsSet: db.prepare(`
   INSERT INTO guild_settings (guild_id, kick_message, kick_is_prompt)
   VALUES (:guild_id, :message, :is_prompt)
   ON CONFLICT(guild_id) DO UPDATE SET
     kick_message = :message,
     kick_is_prompt = :is_prompt
 `),
 banSettingsSet: db.prepare(`
   INSERT INTO guild_settings (guild_id, ban_message, ban_is_prompt)
   VALUES (:guild_id, :message, :is_prompt)
   ON CONFLICT(guild_id) DO UPDATE SET
     ban_message = :message,
     ban_is_prompt = :is_prompt
 `),
 msgSettingsGet: db.prepare('SELECT welcome_message, welcome_is_prompt, leave_message, leave_is_prompt, kick_message, kick_is_prompt, ban_message, ban_is_prompt FROM guild_settings WHERE guild_id = ?'),
 banSettingsGet: db.prepare('SELECT ban_message, ban_is_prompt FROM guild_settings WHERE guild_id = ?'),

 /* --- GET individual messages --- */
 welcomeSettingsGet: db.prepare('SELECT welcome_message, welcome_is_prompt FROM guild_settings WHERE guild_id = ?'),
 leaveSettingsGet: db.prepare('SELECT leave_message, leave_is_prompt FROM guild_settings WHERE guild_id = ?'),
 kickSettingsGet: db.prepare('SELECT kick_message, kick_is_prompt FROM guild_settings WHERE guild_id = ?'),

 /* --- DELETE messages --- */
 welcomeSettingsDelete: db.prepare('UPDATE guild_settings SET welcome_message = NULL, welcome_is_prompt = NULL WHERE guild_id = ?'),
 leaveSettingsDelete: db.prepare('UPDATE guild_settings SET leave_message = NULL, leave_is_prompt = NULL WHERE guild_id = ?'),
 kickSettingsDelete: db.prepare('UPDATE guild_settings SET kick_message = NULL, kick_is_prompt = NULL WHERE guild_id = ?'),
 banSettingsDelete: db.prepare('UPDATE guild_settings SET ban_message = NULL, ban_is_prompt = NULL WHERE guild_id = ?'),

 /* --- Generic message handling by type --- */
 // Get message by type (welcome, leave, leave_kick, leave_ban)
 getMessageByType: db.prepare(`
   SELECT
     CASE ?
       WHEN 'welcome' THEN welcome_message
       WHEN 'leave' THEN leave_message
       WHEN 'leave_kick' THEN kick_message
       WHEN 'leave_ban' THEN ban_message
     END as message,
     CASE ?
       WHEN 'welcome' THEN welcome_is_prompt
       WHEN 'leave' THEN leave_is_prompt
       WHEN 'leave_kick' THEN kick_is_prompt
       WHEN 'leave_ban' THEN ban_is_prompt
     END as is_prompt
   FROM guild_settings
   WHERE guild_id = ?
 `),

 // Set message by type
 setMessageByType: db.prepare(`
   INSERT INTO guild_settings (guild_id,
     welcome_message, welcome_is_prompt,
     leave_message, leave_is_prompt,
     kick_message, kick_is_prompt,
     ban_message, ban_is_prompt)
   VALUES (?, NULL, 0, NULL, 0, NULL, 0, NULL, 0)
   ON CONFLICT(guild_id) DO UPDATE SET
     welcome_message = CASE WHEN ? = 'welcome' THEN ? ELSE welcome_message END,
     welcome_is_prompt = CASE WHEN ? = 'welcome' THEN ? ELSE welcome_is_prompt END,
     leave_message = CASE WHEN ? = 'leave' THEN ? ELSE leave_message END,
     leave_is_prompt = CASE WHEN ? = 'leave' THEN ? ELSE leave_is_prompt END,
     kick_message = CASE WHEN ? = 'leave_kick' THEN ? ELSE kick_message END,
     kick_is_prompt = CASE WHEN ? = 'leave_kick' THEN ? ELSE kick_is_prompt END,
     ban_message = CASE WHEN ? = 'leave_ban' THEN ? ELSE ban_message END,
     ban_is_prompt = CASE WHEN ? = 'leave_ban' THEN ? ELSE ban_is_prompt END
 `),

 // Delete message by type
 deleteMessageByType: db.prepare(`
   UPDATE guild_settings SET
     welcome_message = CASE WHEN ? = 'welcome' THEN NULL ELSE welcome_message END,
     welcome_is_prompt = CASE WHEN ? = 'welcome' THEN NULL ELSE welcome_is_prompt END,
     leave_message = CASE WHEN ? = 'leave' THEN NULL ELSE leave_message END,
     leave_is_prompt = CASE WHEN ? = 'leave' THEN NULL ELSE leave_is_prompt END,
     kick_message = CASE WHEN ? = 'leave_kick' THEN NULL ELSE kick_message END,
     kick_is_prompt = CASE WHEN ? = 'leave_kick' THEN NULL ELSE kick_is_prompt END,
     ban_message = CASE WHEN ? = 'leave_ban' THEN NULL ELSE ban_message END,
     ban_is_prompt = CASE WHEN ? = 'leave_ban' THEN NULL ELSE ban_is_prompt END
   WHERE guild_id = ?
 `),

 /* --- EMOJIS DE REAÇÃO --- */
 reactionEmojiAdd: db.prepare('INSERT OR IGNORE INTO reaction_emojis (guild_id, reaction_emoji_id) VALUES (?, ?)'),
 reactionEmojiList: db.prepare('SELECT id, reaction_emoji_id FROM reaction_emojis WHERE guild_id = ?'),
 reactionEmojiDelete: db.prepare('DELETE FROM reaction_emojis WHERE guild_id = ? AND id = ?')
};

/* ----------------------------------------------------------
  Exportações públicas (mesma assinatura da versão antiga)
---------------------------------------------------------- */
module.exports = {
  // blacklist chatbot
  chatbotCanalNaBlacklist: (g, c) => !!stmts.chatbotExists.get(g, c),
  chatbotAdicionarCanal:   (g, c) => stmts.chatbotAdd.run(g, c).changes,
  chatbotRemoverCanal:     (g, c) => stmts.chatbotDel.run(g, c).changes,
  chatbotListarCanais:     (g)   => stmts.chatbotList.all(g),

  // blacklist XP
  xpCanalNaBlacklist: (g, c) => !!stmts.xpExists.get(g, c),
  xpAdicionarCanal:   (g, c) => stmts.xpAdd.run(g, c).changes,
  xpRemoverCanal:     (g, c) => stmts.xpDel.run(g, c).changes,
  xpListarCanais:     (g)   => stmts.xpList.all(g),

  // multiplicadores de cargo
  definirMultiplicadorRole:  (g, r, m) => stmts.multSet.run(g, r, m).changes,
  removerMultiplicadorRole:  (g, r)   => stmts.multDel.run(g, r).changes,
  listarMultiplicadoresRole: (g)     => stmts.multList.all(g),
  buscarMultiplicadoresParaUsuario: (g, roleIds) => {
    if (!roleIds.length) return [];
    return stmts.multByIds.all(g, JSON.stringify(roleIds)).map(r => r.multiplier);
  },

  // XP do usuário
  buscarUsuarioXP: (g, u) => stmts.xpGet.get(g, u) || null,
  atualizarUsuarioXP: (g, u, xpAdd, ts) => {
    const row   = stmts.xpGet.get(g, u);
    const oldLv = row?.nivel || 0;
    const newXp = (row?.xp || 0) + xpAdd;
    const newLv = Math.floor(newXp / 1000);
    stmts.xpUpsert.run(g, u, xpAdd, newLv, ts);
    return { levelUp: newLv > oldLv, novoNivel: newLv };
  },
  definirXP: (g, u, xp) => {
    const lv = Math.floor(xp / 1000);
    stmts.xpSet.run(g, u, xp, lv);
  },
  resetarXP: (g) => stmts.xpResetGuild.run(g).changes,
  removerUsuarioXP: (g, u) => stmts.xpDelUser.run(g, u).changes,
  buscarRank: (g, limit = 10) => stmts.rankTop.all(g, limit),

  // mensagens (salvando IDs do Discord)
  inserirMensagem: (g, c, u, messageId, ts) => stmts.msgInsert.run(g, c, u, messageId, ts).lastInsertRowid,
  buscarHistoricoConversa: (g, c, u, l = 3) =>
    stmts.msgHistory.all(g, c, u, l).map(r => r.message_id).reverse(),
  buscarHistoricoCanal: (g, c, l = 10) =>
    stmts.channelMsgHistory.all(g, c, l).reverse(),
  buscarHistoricoCanalRange: (g, c, limit, offset) =>
    stmts.channelMsgHistoryRange.all(g, c, limit, offset).reverse(),

  // --- NOVAS FUNÇÕES EXPORTADAS ---
  // configurações do servidor
  getSystemChannel: (g) => {
    const row = stmts.settingsGetChannel.get(g);
    return row ? row.system_channel_id : null;
  },
  setSystemChannel: (g, c) => stmts.settingsSetChannel.run(g, c).changes,

  // configurações de role congrats
  // retorna a primeira configuração (compatibilidade) — prefer lista via listRoleCongratsConfigs
  getRoleCongratsConfig: (g) => {
    const rows = stmts.rcList.all(g);
    if (rows && rows.length > 0) return { roleId: rows[0].role_id, prompt: rows[0].prompt, isPrompt: rows[0].is_prompt === 1 };
    const row = stmts.settingsGetRoleCongrats.get(g);
    if (!row || !row.role_congrats_role_id || !row.role_congrats_prompt) {
      return null;
    }
    return {
      roleId: row.role_congrats_role_id,
      prompt: row.role_congrats_prompt,
      isPrompt: false
    };
  },
  // lista todas as configurações de parabéns por cargo para uma guild
  listRoleCongratsConfigs: (g) => {
    const rows = stmts.rcList.all(g);
    if (rows && rows.length > 0) return rows.map(r => ({ roleId: r.role_id, prompt: r.prompt, isPrompt: r.is_prompt === 1 }));
    // fallback para configuração legada em guild_settings
    const legacy = stmts.settingsGetRoleCongrats.get(g);
    if (legacy && legacy.role_congrats_role_id && legacy.role_congrats_prompt) {
      return [{ roleId: legacy.role_congrats_role_id, prompt: legacy.role_congrats_prompt, isPrompt: false }];
    }
    return [];
  },
  setRoleCongratsConfig: (g, roleId, prompt, isPrompt = 0) => stmts.rcInsert.run(g, roleId, prompt, isPrompt ? 1 : 0).changes,
  // clearRoleCongratsConfig(g) -> limpa todas; clearRoleCongratsConfig(g, roleId) -> remove só o role
  clearRoleCongratsConfig: (g, roleId = null) => {
    if (roleId) return stmts.rcDelete.run(g, roleId).changes;
    return stmts.rcDeleteAll.run(g).changes;
  },

  // Segurança: helper manual para remover colunas legadas de guild_settings.
  // Não é chamado automaticamente — execute manualmente se tiver certeza de que os dados foram migrados.
  // Retorna { removed: true/false, reason }
  removeLegacyRoleCongratsColumnsIfSafe: () => {
    try {
      const count = db.prepare('SELECT COUNT(1) as c FROM guild_settings WHERE role_congrats_role_id IS NOT NULL OR role_congrats_prompt IS NOT NULL').get().c;
      if (count > 0) return { removed: false, reason: 'Existing legacy rows still present' };
      // SQLite doesn't support DROP COLUMN easily; user must rebuild table — return instruction
      return { removed: false, reason: 'Manual schema cleanup required: drop columns by recreating guild_settings table. See docs.' };
    } catch (e) {
      return { removed: false, reason: String(e) };
    }
  },

  // memórias de usuário (por guild)
  adicionarMemoriaUsuario: async (g, u, fact, opts = {}) => {
    try {
      /* --- Geração do fact_key --- */
      const factKey = String(fact ?? '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

      /* --- Geração do embedding para o fato --- */
      let embeddingJson = null;
      try {
        const embedding = await getGerarEmbedding()(fact);
        embeddingJson = JSON.stringify(embedding);
        console.log('[DATABASE][INFO] Embedding gerado para memória de usuário');
      } catch (embedError) {
        console.warn('[DATABASE][WARN] Falha ao gerar embedding, salvando sem embedding:', embedError.message);
      }

      /* --- Extração das opções --- */
      const { confidence = null, sourceMessageId = null, importance = null, createdAt = Date.now() } = opts || {};

      /* --- Inserção no banco de dados --- */
      const res = stmts.memInsert.run(g, u, fact, factKey, confidence, sourceMessageId, importance, embeddingJson, createdAt);
      return { inserted: res.changes > 0, duplicate: res.changes === 0, id: res.lastInsertRowid };

    } catch (error) {
      console.error('[DATABASE][ERROR] Falha ao adicionar memória de usuário:', error.message);
      throw error;
    }
  },
  listarMemoriasUsuario: (g, u, limit = 20, offset = 0) =>
    stmts.memList.all(g, u, limit, offset),
  removerMemoriaUsuario: (g, u, factKey) =>
    stmts.memDelete.run(g, u, factKey).changes,

  // Funções para buscar memórias com embeddings
  listarMemoriasUsuarioComEmbedding: (g, u, limit = 100, offset = 0) =>
    stmts.memGetWithEmbedding.all(g, u, limit, offset),
  listarMemoriasGuildComEmbedding: (g, limit = 100, offset = 0) =>
    stmts.guildMemGetWithEmbedding.all(g, limit, offset),

 // memórias da guild
 adicionarMemoriaGuild: async (g, fact) => {
   try {
     /* --- Geração do embedding para o fato --- */
     let embeddingJson = null;
     try {
       const embedding = await getGerarEmbedding()(fact);
       embeddingJson = JSON.stringify(embedding);
       console.log('[DATABASE][INFO] Embedding gerado para memória da guild');
     } catch (embedError) {
       console.warn('[DATABASE][WARN] Falha ao gerar embedding da guild, salvando sem embedding:', embedError.message);
     }

     /* --- Inserção no banco de dados --- */
     const createdAt = Date.now();
     const res = stmts.guildMemInsert.run(g, fact, embeddingJson, createdAt);
     return { id: res.lastInsertRowid, changes: res.changes };

   } catch (error) {
     console.error('[DATABASE][ERROR] Falha ao adicionar memória da guild:', error.message);
     throw error;
   }
 },
 listarMemoriasGuild: (g, limit = 20, offset = 0) => stmts.guildMemList.all(g, limit, offset),
 removerMemoriaGuild: (g, id) => stmts.guildMemDelete.run(g, id).changes,

 // Welcome/Leave messages
 setWelcomeMessage: (guildId, message, isPrompt) => {
   return stmts.welcomeSettingsSet.run({
       guild_id: guildId,
       message: message,
       is_prompt: isPrompt ? 1 : 0
   }).changes;
 },
 setLeaveMessage: (guildId, message, isPrompt) => {
   return stmts.leaveSettingsSet.run({
       guild_id: guildId,
       message: message,
       is_prompt: isPrompt ? 1 : 0
   }).changes;
 },
 setKickMessage: (guildId, message, isPrompt) => {
   return stmts.kickSettingsSet.run({
       guild_id: guildId,
       message: message,
       is_prompt: isPrompt ? 1 : 0
   }).changes;
 },
 setBanMessage: (guildId, message, isPrompt) => {
   return stmts.banSettingsSet.run({
       guild_id: guildId,
       message: message,
       is_prompt: isPrompt ? 1 : 0
   }).changes;
 },
 getBanMessage: (guildId) => {
   const row = stmts.banSettingsGet.get(guildId);
   if (!row || (row.ban_message === null && row.ban_is_prompt === null)) {
     return null;
   }
   return {
     message: row.ban_message,
     isPrompt: row.ban_is_prompt === 1
   };
 },
 getWelcomeLeaveSettings: (guildId) => stmts.msgSettingsGet.get(guildId) || null,

 // Individual message getters
 getWelcomeMessage: (guildId) => {
   const row = stmts.welcomeSettingsGet.get(guildId);
   if (!row || (row.welcome_message === null && row.welcome_is_prompt === null)) {
     return null;
   }
   return {
     message: row.welcome_message,
     isPrompt: row.welcome_is_prompt === 1
   };
 },
 getLeaveMessage: (guildId) => {
   const row = stmts.leaveSettingsGet.get(guildId);
   if (!row || (row.leave_message === null && row.leave_is_prompt === null)) {
     return null;
   }
   return {
     message: row.leave_message,
     isPrompt: row.leave_is_prompt === 1
   };
 },
 getKickMessage: (guildId) => {
   const row = stmts.kickSettingsGet.get(guildId);
   if (!row || (row.kick_message === null && row.kick_is_prompt === null)) {
     return null;
   }
   return {
     message: row.kick_message,
     isPrompt: row.kick_is_prompt === 1
   };
 },

 // Delete functions
 deleteWelcomeMessage: (guildId) => stmts.welcomeSettingsDelete.run(guildId).changes,
 deleteLeaveMessage: (guildId) => stmts.leaveSettingsDelete.run(guildId).changes,
 deleteKickMessage: (guildId) => stmts.kickSettingsDelete.run(guildId).changes,
 deleteBanMessage: (guildId) => stmts.banSettingsDelete.run(guildId).changes,

 // Generic message functions by type
 getMessageByType: (guildId, type) => {
   const row = stmts.getMessageByType.get(type, type, guildId);
   if (!row || (row.message === null && row.is_prompt === null)) {
     return null;
   }
   return {
     message: row.message,
     isPrompt: row.is_prompt === 1
   };
 },
 setMessageByType: (guildId, type, message, isPrompt) => {
   const sqlType = type === 'kick' ? 'leave_kick' : type === 'ban' ? 'leave_ban' : type;
   return stmts.setMessageByType.run(
     guildId,
     sqlType, message, sqlType, isPrompt ? 1 : 0,
     sqlType, message, sqlType, isPrompt ? 1 : 0,
     sqlType, message, sqlType, isPrompt ? 1 : 0,
     sqlType, message, sqlType, isPrompt ? 1 : 0
   ).changes;
 },
 deleteMessageByType: (guildId, type) => {
   const sqlType = type === 'kick' ? 'leave_kick' : type === 'ban' ? 'leave_ban' : type;
   return stmts.deleteMessageByType.run(
     sqlType, sqlType, sqlType, sqlType, sqlType, sqlType, sqlType, sqlType, guildId
   ).changes;
 },

 /* --- EMOJIS DE REAÇÃO --- */
 addReactionEmoji: (guildId, emojiId) => stmts.reactionEmojiAdd.run(guildId, emojiId).changes,
 listReactionEmojis: (guildId) => stmts.reactionEmojiList.all(guildId),
 deleteReactionEmoji: (guildId, id) => stmts.reactionEmojiDelete.run(guildId, id).changes,

// helper para graceful shutdown
close: () => db.close()
};