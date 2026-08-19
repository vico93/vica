import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { initDatabase } from '../src/db/index.js';
import { Logger } from '../src/utils/logger.js';

test('initDatabase cria tabelas e aplica schema migration v1', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vica-db-test-'));
  const dbPath = path.join(tempDir, 'test.sqlite');

  const db = initDatabase(dbPath);
  assert.ok(fs.existsSync(dbPath));

  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  assert.ok(tables.includes('schema_migrations'));
  assert.ok(tables.includes('users'));
  assert.ok(tables.includes('xp'));
  assert.ok(tables.includes('settings'));
  assert.ok(tables.includes('conversations'));

  const migration = db.prepare('SELECT version FROM schema_migrations WHERE version = 1').get();
  assert.equal(migration.version, 1);

  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('Logger formata e respeita níveis', (t) => {
  const logger = new Logger('warn');
  assert.equal(logger.levelName, 'warn');
  
  // Teste de mutação de nível
  logger.setLevel('debug');
  assert.equal(logger.levelName, 'debug');
});
