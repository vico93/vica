import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketServer } from 'ws';
import { create, toBinary, fromBinary } from '@bufbuild/protobuf';
import { ClientMessageSchema, ServerMessageSchema } from '../src/gen/core_pb.js';
import { OsmiumClient } from '../src/client/index.js';
import { Events } from '../src/gateway/events.js';

test('Smoke M1: Bot conecta, autentica, escuta !ping e responde pong', async (t) => {
  const wss = new WebSocketServer({ port: 0 });
  const port = wss.address().port;
  const endpoint = `ws://127.0.0.1:${port}`;

  let sentMessagePayload = null;

  wss.on('connection', (ws) => {
    ws.on('message', (binaryData) => {
      const clientMsg = fromBinary(ClientMessageSchema, new Uint8Array(binaryData));

      if (clientMsg.message?.case === 'coreInitialize') {
        const res = create(ServerMessageSchema, {
          id: 1,
          message: {
            case: 'result',
            value: {
              reqId: clientMsg.id,
              result: {
                case: 'initialized',
                value: {
                  entrypoints: { entrypoints: [] }
                }
              }
            }
          }
        });
        ws.send(toBinary(ServerMessageSchema, res));
      } else if (clientMsg.message?.case === 'authAuthorize') {
        const res = create(ServerMessageSchema, {
          id: 2,
          message: {
            case: 'result',
            value: {
              reqId: clientMsg.id,
              result: {
                case: 'authorization',
                value: {
                  token: 'auth_ok_session',
                  user: {
                    id: 620989n,
                    name: 'Vica',
                    username: 'vica',
                    bot: true
                  },
                  sessionId: 9999n
                }
              }
            }
          }
        });
        ws.send(toBinary(ServerMessageSchema, res));
      } else if (clientMsg.message?.case === 'messagesSendMessage') {
        sentMessagePayload = clientMsg.message.value;
        const res = create(ServerMessageSchema, {
          id: 3,
          message: {
            case: 'result',
            value: {
              reqId: clientMsg.id,
              result: {
                case: 'sentMessage',
                value: {
                  messageId: 55555n
                }
              }
            }
          }
        });
        ws.send(toBinary(ServerMessageSchema, res));
      }
    });
  });

  const client = new OsmiumClient({
    endpoint,
    token: 'smoke_test_token',
    clientId: 620989
  });

  await new Promise((resolve) => {
    client.on(Events.READY, async (user) => {
      assert.equal(user.name, 'Vica');

      // Simula uma mensagem "!ping" enviada por um usuário no canal
      for (const ws of wss.clients) {
        const updateMsg = create(ServerMessageSchema, {
          id: 10,
          message: {
            case: 'update',
            value: {
              update: {
                case: 'messageCreated',
                value: {
                  message: {
                    messageId: 101010n,
                    message: '!ping',
                    authorId: 12345n,
                    chatRef: {
                      ref: {
                        case: 'channel',
                        value: {
                          communityId: 111n,
                          channelId: 222n
                        }
                      }
                    }
                  },
                  author: {
                    id: 12345n,
                    name: 'UserTest',
                    username: 'usertest',
                    bot: false
                  }
                }
              }
            }
          }
        });
        ws.send(toBinary(ServerMessageSchema, updateMsg));
      }
    });

    client.on(Events.MESSAGE_CREATED, async (data) => {
      const text = data.message?.message;
      if (text === '!ping') {
        await client.sendMessage(data.message.chatRef, 'pong', {
          replyToMessageId: data.message.messageId
        });
        resolve();
      }
    });

    client.connect();
  });

  assert.ok(sentMessagePayload);
  assert.equal(sentMessagePayload.message, 'pong');
  assert.equal(sentMessagePayload.replyTo?.messageId, 101010n);
  assert.equal(sentMessagePayload.chatRef?.ref?.case, 'channel');
  assert.equal(sentMessagePayload.chatRef?.ref?.value?.channelId, 222n);

  client.disconnect();
  await new Promise((resolve) => wss.close(resolve));
});
