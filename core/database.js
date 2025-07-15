// core/database.js  (v2 – performance edition)
const Database = require('better-sqlite3');
const path     = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'database.db');
const db     = new Database(dbPath);

// Performance tuning
db.pragma('journal_mode = WAL');
db.pragma('synchronous  = NORMAL');

// ------------------------------------------------------------------
// Schema (run once, safe to re-run)
// ------------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS mensagens (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
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
  xp        INTEGER DEFAULT 0,
  nivel     INTEGER DEFAULT 0,
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
`);

// ------------------------------------------------------------------
// Prepared statements
// ------------------------------------------------------------------
const stmts = {
  // Chatbot blacklist
  chatbotExists : db.prepare(`SELECT 1 FROM blacklist_chatbot_canais WHERE guild_id=? AND canal_id=? LIMIT 1`),
  chatbotAdd    : db.prepare(`INSERT OR IGNORE INTO blacklist_chatbot_canais (guild_id,canal_id) VALUES (?,?)`),
  chatbotDel    : db.prepare(`DELETE FROM blacklist_chatbot_canais WHERE guild_id=? AND canal_id=?`),
  chatbotList   : db.prepare(`SELECT canal_id FROM blacklist_chatbot_canais WHERE guild_id=?`),

  // XP blacklist
  xpExists : db.prepare(`SELECT 1 FROM blacklist_xp_canais WHERE guild_id=? AND canal_id=? LIMIT 1`),
  xpAdd    : db.prepare(`INSERT OR IGNORE INTO blacklist_xp_canais (guild_id,canal_id) VALUES (?,?)`),
  xpDel    : db.prepare(`DELETE FROM blacklist_xp_canais WHERE guild_id=? AND canal_id=?`),
  xpList   : db.prepare(`SELECT canal_id FROM blacklist_xp_canais WHERE guild_id=?`),

  // Multipliers
  multSet   : db.prepare(`INSERT INTO rank_role_multipliers (guild_id,role_id,multiplier) VALUES (?,?,?)
                         ON CONFLICT(guild_id,role_id) DO UPDATE SET multiplier=excluded.multiplier`),
  multDel   : db.prepare(`DELETE FROM rank_role_multipliers WHERE guild_id=? AND role_id=?`),
  multList  : db.prepare(`SELECT role_id,multiplier FROM rank_role_multipliers WHERE guild_id=?`),
  multByIds : db.prepare(`SELECT multiplier FROM rank_role_multipliers WHERE guild_id=? AND role_id IN (SELECT value FROM json_each(?))`),

  // XP
  xpGet        : db.prepare(`SELECT * FROM rank_xp WHERE guild_id=? AND usuario_id=?`),
  xpUpsert     : db.prepare(`INSERT INTO rank_xp (guild_id,usuario_id,xp,nivel,ultima_mensagem_timestamp)
                               VALUES (?,?,?,?,?)
                             ON CONFLICT(guild_id,usuario_id) DO UPDATE
                               SET xp = xp + excluded.xp,
                                   nivel = excluded.nivel,
                                   total_mensagens = total_mensagens + 1,
                                   ultima_mensagem_timestamp = excluded.ultima_mensagem_timestamp`),
  xpSet        : db.prepare(`INSERT INTO rank_xp (guild_id,usuario_id,xp,nivel)
                             VALUES (?,?,?,?) ON CONFLICT(guild_id,usuario_id) DO UPDATE
                             SET xp=excluded.xp, nivel=excluded.nivel`),
  xpResetGuild : db.prepare(`DELETE FROM rank_xp WHERE guild_id=?`),
  rankTop      : db.prepare(`SELECT usuario_id,xp,nivel FROM rank_xp WHERE guild_id=? ORDER BY xp DESC LIMIT ?`),

  // Mensagens
  msgInsert : db.prepare(`INSERT INTO mensagens (guild_id,canal_id,usuario_id,conteudo,timestamp) VALUES (?,?,?,?,?)`),
  msgHistory: db.prepare(`SELECT conteudo FROM mensagens WHERE guild_id=? AND canal_id=? AND usuario_id=? ORDER BY timestamp DESC LIMIT ?`)
};

// ------------------------------------------------------------------
// Helper wrappers (same API as before)
// ------------------------------------------------------------------
module.exports = {
  // Chatbot blacklist
  chatbotCanalNaBlacklist : (g,c) => !!stmts.chatbotExists.get(g,c),
  chatbotAdicionarCanal   : (g,c) => stmts.chatbotAdd.run(g,c).changes,
  chatbotRemoverCanal     : (g,c) => stmts.chatbotDel.run(g,c).changes,
  chatbotListarCanais     : (g)   => stmts.chatbotList.all(g),

  // XP blacklist
  xpCanalNaBlacklist : (g,c) => !!stmts.xpExists.get(g,c),
  xpAdicionarCanal   : (g,c) => stmts.xpAdd.run(g,c).changes,
  xpRemoverCanal     : (g,c) => stmts.xpDel.run(g,c).changes,
  xpListarCanais     : (g)   => stmts.xpList.all(g),

  // Multipliers
  definirMultiplicadorRole  : (g,r,m) => stmts.multSet.run(g,r,m).changes,
  removerMultiplicadorRole  : (g,r)   => stmts.multDel.run(g,r).changes,
  listarMultiplicadoresRole : (g)     => stmts.multList.all(g),
  buscarMultiplicadoresParaUsuario(g, roleIds) {
    if (!roleIds.length) return [];
    const rows = stmts.multByIds.all(g, JSON.stringify(roleIds));
    return rows.map(r => r.multiplier);
  },

  // XP
  buscarUsuarioXP(g,u) { return stmts.xpGet.get(g,u) || null; },
  async atualizarUsuarioXP(g,u,xpAdd,ts) {
    const row = stmts.xpGet.get(g,u);
    const oldLvl = row ? row.nivel : 0;
    const newXp  = (row ? row.xp : 0) + xpAdd;
    const newLvl = Math.floor(newXp / 1000);
    stmts.xpUpsert.run(g,u,xpAdd,newLvl,ts);
    return { levelUp: newLvl > oldLvl, novoNivel: newLvl };
  },
  definirXP(g,u,xp) {
    const lvl = Math.floor(xp / 1000);
    stmts.xpSet.run(g,u,xp,lvl);
  },
  resetarXP(g) { return stmts.xpResetGuild.run(g).changes; },
  buscarRank(g,limit=10) { return stmts.rankTop.all(g,limit); },

  // Mensagens
  inserirMensagem(g,c,u,txt,ts) { return stmts.msgInsert.run(g,c,u,txt,ts).lastInsertRowid; },
  buscarHistoricoConversa(g,c,u,l=3) {
    return stmts.msgHistory.all(g,c,u,l).map(r=>r.conteudo).reverse();
  },

  // Graceful close helper
  close() { db.close(); }
};