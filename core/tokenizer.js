/*
** caminho: core/tokenizer.js
** descrição: Módulo para interagir com o endpoint de tokenizer da Z.AI
*/

const config = require('../config.json');

/**
 * Calcula o número de tokens para uma lista de mensagens e ferramentas.
 * @param {Array} messages - Lista de mensagens no formato {role, content}.
 * @param {Array} tools - Lista de ferramentas disponíveis (opcional).
 * @param {string} model - Modelo a ser utilizado (opcional, usa o padrão do config).
 * @returns {Promise<number>} - Promessa que resolve com o total de tokens.
 */
async function countTokens(messages, tools = [], model = null) {
    const endpoint = `${config.llm.base_url}/tokenizer`;
    const selectedModel = model || config.llm.model;

    // Prepara o payload conforme especificação OpenAPI
    const payload = {
        model: selectedModel,
        messages: messages,
    };

    if (tools && tools.length > 0) {
        payload.tools = tools;
    }

    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${config.llm.api_key}`
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
