import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { adminCommand } from '../src/commands/admin.js';
import { initDatabase } from '../src/db/index.js';
import { CommandRegistry } from '../src/commands/registry.js';

test('adminCommand bloqueia não-admins e permite alterar prefix e emoji', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vica-admin-test-'));
  const dbPath = path.join(tempDir, 'test.sqlite');
  const db = initDatabase(dbPath);
  const registry = new CommandRegistry({ prefix: '!' });

  let replyText = '';
  const ctx = {
    isAdmin: false,
    communityId: 100n,
    db,
    registry,
    async reply(text) {
      replyText = text;
    }
  };

  // 1. Bloqueia não-admin
  await adminCommand.execute(ctx, ['prefix', '.']);
  assert.match(replyText, /Apenas administradores/);

  // 2. Permite admin alterar prefixo
  ctx.isAdmin = true;
  await adminCommand.execute(ctx, ['prefix', '.']);
  assert.match(replyText, /Prefixo atualizado para: `\.`/);
  assert.equal(registry.prefix, '.');

  const setting = db.prepare('SELECT value FROM settings WHERE community_id = ? AND key = ?').get('100', 'prefix');
  assert.equal(setting.value, '.');

  // 3. Permite admin alterar emoji
  await adminCommand.execute(ctx, ['emoji', '🤖']);
  assert.match(replyText, /Emoji de reação da IA configurado para: `🤖`/);

  const emojiSetting = db.prepare('SELECT value FROM settings WHERE community_id = ? AND key = ?').get('100', 'reaction_emoji');
  assert.equal(emojiSetting.value, '🤖');

  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});
