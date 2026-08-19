import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandRegistry } from '../src/commands/registry.js';

test('CommandRegistry registra comandos, aliases e respeita prefixo', async (t) => {
  const registry = new CommandRegistry({ prefix: '!' });

  let pingCalled = false;
  let passedArgs = [];

  registry.register({
    name: 'ping',
    aliases: ['p', 'latency'],
    description: 'Verifica latência',
    async execute(ctx, args) {
      pingCalled = true;
      passedArgs = args;
    }
  });

  // 1. Prefixo incorreto -> ignorado
  const ignored = registry.parse('?ping');
  assert.equal(ignored, null);

  const ignoredMatch = await registry.handleMessage({}, '?ping');
  assert.equal(ignoredMatch, false);
  assert.equal(pingCalled, false);

  // 2. Prefixo correto -> executado
  const match = registry.parse('!ping arg1 arg2');
  assert.ok(match);
  assert.equal(match.name, 'ping');
  assert.deepEqual(match.args, ['arg1', 'arg2']);

  const executed = await registry.handleMessage({}, '!ping arg1 arg2');
  assert.equal(executed, true);
  assert.equal(pingCalled, true);
  assert.deepEqual(passedArgs, ['arg1', 'arg2']);

  // 3. Alias funciona
  const aliasMatch = registry.parse('!p');
  assert.ok(aliasMatch);
  assert.equal(aliasMatch.name, 'ping');

  // 4. Prefixo dinâmico
  registry.setPrefix('.');
  assert.equal(registry.parse('!ping'), null);
  assert.ok(registry.parse('.ping'));
});
