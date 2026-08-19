import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketServer } from 'ws';
import { Connection } from '../src/client/connection.js';

test('Connection conecta, envia/recebe mensagens e reconecta', async (t) => {
  const wss = new WebSocketServer({ port: 0 });
  const port = wss.address().port;
  const endpoint = `ws://127.0.0.1:${port}`;

  let serverReceived = null;
  wss.on('connection', (ws) => {
    ws.on('message', (msg) => {
      serverReceived = msg;
      ws.send(Buffer.from([0x01, 0x02, 0x03]));
    });
  });

  const connection = new Connection(endpoint, {
    initialBackoff: 50,
    maxBackoff: 200,
    backoffMultiplier: 1.5,
    jitter: 0
  });

  // 1. Testa connect e round-trip
  await new Promise((resolve) => {
    connection.on('connect', () => {
      connection.send(Buffer.from([0xAA, 0xBB]));
    });

    connection.on('message', (msg) => {
      assert.deepEqual(Array.from(msg), [0x01, 0x02, 0x03]);
      resolve();
    });

    connection.connect();
  });

  assert.deepEqual(Array.from(serverReceived), [0xAA, 0xBB]);

  // 2. Testa reconexão
  let reconnected = false;
  await new Promise((resolve) => {
    let disconnectCount = 0;

    connection.on('disconnect', () => {
      disconnectCount++;
    });

    connection.on('connect', () => {
      if (disconnectCount > 0) {
        reconnected = true;
        resolve();
      }
    });

    // Força fechamento pelo servidor para disparar reconexão
    for (const client of wss.clients) {
      client.close();
    }
  });

  assert.equal(reconnected, true);

  connection.disconnect();
  await new Promise((resolve) => wss.close(resolve));
});
