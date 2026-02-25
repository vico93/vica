/*
** caminho: tools/image_generation.js
** últimaMod: 2026-02-25 00:25
** autor: Vico
** colaboração: ChatGPT (GPT-5)
*/

const OpenAI = require('openai');
const fetch = require('node-fetch');
const config = require('../config.json');

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

async function downloadImageFromUrl(imageUrl) {
    const response = await fetch(imageUrl);
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
}

async function execute(args, context) {
    const prompt = args?.prompt;

    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
        throw new Error('O parametro "prompt" e obrigatorio.');
    }

    if (prompt.length > 32000) {
        throw new Error('O parametro "prompt" excede o limite de 32000 caracteres.');
    }

    const llmConfig = config.llm;
    if (!llmConfig?.base_url || !llmConfig?.api_key) {
        throw new Error('Configuracao LLM invalida. Verifique base_url e api_key em config.json.');
    }

    if (!llmConfig?.model_image_gen) {
        throw new Error('Configuracao LLM invalida. Verifique llm.model_image_gen em config.json.');
    }

    const openai = new OpenAI({
        apiKey: llmConfig.api_key,
        baseURL: llmConfig.base_url,
        defaultHeaders: {
            'X-Title': 'Vica',
        },
    });

    console.log(`[TOOLS][IMAGE][INFO] Gerando imagem com o modelo: ${llmConfig.model_image_gen}`);

    try {
        const response = await openai.images.generate({
            model: llmConfig.model_image_gen,
            prompt: prompt.trim(),
        });

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
            const downloadedImage = await downloadImageFromUrl(image.url);
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
