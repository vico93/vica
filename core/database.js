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
   Criação de tabelas (idempotente)
---------------------------------------------------------- */
db.exec(`
CREATE TABLE IF NOT EXISTS mensagens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  canal_id TEXT NOT NULL,
  usuario_id TEXT NOT NULL,
  conteudo TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  response_id TEXT
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
  system_channel_id TEXT
);
`);

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

  /* --- Mensagens para histórico da IA --- */
  msgInsert:  db.prepare('INSERT INTO mensagens (guild_id, canal_id, usuario_id, conteudo, timestamp) VALUES (?, ?, ?, ?, ?)'),
  msgHistory: db.prepare('SELECT conteudo FROM mensagens WHERE guild_id=? AND canal_id=? AND usuario_id=? ORDER BY timestamp DESC LIMIT ?'),
  
  /* --- NOVAS STATEMENTS PARA CONFIGURAÇÕES DO SERVIDOR --- */
  settingsGetChannel: db.prepare('SELECT system_channel_id FROM guild_settings WHERE guild_id = ?'),
  settingsSetChannel: db.prepare(`INSERT INTO guild_settings (guild_id, system_channel_id)
                                  VALUES (?, ?)
                                  ON CONFLICT(guild_id) DO UPDATE SET system_channel_id = excluded.system_channel_id`)
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

  // mensagens
  inserirMensagem: (g, c, u, txt, ts) => stmts.msgInsert.run(g, c, u, txt, ts).lastInsertRowid,
  buscarHistoricoConversa: (g, c, u, l = 3) =>
    stmts.msgHistory.all(g, c, u, l).map(r => r.conteudo).reverse(),

  // --- NOVAS FUNÇÕES EXPORTADAS ---
  // configurações do servidor
  getSystemChannel: (g) => {
    const row = stmts.settingsGetChannel.get(g);
    return row ? row.system_channel_id : null;
  },
  setSystemChannel: (g, c) => stmts.settingsSetChannel.run(g, c).changes,

  // helper para graceful shutdown
  close: () => db.close()
};