/*
** caminho: tools/image_generation.js
** últimaMod: 2026-02-25 00:00
** autor: Vico
** colaboração: ChatGPT (GPT-5)
*/

const OpenAI = require('openai');
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

        if (image.url) {
            return `Imagem gerada com sucesso: ${image.url}`;
        }

        if (!image.b64_json) {
            throw new Error('A API nao retornou URL nem b64_json para a imagem.');
        }

        const channel = context?.channel;
        if (!channel?.send) {
            return 'Imagem gerada com sucesso, mas o canal nao estava disponivel para envio automatico.';
        }

        const outputFormat = response?.output_format || 'png';
        const fileExtension = getFileExtension(outputFormat);
        const imageBuffer = Buffer.from(image.b64_json, 'base64');
        const fileName = `imagem_${Date.now()}.${fileExtension}`;

        const sentMessage = await channel.send({
            files: [{
                attachment: imageBuffer,
                name: fileName,
            }],
        });

        const attachmentUrl = sentMessage.attachments.first()?.url;
        if (attachmentUrl) {
            return `Imagem gerada com sucesso: ${attachmentUrl}`;
        }

        return 'Imagem gerada e enviada no canal com sucesso.';
    } catch (error) {
        console.error('[TOOLS][IMAGE][ERROR]', error);
        throw new Error(`Falha na geracao de imagem: ${error.message}`);
    }
}

module.exports = {
    execute,
};
