import test from 'node:test';
import assert from 'node:assert/strict';
import { perguntarCommand } from '../src/commands/perguntar.js';

test('perguntarCommand posta pergunta no canal', async (t) => {
  let repliedText = '';
  const ctx = {
    async reply(text) {
      repliedText = text;
    }
  };

  await perguntarCommand.execute(ctx);
  assert.match(repliedText, /💬 \*\*Pergunta do momento:\*\*/);
  assert.ok(repliedText.length > 30);
});
