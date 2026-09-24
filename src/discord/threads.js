/*
** caminho: src/discord/threads.js
** últimaMod: 2026-09-24 00:00
** autor: Vico
** colaboração: AI assistants
*/

async function getOpenThreadForMessage(message) {
    if (!message?.hasThread) return null;
    if (message.thread && !message.thread.archived) return message.thread;

    try {
        if (message.channel?.threads?.fetch) {
            const fetchedThread = await message.channel.threads.fetch(message.id);
            if (fetchedThread && !fetchedThread.archived) return fetchedThread;
        }
    } catch {
        // Fall through to the guild channel lookup.
    }

    try {
        if (message.guild?.channels?.fetch) {
            const fallbackThread = await message.guild.channels.fetch(message.id);
            if (fallbackThread?.isThread?.() && !fallbackThread.archived) return fallbackThread;
        }
    } catch {
        // Ignore unavailable or deleted threads.
    }

    return null;
}

module.exports = { getOpenThreadForMessage };
