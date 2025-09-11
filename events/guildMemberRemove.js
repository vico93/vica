/*
** caminho: events/guildMemberRemove.js
** últimaMod: 11/09/2025 20:47
** autor: Vico
** colaboração: Gemini, ChatGPT, Kimi AI e Roo Sonic (xai/grok-code-fast-1)
*/

const database = require('../core/database');
const oai_interface = require('../core/oai_interface');
const auditCache = require('../core/auditCache');
const { PermissionsBitField } = require('discord.js');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member, client) {
    // Ignora eventos de servidores onde o bot pode não estar totalmente pronto
    if (!member.guild) return;

    // Ignora se o membro removido for o próprio bot (audit logs irrelevantes)
    if (member.id === client.user.id) return;

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
      const settings = database.getWelcomeLeaveSettings(member.guild.id);
      if (!settings) return;

      // Use system channel
      const systemChannelId = database.getSystemChannel(member.guild.id);
      if (!systemChannelId) {
        console.warn(`[WARN] No system channel configured for guild ${member.guild.name}`);
        return;
      }

      const channel = member.guild.channels.cache.get(systemChannelId);
      if (!channel) {
        console.warn(`[WARN] System channel ${systemChannelId} not found in guild ${member.guild.name}`);
        return;
      }

      // Verifica se o bot possui permissão para ver logs de auditoria
      const hasAuditPermission = member.guild.members.me.permissions.has(PermissionsBitField.Flags.ViewAuditLog);
      if (!hasAuditPermission) {
        console.warn('[GUILDMEMBERREMOVE][WARN] Bot não possui permissão VIEW_AUDIT_LOG, pulando detecção de kick/ban');
      }

      // Check if this was a kick or ban by looking at audit logs
      let kickLog = null;
      if (hasAuditPermission) {
        try {
          const fetchedLogs = await member.guild.fetchAuditLogs({
            limit: 1,
            type: 20, // MEMBER_KICK
          });
          kickLog = fetchedLogs.entries.first();
        } catch (err) {
          if (err.code === 10004) {
            console.error('[GUILDMEMBERREMOVE][ERROR] Erro ao buscar logs de kick - Guild desconhecida:', err);
          } else {
            throw err;
          }
        }
      }
      const wasKicked = kickLog && kickLog.target.id === member.id;

      // Check for ban
      let banLog = null;
      if (hasAuditPermission) {
        try {
          const banLogs = await member.guild.fetchAuditLogs({
            limit: 1,
            type: 22, // MEMBER_BAN_ADD
          });
          banLog = banLogs.entries.first();
        } catch (err) {
          if (err.code === 10004) {
            console.error('[GUILDMEMBERREMOVE][ERROR] Erro ao buscar logs de ban - Guild desconhecida:', err);
          } else {
            throw err;
          }
        }
      }
      const wasBanned = banLog && banLog.target.id === member.id;

      let messageConfig = null;
      let messageType = 'leave';
      let kickReason = null;

      if (wasBanned && settings.ban_message) {
        messageConfig = {
          message: settings.ban_message,
          isPrompt: settings.ban_is_prompt === 1
        };
        messageType = 'ban';
      } else if (wasKicked && settings.kick_message) {
        kickReason = kickLog.reason || 'No reason provided';
        messageConfig = {
          message: settings.kick_message,
          isPrompt: settings.kick_is_prompt === 1
        };
        messageType = 'kick';
      } else if (settings.leave_message) {
        messageConfig = {
          message: settings.leave_message,
          isPrompt: settings.leave_is_prompt === 1
        };
        messageType = 'leave';
      }

      if (messageConfig) {
        let finalMessage = messageConfig.message;

        // Replace placeholders
        finalMessage = finalMessage.replace(/\{@USER\}/g, `<@${member.id}>`).replace(/\{USER\}/g, member.user.username);

        // Replace {REASON} placeholder for kicks
        if (messageType === 'kick') {
          finalMessage = finalMessage.replace(/\{REASON\}/g, kickReason);
        }

        // If it's a prompt, generate message via AI
        if (messageConfig.isPrompt) {
          try {
            finalMessage = await oai_interface.gerarMensagemBemVindoViaAPI(
              member.guild.id,
              member.id,
              member.user.username,
              messageType,
              messageConfig.message
            );
          } catch (error) {
            console.error(`[ERROR] Failed to generate ${messageType} message via AI:`, error);
            // Fall back to the original message without AI generation
          }
        }

        await channel.send(finalMessage);
        console.log(`[MEMBER-${messageType.toUpperCase()}] Sent ${messageType} message for ${member.user.tag} in ${member.guild.name}`);
      }
    } catch (err) {
      console.error(`[ERROR-MEMBER-LEAVE] Failed to handle member leave for ${member.user.tag}:`, err);
    }
  },
};