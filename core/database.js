// Arquivo: core/database.js

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'database.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('[DB] Erro ao conectar ao SQLite:', err.message);
  } else {
    console.log('[DB] Conectado ao SQLite em', dbPath);
  }
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS mensagens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      canal_id TEXT NOT NULL,
      usuario_id TEXT NOT NULL,
      conteudo TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      response_id TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS rank_xp (
      guild_id TEXT NOT NULL,
      usuario_id TEXT NOT NULL,
      xp INTEGER DEFAULT 0,
      nivel INTEGER DEFAULT 0,
      total_mensagens INTEGER DEFAULT 0,
      ultima_mensagem_timestamp INTEGER DEFAULT 0,
      PRIMARY KEY (guild_id, usuario_id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS blacklist_chatbot_canais (
      guild_id TEXT NOT NULL,
      canal_id TEXT NOT NULL,
      PRIMARY KEY (guild_id, canal_id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS blacklist_xp_canais (
      guild_id TEXT NOT NULL,
      canal_id TEXT NOT NULL,
      PRIMARY KEY (guild_id, canal_id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS rank_role_multipliers (
      guild_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      multiplier REAL NOT NULL,
      PRIMARY KEY (guild_id, role_id)
    )
  `);
});

// --- Chatbot Blacklist Functions ---
function chatbotCanalNaBlacklist(guildId, canalId) {
  return new Promise((resolve, reject) => {
    const query = `SELECT 1 FROM blacklist_chatbot_canais WHERE guild_id = ? AND canal_id = ? LIMIT 1`;
    db.get(query, [guildId, canalId], (err, row) => err ? reject(err) : resolve(!!row));
  });
}
function chatbotAdicionarCanal(guildId, canalId) {
  return new Promise((resolve, reject) => {
    const query = `INSERT OR IGNORE INTO blacklist_chatbot_canais (guild_id, canal_id) VALUES (?, ?)`;
    db.run(query, [guildId, canalId], function(err) { err ? reject(err) : resolve(this.changes) });
  });
}
function chatbotRemoverCanal(guildId, canalId) {
  return new Promise((resolve, reject) => {
    const query = `DELETE FROM blacklist_chatbot_canais WHERE guild_id = ? AND canal_id = ?`;
    db.run(query, [guildId, canalId], function(err) { err ? reject(err) : resolve(this.changes) });
  });
}
function chatbotListarCanais(guildId) {
  return new Promise((resolve, reject) => {
    const query = `SELECT canal_id FROM blacklist_chatbot_canais WHERE guild_id = ?`;
    db.all(query, [guildId], (err, rows) => err ? reject(err) : resolve(rows));
  });
}

// --- XP Blacklist Functions ---
function xpCanalNaBlacklist(guildId, canalId) {
  return new Promise((resolve, reject) => {
    const query = `SELECT 1 FROM blacklist_xp_canais WHERE guild_id = ? AND canal_id = ? LIMIT 1`;
    db.get(query, [guildId, canalId], (err, row) => err ? reject(err) : resolve(!!row));
  });
}
function xpAdicionarCanal(guildId, canalId) {
  return new Promise((resolve, reject) => {
    const query = `INSERT OR IGNORE INTO blacklist_xp_canais (guild_id, canal_id) VALUES (?, ?)`;
    db.run(query, [guildId, canalId], function(err) { err ? reject(err) : resolve(this.changes) });
  });
}
function xpRemoverCanal(guildId, canalId) {
  return new Promise((resolve, reject) => {
    const query = `DELETE FROM blacklist_xp_canais WHERE guild_id = ? AND canal_id = ?`;
    db.run(query, [guildId, canalId], function(err) { err ? reject(err) : resolve(this.changes) });
  });
}
function xpListarCanais(guildId) {
  return new Promise((resolve, reject) => {
    const query = `SELECT canal_id FROM blacklist_xp_canais WHERE guild_id = ?`;
    db.all(query, [guildId], (err, rows) => err ? reject(err) : resolve(rows));
  });
}

// --- XP Multiplier Functions ---
function definirMultiplicadorRole(guildId, roleId, multiplier) {
    return new Promise((resolve, reject) => {
        const query = `INSERT INTO rank_role_multipliers (guild_id, role_id, multiplier) VALUES (?, ?, ?)
                       ON CONFLICT(guild_id, role_id) DO UPDATE SET multiplier = excluded.multiplier`;
        db.run(query, [guildId, roleId, multiplier], function(err) { err ? reject(err) : resolve(this.changes) });
    });
}
function removerMultiplicadorRole(guildId, roleId) {
    return new Promise((resolve, reject) => {
        const query = `DELETE FROM rank_role_multipliers WHERE guild_id = ? AND role_id = ?`;
        db.run(query, [guildId, roleId], function(err) { err ? reject(err) : resolve(this.changes) });
    });
}
function listarMultiplicadoresRole(guildId) {
    return new Promise((resolve, reject) => {
        const query = `SELECT role_id, multiplier FROM rank_role_multipliers WHERE guild_id = ?`;
        db.all(query, [guildId], (err, rows) => err ? reject(err) : resolve(rows));
    });
}
function buscarMultiplicadoresParaUsuario(guildId, roleIds) {
    return new Promise((resolve, reject) => {
        if (roleIds.length === 0) return resolve([]);
        const placeholders = roleIds.map(() => '?').join(',');
        const query = `SELECT multiplier FROM rank_role_multipliers WHERE guild_id = ? AND role_id IN (${placeholders})`;
        db.all(query, [guildId, ...roleIds], (err, rows) => err ? reject(err) : resolve(rows.map(r => r.multiplier)));
    });
}

// --- Ranking Functions ---
function buscarUsuarioXP(guildId, usuarioId) {
  return new Promise((resolve, reject) => {
    const query = `SELECT * FROM rank_xp WHERE guild_id = ? AND usuario_id = ?`;
    db.get(query, [guildId, usuarioId], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function atualizarUsuarioXP(guildId, usuarioId, xpAdicional, timestamp) {
  return new Promise(async (resolve, reject) => {
    try {
      const insertQuery = `INSERT OR IGNORE INTO rank_xp (guild_id, usuario_id) VALUES (?, ?)`;
      await new Promise((res, rej) => db.run(insertQuery, [guildId, usuarioId], (err) => err ? rej(err) : res()));

      const usuarioAtual = await buscarUsuarioXP(guildId, usuarioId);
      const novoXp = usuarioAtual.xp + xpAdicional;
      const novoNivel = Math.floor(novoXp / 1000);

      const updateQuery = `
        UPDATE rank_xp
        SET
          xp = ?,
          nivel = ?,
          total_mensagens = total_mensagens + 1,
          ultima_mensagem_timestamp = ?
        WHERE guild_id = ? AND usuario_id = ?
      `;
      db.run(updateQuery, [novoXp, novoNivel, timestamp, guildId, usuarioId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ levelUp: novoNivel > usuarioAtual.nivel, novoNivel: novoNivel });
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

// --- Message Functions ---
function inserirMensagem(guildId, canalId, usuarioId, conteudo, timestamp) {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO mensagens (guild_id, canal_id, usuario_id, conteudo, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `;
    db.run(query, [guildId, canalId, usuarioId, conteudo, timestamp], function(err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });
  });
}

function buscarHistoricoConversa(guildId, canalId, usuarioId, limit = 3) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT conteudo FROM mensagens
      WHERE guild_id = ? AND canal_id = ? AND usuario_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `;
    db.all(query, [guildId, canalId, usuarioId, limit], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows.map(r => r.conteudo).reverse());
      }
    });
  });
}


module.exports = {
  // Chatbot
  chatbotCanalNaBlacklist,
  chatbotAdicionarCanal,
  chatbotRemoverCanal,
  chatbotListarCanais,
  // XP
  xpCanalNaBlacklist,
  xpAdicionarCanal,
  xpRemoverCanal,
  xpListarCanais,
  // Multiplicadores
  definirMultiplicadorRole,
  removerMultiplicadorRole,
  listarMultiplicadoresRole,
  buscarMultiplicadoresParaUsuario,
  // Ranking
  buscarUsuarioXP,
  atualizarUsuarioXP,
  // Mensagens
  inserirMensagem,
  buscarHistoricoConversa,
};