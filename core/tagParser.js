/*
** caminho: core/tagParser.js
** últimaMod: 2025-09-03 14:55
** autor: Vico
** colaboração: modelo utilizados: Roo Sonic
*/

// Módulo de parser de tags especiais
// Responsável por analisar mensagens com tags específicas como [imagem], [meta]...[/meta] e [vica]...[/vica]

/*
** caminho: core/tagParser.js
** últimaMod: 2025-09-03 14:55
** autor: Vico
** colaboração: modelo utilizados: Roo Sonic
*/

// Módulo de parser de tags especiais
// Responsável por analisar mensagens com tags específicas como [imagem], [meta]...[/meta] e [vica]...[/vica]

/**
 * Função para construir uma mensagem com tags especiais a partir de dados estruturados.
 * Reconstrói o formato de mensagem original com base nos componentes fornecidos.
 * @param {object} params - Parâmetros da função
 * @param {string} params.text - Texto base da mensagem (obrigatório)
 * @param {boolean} [params.imagem=false] - Flag para adicionar tag [imagem]
 * @param {object|null} [params.meta=null] - Objeto com pares chave-valor para tag meta
 * @param {object|null} [params.vica=null] - Objeto com comando e parâmetros para tag vica
 * @returns {string} Mensagem formatada com tags
 * @throws {Error} Se texto não for fornecido ou for inválido
 */
function buildTaggedMessage({ text, imagem = false, meta = null, vica = null }) {
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

    // Construir tag [vica] se fornecida
    if (vica && typeof vica === 'object') {
        const { command, ...params } = vica;
        if (command) {
            const vicaParts = [command];
            for (const [key, value] of Object.entries(params)) {
                vicaParts.push(key, value);
            }
            components.push(`[vica]${vicaParts.join(':')}[/vica]`);
        }
    }

    // Unir componentes com espaços únicos
    return components.join(' ').replace(/\s+/g, ' ');
}

/**
 * Função para analisar mensagens com tags especiais.
 * Utiliza regex para detectar e extrair conteúdo das tags, removendo-as do texto principal.
 * @param {string} message - A mensagem original contendo as tags.
 * @returns {object} Objeto com text limpo, flags e conteúdos extraídos.
 */
function parseTags(message) {
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

    // Extrair conteúdo da tag [vica]...[/vica]
    const vicaMatch = message.match(/\[vica\](.*?)\[\/vica\]/s);
    let vica = null;
    if (vicaMatch) {
        vica = vicaMatch[1].trim();
        text = text.replace(/\[vica\].*?\[\/vica\]/gs, '');
    }

    // Limpar espaços extras do texto resultante
    text = text.trim().replace(/\s+/g, ' ');

    // Retornar objeto com dados parseados
    return {
        text,
        hasImage,
        meta,
        vica
    };
}

module.exports = { parseTags, buildTaggedMessage };

// Exemplos de uso:
//
// const result = parseTags("Olá [imagem] como vai? [meta]Isso é meta[/meta] Olá novamente [vica]Conteúdo especial[/vica]");
// console.log(result);
// // Output: { text: "Olá como vai? Olá novamente", hasImage: true, meta: "Isso é meta", vica: "Conteúdo especial" }
//
// const constructed = buildTaggedMessage({
//   text: "Como você está?",
//   imagem: true,
//   meta: { user: "João", id: "123" },
//   vica: { command: "reply", channel: "general", priority: "high" }
// });
// console.log(constructed);
// // Output: "[imagem] Como você está? [meta]user:João|id:123[/meta] [vica]reply:channel:general:priority:high[/vica]"