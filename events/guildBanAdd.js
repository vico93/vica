/*
** path: events/guildBanAdd.js
** lastMod: 2025-09-12
** author: Vico
** colaboração: Roo Sonic e Kimi AI, Roo Sonic (xai/grok-code-fast-1)
*/

const { AuditLogEvent } = require('discord.js');
const database = require('../core/database');
const oai_interface = require('../core/oai_interface');
const auditCache = require('../core/auditCache');

module.exports = {
  name: 'GuildAuditLogEntryCreate',
  async execute(auditLog) {
    // Only process ban events
    if (auditLog.action !== AuditLogEvent.MemberBanAdd) return;

    // Ignore events from guilds where the bot might not be fully ready
    if (!auditLog.guild) return;

    // Cache logic to prevent deduplication
    const key = `ban:${auditLog.guild.id}:${auditLog.target.id}`;
    if (auditCache.has(key)) return;
    auditCache.set(key, Date.now());

    try {
      // Get ban message configuration
      const messageConfig = database.getMessageByType(auditLog.guild.id, 'ban');
      if (!messageConfig || !messageConfig.message) return;

      // Get system channel
      const systemChannelId = database.getSystemChannel(auditLog.guild.id);
      if (!systemChannelId) {
        console.warn(`[GUILDBANADD][WARN] No system channel configured for guild ${auditLog.guild.name}`);
        return;
      }

      const channel = auditLog.guild.channels.cache.get(systemChannelId);
      if (!channel) {
        console.warn(`[GUILDBANADD][WARN] System channel ${systemChannelId} not found in guild ${auditLog.guild.name}`);
        return;
      }

      // Get the banned user from the audit log target
      const bannedUser = auditLog.target;
      if (!bannedUser) {
        console.warn(`[GUILDBANADD][WARN] No user found in ban audit log entry for guild ${auditLog.guild.name}`);
        return;
      }

      let finalMessage = messageConfig.message;

      // Replace placeholders - use username for ban messages (not mention)
      const userName = bannedUser.username || bannedUser.displayName || 'Unknown User';
      finalMessage = finalMessage.replace(/\{@USER\}/g, userName).replace(/\{USER\}/g, userName);

      // Get ban reason from audit log and replace {REASON} placeholder
      const banReason = auditLog.reason || 'No reason provided';
      finalMessage = finalMessage.replace(/\{REASON\}/g, banReason);

      // If it's a prompt, generate message via AI
      if (messageConfig.isPrompt) {
        try {
          finalMessage = await oai_interface.gerarMensagemBemVindoViaAPI(
            auditLog.guild.id,
            bannedUser.id,
            userName,
            'ban',
            messageConfig.message
          );
        } catch (error) {
          console.error(`[GUILDBANADD][ERROR] Failed to generate ban message via AI:`, error);
          // Fall back to the original message without AI generation
        }
      }

      await channel.send(finalMessage);
      console.log(`[GUILDBANADD][BAN] Sent ban message for ${bannedUser.tag || bannedUser.username} in ${auditLog.guild.name} with reason: "${banReason}"`);
    } catch (err) {
      console.error(`[GUILDBANADD][ERROR] Failed to handle ban audit log event:`, err);
    }
  },
};