/*
** caminho: src/discord/replies.js
** últimaMod: 2026-09-24 00:00
** autor: Vico
** colaboração: AI assistants
*/

const { splitText } = require('./text');

async function sendChunkedReply({ response, sourceMessage, responseChannel }) {
    const chunks = splitText(response);
    if (chunks.length === 0) {
        const fallback = 'Bah, dei uma travada e não consegui montar a resposta 😵‍💫. Tenta de novo em seguida.';
        if (responseChannel.id === sourceMessage.channel.id) {
            await sourceMessage.reply({ content: fallback, failIfNotExists: false });
        } else {
            await responseChannel.send(fallback);
        }
        return false;
    }

    if (chunks.length > 1) {
        console.log(`[VICA][REPLY][INFO] Response length > 2000, splitting into ${chunks.length} chunks`);
    }

    if (responseChannel.id === sourceMessage.channel.id) {
        await sourceMessage.reply({ content: chunks[0], failIfNotExists: false });
    } else {
        await responseChannel.send(chunks[0]);
    }

    for (let i = 1; i < chunks.length; i++) {
        await responseChannel.send(chunks[i]);
    }

    return true;
}

module.exports = { sendChunkedReply };
