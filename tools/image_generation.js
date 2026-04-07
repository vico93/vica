/*
** caminho: tools/image_generation.js
** últimaMod: 2026-03-09 12:20
** autor: Vico
** colaboração: ChatGPT (GPT-5)
*/

const OpenAI = require('openai');
const fetch = require('node-fetch');
const config = require('../core/config');

function getFileExtension(outputFormat) {
    if (outputFormat === 'jpeg') {
        return 'jpg';
    }
    if (outputFormat === 'webp') {
        return 'webp';
    }
    return 'png';
}

function getFileExtensionFromContentType(contentType, fallback = 'png') {
    if (!contentType || typeof contentType !== 'string') {
        return fallback;
    }

    const normalized = contentType.toLowerCase();
    if (normalized.includes('image/jpeg') || normalized.includes('image/jpg')) {
        return 'jpg';
    }
    if (normalized.includes('image/webp')) {
        return 'webp';
    }
    if (normalized.includes('image/png')) {
        return 'png';
    }

    return fallback;
}

function getFileExtensionFromUrl(imageUrl, fallback = 'png') {
    if (!imageUrl || typeof imageUrl !== 'string') {
        return fallback;
    }

    const normalized = imageUrl.toLowerCase();
    if (normalized.includes('.jpeg') || normalized.includes('.jpg')) {
        return 'jpg';
    }
    if (normalized.includes('.webp')) {
        return 'webp';
    }
    if (normalized.includes('.png')) {
        return 'png';
    }

    return fallback;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSafeUrlForLog(imageUrl) {
    if (typeof imageUrl !== 'string' || !imageUrl.trim()) {
        return '[url_vazia]';
    }

    try {
        const parsed = new URL(imageUrl);
        return `${parsed.origin}${parsed.pathname}`;
    } catch {
        return '[url_invalida]';
    }
}

function decodeImageFromDataUrl(imageUrl) {
    if (typeof imageUrl !== 'string') {
        return null;
    }

    const dataUrlMatch = imageUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!dataUrlMatch) {
        return null;
    }

    const contentType = dataUrlMatch[1];
    const base64Payload = dataUrlMatch[2];
    const imageBuffer = Buffer.from(base64Payload, 'base64');

    if (!imageBuffer || imageBuffer.length === 0) {
        throw new Error('Imagem em data URL retornou payload vazio.');
    }

    return {
        imageBuffer,
        contentType,
    };
}

function shouldRetryDefaultImageGeneration(error) {
    const status = error?.status || error?.response?.status;
    const message = (error?.message || '').toLowerCase();

    if (status && status >= 500) {
        return false;
    }

    return message.includes('response_format')
        || message.includes('b64_json')
        || message.includes('unknown parameter')
        || message.includes('unsupported')
        || message.includes('not support')
        || message.includes('invalid parameter');
}

async function generateImageWithFallback(openai, model, prompt) {
    const basePayload = {
        model,
        prompt: prompt.trim(),
    };

    try {
        // Prefer inline base64 to avoid transient/invalid URLs from some providers.
        return await openai.images.generate({
            ...basePayload,
            response_format: 'b64_json',
        });
    } catch (error) {
        if (!shouldRetryDefaultImageGeneration(error)) {
            throw error;
        }

        console.warn(`[TOOLS][IMAGE][WARN] Modelo '${model}' nao aceitou response_format=b64_json. Tentando formato padrao...`);
        return await openai.images.generate(basePayload);
    }
}

async function fetchImageUrl(imageUrl, extraHeaders = {}) {
    return await fetch(imageUrl, {
        headers: {
            'Accept': 'image/*',
            'User-Agent': 'VicaBot/1.0',
            ...extraHeaders,
        },
    });
}

