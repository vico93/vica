// debug/migrate-legacy-role-congrats.js
// Migrates any legacy role_congrats columns from guild_settings into the new role_congrats table
// and clears the legacy columns for those guilds.

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(process.cwd(), 'data', 'database.db');
const db = new Database(dbPath);

try {
  const cols = db.prepare('PRAGMA table_info(guild_settings)').all();
  if (!cols || cols.length === 0) {
    console.log('No guild_settings table found; nothing to migrate.');
    process.exit(0);
  }
  const hasLegacy = cols.some(c => c.name === 'role_congrats_role_id' || c.name === 'role_congrats_prompt');
  if (!hasLegacy) {
    console.log('No legacy columns present; nothing to migrate.');
    process.exit(0);
  }

  const rows = db.prepare("SELECT guild_id, role_congrats_role_id AS role_id, role_congrats_prompt AS prompt FROM guild_settings WHERE role_congrats_role_id IS NOT NULL OR role_congrats_prompt IS NOT NULL").all();
  if (!rows || rows.length === 0) {
    console.log('No legacy rows with non-null values found.');
    process.exit(0);
  }

  const insert = db.prepare('INSERT INTO role_congrats (guild_id, role_id, prompt) VALUES (?, ?, ?) ON CONFLICT(guild_id, role_id) DO UPDATE SET prompt=excluded.prompt');
  const clear = db.prepare('UPDATE guild_settings SET role_congrats_role_id = NULL, role_congrats_prompt = NULL WHERE guild_id = ?');

  db.exec('BEGIN');
  let migrated = 0;
  for (const r of rows) {
    if (!r.role_id || !r.prompt) {
      // skip partial/invalid rows but still clear
      console.log('Skipping invalid legacy row (missing role or prompt) for guild', r.guild_id);
      clear.run(r.guild_id);
      continue;
    }
    insert.run(r.guild_id, r.role_id, r.prompt);
    clear.run(r.guild_id);
    console.log('Migrated guild:', r.guild_id);
    migrated++;
  }
  db.exec('COMMIT');
  console.log(`Migration complete. Cleared legacy columns for ${migrated} migrated row(s).`);
  process.exit(0);
} catch (e) {
  try { db.exec('ROLLBACK'); } catch (er) {}
  console.error('ERROR during migration:', e);
  process.exit(2);
} finally {
  try { db.close(); } catch (e) {}
}
