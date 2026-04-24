/*
** caminho: tools/analyze_image.js
** últimaMod: 2026-04-09 00:00
** autor: Vico
** colaboração: GPT-5.4
*/

const OpenAI = require('openai');
const path = require('path');
const fetch = require('node-fetch');
const config = require('../core/config');

const ALLOWED_DISCORD_HOSTS = new Set([
  'cdn.discordapp.com',
  'media.discordapp.net',
]);
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const SUPPORTED_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);

function getLLMConfig(context = {}) {
  return config.resolveToolModelConfig(context?.toolDefinition, 'default');
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || '')
    .trim()
    .replace(/\/+$/, '');
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

function normalizeContentType(contentType) {
  return String(contentType || '')
    .trim()
    .split(';')[0]
    .toLowerCase();
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

function truncateText(text, maxLength) {
  if (typeof text !== 'string') {
    return '';
  }

  if (text.length <= maxLength) {
    return text;
  }

  return text.slice(0, maxLength);
}

function getContentLengthInBytes(response) {
  const rawValue = response?.headers?.get('content-length');
  const parsedValue = Number.parseInt(String(rawValue || ''), 10);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
}

function validateDiscordAttachmentUrl(rawUrl) {
  const normalizedUrl = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!normalizedUrl) {
    throw new Error('Informe "url" ou "attachment_id" para analisar a imagem.');
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

function isSupportedImageFormat(fileUrl, contentType) {
  const normalizedContentType = normalizeContentType(contentType);
  if (normalizedContentType.startsWith('image/')) {
    return true;
  }

  return SUPPORTED_IMAGE_EXTENSIONS.has(getExtensionFromUrl(fileUrl));
}

function decodeImageDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') {
    throw new Error('Imagem inline inválida.');
  }

  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Formato de imagem inline inválido.');
  }

  const mimeType = normalizeContentType(match[1]) || 'image/png';
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer || buffer.length === 0) {
    throw new Error('Imagem inline vazia.');
  }

  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error(`A imagem inline excede o limite suportado (${formatBytes(MAX_IMAGE_BYTES)}).`);
  }

  return {
    dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`,
    mimeType,
    sizeBytes: buffer.length,
  };
}

function getInlineAttachment(context = {}, attachmentId) {
  const normalizedAttachmentId = typeof attachmentId === 'string' ? attachmentId.trim() : '';
  if (!normalizedAttachmentId) {
    return null;
  }

  const attachments = context?.inlineAttachments;
  if (!attachments || typeof attachments !== 'object') {
    return null;
  }

  const attachment = attachments[normalizedAttachmentId];
  if (!attachment || typeof attachment !== 'object') {
    return null;
  }

  return {
    attachmentId: normalizedAttachmentId,
    dataUrl: attachment.dataUrl,
    mimeType: attachment.mimeType,
    sourceLabel: attachment.sourceLabel || normalizedAttachmentId,
  };
}

async function downloadDiscordImageAsDataUrl(validatedUrl) {
  let response;

  try {
    response = await fetch(validatedUrl, {
      headers: {
        'Accept': 'image/*,*/*',
        'User-Agent': 'VicaBot/1.0',
      },
    });
  } catch (error) {
    throw new Error(`Falha ao baixar a imagem do Discord: ${error.message}`);
  }

  if (!response.ok) {
    throw new Error(`Falha ao baixar a imagem do Discord (HTTP ${response.status}).`);
  }

  const contentType = response.headers.get('content-type');
  if (!isSupportedImageFormat(validatedUrl, contentType)) {
    throw new Error('O anexo informado não é uma imagem suportada para análise visual.');
  }

  const announcedLength = getContentLengthInBytes(response);
  if (announcedLength !== null && announcedLength > MAX_IMAGE_BYTES) {
    throw new Error(`A imagem anexada excede o limite suportado (${formatBytes(MAX_IMAGE_BYTES)}).`);
  }

  const fileBuffer = await response.buffer();
  if (!fileBuffer || fileBuffer.length === 0) {
    throw new Error('O anexo baixado do Discord veio vazio.');
  }

  if (fileBuffer.length > MAX_IMAGE_BYTES) {
    throw new Error(`A imagem anexada excede o limite suportado (${formatBytes(MAX_IMAGE_BYTES)}).`);
  }

  const mimeType = normalizeContentType(contentType) || 'image/png';
  return {
    dataUrl: `data:${mimeType};base64,${fileBuffer.toString('base64')}`,
    mimeType,
    sizeBytes: fileBuffer.length,
    sourceLabel: validatedUrl,
  };
}

async function loadImageSource(args = {}, context = {}) {
  if (typeof args.url === 'string' && args.url.trim()) {
    const validatedUrl = validateDiscordAttachmentUrl(args.url);
    const downloaded = await downloadDiscordImageAsDataUrl(validatedUrl);
    return {
      ...downloaded,
      sourceUrl: validatedUrl,
      sourceType: 'discord_url',
    };
  }

  const inlineAttachment = getInlineAttachment(context, args.attachment_id);
  if (!inlineAttachment) {
    throw new Error('Informe uma imagem válida por "url" ou "attachment_id".');
  }

  const decoded = decodeImageDataUrl(inlineAttachment.dataUrl);
  return {
    ...decoded,
    sourceType: 'inline_attachment',
    sourceLabel: inlineAttachment.sourceLabel,
    sourceAttachmentId: inlineAttachment.attachmentId,
  };
}

function buildAnalysisPrompt(args = {}) {
  const userPrompt = typeof args.prompt === 'string' ? args.prompt.trim() : '';

  if (userPrompt) {
    return truncateText(userPrompt, 2000);
  }

  return 'Descreva a imagem de forma objetiva para ajudar outro modelo textual a responder o usuário. Inclua: resumo visual, texto legível na imagem, detalhes relevantes para o pedido e incertezas, se houver.';
}

async function execute(args, context) {
  const llmConfig = getLLMConfig(context);
  const model = llmConfig?.model;
  const apiKey = llmConfig?.api_key;
  const baseUrl = normalizeBaseUrl(llmConfig?.base_url);

  if (!apiKey || !baseUrl || !model) {
    throw new Error('Configuracao LLM invalida. Verifique runtime da tool analyze_image ou [ai_provider] em config.toml.');
  }

  const imageSource = await loadImageSource(args, context);
  const maxResultChars = clampInteger(args?.max_result_chars, 3200, 500, 12000);
  const prompt = buildAnalysisPrompt(args);

  const openai = new OpenAI({
    apiKey,
    baseURL: baseUrl,
    defaultHeaders: {
      'X-Title': 'Vica',
    },
  });

  console.log(`[TOOLS][ANALYZE_IMAGE][INFO] Iniciando análise visual: ${imageSource.sourceLabel} (${formatBytes(imageSource.sizeBytes)}).`);

  let response;
  try {
    response = await openai.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 1200,
      messages: [
        {
          role: 'system',
          content: 'Você é uma etapa interna de análise visual para outro assistente. Responda em texto estruturado, objetivo e útil. Não converse com o usuário. Não invente detalhes quando houver incerteza.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt,
            },
            {
              type: 'image_url',
              image_url: {
                url: imageSource.dataUrl,
              },
            },
          ],
        },
      ],
    });
  } catch (apiError) {
    console.error(`[TOOLS][ANALYZE_IMAGE][ERROR] API error:`, apiError?.message || apiError);
    throw new Error(`Falha na API de análise visual: ${apiError?.message || 'unknown error'}`);
  }

  console.log(`[TOOLS][ANALYZE_IMAGE][DEBUG] API response:`, JSON.stringify({
    model: response?.model,
    usage: response?.usage,
    finish_reason: response?.choices?.[0]?.finish_reason,
    has_content: !!response?.choices?.[0]?.message?.content,
    content_preview: response?.choices?.[0]?.message?.content?.slice(0, 100) || '(empty)'
  }));

  const rawContent = response?.choices?.[0]?.message?.content;
  const fullText = typeof rawContent === 'string' ? rawContent.trim() : '';
  if (!fullText) {
    const finishReason = response?.choices?.[0]?.finish_reason || 'unknown';
    throw new Error(`A análise visual não retornou conteúdo. (finish_reason: ${finishReason})`);
  }

  const content = truncateText(fullText, maxResultChars);

  return {
    model: response?.model || model,
    source_type: imageSource.sourceType,
    source_url: imageSource.sourceUrl || null,
    source_attachment_id: imageSource.sourceAttachmentId || null,
    content,
    truncated: fullText.length > content.length,
    original_length: fullText.length,
  };
}

module.exports = {
  execute,
};
