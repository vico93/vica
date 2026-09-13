/*
** caminho: tools/read_text_attachment.js
** últimaMod: 2026-04-09 01:20
** autor: Vico
** colaboração: GPT-5.4
*/

const path = require('path');
const fetch = require('node-fetch');
const config = require('../core/config');

const ALLOWED_DISCORD_HOSTS = new Set([
  'cdn.discordapp.com',
  'media.discordapp.net',
]);
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
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

function normalizeContentType(contentType) {
  return String(contentType || '')
    .trim()
    .split(';')[0]
    .toLowerCase();
}

function normalizeBaseName(fileName) {
  return String(fileName || '')
    .trim()
    .toLowerCase();
}

function getRetryConfig() {
  const settings = config.ai_settings || {};
  return {
    maxRetries: Number.isInteger(settings.retries) ? settings.retries : 3,
    baseDelay: Number.isInteger(settings.initial_delay_ms) ? settings.initial_delay_ms : 1000,
  };
}

function getBackoffDelay(attempt, baseDelay) {
  const jitter = Math.floor(Math.random() * 250);
  return baseDelay * Math.pow(2, attempt - 1) + jitter;
}

async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetries(url, options) {
  const { maxRetries, baseDelay } = getRetryConfig();
  let attempt = 0;

  while (true) {
    try {
      const response = await fetch(url, options);

      if (!RETRYABLE_STATUS_CODES.has(response.status) || attempt >= maxRetries) {
        return response;
      }

      attempt += 1;
      const delay = getBackoffDelay(attempt, baseDelay);
      try {
        await response.text();
      } catch {
        // ignore body drain errors before retry
      }
      console.warn(`[TOOLS][READ_TEXT_ATTACHMENT][WARN] HTTP ${response.status} na tentativa ${attempt}/${maxRetries}. Retentando em ${delay}ms...`);
      await sleep(delay);
    } catch (error) {
      if (attempt >= maxRetries) {
        throw error;
      }

      attempt += 1;
      const delay = getBackoffDelay(attempt, baseDelay);
      console.warn(`[TOOLS][READ_TEXT_ATTACHMENT][WARN] Erro de rede na tentativa ${attempt}/${maxRetries}: ${error.message}. Retentando em ${delay}ms...`);
      await sleep(delay);
    }
  }
}

function validateAttachmentUrl(rawUrl) {
  const normalizedUrl = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!normalizedUrl) {
    throw new Error('O parâmetro "url" é obrigatório.');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(normalizedUrl);
  } catch (_) {
    throw new Error('O parâmetro "url" é inválido.');
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('O parâmetro "url" deve usar HTTP ou HTTPS.');
  }

  if (!ALLOWED_DISCORD_HOSTS.has(parsedUrl.hostname)) {
    throw new Error('A ferramenta aceita apenas URLs de anexos do Discord.');
  }

  return parsedUrl.toString();
}

function getExtensionFromUrl(fileUrl) {
  try {
    const parsedUrl = new URL(fileUrl);
    return path.extname(parsedUrl.pathname).toLowerCase();
  } catch {
    return '';
  }
}

function getFileNameFromUrl(fileUrl) {
  try {
    const parsedUrl = new URL(fileUrl);
    const baseName = path.basename(parsedUrl.pathname);
    return decodeURIComponent(baseName || 'attachment.txt');
  } catch {
    return 'attachment.txt';
  }
}

function isSupportedTextFormat(fileUrl, contentType) {
  const normalizedContentType = normalizeContentType(contentType);
  if (normalizedContentType.startsWith('text/')) {
    return true;
  }

  if (TEXT_MIME_TYPES.has(normalizedContentType)) {
    return true;
  }

  const fileName = normalizeBaseName(getFileNameFromUrl(fileUrl));
  if (TEXT_FILENAMES.has(fileName)) {
    return true;
  }

  return TEXT_EXTENSIONS.has(getExtensionFromUrl(fileUrl));
}

function getContentLengthInBytes(response) {
  const rawValue = response?.headers?.get('content-length');
  const parsedValue = Number.parseInt(String(rawValue || ''), 10);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }

  return `${bytes} B`;
}

function clampInteger(value, fallback, min, max) {
  if (!Number.isInteger(value)) {
    return fallback;
  }

  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
}

function getOptionalPositiveInteger(value, fieldName) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`O parâmetro "${fieldName}" deve ser um inteiro maior ou igual a 1.`);
  }

  return value;
}

function stripBom(text) {
  return typeof text === 'string' && text.charCodeAt(0) === 0xFEFF
    ? text.slice(1)
    : text;
}

function getReplacementCharRatio(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return 0;
  }

  const replacementChars = (text.match(/�/g) || []).length;
  return replacementChars / text.length;
}

function decodeUtf16Be(buffer) {
  const withoutBom = buffer.slice(2);
  const swapped = Buffer.allocUnsafe(withoutBom.length);

  for (let index = 0; index < withoutBom.length; index += 2) {
    swapped[index] = withoutBom[index + 1] || 0;
    swapped[index + 1] = withoutBom[index] || 0;
  }

  return swapped.toString('utf16le');
}

function isLikelyUtf16Le(buffer) {
  if (!buffer || buffer.length < 4 || buffer.length % 2 !== 0) {
    return false;
  }

  const samplePairs = Math.min(Math.floor(buffer.length / 2), 256);
  let oddZeroes = 0;
  let evenZeroes = 0;

  for (let index = 0; index < samplePairs; index += 1) {
    if (buffer[index * 2] === 0) {
      evenZeroes += 1;
    }
    if (buffer[index * 2 + 1] === 0) {
      oddZeroes += 1;
    }
  }

  return oddZeroes > samplePairs * 0.3 && oddZeroes > evenZeroes * 3;
}

