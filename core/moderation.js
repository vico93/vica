/*
** caminho: core/moderation.js
** últimaMod: 2026-03-01 10:55
** autor: Vico
** colaboração: OpenCode (GPT-5.3-Codex)
*/

const { PermissionsBitField } = require('discord.js');
const database = require('./database');

const VALID_ACTIONS = new Set(['timeout', 'kick', 'ban']);
const DEFAULT_WARN_CONFIG = Object.freeze({
    warnLimit: 3,
    action: 'timeout',
    timeoutMinutes: 30
});

const MAX_REASON_LENGTH = 512;
const MAX_TIMEOUT_MINUTES = 40_320; // 28 days

function sanitizeReason(reason, fallback = 'Sem motivo informado.') {
    if (typeof reason !== 'string') {
        return fallback;
    }

    const trimmed = reason.trim();
    if (!trimmed) {
        return fallback;
    }

    if (trimmed.length <= MAX_REASON_LENGTH) {
        return trimmed;
    }

    return trimmed.slice(0, MAX_REASON_LENGTH);
}

function sanitizeDisplayReason(reason) {
    const normalized = sanitizeReason(reason);
    if (normalized.length <= 300) {
        return normalized;
    }

    return `${normalized.slice(0, 300)}...`;
}

function normalizeWarnAction(action) {
    const normalized = typeof action === 'string'
        ? action.trim().toLowerCase()
        : '';

    return VALID_ACTIONS.has(normalized) ? normalized : DEFAULT_WARN_CONFIG.action;
}

function normalizeWarnLimit(limit) {
    if (!Number.isInteger(limit)) {
        return DEFAULT_WARN_CONFIG.warnLimit;
    }

    if (limit < 1) {
        return 1;
    }

    if (limit > 20) {
        return 20;
    }

    return limit;
}

function normalizeTimeoutMinutes(minutes) {
    if (!Number.isInteger(minutes)) {
        return DEFAULT_WARN_CONFIG.timeoutMinutes;
    }

    if (minutes < 1) {
        return 1;
    }

    if (minutes > MAX_TIMEOUT_MINUTES) {
        return MAX_TIMEOUT_MINUTES;
    }

    return minutes;
}

function getRequiredPermissionForAction(action) {
    if (action === 'timeout') {
        return PermissionsBitField.Flags.ModerateMembers;
    }

    if (action === 'kick') {
        return PermissionsBitField.Flags.KickMembers;
    }

    if (action === 'ban') {
        return PermissionsBitField.Flags.BanMembers;
    }

    return null;
}

function hasPermission(member, permissionFlag) {
    if (!member || !permissionFlag) {
        return false;
    }

    try {
        return member.permissions?.has(permissionFlag) === true;
    } catch (_) {
        return false;
    }
}

function canActOnTarget(executorMember, targetMember, guild) {
    if (!executorMember || !targetMember || !guild) {
        return false;
    }

    if (executorMember.id === guild.ownerId) {
        return true;
    }

    const executorHighest = executorMember.roles?.highest;
    const targetHighest = targetMember.roles?.highest;

    if (!executorHighest || !targetHighest) {
        return false;
    }

    return executorHighest.comparePositionTo(targetHighest) > 0;
}

async function fetchGuildMember(guild, userId) {
    if (!guild || !userId) {
        return null;
    }

    const cached = guild.members.cache.get(userId);
    if (cached) {
        return cached;
    }

    try {
        return await guild.members.fetch(userId);
    } catch (_) {
        return null;
    }
}

async function getBotGuildMember(guild) {
    if (!guild) {
        return null;
    }

    if (guild.members.me) {
        return guild.members.me;
    }

    try {
        return await guild.members.fetchMe();
    } catch (_) {
        return null;
    }
}

function getWarnConfig(guildId) {
    const rawConfig = database.getWarnConfig(guildId) || DEFAULT_WARN_CONFIG;

    return {
        warnLimit: normalizeWarnLimit(rawConfig.warnLimit),
        action: normalizeWarnAction(rawConfig.action),
        timeoutMinutes: normalizeTimeoutMinutes(rawConfig.timeoutMinutes)
    };
}

function setWarnLimit(guildId, warnLimit) {
    const normalized = normalizeWarnLimit(warnLimit);
    database.setWarnLimit(guildId, normalized);
    return getWarnConfig(guildId);
}

function setWarnAction(guildId, action) {
    const normalized = normalizeWarnAction(action);
    database.setWarnAction(guildId, normalized);
    return getWarnConfig(guildId);
}

function setWarnTimeoutMinutes(guildId, timeoutMinutes) {
    const normalized = normalizeTimeoutMinutes(timeoutMinutes);
    database.setWarnTimeoutMinutes(guildId, normalized);
    return getWarnConfig(guildId);
}

