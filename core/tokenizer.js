/*
** caminho: core/tokenizer.js
** descrição: Módulo para interagir com o endpoint de tokenizer da Z.AI
*/

const config = require('./config');

/**
 * Calcula o número de tokens para uma lista de mensagens e ferramentas.
 * @param {Array} messages - Lista de mensagens no formato {role, content}.
 * @param {Array} tools - Lista de ferramentas disponíveis (opcional).
 * @param {string} model - Modelo a ser utilizado (opcional, usa o padrão do config).
 * @returns {Promise<number>} - Promessa que resolve com o total de tokens.
 */
/**
 * Remove conteúdo de imagem das mensagens para o tokenizer.
 * Substitui image_url por um placeholder de texto curto.
 */
function sanitizeMessages(messages) {
    return messages.map(msg => {
        if (!Array.isArray(msg.content)) return msg;
        // Filtra image_url e mantém apenas partes de texto
        const textParts = msg.content.filter(part => part.type !== 'image_url');
        // Adiciona placeholder para indicar que havia imagem
        textParts.push({ type: 'text', text: '[image]' });
        return { ...msg, content: textParts };
    });
}

async function countTokens(messages, tools = [], model = null, capability = 'default') {
    const modelConfig = config.getModelConfig(capability);
    const endpoint = `${modelConfig.base_url}/tokenizer`;
    const selectedModel = model || modelConfig.model;

    // Prepara o payload conforme especificação OpenAPI
    const payload = {
        model: selectedModel,
        messages: sanitizeMessages(messages),
    };

    if (tools && tools.length > 0) {
        payload.tools = tools;
    }

    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${modelConfig.api_key}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.warn(`[TOKENIZER][WARN] Falha ao calcular tokens: ${response.status} - ${errorText}`);
            // Em caso de falha, retornamos 0 para não bloquear o fluxo, mas logamos o aviso.
            return 0;
        }

        const data = await response.json();

        // O endpoint retorna usage: { prompt_tokens, total_tokens, ... }
        // Estamos interessados no total (que seria o input atual)
        return data.usage?.total_tokens || 0;

    } catch (error) {
        console.warn(`[TOKENIZER][ERRO] Erro de rede ao chamar tokenizer: ${error.message}`);
        return 0;
    }
}

module.exports = {
    countTokens
};
