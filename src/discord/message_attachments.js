/*
** caminho: helpers/message_attachments.js
** últimaMod: 2026-04-08 01:05
** autor: Vico
** colaboração: GPT-5.4
*/

const path = require('path');

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);
const AUDIO_EXTENSIONS = new Set(['.ogg', '.mp3', '.wav', '.m4a', '.aac', '.flac', '.opus']);
const PDF_EXTENSIONS = new Set(['.pdf']);
const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.rst',
  '.json', '.jsonl', '.jsonc',
  '.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx',
  '.py', '.rb', '.php', '.java', '.kt', '.kts', '.scala',
  '.c', '.cc', '.cpp', '.cxx', '.h', '.hpp', '.hh',
  '.cs', '.go', '.rs', '.swift', '.lua',
  '.html', '.htm', '.css', '.scss', '.sass', '.less',
  '.xml', '.svg', '.yml', '.yaml', '.toml', '.ini', '.cfg', '.conf', '.properties',
  '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
  '.sql', '.csv', '.tsv', '.log'
]);
const TEXT_FILENAMES = new Set([
  'dockerfile', 'makefile', 'procfile',
  '.env', '.gitignore', '.editorconfig',
  '.prettierrc', '.eslintrc', '.npmrc', '.yarnrc'
]);
const TEXT_MIME_TYPES = new Set([
  'application/json',
  'application/ld+json',
  'application/xml',
  'application/javascript',
  'application/x-javascript',
  'application/ecmascript',
  'application/x-sh',
  'application/x-shellscript',
  'application/x-httpd-php',
  'application/x-python-code',
  'application/x-yaml',
  'application/yaml',
  'application/toml',
  'application/x-toml',
  'application/csv',
  'text/csv'
]);

function getAttachmentExtension(attachment) {
  const fileName = (attachment?.name || '').toLowerCase();
  return path.extname(fileName);
}

function getAttachmentFileName(attachment) {
  return (attachment?.name || '').toLowerCase();
}

function isImageAttachment(attachment) {
  if (!attachment) return false;
  if (attachment.contentType?.startsWith('image/')) return true;

  return IMAGE_EXTENSIONS.has(getAttachmentExtension(attachment));
}

function isAudioAttachment(attachment) {
  if (!attachment) return false;
  if (attachment.contentType?.startsWith('audio/')) return true;
  if (attachment.contentType === 'video/ogg') return true;

  return AUDIO_EXTENSIONS.has(getAttachmentExtension(attachment));
}

function isPdfAttachment(attachment) {
  if (!attachment) return false;
  if (attachment.contentType === 'application/pdf') return true;

  return PDF_EXTENSIONS.has(getAttachmentExtension(attachment));
}

function isTextAttachment(attachment) {
  if (!attachment) return false;

  const contentType = String(attachment.contentType || '')
    .trim()
    .split(';')[0]
    .toLowerCase();
  if (contentType.startsWith('text/')) return true;
  if (TEXT_MIME_TYPES.has(contentType)) return true;

  const fileName = getAttachmentFileName(attachment);
  if (TEXT_FILENAMES.has(fileName)) return true;

  return TEXT_EXTENSIONS.has(getAttachmentExtension(attachment));
}

function getFirstAttachmentByPredicate(message, predicate) {
  if (!message?.attachments?.size) return null;

  for (const attachment of message.attachments.values()) {
    if (predicate(attachment)) return attachment;
  }

  return null;
}

function normalizeAttachmentHintValue(value) {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value)
    .replace(/[\r\n]+/g, ' ')
    .replace(/[\[\]]/g, '')
    .replace(/,/g, ';')
    .trim();
}

function buildAttachmentHint(fields = {}) {
  const parts = [];

  for (const [key, value] of Object.entries(fields)) {
    const normalizedValue = normalizeAttachmentHintValue(value);
    if (!normalizedValue) {
      continue;
    }

    parts.push(`${key}=${normalizedValue}`);
  }

  if (parts.length === 0) {
    return '';
  }

  return `[Attachment: ${parts.join(', ')}]`;
}

module.exports = {
  isImageAttachment,
  isAudioAttachment,
  isPdfAttachment,
  isTextAttachment,
  getFirstAttachmentByPredicate,
  buildAttachmentHint
};
