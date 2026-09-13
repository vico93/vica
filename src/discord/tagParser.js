/*
** caminho: src/discord/tagParser.js
** últimaMod: 2026-04-19 21:50
** autor: Vico
** colaboração: Gemini, ChatGPT, Grok Code Fast, Kimi

// Módulo de parser de tags especiais
// Responsável por analisar mensagens com tags específicas como [imagem], [imagem_gerada], [meta]...[/meta] e [memory]...[/memory] (case-insensitive)

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

    // Remove tags [imagem]/[imagem_gerada] (defensivo: prompts antigos e ecos do modelo)
    text = text.replace(/\[(imagem|imagem_gerada)\]/gi, '');

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

    // Remover linha com tags de instrução vazadas (ex: erro onde o modelo repete o "[trigger] prompt" inteiro)
    const instructionTagsRegex = /^\s*\[(?:trigger|pergunta|welcome|leave|kick|ban|up_role)\].*?(?:\r?\n|$)/gim;
    if (instructionTagsRegex.test(text)) {
        text = text.replace(instructionTagsRegex, '');
    }

    // Remover qualquer menção solta às tags (se não estivessem no início da linha)
    const looseTagsRegex = /\[(?:trigger|pergunta|welcome|leave|kick|ban|up_role)\]/gi;
    if (looseTagsRegex.test(text)) {
        text = text.replace(looseTagsRegex, '');
    }

    // Limpar espaços extras do texto resultante
    const cleanedMessage = text.trim().replace(/[ \t]+/g, ' ');

    // Retornar objeto com dados parseados
    return {
        cleanedMessage,
        meta
    };
}

module.exports = { parseTags };

// Exemplos de uso:
//
// const result = parseTags("Olá [imagem] como vai? [meta]Isso é meta[/meta] [memory]Checking memory...[/memory]");
// console.log(result);
// // Output: { cleanedMessage: "Olá como vai?", meta: "Isso é meta" }
