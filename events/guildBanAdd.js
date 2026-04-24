/*
** path: events/guildBanAdd.js
** lastMod: 2025-09-30 18:48
** author: Vico
** colaboração: Kimi AI e Grok Code Fast
*/

const { AuditLogEvent } = require('discord.js');
const database = require('../core/database');
const oai_interface = require('../core/oai_interface');
const auditCache = require('../core/auditCache');
const { processAliases } = require('../core/aliasProcessor');

module.exports = {
  name: 'GuildAuditLogEntryCreate',
  async execute(auditLog) {
    console.log('[GUILDBANADD][DEBUG] Event triggered for audit log entry:', auditLog.action, 'target:', auditLog.target.tag || auditLog.target.username, 'guild:', auditLog.guild.name);

    // Only process ban events
    if (auditLog.action !== AuditLogEvent.MemberBanAdd) return;

    // Ignora bots
    if (auditLog.target.bot) return;

    // Ignore events from guilds where the bot might not be fully ready
    if (!auditLog.guild) return;

    // Cache logic to prevent deduplication
    const key = `ban:${auditLog.guild.id}:${auditLog.target.id}`;
    if (auditCache.has(key)) return;
    auditCache.set(key, Date.now());

    try {
      // Get ban message configuration
      console.log('[GUILDBANADD][DEBUG] Looking up message config for type: leave_ban');
      const messageConfig = database.getMessageByType(auditLog.guild.id, 'leave_ban');
      console.log('[GUILDBANADD][DEBUG] Message config retrieved:', messageConfig ? 'yes' : 'no');
      if (!messageConfig || !messageConfig.message) {
        console.log('[GUILDBANADD][DEBUG] No message config or message, skipping');
        return;
      }

      // Get system channel
      const systemChannelId = database.getSystemChannel(auditLog.guild.id);
      console.log('[GUILDBANADD][DEBUG] Retrieved system channel ID:', systemChannelId, 'for guild:', auditLog.guild.id);
      if (!systemChannelId) {
        console.warn(`[GUILDBANADD][WARN] No system channel configured for guild ${auditLog.guild.name}`);
        return;
      }

      const channel = auditLog.guild.channels.cache.get(systemChannelId);
      console.log('[GUILDBANADD][DEBUG] Retrieved channel object:', channel ? channel.name : 'null');
      if (!channel) {
        console.warn(`[GUILDBANADD][WARN] System channel ${systemChannelId} not found in guild ${auditLog.guild.name}`);
        return;
      }

      // Check send permissions
      const hasSendPerm = channel.permissionsFor(auditLog.guild.members.me).has('SendMessages');
      console.log('[GUILDBANADD][DEBUG] Bot has SendMessages permission in channel:', hasSendPerm);
      if (!hasSendPerm) {
        console.warn(`[GUILDBANADD][WARN] Bot lacks SendMessages permission in system channel ${channel.name}`);
        return;
      }

      // Get the banned user from the audit log target
      const bannedUser = auditLog.target;
      console.log('[GUILDBANADD][DEBUG] Banned user:', bannedUser ? bannedUser.tag || bannedUser.username : 'null');
      if (!bannedUser) {
        console.warn(`[GUILDBANADD][WARN] No user found in ban audit log entry for guild ${auditLog.guild.name}`);
        return;
      }

      let finalMessage = messageConfig.message;
      console.log('[GUILDBANADD][DEBUG] Original message:', finalMessage.substring(0, 100) + '...');

      // Processa alias dinâmicos
      const banReason = auditLog.reason || 'Nenhuma razão informada';
      finalMessage = processAliases(finalMessage, {
        member: auditLog.target,
        guild: auditLog.guild,
        reason: banReason
      });
      console.log('[GUILDBANADD][DEBUG] After alias processing:', finalMessage.substring(0, 100) + '...');

      // If it's a prompt, generate message via AI
      if (messageConfig.isPrompt) {
        console.log('[GUILDBANADD][DEBUG] Generating AI message...');
        try {
          const userName = bannedUser.username || bannedUser.displayName || 'Unknown User';
          finalMessage = await oai_interface.gerarMensagemBemVindoViaAPI(
            auditLog.guild.id,
            bannedUser.id,
            userName,
            'ban',
            messageConfig.message,
            null,
            null,
            banReason
          );
          console.log('[GUILDBANADD][DEBUG] AI message generated successfully');
        } catch (error) {
          console.error(`[GUILDBANADD][ERROR] Failed to generate ban message via AI:`, error);
          // Fall back to the original message without AI generation
          console.log('[GUILDBANADD][DEBUG] Falling back to original message');
        }
      } else {
        console.log('[GUILDBANADD][DEBUG] Not a prompt, using original message');
      }

      console.log('[GUILDBANADD][DEBUG] Final message to send:', finalMessage.substring(0, 100) + '...');
      await channel.send(finalMessage);
      console.log(`[GUILDBANADD][BAN] Sent ban message for ${bannedUser.tag || bannedUser.username} in ${auditLog.guild.name} with reason: "${banReason}"`);
    } catch (err) {
      console.error(`[GUILDBANADD][ERROR] Failed to handle ban audit log event:`, err);
    }
  },
};
