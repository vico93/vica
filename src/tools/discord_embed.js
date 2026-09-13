/*
** caminho: tools/discord_embed.js
** últimaMod: 2026-05-04
** autor: Vico
** colaboração: OpenCode (GPT-5.3-Codex)
*/

/**
 * Extracts embed data from a Discord message.
 * Useful as a fallback when fetch fails to retrieve content from a URL,
 * since Discord may have already generated an embed with metadata.
 */

function isValidDiscordId(id) {
    return typeof id === 'string' && /^\d{17,19}$/.test(id);
}

function normalizeString(value) {
    if (typeof value !== 'string') {
        return '';
    }
    return value.trim();
}

function clampInteger(value, fallback, min, max) {
    if (!Number.isInteger(value)) {
        return fallback;
    }
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

function formatColor(color) {
    if (typeof color !== 'number') return null;
    return '#' + color.toString(16).padStart(6, '0').toUpperCase();
}

function formatTimestamp(timestamp) {
    if (!timestamp) return null;
    try {
        return new Date(timestamp).toISOString();
    } catch {
        return null;
    }
}

function extractEmbedData(embed) {
    return {
        title: embed.title || null,
        description: embed.description || null,
        url: embed.url || null,
        image_url: embed.image?.url || null,
        thumbnail_url: embed.thumbnail?.url || null,
        provider_name: embed.provider?.name || null,
        provider_url: embed.provider?.url || null,
        author_name: embed.author?.name || null,
        author_url: embed.author?.url || null,
        footer_text: embed.footer?.text || null,
        footer_icon_url: embed.footer?.iconURL || null,
        timestamp: formatTimestamp(embed.timestamp),
        color: formatColor(embed.color),
        fields: Array.isArray(embed.fields)
            ? embed.fields.map(f => ({
                name: f.name || '',
                value: f.value || '',
                inline: !!f.inline
            }))
            : []
    };
}

async function execute(args, context) {
    const messageId = normalizeString(args?.message_id);
    const limit = clampInteger(args?.limit, 10, 1, 10);

    // Resolve message ID: use provided, or fall back to source message from context
    let targetMessageId = messageId;
    if (!targetMessageId && context?.sourceMessageId) {
        targetMessageId = normalizeString(context.sourceMessageId);
    }

    // Resolve channel: from context
    const channel = context?.channel;
    if (!channel?.messages?.fetch) {
        return {
            success: false,
            error: 'Canal não disponível no contexto.'
        };
    }

    // Fetch the message
    let targetMessage;
    try {
        targetMessage = await channel.messages.fetch(targetMessageId);
    } catch (error) {
        console.error(`[TOOLS][DISCORD_EMBED][ERROR] Falha ao buscar mensagem ${targetMessageId}:`, error.message);
        return {
            success: false,
            error: `Mensagem não encontrada ou sem permissão de acesso. (ID: ${targetMessageId})`
        };
    }

    // Check for embeds
    const embeds = targetMessage.embeds || [];
    if (embeds.length === 0) {
        return {
            success: true,
            embed_count: 0,
            embeds: [],
            message_url: targetMessage.url,
            note: 'A mensagem não contém embeds.'
        };
    }

    // Extract embed data (respecting limit)
    const limitedEmbeds = embeds.slice(0, limit);
    const extractedEmbeds = limitedEmbeds.map(extractEmbedData);

    return {
        success: true,
        embed_count: embeds.length,
        returned_count: extractedEmbeds.length,
        embeds: extractedEmbeds,
        message_url: targetMessage.url,
        message_id: targetMessage.id,
        channel_id: targetMessage.channel.id,
        guild_id: targetMessage.guild?.id || null
    };
}

module.exports = {
    execute
};
