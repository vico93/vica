import fs from 'node:fs';
import path from 'node:path';
import { OpenRouter, serializeConversationState, deserializeConversationState } from '@openrouter/agent';
import { logger } from '../utils/logger.js';
import { buildMetaTag, sanitizeOutput } from './tags.js';
import { loadLocalTools } from './tools/loader.js';
import { loadMcpTools } from './mcp.js';

const DEFAULT_SYSTEM_PROMPT = 'Você é a Vica, um bot de chat para comunidades no Osmium.';

export class Agent {
  /**
   * @param {object} options
   * @param {object} options.config Configuração completa (osmium/openrouter/database/tools/mcpServers).
   * @param {import('better-sqlite3').Database} options.db Conexão SQLite.
   */
  constructor({ config, db }) {
    this.config = config;
    this.db = db;
    this.client = null;
    this.systemPrompt = null;
    this.tools = null;
    this.mcpHandles = [];
  }

  _getClient() {
    if (!this.client) {
      const apiKey = this.config.openrouter?.api_key;
      if (!apiKey) {
        throw new Error('openrouter.api_key não configurado.');
      }
      this.client = new OpenRouter({ apiKey });
      logger.info(`Agente OpenRouter inicializado (modelo: ${this.config.openrouter?.model || 'padrão'}).`);
    }
    return this.client;
  }

  async _loadSystemPrompt() {
    if (this.systemPrompt !== null) return this.systemPrompt;

    const file = this.config.openrouter?.system_prompt || 'system_prompt.md';
    const filePath = path.resolve(process.cwd(), file);
    try {
      const raw = await fs.promises.readFile(filePath, 'utf-8');
      this.systemPrompt = raw.trim();
    } catch (err) {
      logger.warn(`Não foi possível ler "${file}" (${err.message}). Usando prompt padrão.`);
      this.systemPrompt = DEFAULT_SYSTEM_PROMPT;
    }
    return this.systemPrompt;
  }

  async _loadTools() {
    if (this.tools) return this.tools;

    const tools = [];
    tools.push(...(await loadLocalTools(this.config.tools || [])));

    const { tools: mcpTools, handles } = await loadMcpTools(this.config.mcpServers || {});
    tools.push(...mcpTools);
    this.mcpHandles = handles;

    this.tools = tools;
    if (tools.length > 0) {
      logger.info(`Ferramentas carregadas: ${tools.length} (locais + MCP).`);
    }
    return tools;
  }

  _channelKey(communityId, channelId) {
    return `c:${communityId}:${channelId}`;
  }

  _stateAccessor(channelKey) {
    const db = this.db;
    return {
      async load() {
        const row = db.prepare('SELECT state FROM conversations WHERE channel_id = ?').get(channelKey);
        if (!row?.state) return null;
        try {
          return deserializeConversationState(row.state);
        } catch (err) {
          logger.warn('Falha ao desserializar estado de conversa (recomeçando):', err.message);
          return null;
        }
      },
      async save(state) {
        const json = serializeConversationState(state);
        db.prepare(`
          INSERT INTO conversations (channel_id, state, updated_at)
          VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(channel_id) DO UPDATE SET state = excluded.state, updated_at = CURRENT_TIMESTAMP
        `).run(channelKey, json);
      }
    };
  }

  /**
   * Gera uma resposta da IA para a mensagem de um usuário em um canal.
   * @param {object} params
   * @param {string} params.communityId
   * @param {string} params.channelId
   * @param {object} [params.author] Usuário autor (types.User).
   * @param {string} params.text Texto (já limpo de menções).
   * @param {string|null} [params.imageUrl] Data URL de imagem para visão.
   * @returns {Promise<string>} Texto de resposta já sanitizado.
   */
  async respond({ communityId, channelId, author, text, imageUrl = null }) {
    const client = this._getClient();
    const instructions = await this._loadSystemPrompt();
    const tools = await this._loadTools();
    const model = this.config.openrouter?.model;

    const meta = buildMetaTag({
      username: author?.username,
      globalName: author?.name,
      id: author?.id != null ? String(author.id) : ''
    });
    const prompt = meta ? `${text} ${meta}` : text;

    let input;
    if (imageUrl) {
      input = [
        { type: 'input_text', text: prompt },
        { type: 'input_image', image_url: imageUrl, detail: 'auto' }
      ];
    } else {
      input = prompt;
    }

    const request = {
      model,
      instructions,
      input,
      state: this._stateAccessor(this._channelKey(communityId, channelId))
    };
    if (tools.length > 0) {
      request.tools = tools;
    }

    const result = await client.callModel(request);
    const raw = await result.getText();
    return sanitizeOutput(raw);
  }

  /**
   * Fecha handles MCP abertos (graceful shutdown).
   */
  async close() {
    for (const handle of this.mcpHandles) {
      try {
        await handle.close();
      } catch (err) {
        logger.debug('Falha ao fechar handle MCP:', err.message);
      }
    }
    this.mcpHandles = [];
  }
}
