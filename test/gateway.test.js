import test from 'node:test';
import assert from 'node:assert/strict';
import { GatewayDispatcher } from '../src/gateway/dispatcher.js';
import { Events } from '../src/gateway/events.js';

test('GatewayDispatcher despacha messageCreated e outros updates corretamente', (t) => {
  const dispatcher = new GatewayDispatcher();

  let messageCreatedDispatched = null;
  dispatcher.on(Events.MESSAGE_CREATED, (data) => {
    messageCreatedDispatched = data;
  });

  let reactionsDispatched = null;
  dispatcher.on(Events.MESSAGE_REACTIONS, (data) => {
    reactionsDispatched = data;
  });

  // Simula ServerMessage com update messageCreated
  dispatcher.dispatch({
    id: 100,
    message: {
      case: 'update',
      value: {
        update: {
          case: 'messageCreated',
          value: {
            message: {
              messageId: 123456n,
              message: '!ping'
            },
            author: {
              id: 999n,
              name: 'Alice'
            }
          }
        }
      }
    }
  });

  assert.ok(messageCreatedDispatched);
  assert.equal(messageCreatedDispatched.message.message, '!ping');
  assert.equal(messageCreatedDispatched.author.name, 'Alice');

  // Simula ServerMessage com update messageReactions
  dispatcher.dispatch({
    id: 101,
    message: {
      case: 'update',
      value: {
        update: {
          case: 'messageReactions',
          value: {
            reactions: {
              reactions: []
            }
          }
        }
      }
    }
  });

  assert.ok(reactionsDispatched);
});
