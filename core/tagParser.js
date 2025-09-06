/*
** caminho: core/tagParser.js
** últimaMod: 2025-09-06 17:20
** autor: Vico
** colaboração: Gemini, ChatGPT, Roo Sonic, Kimi

// Módulo de parser de tags especiais
// Responsável por analisar mensagens com tags específicas como [imagem], [meta]...[/meta] e [salvar_memoria]...[/salvar_memoria] (case-insensitive)

/* --- Funções de Validação --- */

/**
 * Valida se um ID do Discord é válido (string numérica com 17-19 dígitos)
 * @param {string} id - ID a ser validado
 * @returns {boolean} True se válido
 */
function isValidDiscordId(id) {
    return typeof id === 'string' && /^\d{17,19}$/.test(id);
}

/**
 * Valida se o parâmetro importance é um número inteiro entre 1 e 10
 * @param {string|number} importance - Valor de importance a ser validado
 * @returns {boolean} True se válido
 */
function isValidImportance(importance) {
    const num = parseInt(importance, 10);
    return !isNaN(num) && num >= 1 && num <= 10;
}

/**
 * Valida se o parâmetro confidence é um número entre 0.0 e 1.0
 * @param {string|number} confidence - Valor de confidence a ser validado
 * @returns {boolean} True se válido
 */
