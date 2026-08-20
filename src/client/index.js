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
    this._sentMessageIds = new Set();
    this._sentMessageIdQueue = [];

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

  _rememberSentMessageId(messageId) {
    if (messageId == null) return;
    const key = String(messageId);
    if (this._sentMessageIds.has(key)) return;
    this._sentMessageIds.add(key);
    this._sentMessageIdQueue.push(key);
    while (this._sentMessageIdQueue.length > 2000) {
      const oldest = this._sentMessageIdQueue.shift();
      this._sentMessageIds.delete(oldest);
    }
  }

  /**
   * Verifica se um ID de mensagem corresponde a uma mensagem enviada pelo bot.
   * @param {bigint|string} messageId
   */
  isBotMessage(messageId) {
    return this._sentMessageIds.has(String(messageId));
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

    this._rememberSentMessageId(res?.value?.messageId);
    return res?.value;
  }

  /**
   * Ativa/desativa o indicador de "digitando" em um chat.
   * @param {object} chatRef
   * @param {boolean} [typing=true]
   */
  async setTyping(chatRef, typing = true) {
    await this.rpc.request({
      case: 'chatsSetTyping',
      value: {
        chatRef,
        typing
      }
    });
  }

  /**
   * Adiciona uma reação do próprio bot a uma mensagem.
   * @param {object} chatRef
   * @param {bigint} messageId
   * @param {{ case: 'unicodeEmoji'|'customEmoji', value: string|bigint }} emoji
   */
  async sendReaction(chatRef, messageId, emoji) {
    await this.rpc.request({
      case: 'reactionsAddReaction',
      value: {
        chatRef,
        messageId,
        emoji: { emoji }
      }
    });
  }

  /**
   * Remove a reação do próprio bot de uma mensagem.
   * @param {object} chatRef
   * @param {bigint} messageId
   * @param {{ case: 'unicodeEmoji'|'customEmoji', value: string|bigint }} emoji
   */
  async removeReaction(chatRef, messageId, emoji) {
    await this.rpc.request({
      case: 'reactionsRemoveReaction',
      value: {
        chatRef,
        messageId,
        emoji: { emoji }
      }
    });
  }

  /**
   * Busca uma mensagem pelo ID (via getHistory em torno do ID).
   * @param {object} chatRef
   * @param {bigint} messageId
   */
  async getMessage(chatRef, messageId) {
    const res = await this.rpc.request({
      case: 'messagesGetHistory',
      value: {
        chatRef,
        limit: 50,
        offset: { case: 'around', value: messageId }
      }
    });
    const messages = res?.value?.messages;
    if (Array.isArray(messages) && messages.length > 0) {
      return messages.find((m) => String(m.messageId) === String(messageId)) || null;
    }
    return null;
  }

  /**
   * Baixa um arquivo de mídia (em chunks) e devolve como data URL.
   * @param {bigint} fileId
   * @param {bigint} [size]
   * @param {string} [mimetype='image/png']
   * @returns {Promise<string|null>}
   */
  async downloadMedia(fileId, size, mimetype = 'image/png') {
    const CHUNK = 512 * 1024;
    const sizeBig = typeof size === 'bigint' ? size : BigInt(size || 0);
    const chunks = [];
    let offset = 0n;

    const readPart = async (length) => {
      const res = await this.rpc.request({
        case: 'mediaDownloadFilePart',
        value: {
          fileRef: { ref: { case: 'mediaFile', value: { fileId } } },
          offset,
          length
        }
      });
      return res?.value?.data;
    };

    if (sizeBig > 0n) {
      while (offset < sizeBig) {
        const remaining = sizeBig - offset;
        const length = remaining > BigInt(CHUNK) ? CHUNK : Number(remaining);
        const data = await readPart(length);
        if (!data || data.length === 0) break;
        chunks.push(data);
        offset += BigInt(data.length);
      }
    } else {
      let guard = 0;
      while (guard++ < 200) {
        const data = await readPart(CHUNK);
        if (!data || data.length === 0) break;
        chunks.push(data);
        if (data.length < CHUNK) break;
      }
    }

    if (chunks.length === 0) return null;
    const total = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    const base64 = total.toString('base64');
    const mime = String(mimetype || 'image/png').split(';')[0].trim() || 'image/png';
    return `data:${mime};base64,${base64}`;
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

  /**
   * Edita o perfil do próprio bot (name, username, bio, icon, color).
   * @param {object} fields
   * @param {string} [fields.name]
   * @param {string} [fields.username]
   * @param {string} [fields.bio]
   * @param {bigint} [fields.icon]
   * @param {number} [fields.color]
   */
  async editProfile(fields) {
    await this.rpc.request({
      case: 'settingsEditProfile',
      value: fields
    });
  }
}