async function downloadImageFromUrl(imageUrl, options = {}) {
    const normalizedUrl = typeof imageUrl === 'string' ? imageUrl.trim() : '';
    if (!normalizedUrl) {
        throw new Error('URL da imagem nao informada.');
    }

    const decodedDataUrl = decodeImageFromDataUrl(normalizedUrl);
    if (decodedDataUrl) {
        return decodedDataUrl;
    }

    if (!/^https?:\/\//i.test(normalizedUrl)) {
        throw new Error('URL de imagem invalida retornada pela API.');
    }

    const maxAttemptsRaw = options?.maxAttempts;
    const maxAttempts = Number.isInteger(maxAttemptsRaw)
        ? Math.min(Math.max(maxAttemptsRaw, 1), 5)
        : 3;
    const apiKey = typeof options?.apiKey === 'string' ? options.apiKey.trim() : '';

    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            let response = await fetchImageUrl(normalizedUrl);
            if (!response.ok && apiKey && [401, 403, 404].includes(response.status)) {
                response = await fetchImageUrl(normalizedUrl, {
                    'Authorization': `Bearer ${apiKey}`,
                });
            }

            if (!response.ok) {
                throw new Error(`Falha ao baixar imagem da URL (HTTP ${response.status}).`);
            }

            const imageBuffer = await response.buffer();
            const contentType = response.headers.get('content-type') || '';

            if (!imageBuffer || imageBuffer.length === 0) {
                throw new Error('Download da imagem retornou arquivo vazio.');
            }

            return {
                imageBuffer,
                contentType,
            };
        } catch (error) {
            lastError = error;
            if (attempt < maxAttempts) {
                console.warn(`[TOOLS][IMAGE][WARN] Tentativa ${attempt}/${maxAttempts} falhou ao baixar imagem (${getSafeUrlForLog(normalizedUrl)}): ${error.message}`);
                await sleep(attempt * 250);
            }
        }
    }

    throw lastError || new Error('Falha ao baixar imagem da URL.');
}

async function execute(args, context) {
    const prompt = args?.prompt;

    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
        throw new Error('O parametro "prompt" e obrigatorio.');
    }

    if (prompt.length > 32000) {
        throw new Error('O parametro "prompt" excede o limite de 32000 caracteres.');
    }

    const runtimeConfig = config.getToolRuntimeConfig(context?.toolDefinition);
    const llmConfig = config.resolveToolModelConfig(context?.toolDefinition, 'default');

    if (!runtimeConfig?.model) {
        throw new Error('Configuracao da ferramenta invalida. Defina runtime.model em data/tools.json para image_generation.');
    }

    if (!llmConfig?.base_url || !llmConfig?.api_key) {
        throw new Error('Configuracao LLM invalida. Verifique runtime.base_url/runtime.api_key em data/tools.json ou [models.default] em config.toml.');
    }

    if (!llmConfig?.model) {
        throw new Error('Configuracao LLM invalida. Verifique runtime.model em data/tools.json para image_generation.');
    }

    const openai = new OpenAI({
        apiKey: llmConfig.api_key,
        baseURL: llmConfig.base_url,
        defaultHeaders: {
            'X-Title': 'Vica',
        },
    });

    console.log(`[TOOLS][IMAGE][INFO] Gerando imagem com o modelo: ${llmConfig.model}`);

    try {
        const response = await generateImageWithFallback(openai, llmConfig.model, prompt);

        const image = response?.data?.[0];
        if (!image) {
            throw new Error('A API nao retornou dados de imagem.');
        }

        if (!image.b64_json && !image.url) {
            throw new Error('A API nao retornou URL nem b64_json para a imagem.');
        }

        const channel = context?.channel;
        if (!channel?.send) {
            return 'Imagem gerada com sucesso, mas o canal nao estava disponivel para envio automatico.';
        }

        let imageBuffer;
        let fileExtension = 'png';

        if (image.b64_json) {
            const outputFormat = response?.output_format || 'png';
            fileExtension = getFileExtension(outputFormat);
            imageBuffer = Buffer.from(image.b64_json, 'base64');
        } else {
            const downloadedImage = await downloadImageFromUrl(image.url, {
                apiKey: llmConfig.api_key,
                maxAttempts: 3,
            });
            fileExtension = getFileExtensionFromContentType(
                downloadedImage.contentType,
                getFileExtensionFromUrl(image.url, 'png')
            );
            imageBuffer = downloadedImage.imageBuffer;
        }

        const fileName = `imagem_${Date.now()}.${fileExtension}`;

        await channel.send({
            files: [{
                attachment: imageBuffer,
                name: fileName,
            }],
        });

        return 'Imagem gerada e anexada no canal com sucesso. Agora responda ao usuario com um comentario curto, sem incluir links.';
    } catch (error) {
        console.error('[TOOLS][IMAGE][ERROR]', error);
        throw new Error(`Falha na geracao de imagem: ${error.message}`);
    }
}

module.exports = {
    execute,
};
