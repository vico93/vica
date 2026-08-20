import { logger } from '../utils/logger.js';
import { sliceCodePoints, removeSpanCodePoints } from './tags.js';

const FALLBACK_EMPTY = 'Bah, dei uma travada e não consegui montar a resposta 😵‍💫. Tenta de novo em seguida.';
const IMAGE_ONLY_HINT = 'Veja a imagem anexada.';

export class AITriggers {
  /**
   * @param {object} deps
   * @param {import('../client/index.js').OsmiumClient} deps.client
   * @param {import('./agent.js').Agent} deps.agent
   * @param {object} deps.config
   * @param {import('better-sqlite3').Database} [deps.db]
   */
  constructor({ client, agent, config, db }) {
    this.client = client;
    this.agent = agent;
    this.config = config;
    this.db = db;
    this.reactionBaseline = new Map();
  }

  _communityId(chatRef) {
    if (chatRef?.ref?.case === 'channel') return String(chatRef.ref.value?.communityId ?? '');
    return '';
  }

  _channelId(chatRef) {
    if (chatRef?.ref?.case === 'channel') return String(chatRef.ref.value?.channelId ?? '');
    return '';
  }

  _getSetting(communityId, key) {
    if (!this.db) return null;
    const row = this.db
      .prepare('SELECT value FROM settings WHERE community_id = ? AND key = ?')
      .get(String(communityId || 'global'), key);
    return row?.value ?? null;
  }

  _reactionEmoji(communityId) {
    const fromDb = this._getSetting(communityId, 'reaction_emoji');
    if (fromDb) return fromDb;
    return this.config.openrouter?.reaction_emoji || '';
  }

  /* ---------- menção / reply ---------- */

  _findBotMention(message) {
    const identity = [this.client.user?.username, this.client.user?.name].filter(Boolean);
    if (identity.length === 0) return null;

    const text = message?.message || '';
    for (const entity of message?.entities || []) {
      const caseName = entity?.entity?.case;
      if (caseName !== 'username' && caseName !== 'userMention') continue;

      const start = entity.startIndex ?? 0;
      const length = entity.length ?? 0;
      const name = sliceCodePoints(text, start + 1, start + 1 + length);
      if (identity.some((id) => id && name.toLowerCase() === id.toLowerCase())) {
        return { startIndex: start, length };
      }
    }
    return null;
  }

  _isReplyToBot(message) {
    const replyId = message?.reply?.messageId;
    if (replyId == null) return false;
    return this.client.isBotMessage(replyId);
  }

  /* ---------- reação ---------- */

  _emojiKey(reactionEmoji) {
    const oneof = reactionEmoji?.emoji;
    if (!oneof) return null;
    if (oneof.case === 'unicodeEmoji') return `u:${oneof.value}`;
    if (oneof.case === 'customEmoji') return `c:${String(oneof.value)}`;
    return null;
  }

  _configuredEmojiKey(configured) {
    if (!configured) return null;
    if (/^\d+$/.test(String(configured))) return `c:${configured}`;
    return `u:${configured}`;
  }

  _detectNewReaction(update) {
    const chatRef = update?.chatRef;
    const reactions = update?.reactions;
    if (!chatRef || !reactions?.messageId) return null;

    const communityId = this._communityId(chatRef);
    const configuredKey = this._configuredEmojiKey(this._reactionEmoji(communityId));
    if (!configuredKey) return null;

    const messageId = String(reactions.messageId);
    const field = (reactions.reactionFields || []).find((f) => this._emojiKey(f.emoji) === configuredKey);
    const count = field?.count ?? 0;
    const me = field?.me ?? false;

    const baselineKey = `${communityId}:${messageId}:${configuredKey}`;
    const previous = this.reactionBaseline.get(baselineKey);
    this.reactionBaseline.set(baselineKey, count);

    if (me || previous === undefined || count <= previous) return null;
    return { communityId, chatRef, messageId };
  }

  /* ---------- imagem ---------- */

