/*
** caminho: core/tagParser.js
** últimaMod: 2025-09-12 20:15
** autor: Vico
** colaboração: Gemini, ChatGPT, Roo Sonic, Kimi, Roo Sonic (xai/grok-code-fast-1)

// Módulo de parser de tags especiais
// Responsável por analisar mensagens com tags específicas como [imagem], [imagem_gerada], [meta]...[/meta] e [memory]...[/memory] (case-insensitive)

/* --- Funções de Validação --- */

/**
 * Valida se um ID do Discord é válido (string numérica com 17-19 dígitos)
 * @param {string} id - ID a ser validado
 * @returns {boolean} True se válido
 */
function isValidDiscordId(id) {
    return typeof id === 'string' && /^\d{17,19}$/.test(id);
}

/* --- Funções de Substituição de Placeholders --- */

/**
 * Substitui placeholders na tag com valores do contexto
 * @param {string} content - Conteúdo da tag com possíveis placeholders
 * @param {object} context - Objeto de contexto com valores para substituição (ex: { guildId: '123456789012345678' })
 * @returns {string} Conteúdo com placeholders substituídos
 */
function replacePlaceholders(content, context = {}) {
    let result = content;

    // Substitui {GUILD_ID} pelo valor do guildId do contexto
    if (context.guildId && result.includes('{GUILD_ID}')) {
        result = result.replace(/\{GUILD_ID\}/g, context.guildId);
        console.log('[TAG_PARSER][PLACEHOLDER] Placeholder {GUILD_ID} substituído por:', context.guildId);
    }

    return result;
}

/* --- Função de Construção de Mensagens --- */

/**
 * Função para construir uma mensagem com tags especiais a partir de dados estruturados.
 * Reconstrói o formato de mensagem original com base nos componentes fornecidos.
 * @param {object} params - Parâmetros da função
 * @param {string} params.text - Texto base da mensagem (obrigatório)
 * @param {boolean} [params.imagem=false] - Flag para adicionar tag [imagem]
 * @param {object|null} [params.meta=null] - Objeto com pares chave-valor para tag meta
 * @param {object} [params.context=null] - Objeto de contexto para substituição de placeholders
 * @returns {string} Mensagem formatada com tags
 * @throws {Error} Se texto não for fornecido ou for inválido
 */
function buildTaggedMessage({ text, imagem = false, meta = null, context = null }) {
    // Validação do texto (sempre obrigatório e deve ser string)
    if (!text || typeof text !== 'string') {
        throw new Error('Texto é obrigatório e deve ser uma string válida');
    }

    // Lista para armazenar componentes da mensagem
    const components = [];

    // Adicionar tag [imagem] se solicitada
    if (imagem) {
        components.push('[imagem]');
    }

    // Adicionar texto (sempre incluído e limpo)
    components.push(text.trim());

    // Construir tag [meta] se fornecida
    if (meta && typeof meta === 'object') {
        const metaPairs = [];
        for (const [key, value] of Object.entries(meta)) {
            metaPairs.push(`${key}:${value}`);
        }
        if (metaPairs.length > 0) {
            components.push(`[meta]${metaPairs.join('|')}[/meta]`);
        }
    }

    // Unir componentes com espaços únicos
    return components.join(' ').replace(/\s+/g, ' ');
}

/**
 * Função para analisar mensagens com tags especiais.
 * Utiliza regex para detectar e extrair conteúdo das tags, removendo-as do texto principal.
 * @param {string} message - A mensagem original contendo as tags.
 * @param {object} [context={}] - Objeto de contexto para substituição de placeholders.
 * @returns {object} Objeto com cleanedMessage (texto limpo), flags e conteúdos extraídos.
 */
function parseTags(message, context = {}) {
    // Clonando a mensagem para modificações
    let text = message;

    // Flag para imagem
    const hasImage = /\[(imagem|imagem_gerada)\]/i.test(message);

    // Remover tag [imagem] do texto
    if (hasImage) {
        text = text.replace(/\[(imagem|imagem_gerada)\]/gi, '');
    }

    // Extrair conteúdo da tag [meta]...[/meta]
    const metaMatch = message.match(/\[meta\](.*?)\[\/meta\]/s);
    let meta = null;
    if (metaMatch) {
        meta = metaMatch[1].trim();
        text = text.replace(/\[meta\].*?\[\/meta\]/gs, '');
    }

    // Remover tags [memory]...[/memory] (case-insensitive, dotAll)
    // Estas tags são usadas para "pensamentos" de memória que devem ser ocultados do usuário final
    const memoryRegex = /\[memory\](.*?)\[\/memory\]/gsi;
    if (memoryRegex.test(text)) {
        // Opcional: Logar o conteúdo removido se necessário para debug
        // const match = text.match(memoryRegex);
        // console.log('[TAG_PARSER][INFO] Stripping memory tag content:', match[1]);
        text = text.replace(memoryRegex, '');
    }

    // Limpar espaços extras do texto resultante
    const cleanedMessage = text.trim().replace(/[ \t]+/g, ' ');

    // Retornar objeto com dados parseados
    return {
        cleanedMessage,
        hasImage,
        meta
    };
}

module.exports = { parseTags, buildTaggedMessage };

// Exemplos de uso:
//
// const result = parseTags("Olá [imagem] como vai? [meta]Isso é meta[/meta] [memory]Checking memory...[/memory]");
// console.log(result);
// // Output: { cleanedMessage: "Olá como vai?", hasImage: true, meta: "Isso é meta" }
