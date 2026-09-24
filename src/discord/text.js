/*
** caminho: src/discord/text.js
** últimaMod: 2026-09-24 00:00
** autor: Vico
** colaboração: AI assistants
*/

function splitText(text, maxLength = 2000) {
    if (typeof text !== 'string') return [];

    const normalizedText = text.trim();
    if (!normalizedText) return [];
    if (normalizedText.length <= maxLength) return [normalizedText];

    const chunks = [];
    let start = 0;
    while (start < normalizedText.length) {
        const end = Math.min(start + maxLength, normalizedText.length);
        if (end === normalizedText.length) {
            chunks.push(normalizedText.slice(start));
            break;
        }

        const lastSpace = normalizedText.lastIndexOf(' ', end);
        if (lastSpace > start) {
            chunks.push(normalizedText.slice(start, lastSpace));
            start = lastSpace + 1;
        } else {
            chunks.push(normalizedText.slice(start, end));
            start = end;
        }
    }

    return chunks;
}

module.exports = { splitText };
