/*
** caminho: tools/web_reader.js
** últimaMod: 2026-03-01 03:55
** autor: Vico
** colaboração: ChatGPT (GPT-5)
*/

const fetch = require('node-fetch');
const config = require('../core/config');

const ALLOWED_RETURN_FORMATS = new Set(['markdown', 'text']);

function getLLMConfig() {
    return config.getModelConfig('default');
}

function normalizeBaseUrl(baseUrl) {
    return String(baseUrl || '')
        .trim()
        .replace(/\/(chat\/completions|responses)\/?$/, '')
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

function truncateText(text, maxLength) {
    if (typeof text !== 'string') {
        return '';
    }

    if (text.length <= maxLength) {
        return text;
    }

    return text.slice(0, maxLength);
}

function buildPayload(args, validatedUrl) {
    const returnFormat = typeof args?.return_format === 'string'
        ? args.return_format.trim().toLowerCase()
        : 'markdown';

    if (!ALLOWED_RETURN_FORMATS.has(returnFormat)) {
        throw new Error('O parâmetro "return_format" deve ser "markdown" ou "text".');
    }

    return {
        url: validatedUrl,
        timeout: clampInteger(args?.timeout, 20, 1, 120),
        no_cache: typeof args?.no_cache === 'boolean' ? args.no_cache : false,
        return_format: returnFormat,
        retain_images: typeof args?.retain_images === 'boolean' ? args.retain_images : true,
        no_gfm: typeof args?.no_gfm === 'boolean' ? args.no_gfm : false,
        keep_img_data_url: typeof args?.keep_img_data_url === 'boolean' ? args.keep_img_data_url : false,
        with_images_summary: typeof args?.with_images_summary === 'boolean' ? args.with_images_summary : false,
        with_links_summary: typeof args?.with_links_summary === 'boolean' ? args.with_links_summary : false,
    };
}

async function execute(args, context) {
    void context;

    const rawUrl = typeof args?.url === 'string' ? args.url.trim() : '';
    if (!rawUrl) {
        throw new Error('O parâmetro "url" é obrigatório.');
    }

    let validatedUrl;
    try {
        const parsedUrl = new URL(rawUrl);
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
            throw new Error('Invalid protocol');
        }
        validatedUrl = parsedUrl.toString();
    } catch (_) {
        throw new Error('O parâmetro "url" é inválido.');
    }

    const llmConfig = getLLMConfig();
    if (!llmConfig?.api_key || !llmConfig?.base_url) {
        throw new Error('Configuração LLM inválida. Verifique [models.default] em config.toml.');
    }

    const baseUrl = normalizeBaseUrl(llmConfig.base_url);
    if (!baseUrl) {
        throw new Error('Configuração LLM inválida. base_url vazio em config.toml.');
    }

    const endpoint = `${baseUrl}/reader`;
    const payload = buildPayload(args, validatedUrl);
    const maxContentLength = clampInteger(args?.max_content_length, 5000, 500, 50000);

    console.log(`[TOOLS][WEB_READER][INFO] Lendo URL: ${validatedUrl}`);

    let response;
    try {
        response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${llmConfig.api_key}`,
                'X-Title': 'Vica',
            },
            body: JSON.stringify(payload),
        });
    } catch (error) {
        throw new Error(`Falha de rede ao chamar web_reader: ${error.message}`);
    }

    const rawBody = await response.text();
    if (!response.ok) {
        const preview = rawBody.length > 400 ? `${rawBody.slice(0, 400)}...` : rawBody;
        throw new Error(`Falha no web_reader (HTTP ${response.status}): ${preview}`);
    }

    let data;
    try {
        data = JSON.parse(rawBody);
    } catch (_) {
        throw new Error('Resposta inválida do web_reader: JSON não reconhecido.');
    }

    const readerResult = data?.reader_result;
    if (!readerResult || typeof readerResult !== 'object') {
        throw new Error('Resposta inválida do web_reader: campo reader_result ausente.');
    }

    const fullContent = typeof readerResult.content === 'string' ? readerResult.content : '';
    const content = truncateText(fullContent, maxContentLength);

    return {
        title: typeof readerResult.title === 'string' ? readerResult.title : '',
        url: typeof readerResult.url === 'string' ? readerResult.url : validatedUrl,
        description: typeof readerResult.description === 'string' ? readerResult.description : '',
        content: content,
        metadata: readerResult.metadata && typeof readerResult.metadata === 'object' ? readerResult.metadata : {},
        truncated: fullContent.length > content.length,
        original_length: fullContent.length,
    };
}

module.exports = {
    execute,
};
