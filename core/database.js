/*
** caminho: core/database.js
** últimaMod: 16/07/2025 22:22
** autor: Vico
** colaboração: ChatGPT, Gemini, Kimi AI
*/

/*
  Módulo de acesso ao banco de dados.
  Utiliza better-sqlite3 para alta performance.
  Todas as funções são síncronas (non-blocking graças ao driver).
  Mantém prepared statements para evitar re-parsing de SQL.
*/

const Database = require('better-sqlite3');
const path = require('path');

// Caminho absoluto para o arquivo do banco
const dbPath = path.join(__dirname, '..', 'data', 'database.db');
const db = new Database(dbPath);

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
  created_at INTEGER NOT NULL,
  UNIQUE (guild_id, user_id, fact_key) ON CONFLICT IGNORE
);
CREATE INDEX IF NOT EXISTS idx_user_memories_guild_user_created
  ON user_memories (guild_id, user_id, created_at DESC);
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

  /* --- MEMÓRIAS DE USUÁRIO --- */
  memInsert: db.prepare(`INSERT OR IGNORE INTO user_memories
                         (guild_id, user_id, fact, fact_key, confidence, source_message_id, created_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?)`),
  memList:   db.prepare(`SELECT id, fact, confidence, source_message_id, created_at
                         FROM user_memories
                         WHERE guild_id = ? AND user_id = ?
                         ORDER BY created_at DESC
                         LIMIT ? OFFSET ?`)
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

  // --- NOVAS FUNÇÕES EXPORTADAS ---
  // configurações do servidor
  getSystemChannel: (g) => {
    const row = stmts.settingsGetChannel.get(g);
    return row ? row.system_channel_id : null;
  },
  setSystemChannel: (g, c) => stmts.settingsSetChannel.run(g, c).changes,

  // configurações de role congrats
  getRoleCongratsConfig: (g) => {
    const row = stmts.settingsGetRoleCongrats.get(g);
    if (!row || !row.role_congrats_role_id || !row.role_congrats_prompt) {
      return null;
    }
    return {
      roleId: row.role_congrats_role_id,
      prompt: row.role_congrats_prompt
    };
  },
  setRoleCongratsConfig: (g, roleId, prompt) => stmts.settingsSetRoleCongrats.run(g, roleId, prompt).changes,
  clearRoleCongratsConfig: (g) => stmts.settingsClearRoleCongrats.run(g).changes,

  // memórias de usuário (por guild)
  adicionarMemoriaUsuario: (g, u, fact, opts = {}) => {
    const { confidence = null, sourceMessageId = null, createdAt = Date.now() } = opts || {};
    const factKey = String(fact ?? '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    const res = stmts.memInsert.run(g, u, fact, factKey, confidence, sourceMessageId, createdAt);
    return { inserted: res.changes > 0, duplicate: res.changes === 0, id: res.lastInsertRowid };
  },
  listarMemoriasUsuario: (g, u, limit = 20, offset = 0) =>
    stmts.memList.all(g, u, limit, offset),

  // helper para graceful shutdown
  close: () => db.close()
};