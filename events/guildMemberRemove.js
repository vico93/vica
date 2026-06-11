/*
** caminho: events/guildMemberRemove.js
** últimaMod: 2025-09-23 09:15
** autor: Vico
** colaboração: Gemini, ChatGPT, Kimi AI e Roo Sonic (xai/grok-code-fast-1)
*/

const database = require('../core/database');
const oai_interface = require('../core/oai_interface');
const auditCache = require('../core/auditCache');
const { processAliases } = require('../core/aliasProcessor');
const { PermissionsBitField } = require('discord.js');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member, client) {
    console.log('[GUILDMEMBERREMOVE][DEBUG] Event triggered for user:', member.user.tag, 'ID:', member.id, 'in guild:', member.guild.name);

    // Ignora eventos de servidores onde o bot pode não estar totalmente pronto
    if (!member.guild) return;

    // Ignora se o membro removido for o próprio bot (audit logs irrelevantes)
    if (member.id === client.user.id) return;

    // Ignora bots
    if (member.user.bot) return;

    // Cache deduplication logic
    const key = `leave:${member.guild.id}:${member.id}`;
    if (auditCache.has(key)) return;
    auditCache.set(key, Date.now());

    try {
      const changes = database.removerUsuarioXP(member.guild.id, member.id);
      if (changes > 0) {
        console.log(`[RANK] Membro ${member.user.tag} (ID: ${member.id}) removido do ranking do servidor ${member.guild.name}.`);
      }
    } catch (err) {
      console.error(`[ERRO-DB] Falha ao tentar remover o membro ${member.id} do ranking:`, err);
    }

    // Handle leave/kick/ban messages
    try {
      // Use system channel
      const systemChannelId = database.getSystemChannel(member.guild.id);
      console.log('[GUILDMEMBERREMOVE][DEBUG] Retrieved system channel ID:', systemChannelId, 'for guild:', member.guild.id);
      if (!systemChannelId) {
        console.warn(`[GUILDMEMBERREMOVE][WARN] No system channel configured for guild ${member.guild.name}`);
        return;
      }

      const channel = member.guild.channels.cache.get(systemChannelId);
      console.log('[GUILDMEMBERREMOVE][DEBUG] Retrieved channel object:', channel ? channel.name : 'null');
      if (!channel) {
        console.warn(`[GUILDMEMBERREMOVE][WARN] System channel ${systemChannelId} not found in guild ${member.guild.name}`);
        return;
      }

      // Check send permissions
      const hasSendPerm = channel.permissionsFor(client.user).has('SendMessages');
      console.log('[GUILDMEMBERREMOVE][DEBUG] Bot has SendMessages permission in channel:', hasSendPerm);
      if (!hasSendPerm) {
        console.warn(`[GUILDMEMBERREMOVE][WARN] Bot lacks SendMessages permission in system channel ${channel.name}`);
        return;
      }

      // Verifica se o bot possui permissão para ver logs de auditoria
      const hasAuditPermission = member.guild.members.me.permissions.has(PermissionsBitField.Flags.ViewAuditLog);
      console.log('[GUILDMEMBERREMOVE][DEBUG] Bot has ViewAuditLog permission:', hasAuditPermission);
      if (!hasAuditPermission) {
        console.warn('[GUILDMEMBERREMOVE][WARN] Bot não possui permissão VIEW_AUDIT_LOG, pulando detecção de kick/ban');
      }

      // Check if this was a kick or ban by looking at audit logs
      let kickLog = null;
      if (hasAuditPermission) {
        try {
          console.log('[GUILDMEMBERREMOVE][DEBUG] Fetching kick audit logs...');
          const fetchedLogs = await member.guild.fetchAuditLogs({
            limit: 1,
            type: 20, // MEMBER_KICK
          });
          kickLog = fetchedLogs.entries.first();
          console.log('[GUILDMEMBERREMOVE][DEBUG] Kick log found:', kickLog ? 'yes' : 'no', kickLog ? `target: ${kickLog.target.id}` : '');
        } catch (err) {
          console.log('[GUILDMEMBERREMOVE][DEBUG] Error fetching kick logs:', err.message);
          if (err.code === 10004) {
            console.error('[GUILDMEMBERREMOVE][ERROR] Erro ao buscar logs de kick - Guild desconhecida:', err);
          } else {
            throw err;
          }
        }
      }
      const wasKicked = kickLog && kickLog.target.id === member.id;
      console.log('[GUILDMEMBERREMOVE][DEBUG] Was kicked:', wasKicked);

      // Check for ban
      let banLog = null;
      if (hasAuditPermission) {
        try {
          console.log('[GUILDMEMBERREMOVE][DEBUG] Fetching ban audit logs...');
          const banLogs = await member.guild.fetchAuditLogs({
            limit: 1,
            type: 22, // MEMBER_BAN_ADD
          });
          banLog = banLogs.entries.first();
          console.log('[GUILDMEMBERREMOVE][DEBUG] Ban log found:', banLog ? 'yes' : 'no', banLog ? `target: ${banLog.target.id}` : '');
        } catch (err) {
          console.log('[GUILDMEMBERREMOVE][DEBUG] Error fetching ban logs:', err.message);
          if (err.code === 10004) {
            console.error('[GUILDMEMBERREMOVE][ERROR] Erro ao buscar logs de ban - Guild desconhecida:', err);
          } else {
            throw err;
          }
        }
      }
      const wasBanned = banLog && banLog.target.id === member.id;
      console.log('[GUILDMEMBERREMOVE][DEBUG] Was banned:', wasBanned);

      let messageConfig = null;
      let messageType = 'leave';
      let kickReason = null;
      let banReason = null;

      // Check for ban message first (highest priority)
      if (wasBanned) {
        banReason = banLog.reason || 'No reason provided';
        messageConfig = database.getMessageByType(member.guild.id, 'leave_ban');
        if (messageConfig) {
          messageType = 'ban';
        }
      }
      // Check for kick message if not banned but was kicked
      else if (wasKicked) {
        kickReason = kickLog.reason || 'No reason provided';
        messageConfig = database.getMessageByType(member.guild.id, 'leave_kick');
        if (messageConfig) {
          messageType = 'kick';
        }
      }
      // Check for leave message if neither kicked nor banned
      else {
        messageConfig = database.getMessageByType(member.guild.id, 'leave');
        if (messageConfig) {
          messageType = 'leave';
        }
      }

      console.log('[GUILDMEMBERREMOVE][DEBUG] Message config retrieved:', messageConfig ? 'yes' : 'no', messageType);
      if (messageConfig) {
        let finalMessage = messageConfig.message;
        console.log('[GUILDMEMBERREMOVE][DEBUG] Original message:', finalMessage.substring(0, 100) + '...');

        // Processa alias dinâmicos
        const aliasContext = {
          member: member,
          guild: member.guild
        };
        if (messageType === 'kick') {
          aliasContext.reason = kickReason;
        } else if (messageType === 'ban') {
          aliasContext.reason = banReason;
        }
        finalMessage = processAliases(finalMessage, aliasContext);
        console.log('[GUILDMEMBERREMOVE][DEBUG] After alias processing:', finalMessage.substring(0, 100) + '...');

        // If it's a prompt, generate message via AI
        if (messageConfig.isPrompt) {
          console.log('[GUILDMEMBERREMOVE][DEBUG] Generating AI message...');
          try {
            const moderationReason = messageType === 'kick' ? kickReason : messageType === 'ban' ? banReason : null;
            finalMessage = await oai_interface.gerarMensagemBemVindoViaAPI(
              member.guild.id,
              member.id,
              member.user.username,
              messageType,
              finalMessage,
              null,
              null,
              moderationReason
            );
            console.log('[GUILDMEMBERREMOVE][DEBUG] AI message generated successfully');
          } catch (error) {
            console.error(`[GUILDMEMBERREMOVE][ERROR] Failed to generate ${messageType} message via AI:`, error);
            // Fall back to the original message without AI generation
            console.log('[GUILDMEMBERREMOVE][DEBUG] Falling back to original message');
          }
        } else {
          console.log('[GUILDMEMBERREMOVE][DEBUG] Not a prompt, using original message');
        }

        console.log('[GUILDMEMBERREMOVE][DEBUG] Final message to send:', finalMessage.substring(0, 100) + '...');
        await channel.send(finalMessage);
        console.log(`[GUILDMEMBERREMOVE][${messageType.toUpperCase()}] Sent ${messageType} message for ${member.user.tag} in ${member.guild.name}`);
      } else {
        console.log('[GUILDMEMBERREMOVE][DEBUG] No message config found, skipping send');
      }
    } catch (err) {
      console.error(`[ERROR-MEMBER-LEAVE] Failed to handle member leave for ${member.user.tag}:`, err);
    }
  },
};
