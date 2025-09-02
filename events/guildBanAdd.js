/*
** path: events/guildBanAdd.js
** lastMod: 2025-09-02 21:56
** author: Vico
** colaboração: Roo Sonic e Kimi AI
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
      const config = database.getBanMessage(auditLog.guild.id);
      if (!config || !config.message) return;

      // Get system channel
      const systemChannelId = database.getSystemChannel(auditLog.guild.id);
      if (!systemChannelId) {
        console.warn(`[WARN] No system channel configured for guild ${auditLog.guild.name}`);
        return;
      }

      const channel = auditLog.guild.channels.cache.get(systemChannelId);
      if (!channel) {
        console.warn(`[WARN] System channel ${systemChannelId} not found in guild ${auditLog.guild.name}`);
        return;
      }

      // Get the banned user from the audit log target
      const bannedUser = auditLog.target;
      if (!bannedUser) {
        console.warn(`[WARN] No user found in ban audit log entry for guild ${auditLog.guild.name}`);
        return;
      }

      let finalMessage = config.message;

      // Replace placeholders
      finalMessage = finalMessage.replace(/\{USER\}/g, bannedUser.username || bannedUser.displayName || 'Unknown User');

      // Get ban reason from audit log
      const banReason = auditLog.reason || 'No reason provided';
      finalMessage = finalMessage.replace(/\{REASON\}/g, banReason);

      // If it's a prompt, generate message via AI
      if (config.isPrompt) {
        try {
          finalMessage = await oai_interface.gerarMensagemBemVindoViaAPI(
            auditLog.guild.id,
            bannedUser.id,
            bannedUser.username || bannedUser.displayName || 'Unknown User',
            'ban',
            finalMessage
          );
        } catch (error) {
          console.error(`[ERROR] Failed to generate ban message via AI:`, error);
          // Fall back to the original message without AI generation
        }
      }

      await channel.send(finalMessage);
      console.log(`[GUILD-BAN] Sent ban message for ${bannedUser.tag || bannedUser.username} in ${auditLog.guild.name} with reason: "${banReason}"`);
    } catch (err) {
      console.error(`[ERROR-GUILD-BAN] Failed to handle ban audit log event:`, err);
    }
  },
};