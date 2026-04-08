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

function getAttachmentExtension(attachment) {
  const fileName = (attachment?.name || '').toLowerCase();
  return path.extname(fileName);
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
  getFirstAttachmentByPredicate,
  buildAttachmentHint
};
