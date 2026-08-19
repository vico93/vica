import { EventEmitter } from 'node:events';
import { Connection } from './connection.js';
import { RpcClient } from './rpc.js';
import { decodeServerMessage } from './transport.js';
import { authenticate } from './auth.js';
import { GatewayDispatcher } from '../gateway/dispatcher.js';
import { Events } from '../gateway/events.js';
import { logger } from '../utils/logger.js';

export class OsmiumClient extends EventEmitter {
  /**
   * @param {object} config
   * @param {string} config.endpoint
   * @param {string} config.token
   * @param {number} [config.clientId]
   * @param {string} [config.appVersion]
   */
  constructor(config) {
    super();
    this.config = config;
    this.connection = new Connection(config.endpoint);
    this.rpc = new RpcClient(this.connection);
    this.dispatcher = new GatewayDispatcher();
    this.user = null;
    this.sessionId = null;
    this.sessionToken = null;
    this.isReady = false;

    this._setupPipeline();
  }

  _setupPipeline() {
    this.connection.on('connect', async () => {
      this.emit(Events.CONNECT);
      try {
        const authData = await authenticate(this.rpc, this.config.token, {
          clientId: this.config.clientId,
          appVersion: this.config.appVersion
        });

        this.user = authData.user;
        this.sessionId = authData.sessionId;
        this.sessionToken = authData.token;
        this.isReady = true;

        logger.info(`OsmiumClient Pronto! Logado como ${this.user?.name} (@${this.user?.username})`);
        this.emit(Events.READY, this.user);
      } catch (err) {
        logger.error('Falha na autenticação/handshake:', err.message);
        this.emit(Events.ERROR, err);
      }
    });

    this.connection.on('disconnect', (info) => {
      this.isReady = false;
      this.rpc.clearPending(new Error(`Desconectado do servidor: ${info.reason || info.code}`));
      this.emit(Events.DISCONNECT, info);
    });

    this.connection.on('message', (binaryBuffer) => {
      try {
        const serverMessage = decodeServerMessage(binaryBuffer);
        
        // 1. Processa resposta de RPC
        this.rpc.handleServerMessage(serverMessage);

        // 2. Processa update via Dispatcher
        this.dispatcher.dispatch(serverMessage);
      } catch (err) {
        logger.error('Erro ao processar mensagem do servidor:', err.message);
      }
    });

    // Reencaminha eventos do dispatcher para a fachada
    for (const eventName of Object.values(Events)) {
      if (eventName !== Events.CONNECT && eventName !== Events.DISCONNECT && eventName !== Events.READY && eventName !== Events.ERROR) {
        this.dispatcher.on(eventName, (...args) => this.emit(eventName, ...args));
      }
    }
  }

  /**
   * Conecta o cliente ao gateway Osmium.
   */
  connect() {
    this.connection.connect();
  }

  /**
   * Desconecta o cliente.
   */
  disconnect() {
    this.connection.disconnect();
  }

  /**
   * Envia uma mensagem em um chat/canal.
   * @param {object} chatRef
   * @param {string} text
   * @param {object} [options]
   * @param {bigint} [options.replyToMessageId]
   */
  async sendMessage(chatRef, text, options = {}) {
    let replyTo = undefined;
    if (options.replyToMessageId) {
      replyTo = {
        messageId: options.replyToMessageId
      };
    }

    const res = await this.rpc.request({
      case: 'messagesSendMessage',
      value: {
        chatRef,
        message: text,
        replyTo
      }
    });

    return res?.value;
  }

  /**
   * Deleta uma ou mais mensagens em um chat.
   * @param {object} chatRef
   * @param {bigint[]} messageIds
   */
  async deleteMessage(chatRef, messageIds) {
    const ids = Array.isArray(messageIds) ? messageIds : [messageIds];
    const res = await this.rpc.request({
      case: 'messagesDeleteMessage',
      value: {
        chatRef,
        messageIds: ids
      }
    });
    return res;
  }
}
