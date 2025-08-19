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

-- TABELA PARA MÚLTIPLAS CONFIGURAÇÕES DE PARABÉNS POR CARGO --
CREATE TABLE IF NOT EXISTS role_congrats (
  guild_id TEXT NOT NULL,
  role_id  TEXT NOT NULL,
  prompt   TEXT NOT NULL,
  PRIMARY KEY (guild_id, role_id)
);

-- Migrações: se existir configuração legada em guild_settings, copie para role_congrats
INSERT OR IGNORE INTO role_congrats (guild_id, role_id, prompt)
  SELECT guild_id, role_congrats_role_id, role_congrats_prompt
  FROM guild_settings
  WHERE role_congrats_role_id IS NOT NULL AND role_congrats_prompt IS NOT NULL;

-- TABELA DE MEMÓRIAS DA GUILD --
CREATE TABLE IF NOT EXISTS guild_memories (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 guild_id TEXT NOT NULL,
 fact TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_guild_memories_guild_created
 ON guild_memories (guild_id, created_at DESC);
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

  /* --- NOVA TABELA: MULTIPLAS CONFIGS role_congrats --- */
  rcInsert:   db.prepare(`INSERT INTO role_congrats (guild_id, role_id, prompt)
                         VALUES (?, ?, ?)
                         ON CONFLICT(guild_id, role_id) DO UPDATE SET prompt=excluded.prompt`),
  rcDelete:   db.prepare('DELETE FROM role_congrats WHERE guild_id=? AND role_id=?'),
  rcDeleteAll:db.prepare('DELETE FROM role_congrats WHERE guild_id=?'),
  rcList:     db.prepare('SELECT role_id, prompt FROM role_congrats WHERE guild_id=?'),

  /* --- MEMÓRIAS DE USUÁRIO --- */
  memInsert: db.prepare(`INSERT OR IGNORE INTO user_memories
                         (guild_id, user_id, fact, fact_key, confidence, source_message_id, created_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?)`),
  memList:   db.prepare(`SELECT id, fact, confidence, source_message_id, created_at
                         FROM user_memories
                         WHERE guild_id = ? AND user_id = ?
                         ORDER BY created_at DESC
                         LIMIT ? OFFSET ?`),
 
 /* --- MEMÓRIAS DE GUILD --- */
 guildMemInsert: db.prepare('INSERT INTO guild_memories (guild_id, fact, created_at) VALUES (?, ?, ?)'),
 guildMemList:   db.prepare('SELECT id, fact, created_at FROM guild_memories WHERE guild_id = ? ORDER BY created_at DESC'),
 guildMemDelete: db.prepare('DELETE FROM guild_memories WHERE guild_id = ? AND id = ?')
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
  // retorna a primeira configuração (compatibilidade) — prefer lista via listRoleCongratsConfigs
  getRoleCongratsConfig: (g) => {
    const rows = stmts.rcList.all(g);
    if (rows && rows.length > 0) return { roleId: rows[0].role_id, prompt: rows[0].prompt };
    const row = stmts.settingsGetRoleCongrats.get(g);
    if (!row || !row.role_congrats_role_id || !row.role_congrats_prompt) {
      return null;
    }
    return {
      roleId: row.role_congrats_role_id,
      prompt: row.role_congrats_prompt
    };
  },
  // lista todas as configurações de parabéns por cargo para uma guild
  listRoleCongratsConfigs: (g) => {
    const rows = stmts.rcList.all(g);
    if (rows && rows.length > 0) return rows.map(r => ({ roleId: r.role_id, prompt: r.prompt }));
    // fallback para configuração legada em guild_settings
    const legacy = stmts.settingsGetRoleCongrats.get(g);
    if (legacy && legacy.role_congrats_role_id && legacy.role_congrats_prompt) {
      return [{ roleId: legacy.role_congrats_role_id, prompt: legacy.role_congrats_prompt }];
    }
    return [];
  },
  setRoleCongratsConfig: (g, roleId, prompt) => stmts.rcInsert.run(g, roleId, prompt).changes,
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

 // memórias da guild
 adicionarMemoriaGuild: (g, fact) => {
   const res = stmts.guildMemInsert.run(g, fact, Date.now());
   return { id: res.lastInsertRowid, changes: res.changes };
 },
 listarMemoriasGuild: (g) => stmts.guildMemList.all(g),
 removerMemoriaGuild: (g, id) => stmts.guildMemDelete.run(g, id).changes,

 // helper para graceful shutdown
 close: () => db.close()
};