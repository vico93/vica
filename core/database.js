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
    CREATE TABLE IF NOT EXISTS canais_blacklist (
      guild_id TEXT NOT NULL,
      canal_id TEXT NOT NULL,
      PRIMARY KEY (guild_id, canal_id)
    )
  `);
});

function canalNaBlacklist(guildId, canalId) {
  return new Promise((resolve, reject) => {
    const query = `SELECT 1 FROM canais_blacklist WHERE guild_id = ? AND canal_id = ? LIMIT 1`;
    db.get(query, [guildId, canalId], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(!!row);
      }
    });
  });
}

function adicionarCanalBlacklist(guildId, canalId) {
  return new Promise((resolve, reject) => {
    const query = `INSERT OR IGNORE INTO canais_blacklist (guild_id, canal_id) VALUES (?, ?)`;
    db.run(query, [guildId, canalId], function(err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
}

function removerCanalBlacklist(guildId, canalId) {
  return new Promise((resolve, reject) => {
    const query = `DELETE FROM canais_blacklist WHERE guild_id = ? AND canal_id = ?`;
    db.run(query, [guildId, canalId], function(err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
}

function listarCanaisBlacklist(guildId) {
  return new Promise((resolve, reject) => {
    const query = `SELECT canal_id FROM canais_blacklist WHERE guild_id = ?`;
    db.all(query, [guildId], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

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

function buscarUltimoResponseId(guildId, canalId, usuarioId) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT response_id FROM mensagens
      WHERE guild_id = ? AND canal_id = ? AND usuario_id = ? AND response_id IS NOT NULL
      ORDER BY timestamp DESC LIMIT 1
    `;
    db.get(query, [guildId, canalId, usuarioId], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row ? row.response_id : null);
      }
    });
  });
}

function atualizarUltimoResponseId(guildId, canalId, usuarioId, novoResponseId) {
  return new Promise((resolve, reject) => {
    const query = `
      UPDATE mensagens SET response_id = ?
      WHERE id = (
        SELECT id FROM mensagens
        WHERE guild_id = ? AND canal_id = ? AND usuario_id = ?
        ORDER BY timestamp DESC LIMIT 1
      )
    `;
    db.run(query, [novoResponseId, guildId, canalId, usuarioId], function(err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
}

module.exports = {
  canalNaBlacklist,
  adicionarCanalBlacklist,
  removerCanalBlacklist,
  listarCanaisBlacklist,
  inserirMensagem,
  buscarUltimoResponseId,
  atualizarUltimoResponseId,
};