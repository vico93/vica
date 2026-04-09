/*
** caminho: tools/web_search.js
** últimaMod: 2026-04-08 15:10
** autor: Vico
** colaboração: ChatGPT (GPT-5)
*/

const fetch = require('node-fetch');
const config = require('../core/config');

const ALLOWED_SEARCH_ENGINES = new Set(['search-prime']);
const ALLOWED_RECENCY_FILTERS = new Set(['oneDay', 'oneWeek', 'oneMonth', 'oneYear', 'noLimit']);

function getLLMConfig(context = {}) {
    return config.resolveToolModelConfig(context?.toolDefinition, 'default');
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

function buildPayload(args, searchQuery) {
    const searchEngine = typeof args?.search_engine === 'string'
        ? args.search_engine.trim()
        : 'search-prime';

    if (!ALLOWED_SEARCH_ENGINES.has(searchEngine)) {
        throw new Error('O parâmetro "search_engine" deve ser "search-prime".');
    }

    const recencyFilter = typeof args?.search_recency_filter === 'string'
        ? args.search_recency_filter.trim()
        : 'noLimit';

    if (!ALLOWED_RECENCY_FILTERS.has(recencyFilter)) {
        throw new Error('O parâmetro "search_recency_filter" é inválido.');
    }

    const payload = {
        search_engine: searchEngine,
        search_query: searchQuery,
        count: clampInteger(args?.count, 10, 1, 50),
        search_recency_filter: recencyFilter,
    };

    const domainFilter = typeof args?.search_domain_filter === 'string'
        ? args.search_domain_filter.trim()
        : '';
    if (domainFilter) {
        payload.search_domain_filter = domainFilter;
    }

    const requestId = typeof args?.request_id === 'string'
        ? args.request_id.trim()
        : '';
    if (requestId) {
        payload.request_id = requestId.slice(0, 128);
    }

    const userId = typeof args?.user_id === 'string'
        ? args.user_id.trim()
        : '';
    if (userId) {
        if (userId.length < 6 || userId.length > 128) {
            throw new Error('O parâmetro "user_id" deve ter entre 6 e 128 caracteres.');
        }

        payload.user_id = userId;
    }

    return payload;
}

async function execute(args, context) {
    const searchQuery = typeof args?.search_query === 'string' ? args.search_query.trim() : '';
    if (!searchQuery) {
        throw new Error('O parâmetro "search_query" é obrigatório.');
    }

    const llmConfig = getLLMConfig(context);
    if (!llmConfig?.api_key || !llmConfig?.base_url) {
        throw new Error('Configuração LLM inválida. Verifique [ai_provider] em config.toml.');
    }

    const baseUrl = normalizeBaseUrl(llmConfig.base_url);
    if (!baseUrl) {
        throw new Error('Configuração LLM inválida. base_url vazio em config.toml.');
    }

    const endpoint = `${baseUrl}/web_search`;
    const payload = buildPayload(args, searchQuery);
    const maxContentLength = clampInteger(args?.max_content_length, 600, 100, 5000);

    console.log(`[TOOLS][WEB_SEARCH][INFO] Buscando por: ${truncateText(searchQuery, 160)}`);

    let response;
    try {
        response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${llmConfig.api_key}`,
                'Accept-Language': 'en-US,en',
                'X-Title': 'Vica',
            },
            body: JSON.stringify(payload),
        });
    } catch (error) {
        throw new Error(`Falha de rede ao chamar web_search: ${error.message}`);
    }

    const rawBody = await response.text();
    if (!response.ok) {
        const preview = rawBody.length > 400 ? `${rawBody.slice(0, 400)}...` : rawBody;
        throw new Error(`Falha no web_search (HTTP ${response.status}): ${preview}`);
    }

    let data;
    try {
        data = JSON.parse(rawBody);
    } catch (_) {
        throw new Error('Resposta inválida do web_search: JSON não reconhecido.');
    }

    const searchIntent = Array.isArray(data?.search_intent)
        ? data.search_intent.map((item) => ({
            intent: typeof item?.intent === 'string' ? item.intent : '',
            keywords: typeof item?.keywords === 'string' ? item.keywords : '',
            query: typeof item?.query === 'string' ? item.query : '',
        }))
        : [];
    const searchResults = Array.isArray(data?.search_result) ? data.search_result : null;
    if (!searchResults) {
        throw new Error('Resposta inválida do web_search: campo search_result ausente.');
    }

    return {
        query: searchQuery,
        request_id: typeof data?.request_id === 'string' ? data.request_id : '',
        search_intent: searchIntent,
        count: searchResults.length,
        results: searchResults.map((item) => ({
            title: typeof item?.title === 'string' ? item.title : '',
            content: truncateText(typeof item?.content === 'string' ? item.content : '', maxContentLength),
            link: typeof item?.link === 'string' ? item.link : '',
            media: typeof item?.media === 'string' ? item.media : '',
            icon: typeof item?.icon === 'string' ? item.icon : '',
            refer: typeof item?.refer === 'string' ? item.refer : '',
            publish_date: typeof item?.publish_date === 'string' ? item.publish_date : '',
        })),
    };
}

module.exports = {
    execute,
};
