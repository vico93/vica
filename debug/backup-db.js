// debug/backup-db.js
// Simple DB backup utility. Copies data/database.db to data/database.db.TIMESTAMP.bak

const fs = require('fs');
const path = require('path');

const src = path.resolve(process.cwd(), 'data', 'database.db');
const dest = path.resolve(process.cwd(), 'data', `database.db.${Date.now()}.bak`);

try {
  fs.copyFileSync(src, dest, fs.constants.COPYFILE_FICLONE || 0);
  console.log('Backup created:', dest);
  process.exit(0);
} catch (e) {
  console.error('Backup failed:', e);
  process.exit(2);
}
