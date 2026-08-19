import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadConfig } from '../src/config.js';

test('loadConfig carrega valores com fallback para templates', (t) => {
  const config = loadConfig();
  assert.equal(typeof config.osmium.prefix, 'string');
  assert.equal(config.osmium.prefix, '!');
  assert.equal(config.osmium.voice_xp_per_minute, 1);
  assert.ok(Array.isArray(config.tools));
  assert.ok(typeof config.mcpServers === 'object');
});

test('loadConfig lança erro claro se arquivo estiver malformado', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vica-test-'));
  fs.writeFileSync(path.join(tempDir, 'config.toml'), 'invalid toml [[]]');
  
  assert.throws(() => {
    loadConfig(tempDir);
  }, /Erro ao ler\/parsear config.toml/);

  fs.rmSync(tempDir, { recursive: true, force: true });
});
