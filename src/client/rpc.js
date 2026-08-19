import { logger } from '../utils/logger.js';
import { encodeClientMessage } from './transport.js';

export class RpcClient {
  /**
   * @param {import('./connection.js').Connection} connection
   * @param {object} [options]
   * @param {number} [options.defaultTimeout=15000]
   */
  constructor(connection, options = {}) {
    this.connection = connection;
    this.defaultTimeout = options.defaultTimeout ?? 15000;
    this.pendingRequests = new Map();
    this.nextRequestId = 1;
  }

  /**
   * Inicia a escuta de respostas via conexão.
   */
  handleServerMessage(serverMessage) {
    if (serverMessage.message?.case === 'result') {
      const rpcResult = serverMessage.message.value;
      const reqId = rpcResult.reqId;
      const pending = this.pendingRequests.get(reqId);

      if (pending) {
        this.pendingRequests.delete(reqId);
        clearTimeout(pending.timer);

        if (rpcResult.result?.case === 'error') {
          const err = rpcResult.result.value;
          const error = new Error(`RPC Error [${err.errorCode}]: ${err.errorMessage}`);
          error.code = err.errorCode;
          pending.reject(error);
        } else {
          pending.resolve(rpcResult.result);
        }
      }
    }
  }

  /**
   * Envia uma RPC e retorna uma Promise com o resultado correlacionado por request_id.
   * @param {object} rpcPayload Objeto contendo o campo oneof (ex: `{ coreInitialize: { ... } }` ou `{ authAuthorize: { ... } }`)
   * @param {number} [timeout]
   * @returns {Promise<any>}
   */
  async request(rpcPayload, timeout = this.defaultTimeout) {
    const id = this.nextRequestId++;
    if (this.nextRequestId > 0xFFFFFFFF) {
      this.nextRequestId = 1;
    }

    const clientMsgData = {
      id,
      message: rpcPayload
    };

    const binary = encodeClientMessage(clientMsgData);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`RPC Timeout após ${timeout}ms (req_id: ${id})`));
        }
      }, timeout);

      this.pendingRequests.set(id, { resolve, reject, timer, sentAt: Date.now() });

      try {
        this.connection.send(binary);
      } catch (err) {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(err);
      }
    });
  }

  /**
   * Limpa todas as requisições pendentes (ex: na desconexão).
   * @param {Error} [reason]
   */
  clearPending(reason = new Error('Conexão encerrada com RPCs pendentes')) {
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timer);
      pending.reject(reason);
    }
    this.pendingRequests.clear();
  }
}
