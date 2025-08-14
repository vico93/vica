// debug/inspect-legacy-guild-settings.js
// Prints any rows in guild_settings that still contain legacy role_congrats data.

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(process.cwd(), 'data', 'database.db');
const db = new Database(dbPath, { readonly: true });

try {
  const cols = db.prepare('PRAGMA table_info(guild_settings)').all();
  if (!cols || cols.length === 0) {
    console.log('No guild_settings table found; nothing to inspect.');
    process.exit(0);
  }

  const hasLegacy = cols.some(c => c.name === 'role_congrats_role_id' || c.name === 'role_congrats_prompt');
  console.log('Found guild_settings table. legacyColumnsPresent=', hasLegacy);

  if (!hasLegacy) {
    console.log('No legacy columns present; nothing to inspect.');
    process.exit(0);
  }

  const rows = db.prepare("SELECT guild_id, role_congrats_role_id AS role_id, role_congrats_prompt AS prompt FROM guild_settings WHERE role_congrats_role_id IS NOT NULL OR role_congrats_prompt IS NOT NULL").all();
  if (!rows || rows.length === 0) {
    console.log('No legacy rows with non-null values found.');
    process.exit(0);
  }

  console.log(`Found ${rows.length} legacy row(s):`);
  for (const r of rows) {
    console.log(JSON.stringify(r));
  }
  process.exit(0);
} catch (e) {
  console.error('ERROR inspecting DB:', e);
  process.exit(2);
} finally {
  try { db.close(); } catch (e) {}
}
