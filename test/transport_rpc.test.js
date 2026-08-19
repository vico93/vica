import test from 'node:test';
import assert from 'node:assert/strict';
import { create, toBinary } from '@bufbuild/protobuf';
import { ServerMessageSchema } from '../src/gen/core_pb.js';
import { encodeClientMessage, decodeServerMessage } from '../src/client/transport.js';
import { RpcClient } from '../src/client/rpc.js';
import { EventEmitter } from 'node:events';

test('Transport encode e decode', (t) => {
  const binary = encodeClientMessage({
    id: 42,
    message: {
      case: 'coreInitialize',
      value: {
        clientId: 123,
        deviceType: 'desktop',
        deviceVersion: '1.0',
        appVersion: '0.1.0',
        noSubscribe: false
      }
    }
  });

  assert.ok(binary instanceof Uint8Array);
  assert.ok(binary.length > 0);

  const serverMsg = create(ServerMessageSchema, {
    id: 1001,
    message: {
      case: 'result',
      value: {
        reqId: 42,
        result: {
          case: 'initialized',
          value: {}
        }
      }
    }
  });

  const serverBinary = toBinary(ServerMessageSchema, serverMsg);
  const decoded = decodeServerMessage(serverBinary);

  assert.equal(decoded.id, 1001);
  assert.equal(decoded.message.case, 'result');
  assert.equal(decoded.message.value.reqId, 42);
  assert.equal(decoded.message.value.result.case, 'initialized');
});

test('RpcClient correlaciona request e response com sucesso e erro', async (t) => {
  class MockConnection extends EventEmitter {
    constructor() {
      super();
      this.sent = [];
    }
    send(data) {
      this.sent.push(data);
    }
  }

  const mockConn = new MockConnection();
  const rpc = new RpcClient(mockConn);

  // 1. Sucesso
  const reqPromise = rpc.request({
    case: 'coreInitialize',
    value: { clientId: 1 }
  });

  // Simula resposta do servidor
  const serverSuccessMsg = create(ServerMessageSchema, {
    id: 1,
    message: {
      case: 'result',
      value: {
        reqId: 1,
        result: {
          case: 'initialized',
          value: {}
        }
      }
    }
  });
  rpc.handleServerMessage(serverSuccessMsg);

  const result = await reqPromise;
  assert.equal(result.case, 'initialized');

  // 2. Erro
  const reqErrorPromise = rpc.request({
    case: 'authAuthorize',
    value: { token: 'invalid' }
  });

  const serverErrorMsg = create(ServerMessageSchema, {
    id: 2,
    message: {
      case: 'result',
      value: {
        reqId: 2,
        result: {
          case: 'error',
          value: {
            errorCode: 401,
            errorMessage: 'Token inválido'
          }
        }
      }
    }
  });
  rpc.handleServerMessage(serverErrorMsg);

  await assert.rejects(async () => {
    await reqErrorPromise;
  }, /RPC Error \[401\]: Token inválido/);
});