function decodeTextBuffer(buffer) {
  if (!buffer || buffer.length === 0) {
    throw new Error('O anexo de texto está vazio.');
  }

  if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return {
      text: buffer.slice(3).toString('utf8'),
      encoding: 'utf-8',
    };
  }

  if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
    return {
      text: stripBom(buffer.slice(2).toString('utf16le')),
      encoding: 'utf-16le',
    };
  }

  if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
    return {
      text: stripBom(decodeUtf16Be(buffer)),
      encoding: 'utf-16be',
    };
  }

  if (isLikelyUtf16Le(buffer)) {
    return {
      text: stripBom(buffer.toString('utf16le')),
      encoding: 'utf-16le',
    };
  }

  const utf8Text = stripBom(buffer.toString('utf8'));
  if (!utf8Text.includes('\u0000') && getReplacementCharRatio(utf8Text) <= 0.02) {
    return {
      text: utf8Text,
      encoding: 'utf-8',
    };
  }

  const latin1Text = buffer.toString('latin1');
  if (!latin1Text.includes('\u0000')) {
    return {
      text: latin1Text,
      encoding: 'latin1',
    };
  }

  throw new Error('Não foi possível decodificar o anexo como texto legível.');
}

function getLineSelection(lines, startLine, endLine) {
  const totalLines = lines.length;

  if (totalLines === 0) {
    throw new Error('O anexo de texto não contém linhas legíveis.');
  }

  const selectedStartLine = startLine || 1;
  if (selectedStartLine > totalLines) {
    throw new Error(`O parâmetro "start_line" (${selectedStartLine}) excede o total de linhas do arquivo (${totalLines}).`);
  }

  const selectedEndLine = Math.min(endLine || totalLines, totalLines);
  if (selectedEndLine < selectedStartLine) {
    throw new Error('O parâmetro "end_line" não pode ser menor que "start_line".');
  }

  return {
    totalLines,
    selectedStartLine,
    selectedEndLine,
    selectedLines: lines.slice(selectedStartLine - 1, selectedEndLine),
  };
}

function truncateText(text, maxLength) {
  if (typeof text !== 'string') {
    return '';
  }

  if (text.length <= maxLength) {
    return text;
  }

  return text.slice(0, maxLength);
}

async function downloadTextAttachment(validatedUrl) {
  let response;

  try {
    response = await fetchWithRetries(validatedUrl, {
      headers: {
        'Accept': 'text/*,application/json,application/xml,*/*',
        'User-Agent': 'VicaBot/1.0',
      },
    });
  } catch (error) {
    throw new Error(`Falha ao baixar o anexo do Discord: ${error.message}`);
  }

  if (!response.ok) {
    throw new Error(`Falha ao baixar o anexo do Discord (HTTP ${response.status}).`);
  }

  const contentType = normalizeContentType(response.headers.get('content-type'));
  if (!isSupportedTextFormat(validatedUrl, contentType)) {
    throw new Error('O anexo informado não parece ser um arquivo de texto/código suportado.');
  }

  const announcedLength = getContentLengthInBytes(response);
  if (announcedLength !== null && announcedLength > MAX_TEXT_BYTES) {
    throw new Error(`O arquivo anexado excede o limite suportado para leitura textual (${formatBytes(MAX_TEXT_BYTES)}).`);
  }

  const fileBuffer = await response.buffer();
  if (!fileBuffer || fileBuffer.length === 0) {
    throw new Error('O anexo baixado do Discord veio vazio.');
  }

  if (fileBuffer.length > MAX_TEXT_BYTES) {
    throw new Error(`O arquivo anexado excede o limite suportado para leitura textual (${formatBytes(MAX_TEXT_BYTES)}).`);
  }

  const decoded = decodeTextBuffer(fileBuffer);

  return {
    fileName: getFileNameFromUrl(validatedUrl),
    contentType: contentType || 'text/plain',
    encoding: decoded.encoding,
    sizeBytes: fileBuffer.length,
    text: decoded.text,
  };
}

async function execute(args) {
  const validatedUrl = validateAttachmentUrl(args?.url);
  const startLine = getOptionalPositiveInteger(args?.start_line, 'start_line');
  const endLine = getOptionalPositiveInteger(args?.end_line, 'end_line');

  if (startLine && endLine && endLine < startLine) {
    throw new Error('O parâmetro "end_line" não pode ser menor que "start_line".');
  }

  console.log(`[TOOLS][READ_TEXT_ATTACHMENT][INFO] Iniciando leitura de anexo textual: ${validatedUrl}`);

  const attachment = await downloadTextAttachment(validatedUrl);
  const lines = attachment.text.split(/\r\n|\n|\r/);
  const selection = getLineSelection(lines, startLine, endLine);
  const selectedText = selection.selectedLines.join('\n');
  const maxResultChars = clampInteger(args?.max_result_chars, 4000, 500, 12000);
  const content = truncateText(selectedText, maxResultChars);

  return {
    source_url: validatedUrl,
    file_name: attachment.fileName,
    content_type: attachment.contentType,
    encoding: attachment.encoding,
    size_bytes: attachment.sizeBytes,
    total_lines: selection.totalLines,
    start_line: selection.selectedStartLine,
    end_line: selection.selectedEndLine,
    content,
    truncated: selectedText.length > content.length,
    original_length: selectedText.length,
  };
}

module.exports = {
  execute,
};
