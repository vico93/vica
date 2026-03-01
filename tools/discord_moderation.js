/*
** caminho: tools/discord_moderation.js
** últimaMod: 2026-03-01 11:12
** autor: Vico
** colaboração: OpenCode (GPT-5.3-Codex)
*/

const { PermissionsBitField } = require('discord.js');
const moderation = require('../core/moderation');

function buildError(error) {
    return {
        success: false,
        error
    };
}

function normalizeId(value) {
    if (typeof value !== 'string') {
        return '';
    }

    return value.trim();
}

async function resolveGuildFromContext(context) {
    const guildId = normalizeId(context?.guildId);
    const client = context?.client;

    if (!guildId || !client) {
        return null;
    }

    const cachedGuild = client.guilds.cache.get(guildId);
    if (cachedGuild) {
        return cachedGuild;
    }

    try {
        return await client.guilds.fetch(guildId);
    } catch (_) {
        return null;
    }
}

async function resolveExecutorMember(guild, context) {
    const executorId = normalizeId(context?.userId);
    if (!executorId) {
        return null;
    }

    return moderation.fetchGuildMember(guild, executorId);
}

function ensureBanPermission(executorMember) {
    return moderation.hasPermission(executorMember, PermissionsBitField.Flags.BanMembers);
}

async function resolveTargetMember(guild, targetUserId) {
    const normalizedUserId = normalizeId(targetUserId);
    if (!normalizedUserId) {
        return null;
    }

    return moderation.fetchGuildMember(guild, normalizedUserId);
}

async function execute(args, context) {
    const action = typeof args?.action === 'string'
        ? args.action.trim().toLowerCase()
        : '';

    if (!action) {
        return buildError('Parâmetro "action" é obrigatório.');
    }

    const guild = await resolveGuildFromContext(context);
    if (!guild) {
        return buildError('Contexto inválido: guild/client não disponível para moderação.');
    }

    const executorMember = await resolveExecutorMember(guild, context);
    if (!executorMember) {
        return buildError('Contexto inválido: não foi possível identificar o autor da ação.');
    }

    if (!ensureBanPermission(executorMember)) {
        return buildError('Você precisa da permissão BanMembers para usar a ferramenta de moderação.');
    }

    if (action === 'warn') {
        const targetMember = await resolveTargetMember(guild, args?.target_user_id);
        if (!targetMember) {
            return buildError('target_user_id inválido ou usuário não encontrado no servidor.');
        }

        const result = await moderation.issueWarn({
            guild,
            executorMember,
            targetMember,
            reason: args?.reason
        });

        return result;
    }

    if (action === 'clear_warn') {
        const targetUserId = normalizeId(args?.target_user_id);
        if (!targetUserId) {
            return buildError('target_user_id é obrigatório para clear_warn.');
        }

        return moderation.clearWarnCount(guild.id, targetUserId);
    }

    if (action === 'timeout' || action === 'kick' || action === 'ban') {
        const targetMember = await resolveTargetMember(guild, args?.target_user_id);
        if (!targetMember) {
            return buildError('target_user_id inválido ou usuário não encontrado no servidor.');
        }

        return moderation.executeAction({
            guild,
            executorMember,
            targetMember,
            action,
            reason: args?.reason,
            durationMinutes: args?.duration_minutes
        });
    }

    if (action === 'warn_config_show') {
        return {
            success: true,
            config: moderation.getWarnConfig(guild.id)
        };
    }

    if (action === 'warn_config_set') {
        const hasWarnLimit = Number.isInteger(args?.warn_limit);
        const hasWarnAction = typeof args?.warn_action === 'string';
        const hasTimeout = Number.isInteger(args?.timeout_minutes);

        if (!hasWarnLimit && !hasWarnAction && !hasTimeout) {
            return buildError('Forneça ao menos um dos parâmetros: warn_limit, warn_action, timeout_minutes.');
        }

        if (hasWarnLimit) {
            moderation.setWarnLimit(guild.id, args.warn_limit);
        }

        if (hasWarnAction) {
            moderation.setWarnAction(guild.id, args.warn_action);
        }

        if (hasTimeout) {
            moderation.setWarnTimeoutMinutes(guild.id, args.timeout_minutes);
        }

        return {
            success: true,
            config: moderation.getWarnConfig(guild.id)
        };
    }

    if (action === 'protected_list') {
        return {
            success: true,
            protected: moderation.listProtectedEntries(guild.id)
        };
    }

    if (
        action === 'protected_add_user' ||
        action === 'protected_remove_user' ||
        action === 'protected_add_role' ||
        action === 'protected_remove_role'
    ) {
        return buildError('Ações de alteração da lista de proteção não estão expostas para a IA. Use o comando /mod_protect.');
    }

    return buildError(`Ação '${action}' não suportada pela ferramenta de moderação.`);
}

module.exports = {
    execute
};