function clearWarnCount(guildId, userId) {
    const previousCount = database.getWarnCount(guildId, userId);
    database.clearWarnCount(guildId, userId);
    return {
        success: true,
        previousCount,
        currentCount: 0
    };
}

function listProtectedEntries(guildId) {
    return {
        users: database.listProtectedUsers(guildId),
        roles: database.listProtectedRoles(guildId)
    };
}

function addProtectedUser(guildId, userId) {
    return database.addProtectedUser(guildId, userId);
}

function removeProtectedUser(guildId, userId) {
    return database.removeProtectedUser(guildId, userId);
}

function addProtectedRole(guildId, roleId) {
    return database.addProtectedRole(guildId, roleId);
}

function removeProtectedRole(guildId, roleId) {
    return database.removeProtectedRole(guildId, roleId);
}

function getProtectionBlockReason(guild, targetMember) {
    if (!guild || !targetMember) {
        return null;
    }

    const botId = guild.members.me?.id || guild.client?.user?.id || null;

    if (targetMember.id === guild.ownerId) {
        return 'O dono do servidor está protegido contra moderação automática.';
    }

    if (botId && targetMember.id === botId) {
        return 'Eu não posso aplicar punições em mim mesma.';
    }

    if (database.isProtectedUser(guild.id, targetMember.id)) {
        return 'Este usuário está na lista de proteção da moderação.';
    }

    const protectedRoles = database.listProtectedRoles(guild.id);
    for (const roleId of protectedRoles) {
        if (targetMember.roles?.cache?.has(roleId)) {
            return 'Este usuário possui um cargo protegido na moderação.';
        }
    }

    return null;
}

async function resolveSystemChannelForWarn(guild) {
    const systemChannelId = database.getSystemChannel(guild.id);
    if (!systemChannelId) {
        return {
            success: false,
            error: 'Nenhum canal de sistema está configurado. Use /system_channel add primeiro.'
        };
    }

    let systemChannel = guild.channels.cache.get(systemChannelId);
    if (!systemChannel) {
        try {
            systemChannel = await guild.channels.fetch(systemChannelId);
        } catch (_) {
            systemChannel = null;
        }
    }

    if (!systemChannel || !systemChannel.isTextBased()) {
        return {
            success: false,
            error: 'O canal de sistema configurado é inválido ou não é um canal de texto.'
        };
    }

    const botMember = await getBotGuildMember(guild);
    if (!botMember) {
        return {
            success: false,
            error: 'Não consegui validar minhas permissões no servidor.'
        };
    }

    const permissions = systemChannel.permissionsFor(botMember);
    if (!permissions?.has([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages])) {
        return {
            success: false,
            error: 'Não tenho permissão para enviar mensagens no canal de sistema configurado.'
        };
    }

    return {
        success: true,
        channel: systemChannel
    };
}

function validateExecutorForWarn(guild, executorMember, targetMember) {
    if (!guild || !executorMember || !targetMember) {
        return {
            success: false,
            error: 'Dados insuficientes para aplicar warn.'
        };
    }

    if (!hasPermission(executorMember, PermissionsBitField.Flags.BanMembers)) {
        return {
            success: false,
            error: 'Você precisa da permissão de banir membros para aplicar warns.'
        };
    }

    if (executorMember.id === targetMember.id) {
        return {
            success: false,
            error: 'Você não pode aplicar warn em si mesmo.'
        };
    }

    if (!canActOnTarget(executorMember, targetMember, guild)) {
        return {
            success: false,
            error: 'Você não pode moderar este usuário por hierarquia de cargos.'
        };
    }

    const protectionReason = getProtectionBlockReason(guild, targetMember);
    if (protectionReason) {
        return {
            success: false,
            error: protectionReason
        };
    }

    return { success: true };
}

function validateExecutorForAction(guild, executorMember, targetMember, action) {
    if (!guild || !executorMember || !targetMember) {
        return {
            success: false,
            error: 'Dados insuficientes para aplicar a punição.'
        };
    }

    const requiredPermission = getRequiredPermissionForAction(action);
    if (!requiredPermission || !hasPermission(executorMember, requiredPermission)) {
        return {
            success: false,
            error: 'Você não tem permissão para executar esta ação de moderação.'
        };
    }

    if (executorMember.id === targetMember.id) {
        return {
            success: false,
            error: 'Você não pode aplicar punições em si mesmo.'
        };
    }

    if (!canActOnTarget(executorMember, targetMember, guild)) {
        return {
            success: false,
            error: 'Você não pode moderar este usuário por hierarquia de cargos.'
        };
    }

    const protectionReason = getProtectionBlockReason(guild, targetMember);
    if (protectionReason) {
        return {
            success: false,
            error: protectionReason
        };
    }

    return { success: true };
}

