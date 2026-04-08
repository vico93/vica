/*
** caminho: tools/document_ocr.js
** últimaMod: 2026-04-08 01:10
** autor: Vico
** colaboração: GPT-5.4
*/

const fetch = require('node-fetch');
const config = require('../core/config');

const ALLOWED_DISCORD_HOSTS = new Set([
  'cdn.discordapp.com',
  'media.discordapp.net',
]);
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

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

function getRetryConfig() {
  const settings = config.ai_settings || {};
  return {
    maxRetries: Number.isInteger(settings.retries) ? settings.retries : 3,
    baseDelay: Number.isInteger(settings.initial_delay_ms) ? settings.initial_delay_ms : 1000,
  };
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

function buildUserId(userId) {
  const normalizedUserId = typeof userId === 'string' || typeof userId === 'number'
    ? String(userId).trim()
    : '';

  if (!normalizedUserId) {
    return '';
  }

  const externalUserId = `discord_${normalizedUserId}`;
  if (externalUserId.length < 6 || externalUserId.length > 128) {
    return '';
  }

  return externalUserId;
}

function buildPayload(args, model, validatedUrl, context = {}) {
  const startPageId = getOptionalPositiveInteger(args?.start_page_id, 'start_page_id');
  const endPageId = getOptionalPositiveInteger(args?.end_page_id, 'end_page_id');

  if (startPageId && endPageId && endPageId < startPageId) {
    throw new Error('O parâmetro "end_page_id" não pode ser menor que "start_page_id".');
  }

  const payload = {
    model,
    file: validatedUrl,
    return_crop_images: args?.return_crop_images === true,
    need_layout_visualization: args?.need_layout_visualization === true,
    request_id: `vica_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  };

  if (startPageId) {
    payload.start_page_id = startPageId;
  }

  if (endPageId) {
    payload.end_page_id = endPageId;
  }

  const externalUserId = buildUserId(context?.userId);
  if (externalUserId) {
    payload.user_id = externalUserId;
  }

  return payload;
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

function flattenLayoutDetails(layoutDetails) {
  if (!Array.isArray(layoutDetails)) {
    return '';
  }

  const parts = [];
  for (const page of layoutDetails) {
    if (!Array.isArray(page)) {
      continue;
    }

    for (const item of page) {
      if (typeof item?.content !== 'string') {
        continue;
      }

      if (item.label === 'text' || item.label === 'formula' || item.label === 'table') {
        const content = item.content.trim();
        if (content) {
          parts.push(content);
        }
      }
    }
  }

  return parts.join('\n\n').trim();
}

function getBackoffDelay(attempt, baseDelay) {
  const jitter = Math.floor(Math.random() * 250);
  return baseDelay * Math.pow(2, attempt - 1) + jitter;
}

async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function postWithRetries(url, options) {
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
      console.warn(`[TOOLS][DOCUMENT_OCR][WARN] HTTP ${response.status} na tentativa ${attempt}/${maxRetries}. Retentando em ${delay}ms...`);
      await sleep(delay);
    } catch (error) {
      if (attempt >= maxRetries) {
        throw error;
      }

      attempt += 1;
      const delay = getBackoffDelay(attempt, baseDelay);
      console.warn(`[TOOLS][DOCUMENT_OCR][WARN] Erro de rede na tentativa ${attempt}/${maxRetries}: ${error.message}. Retentando em ${delay}ms...`);
      await sleep(delay);
    }
  }
}

async function execute(args, context) {
  const runtimeConfig = config.getToolRuntimeConfig(context?.toolDefinition);
  const llmConfig = getLLMConfig(context);
  const model = llmConfig?.model;
  const apiKey = llmConfig?.api_key;
  const baseUrl = normalizeBaseUrl(llmConfig?.base_url);

  if (!runtimeConfig?.model) {
    throw new Error('Configuracao da ferramenta invalida. Defina runtime.model em data/tools.json para document_ocr.');
  }

  if (!apiKey || !baseUrl) {
    throw new Error('Configuracao LLM invalida. Verifique runtime.base_url/runtime.api_key em data/tools.json ou [models.default] em config.toml.');
  }

  if (!model) {
    throw new Error('Configuracao LLM invalida. Verifique runtime.model em data/tools.json para document_ocr.');
  }

  const validatedUrl = validateAttachmentUrl(args?.url);
  const payload = buildPayload(args, model, validatedUrl, context);
  const endpoint = `${baseUrl}/paas/v4/layout_parsing`;

  console.log(`[TOOLS][DOCUMENT_OCR][INFO] Iniciando OCR de documento: ${validatedUrl}`);

  let response;
  try {
    response = await postWithRetries(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'X-Title': 'Vica',
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new Error(`Falha de rede ao chamar document_ocr: ${error.message}`);
  }

  const rawBody = await response.text();
  if (!response.ok) {
    const preview = rawBody.length > 500 ? `${rawBody.slice(0, 500)}...` : rawBody;
    throw new Error(`Falha no document_ocr (HTTP ${response.status}): ${preview}`);
  }

  let data;
  try {
    data = JSON.parse(rawBody);
  } catch (_) {
    throw new Error('Resposta inválida do document_ocr: JSON não reconhecido.');
  }

  const fullMarkdown = typeof data?.md_results === 'string'
    ? data.md_results.trim()
    : '';
  const fallbackText = flattenLayoutDetails(data?.layout_details);
  const fullText = fullMarkdown || fallbackText;

  if (!fullText) {
    throw new Error('A API não retornou texto extraído para o documento informado.');
  }

  const maxResultChars = clampInteger(args?.max_result_chars, 3200, 500, 12000);
  const content = truncateText(fullText, maxResultChars);
  const totalPages = Number.isInteger(data?.data_info?.num_pages)
    ? data.data_info.num_pages
    : null;

  return {
    model: data?.model || model,
    source_url: validatedUrl,
    total_pages: totalPages,
    start_page_id: payload.start_page_id || 1,
    end_page_id: payload.end_page_id || totalPages || null,
    content,
    truncated: fullText.length > content.length,
    original_length: fullText.length,
    request_id: data?.request_id || payload.request_id,
  };
}

module.exports = {
  execute,
};
