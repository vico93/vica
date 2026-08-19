import test from 'node:test';
import assert from 'node:assert/strict';
import { pingCommand } from '../src/commands/ping.js';

test('pingCommand responde com pong', async (t) => {
  let repliedText = '';
  let editedText = '';

  const ctx = {
    async reply(text) {
      repliedText = text;
    },
    async editLastReply(text) {
      editedText = text;
    }
  };

  await pingCommand.execute(ctx);

  assert.equal(repliedText, '🏓 Pong!');
  assert.match(editedText, /Pong! \(`\d+ms`\)/);
});