  _extractImageSource(message) {
    for (const media of message?.media || []) {
      if (media?.media?.case === 'file') {
        const file = media.media.value?.file;
        if (!file) continue;
        const mimetype = file.mimetype || '';
        const isImage = mimetype.startsWith('image/') || file.metadata?.metadata?.case === 'image';
        if (isImage) return { kind: 'file', fileId: file.fileId, size: file.size, mimetype };
      } else if (media?.media?.case === 'embed') {
        const embed = media.media.value;
        const url = embed?.imageVariant || embed?.url;
        if (url) return { kind: 'url', url };
      }
    }
    return null;
  }

  async _resolveImageDataUrl(source) {
    if (!source) return null;
    try {
      if (source.kind === 'file') {
        return await this.client.downloadMedia(source.fileId, source.size, source.mimetype);
      }
      const url = source.url;
      if (url.startsWith('data:')) return url;
      const res = await fetch(url);
      if (!res.ok) return null;
      const contentType = res.headers.get('content-type') || 'image/png';
      const mime = contentType.split(';')[0].trim();
      const buf = Buffer.from(await res.arrayBuffer());
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch (err) {
      logger.warn('Falha ao resolver imagem para visão:', err.message);
      return null;
    }
  }

  /* ---------- resposta ---------- */

  _stripBotMention(text, mention) {
    if (!mention) return (text || '').trim();
    return removeSpanCodePoints(text, mention.startIndex, mention.length).trim();
  }

  async _respond({ chatRef, communityId, channelId, message, author, text }) {
    const source = this._extractImageSource(message);
    const imageUrl = await this._resolveImageDataUrl(source);

    const effectiveText = text || (imageUrl ? IMAGE_ONLY_HINT : '');
    if (!effectiveText && !imageUrl) return;

    try {
      await this.client.setTyping(chatRef, true);
    } catch (_) {}

    let reply;
    try {
      reply = await this.agent.respond({
        communityId,
        channelId,
        author,
        text: effectiveText,
        imageUrl
      });
    } catch (err) {
      logger.error('Falha ao gerar resposta da IA:', err.message);
      reply = FALLBACK_EMPTY;
    }

    if (!reply) reply = FALLBACK_EMPTY;

    try {
      await this.client.sendMessage(chatRef, reply, { replyToMessageId: message?.messageId });
    } catch (err) {
      logger.error('Falha ao enviar resposta da IA:', err.message);
    } finally {
      try {
        await this.client.setTyping(chatRef, false);
      } catch (_) {}
    }
  }

  /* ---------- handlers ---------- */

  async onMessageCreated(data) {
    const message = data?.message;
    const chatRef = message?.chatRef;
    if (!chatRef || chatRef.ref?.case !== 'channel') return;

    const mention = this._findBotMention(message);
    const replyToBot = this._isReplyToBot(message);
    if (!mention && !replyToBot) return;

    const text = this._stripBotMention(message.message || '', mention);
    const source = this._extractImageSource(message);
    if (!text && !source) return;

    const author = data.author ?? (message.authorId != null ? { id: message.authorId } : undefined);
    await this._respond({
      chatRef,
      communityId: this._communityId(chatRef),
      channelId: this._channelId(chatRef),
      message,
      author,
      text
    });
  }

  async onMessageReactions(update) {
    const hit = this._detectNewReaction(update);
    if (!hit) return;

    let message = null;
    try {
      message = await this.client.getMessage(hit.chatRef, hit.messageId);
    } catch (err) {
      logger.warn('Falha ao buscar mensagem reagida:', err.message);
    }
    if (!message || (!message.message && !this._extractImageSource(message))) return;

    const text = this._stripBotMention(message.message || '', null);
    const author = message.authorId != null ? { id: message.authorId } : undefined;
    await this._respond({
      chatRef: hit.chatRef,
      communityId: hit.communityId,
      channelId: this._channelId(hit.chatRef),
      message,
      author,
      text
    });
  }
}
