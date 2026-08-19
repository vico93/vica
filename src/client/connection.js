import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { logger } from '../utils/logger.js';

export class Connection extends EventEmitter {
  /**
   * @param {string} endpoint
   * @param {object} [options]
   * @param {number} [options.initialBackoff=1000]
   * @param {number} [options.maxBackoff=30000]
   * @param {number} [options.backoffMultiplier=1.5]
   * @param {number} [options.jitter=0.2]
   */
  constructor(endpoint, options = {}) {
    super();
    this.endpoint = endpoint;
    this.initialBackoff = options.initialBackoff ?? 1000;
    this.maxBackoff = options.maxBackoff ?? 30000;
    this.backoffMultiplier = options.backoffMultiplier ?? 1.5;
    this.jitter = options.jitter ?? 0.2;

    this.currentBackoff = this.initialBackoff;
    this.ws = null;
    this.shouldReconnect = true;
    this.reconnectTimer = null;
    this.isConnected = false;
  }

  connect() {
    this.shouldReconnect = true;
    this._cleanup();

    logger.debug(`Conectando WebSocket ao endpoint: ${this.endpoint}`);
    this.ws = new WebSocket(this.endpoint);
    this.ws.binaryType = 'arraybuffer';

    this.ws.on('open', () => {
      this.isConnected = true;
      this.currentBackoff = this.initialBackoff;
      logger.info('WebSocket conectado.');
      this.emit('connect');
    });

    this.ws.on('message', (data, isBinary) => {
      const buffer = isBinary ? Buffer.from(data) : Buffer.from(data.toString());
      this.emit('message', buffer);
    });

    this.ws.on('error', (err) => {
      logger.error('Erro na conexão WebSocket:', err.message);
      this.emit('error', err);
    });

    this.ws.on('close', (code, reason) => {
      this.isConnected = false;
      const reasonStr = reason ? reason.toString() : '';
      logger.warn(`WebSocket desconectado (code: ${code}, reason: ${reasonStr})`);
      this.emit('disconnect', { code, reason: reasonStr });

      if (this.shouldReconnect) {
        this._scheduleReconnect();
      }
    });
  }

  _calculateBackoff() {
    const jitterFactor = 1 + (Math.random() * 2 - 1) * this.jitter;
    const delay = Math.min(this.currentBackoff * jitterFactor, this.maxBackoff);
    this.currentBackoff = Math.min(this.currentBackoff * this.backoffMultiplier, this.maxBackoff);
    return Math.floor(delay);
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = this._calculateBackoff();
    logger.info(`Reconectando em ${delay}ms...`);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Envia dados binários pelo WebSocket.
   * @param {Uint8Array|Buffer} data
   */
  send(data) {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Não é possível enviar dados: WebSocket não está aberto');
    }
    this.ws.send(data);
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this._cleanup();
  }

  _cleanup() {
    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
    this.isConnected = false;
  }
}
