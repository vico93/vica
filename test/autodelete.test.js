import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandRegistry } from '../src/commands/registry.js';

test('CommandRegistry auto-delete apaga mensagem após execução quando ativado', async (t) => {
  const registry = new CommandRegistry({ prefix: '!', autoDelete: true });

  registry.register({
    name: 'ping',
    async execute(ctx) {
      await ctx.reply('pong');
    }
  });

  let deleted = false;
  const ctx = {
    async reply() {},
    async deleteTriggerMessage() {
      deleted = true;
    }
  };

  const executed = await registry.handleMessage(ctx, '!ping');
  assert.equal(executed, true);
  assert.equal(deleted, true);
});
