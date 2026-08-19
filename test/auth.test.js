import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticate } from '../src/client/auth.js';

test('authenticate realiza fluxo Initialize -> Authorize com sucesso', async (t) => {
  const calls = [];
  const mockRpc = {
    async request(payload) {
      calls.push(payload);
      if (payload.case === 'coreInitialize') {
        return {
          case: 'initialized',
          value: {
            entrypoints: { entrypoints: [] }
          }
        };
      }
      if (payload.case === 'authAuthorize') {
        return {
          case: 'authorization',
          value: {
            token: 'valid_session_token',
            user: {
              id: 620989n,
              name: 'Vica',
              username: 'vica',
              bot: true
            },
            sessionId: 123456n
          }
        };
      }
      throw new Error('Unknown case');
    }
  };

  const result = await authenticate(mockRpc, 'test_bot_token', {
    clientId: 620989,
    appVersion: '0.1.0'
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].case, 'coreInitialize');
  assert.equal(calls[0].value.clientId, 620989);
  assert.equal(calls[1].case, 'authAuthorize');
  assert.equal(calls[1].value.token, 'test_bot_token');

  assert.equal(result.token, 'valid_session_token');
  assert.equal(result.user.name, 'Vica');
  assert.equal(result.user.id, 620989n);
});

test('authenticate rejeita se Initialize falhar', async (t) => {
  const mockRpc = {
    async request(payload) {
      if (payload.case === 'coreInitialize') {
        return {
          case: 'error',
          value: { errorCode: 500, errorMessage: 'Init error' }
        };
      }
    }
  };

  await assert.rejects(async () => {
    await authenticate(mockRpc, 'token');
  }, /Resposta de inicialização inesperada/);
});
