import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';

/**
 * Inicializa a conexão SQLite e aplica migrations.
 * @param {string} dbPath
 * @returns {Database.Database}
 */
export function initDatabase(dbPath) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Executa schema inicial
  const schemaPath = path.resolve(import.meta.dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schemaSql);

  // Registra migration v1 se ainda não registrada
  const row = db.prepare('SELECT version FROM schema_migrations WHERE version = 1').get();
  if (!row) {
    db.prepare('INSERT INTO schema_migrations (version) VALUES (1)').run();
    logger.debug('Schema inicial (v1) aplicado com sucesso.');
  }

  logger.info(`Banco de dados SQLite inicializado em: ${dbPath}`);
  return db;
}
