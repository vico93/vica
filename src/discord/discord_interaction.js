/*
** caminho: core/discord_interaction.js
** últimaMod: 2026-03-02 19:05
** autor: Vico
** colaboração: OpenAI Codex
*/

const TRANSIENT_HTTP_STATUS = new Set([500, 502, 503, 504]);
const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET'
]);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isUnknownInteraction(error) {
  return error?.code === 10062 || error?.rawError?.code === 10062;
}

function isTransientDiscordError(error) {
  if (!error || isUnknownInteraction(error)) {
    return false;
  }

  if (TRANSIENT_HTTP_STATUS.has(error.status)) {
    return true;
  }

  const networkCode = error?.code || error?.cause?.code;
  if (typeof networkCode === 'string' && TRANSIENT_NETWORK_CODES.has(networkCode)) {
    return true;
  }

  const message = String(error?.message || '').toLowerCase();
  return message.includes('service unavailable') ||
    message.includes('gateway timeout') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('fetch failed');
}

async function withDiscordRetry(operationName, action, options = {}) {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 300;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await action();
    } catch (error) {
      const shouldRetry = attempt < maxAttempts && isTransientDiscordError(error);
      if (!shouldRetry) {
        throw error;
      }

      const delay = baseDelayMs * attempt;
      console.warn(
        `[VICA][INTERACTION][WARN] ${operationName} falhou (tentativa ${attempt}/${maxAttempts}) status=${error?.status ?? 'n/a'} code=${error?.code ?? 'n/a'}. Retry em ${delay}ms.`
      );

      await sleep(delay);
    }
  }

  return undefined;
}

function safeDeferReply(interaction, payload = {}, retryOptions = {}) {
  return withDiscordRetry('deferReply', () => interaction.deferReply(payload), retryOptions);
}

function safeReply(interaction, payload = {}, retryOptions = {}) {
  return withDiscordRetry('reply', () => interaction.reply(payload), retryOptions);
}

function safeFollowUp(interaction, payload = {}, retryOptions = {}) {
  return withDiscordRetry('followUp', () => interaction.followUp(payload), retryOptions);
}

function safeEditReply(interaction, payload = {}, retryOptions = {}) {
  return withDiscordRetry('editReply', () => interaction.editReply(payload), retryOptions);
}

module.exports = {
  isUnknownInteraction,
  isTransientDiscordError,
  safeDeferReply,
  safeReply,
  safeFollowUp,
  safeEditReply,
  withDiscordRetry
};
