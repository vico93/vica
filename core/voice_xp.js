/*
** caminho: core/voice_xp.js
** últimaMod: 2026-02-24 20:05
** autor: Vico
** colaboração: OpenCode (GPT-5.3-Codex)
*/

/*
  Serviço de XP por voz.
  - Executa varredura periódica dos canais de voz/stage;
  - Concede XP por minuto para membros elegíveis;
  - Usa regras anti-farm (anti-AFK):
      * ignora bots;
      * ignora canal AFK do servidor;
      * ignora usuários com selfDeaf/serverDeaf;
      * exige pelo menos 2 humanos elegíveis no canal.
*/

const { ChannelType, PermissionsBitField } = require('discord.js');

const VOICE_XP_INTERVAL_MS = 60_000;
const VOICE_XP_PER_MINUTE = 6;

let intervalId = null;
let tickRunning = false;

// Mapa: guildId:userId -> timestamp desde quando está elegível continuamente
const eligibleSinceMap = new Map();

function buildKey(guildId, userId) {
    return `${guildId}:${userId}`;
}

function isMemberVoiceEligible(member, afkChannelId) {
    if (!member || !member.voice || !member.voice.channelId) return false;
    if (member.user?.bot) return false;
    if (afkChannelId && member.voice.channelId === afkChannelId) return false;
    if (member.voice.selfDeaf || member.voice.deaf) return false;
    return true;
}

function getEligibleMembersInGuild(guild, database) {
    const eligibleMembers = new Map(); // userId -> GuildMember

    for (const channel of guild.channels.cache.values()) {
        if (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice) {
            continue;
        }

        if (database.xpCanalNaBlacklist(guild.id, channel.id)) {
            continue;
        }

        if (guild.afkChannelId && channel.id === guild.afkChannelId) {
            continue;
        }

        const channelEligibleMembers = [];
        for (const member of channel.members.values()) {
            if (isMemberVoiceEligible(member, guild.afkChannelId)) {
                channelEligibleMembers.push(member);
            }
        }

        if (channelEligibleMembers.length < 2) {
            continue;
        }

        for (const member of channelEligibleMembers) {
            eligibleMembers.set(member.id, member);
        }
    }

    return eligibleMembers;
}

function calculateVoiceXp(database, guildId, member, minutesElapsed) {
    const baseXp = VOICE_XP_PER_MINUTE * minutesElapsed;
    const roleIds = Array.from(member.roles.cache.keys());
    const multipliers = database.buscarMultiplicadoresParaUsuario(guildId, roleIds);
    const finalMultiplier = multipliers.length ? Math.max(...multipliers) : 1;

    return Math.ceil(baseXp * finalMultiplier);
}

async function sendVoiceLevelUpMessage(database, guild, userId, novoNivel) {
    const systemChannelId = database.getSystemChannel(guild.id);
    if (!systemChannelId) {
        return;
    }

    const systemChannel = guild.channels.cache.get(systemChannelId);
    if (!systemChannel || !systemChannel.isTextBased()) {
        console.warn(`[VOICE_XP][WARN] Canal de sistema inválido (${systemChannelId}) no servidor ${guild.id}.`);
        return;
    }

    const me = guild.members.me;
    if (me && !systemChannel.permissionsFor(me)?.has(PermissionsBitField.Flags.SendMessages)) {
        console.warn(`[VOICE_XP][WARN] Sem permissão para enviar mensagem no canal ${systemChannel.id} (guild ${guild.id}).`);
        return;
    }

    try {
        await systemChannel.send(`🎙️ Parabéns, <@${userId}>! Você avançou para o nível **${novoNivel}**!`);
    } catch (error) {
        console.error(`[VOICE_XP][ERROR] Falha ao enviar level up no canal ${systemChannel.id}:`, error);
    }
}

async function processVoiceXpTick(client, database) {
    const now = Date.now();
    const currentlyEligible = new Map(); // key -> { guild, member }

    for (const guild of client.guilds.cache.values()) {
        try {
            const guildEligibleMembers = getEligibleMembersInGuild(guild, database);
            for (const member of guildEligibleMembers.values()) {
                const key = buildKey(guild.id, member.id);
                currentlyEligible.set(key, { guild, member });
            }
        } catch (error) {
            console.error(`[VOICE_XP][ERROR] Falha ao processar guild ${guild.id}:`, error);
        }
    }

    // Remove usuários que deixaram de ser elegíveis
    for (const key of Array.from(eligibleSinceMap.keys())) {
        if (!currentlyEligible.has(key)) {
            eligibleSinceMap.delete(key);
        }
    }

    // Processa usuários elegíveis
    for (const [key, info] of currentlyEligible.entries()) {
        const previousEligibleTimestamp = eligibleSinceMap.get(key);

        if (!previousEligibleTimestamp) {
            eligibleSinceMap.set(key, now);
            continue;
        }

        const elapsed = now - previousEligibleTimestamp;
        if (elapsed < VOICE_XP_INTERVAL_MS) {
            continue;
        }

        const elapsedMinutes = Math.floor(elapsed / VOICE_XP_INTERVAL_MS);
        const guildId = info.guild.id;
        const userId = info.member.id;
        const xpGain = calculateVoiceXp(database, guildId, info.member, elapsedMinutes);

        const { levelUp, novoNivel } = database.atualizarUsuarioXPVoz(guildId, userId, xpGain);
        eligibleSinceMap.set(key, previousEligibleTimestamp + elapsedMinutes * VOICE_XP_INTERVAL_MS);

        if (levelUp) {
            await sendVoiceLevelUpMessage(database, info.guild, userId, novoNivel);
        }
    }
}

async function runTick(client, database) {
    if (tickRunning) {
        return;
    }

    tickRunning = true;
    try {
        await processVoiceXpTick(client, database);
    } catch (error) {
        console.error('[VOICE_XP][ERROR] Falha no loop de XP por voz:', error);
    } finally {
        tickRunning = false;
    }
}

function startVoiceXpService(client, database) {
    if (intervalId) {
        return;
    }

    eligibleSinceMap.clear();

    // Primeira execução apenas para marcar elegibilidade inicial
    runTick(client, database);

    intervalId = setInterval(() => {
        runTick(client, database);
    }, VOICE_XP_INTERVAL_MS);

    console.log(`[VOICE_XP][INFO] Serviço iniciado (${VOICE_XP_PER_MINUTE} XP/min, intervalo ${VOICE_XP_INTERVAL_MS / 1000}s).`);
}

function stopVoiceXpService() {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }

    eligibleSinceMap.clear();
    tickRunning = false;

    console.log('[VOICE_XP][INFO] Serviço de XP por voz parado.');
}

module.exports = {
    startVoiceXpService,
    stopVoiceXpService
};