function isValidConfidence(confidence) {
    const num = parseFloat(confidence);
    return !isNaN(num) && num >= 0.0 && num <= 1.0;
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

/**
 * Processa uma tag [salvar_memoria] e extrai os parâmetros validados
 * @param {string} content - Conteúdo interno da tag (sem as tags de abertura/fechamento)
 * @param {number} position - Posição da tag na mensagem original (para logging)
 * @param {object} context - Objeto de contexto para substituição de placeholders
 * @returns {object} Objeto com dados da memória parseado e validado
 */
function parseMemoryTag(content, position = 0, context = {}) {
    let hasErrors = false;
    const errors = [];

    // Aplicar substituição de placeholders no conteúdo antes de processar
    const processedContent = replacePlaceholders(content, context);

    // Dividir o conteúdo por ':' em exatamente 5 partes
    const parts = processedContent.split(':');

    if (parts.length !== 5) {
        hasErrors = true;
        errors.push(`Quantidade de parâmetros incorreta: esperado 5, encontrado ${parts.length}`);

        // Criar estrutura padrão com valores vazios/inválidos
        return {
            guildId: '',
            userId: '',
            fact: content.trim(),
            importance: 1,
            confidence: 0.5,
            hasErrors: true,
            errorMessage: errors.join('; ')
        };
    }

    const [guildId, userId, fact, importance, confidence] = parts;

    // Validar guildId
    if (!isValidDiscordId(guildId)) {
        hasErrors = true;
        errors.push(`guildId inválido: deve ser ID do Discord (17-19 dígitos numéricos)`);
    }

    // Validar userId
    if (!isValidDiscordId(userId)) {
        hasErrors = true;
        errors.push(`userId inválido: deve ser ID do Discord (17-19 dígitos numéricos)`);
    }

    // Validar fact (não vazio após trim)
    const trimmedFact = fact.trim();
    if (!trimmedFact) {
        hasErrors = true;
        errors.push(`fact não pode ser vazio`);
    }

    // Validar importance
    if (!isValidImportance(importance)) {
        hasErrors = true;
        errors.push(`importance deve ser um número inteiro entre 1 e 10`);
    }

    // Validar confidence
    if (!isValidConfidence(confidence)) {
        hasErrors = true;
        errors.push(`confidence deve ser um número entre 0.0 e 1.0`);
    }

    // Log de erro se houver problemas
    if (hasErrors) {
        console.error('[TAG_PARSER][ERROR] Tag salvar_memoria malformada na posição', position, '-', errors.join('; '));
    }

    return {
        guildId: guildId || '',
        userId: userId || '',
        fact: trimmedFact,
        importance: parseInt(importance, 10) || 1,
        confidence: parseFloat(confidence) || 0.5,
        hasErrors,
        errorMessage: hasErrors ? errors.join('; ') : null
    };
}

/* --- Função de Construção de Mensagens --- */

/**
 * Função para construir uma mensagem com tags especiais a partir de dados estruturados.
 * Reconstrói o formato de mensagem original com base nos componentes fornecidos.
 * @param {object} params - Parâmetros da função
 * @param {string} params.text - Texto base da mensagem (obrigatório)
 * @param {boolean} [params.imagem=false] - Flag para adicionar tag [imagem]
 * @param {object|null} [params.meta=null] - Objeto com pares chave-valor para tag meta
 * @param {object|null} [params.memories=null] - Array de objetos de memória para salvar
 * @param {object} [params.context=null] - Objeto de contexto para substituição de placeholders
 * @returns {string} Mensagem formatada com tags
 * @throws {Error} Se texto não for fornecido ou for inválido
 */
function buildTaggedMessage({ text, imagem = false, meta = null, memories = null, context = null }) {
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

    // Construir tags [save_memory] se fornecidas
    if (memories && Array.isArray(memories)) {
        for (const memory of memories) {
            if (memory && typeof memory === 'object') {
                const { guildId, userId, fact, importance, confidence } = memory;
                if (guildId && userId && fact) {
                    components.push(`[salvar_memoria]${guildId}:${userId}:${fact}:${importance}:${confidence}[/salvar_memoria]`);
                }
            }
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
    const hasImage = /\[imagem\]/.test(message);

    // Remover tag [imagem] do texto
    if (hasImage) {
        text = text.replace(/\[imagem\]/g, '');
    }

    // Extrair conteúdo da tag [meta]...[/meta]
    const metaMatch = message.match(/\[meta\](.*?)\[\/meta\]/s);
    let meta = null;
    if (metaMatch) {
        meta = metaMatch[1].trim();
        text = text.replace(/\[meta\].*?\[\/meta\]/gs, '');
    }

    // Processar tags [salvar_memoria]...[/salvar_memoria] (case-insensitive)
    const memories = [];
    const saveMemoryRegex = /\[salvar_memoria\](.*?)\[\/salvar_memoria\]/gi;
    let saveMemoryMatch;

    while ((saveMemoryMatch = saveMemoryRegex.exec(message)) !== null) {
        const content = saveMemoryMatch[1];
        const memory = parseMemoryTag(content, saveMemoryMatch.index + 15, context); // +15 to account for "[salvar_memoria]" length

        memories.push(memory);
    }

    // Remover tags [salvar_memoria] do texto (case-insensitive)
    text = text.replace(/\[salvar_memoria\].*?\[\/salvar_memoria\]/gi, '');

    // Limpar espaços extras do texto resultante
    const cleanedMessage = text.trim().replace(/\s+/g, ' ');

    // Retornar objeto com dados parseados
    return {
        cleanedMessage,
        hasImage,
        meta,
        memories
    };
}

module.exports = { parseTags, buildTaggedMessage };

// Exemplos de uso:
//
// const result = parseTags("Olá [imagem] como vai? [meta]Isso é meta[/meta] Olá novamente [salvar_memoria]123456789012345678:987654321098765432:Este usuário é amigável:8:0.95[/salvar_memoria]");
// console.log(result);
// // Output: { cleanedMessage: "Olá como vai? Olá novamente", hasImage: true, meta: "Isso é meta", memories: [{guildId: "123456789012345678", userId: "987654321098765432", fact: "Este usuário é amigável", importance: 8, confidence: 0.95, hasErrors: false}] }
//
// const constructed = buildTaggedMessage({
//   text: "Como você está?",
//   imagem: true,
//   meta: { user: "João", id: "123" },
//   memories: [{ guildId: "123456789012345678", userId: "987654321098765432", fact: "João é muito amigável", importance: 7, confidence: 0.9 }]
// });
// console.log(constructed);
// // Output: "[imagem] Como você está? [meta]user:João|id:123[/meta] [salvar_memoria]123456789012345678:987654321098765432:João é muito amigável:7:0.9[/salvar_memoria]"