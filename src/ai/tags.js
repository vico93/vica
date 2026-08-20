// Tags "invisíveis" trocadas entre o bot e o modelo (estilo bbcode).
// São embutidas no texto da mensagem e removidas antes de chegar ao chat.

const MEMORY_TAG_RE = /\[memory\]([\s\S]*?)\[\/memory\]/gi;

const INSTRUCTION_TAGS = ['trigger', 'pergunta', 'welcome', 'leave', 'kick', 'ban', 'up_role'];
const LEAKED_LINE_RE = new RegExp(`^\\s*\\[(?:${INSTRUCTION_TAGS.join('|')})\\].*?(?:\\r?\\n|$)`, 'gim');
const LOOSE_TAG_RE = new RegExp(`\\[(?:${INSTRUCTION_TAGS.join('|')})\\]`, 'gi');

/**
 * Remove tags internas/instruções vazadas da resposta do modelo
 * antes de enviá-la ao chat.
 * @param {string} raw Texto bruto retornado pelo modelo.
 * @returns {string} Texto limpo.
 */
export function sanitizeOutput(raw) {
  if (typeof raw !== 'string') return '';
  let text = raw.replace(MEMORY_TAG_RE, '');
  text = text.replace(LEAKED_LINE_RE, '');
  text = text.replace(LOOSE_TAG_RE, '');
  text = text.replace(/[ \t]+/g, ' ').trim();
  return text;
}

/**
 * Monta a tag [meta] com metadados do autor da mensagem.
 * @param {object} info
 * @param {string} [info.username]
 * @param {string} [info.globalName]
 * @param {string} [info.id]
 * @returns {string}
 */
export function buildMetaTag({ username = '', globalName = '', id = '' } = {}) {
  const parts = [];
  if (username) parts.push(`user:${username}`);
  if (globalName) parts.push(`globalname:${globalName}`);
  if (id) parts.push(`id:${id}`);
  if (parts.length === 0) return '';
  return `[meta]${parts.join('|')}[/meta]`;
}

/**
 * Fatiar texto por Unicode code points (índices de entidades do Osmium
 * são em code points, não em UTF-16).
 * @param {string} text
 * @param {number} start
 * @param {number} [end]
 * @returns {string}
 */
export function sliceCodePoints(text, start, end) {
  if (typeof text !== 'string') return '';
  return Array.from(text).slice(start, end).join('');
}

/**
 * Remove um intervalo (por code points) do texto — ex.: o span da menção.
 * @param {string} text
 * @param {number} start
 * @param {number} length
 * @returns {string}
 */
export function removeSpanCodePoints(text, start, length) {
  if (typeof text !== 'string') return '';
  const chars = Array.from(text);
  chars.splice(start, length);
  return chars.join('');
}
