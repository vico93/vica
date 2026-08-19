import test from 'node:test';
import assert from 'node:assert/strict';
import { perfilCommand } from '../src/commands/perfil.js';
import { rankCommand } from '../src/commands/rank.js';

test('perfilCommand exibe dados mesmo com DB vazio ou ausente (stub)', async (t) => {
  let replyText = '';
  const ctx = {
    author: { id: 123n, name: 'Alice', username: 'alice' },
    communityId: 456n,
    db: null,
    async reply(text) {
      replyText = text;
    }
  };

  await perfilCommand.execute(ctx);
  assert.match(replyText, /Perfil de Alice/);
  assert.match(replyText, /\*\*Nível:\*\* `0`/);
  assert.match(replyText, /\*\*XP Total:\*\* `0`/);
});

test('rankCommand lida com ranking vazio (stub)', async (t) => {
  let replyText = '';
  const ctx = {
    communityId: 456n,
    db: null,
    async reply(text) {
      replyText = text;
    }
  };

  await rankCommand.execute(ctx);
  assert.match(replyText, /Ninguém acumulou XP ainda/);
});