async function executeAction({ guild, executorMember, targetMember, action, reason, durationMinutes }) {
    const normalizedAction = normalizeWarnAction(action);
    const validation = validateExecutorForAction(guild, executorMember, targetMember, normalizedAction);
    if (!validation.success) {
        return validation;
    }

    const botMember = await getBotGuildMember(guild);
    if (!botMember) {
        return {
            success: false,
            error: 'Não consegui validar minhas permissões para a ação de moderação.'
        };
    }

    const botRequiredPermission = getRequiredPermissionForAction(normalizedAction);
    if (!hasPermission(botMember, botRequiredPermission)) {
        return {
            success: false,
            error: 'Não tenho permissão suficiente para executar essa ação no Discord.'
        };
    }

    const normalizedReason = sanitizeReason(reason);

    try {
        if (normalizedAction === 'timeout') {
            const timeoutMinutes = normalizeTimeoutMinutes(durationMinutes);

            if (!targetMember.moderatable) {
                return {
                    success: false,
                    error: 'Não foi possível aplicar timeout neste usuário (hierarquia ou permissões do bot).'
                };
            }

            await targetMember.timeout(timeoutMinutes * 60 * 1000, normalizedReason);
            return {
                success: true,
                action: 'timeout',
                durationMinutes: timeoutMinutes
            };
        }

        if (normalizedAction === 'kick') {
            if (!targetMember.kickable) {
                return {
                    success: false,
                    error: 'Não foi possível expulsar este usuário (hierarquia ou permissões do bot).'
                };
            }

            await targetMember.kick(normalizedReason);
            return {
                success: true,
                action: 'kick'
            };
        }

        if (!targetMember.bannable) {
            return {
                success: false,
                error: 'Não foi possível banir este usuário (hierarquia ou permissões do bot).'
            };
        }

        await targetMember.ban({ reason: normalizedReason });
        return {
            success: true,
            action: 'ban'
        };
    } catch (error) {
        return {
            success: false,
            error: `Falha ao aplicar ${normalizedAction}: ${error.message}`
        };
    }
}

async function issueWarn({ guild, executorMember, targetMember, reason }) {
    const validation = validateExecutorForWarn(guild, executorMember, targetMember);
    if (!validation.success) {
        return validation;
    }

    const channelResolution = await resolveSystemChannelForWarn(guild);
    if (!channelResolution.success) {
        return channelResolution;
    }

    const config = getWarnConfig(guild.id);
    const currentWarnCount = database.getWarnCount(guild.id, targetMember.id);
    const nextWarnCount = currentWarnCount + 1;
    const normalizedReason = sanitizeReason(reason);
    const displayReason = sanitizeDisplayReason(reason);

    try {
        await channelResolution.channel.send(
            `⚠️ <@${targetMember.id}> recebeu um aviso.\n` +
            `**Motivo:** ${displayReason}\n` +
            `**Avisos:** ${nextWarnCount}/${config.warnLimit}`
        );
    } catch (error) {
        return {
            success: false,
            error: `Não consegui enviar o aviso no canal de sistema: ${error.message}`
        };
    }

    database.setWarnCount(guild.id, targetMember.id, nextWarnCount);

    const thresholdReached = nextWarnCount === config.warnLimit;
    let autoActionResult = null;

    if (thresholdReached) {
        const autoReason = `Limite de ${config.warnLimit} warns atingido. Ultimo motivo: ${normalizedReason}`;
        autoActionResult = await executeAction({
            guild,
            executorMember,
            targetMember,
            action: config.action,
            reason: autoReason,
            durationMinutes: config.timeoutMinutes
        });

        const autoActionText = autoActionResult.success
            ? `✅ Ação automática aplicada em <@${targetMember.id}>: **${config.action}**.`
            : `⚠️ Limite de warns atingido para <@${targetMember.id}>, mas a ação automática falhou: ${autoActionResult.error}`;

        try {
            await channelResolution.channel.send(autoActionText);
        } catch (_) {
            // Ignore post-action notification failures
        }
    }

    return {
        success: true,
        warnCount: nextWarnCount,
        warnLimit: config.warnLimit,
        actionOnLimit: config.action,
        thresholdReached,
        autoActionResult
    };
}

module.exports = {
    VALID_ACTIONS,
    MAX_TIMEOUT_MINUTES,
    fetchGuildMember,
    hasPermission,
    getWarnConfig,
    setWarnLimit,
    setWarnAction,
    setWarnTimeoutMinutes,
    clearWarnCount,
    issueWarn,
    executeAction,
    listProtectedEntries,
    addProtectedUser,
    removeProtectedUser,
    addProtectedRole,
    removeProtectedRole,
    getProtectionBlockReason
};
