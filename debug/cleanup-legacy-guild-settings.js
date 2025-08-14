// debug/cleanup-legacy-guild-settings.js
// Recreates guild_settings without legacy columns, but only if there are no rows with legacy data.

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(process.cwd(), 'data', 'database.db');
const db = new Database(dbPath);

try {
  const cols = db.prepare('PRAGMA table_info(guild_settings)').all();
  if (!cols || cols.length === 0) {
    console.log('No guild_settings table found; nothing to do.');
    process.exit(0);
  }

  const hasLegacy = cols.some(c => c.name === 'role_congrats_role_id' || c.name === 'role_congrats_prompt');
  if (!hasLegacy) {
    console.log('No legacy columns present; nothing to do.');
    process.exit(0);
  }

  const row = db.prepare('SELECT COUNT(1) as c FROM guild_settings WHERE role_congrats_role_id IS NOT NULL OR role_congrats_prompt IS NOT NULL').get();
  if (row.c > 0) {
    console.error('Refusing to remove legacy columns: found', row.c, 'rows with legacy data. Migrate them first.');
    process.exit(1);
  }

  console.log('No legacy rows found — recreating guild_settings without legacy columns...');
  db.exec('BEGIN TRANSACTION');
  db.exec('CREATE TABLE guild_settings_new (guild_id TEXT PRIMARY KEY, system_channel_id TEXT)');
  db.exec('INSERT INTO guild_settings_new (guild_id, system_channel_id) SELECT guild_id, system_channel_id FROM guild_settings');
  db.exec('DROP TABLE guild_settings');
  db.exec('ALTER TABLE guild_settings_new RENAME TO guild_settings');
  db.exec('COMMIT');
  console.log('Recreated guild_settings without legacy columns.');
  process.exit(0);
} catch (e) {
  try { db.exec('ROLLBACK'); } catch (er) {}
  console.error('ERROR during cleanup:', e);
  process.exit(2);
} finally {
  try { db.close(); } catch (e) {}
}
