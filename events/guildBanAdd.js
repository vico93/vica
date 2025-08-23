/*
** path: events/guildBanAdd.js
** lastMod: 23/08/2025 12:44
** author: Vico
** collaboration: Roo Sonic
*/

const database = require('../core/database');
const oai_interface = require('../core/oai_interface');

module.exports = {
  name: 'guildBanAdd',
  async execute(ban) {
    // Ignore events from guilds where the bot might not be fully ready
    if (!ban.guild) return;

    try {
      // Get ban message configuration
      const config = database.getBanMessage(ban.guild.id);
      if (!config || !config.message) return;

      // Get system channel
      const systemChannelId = database.getSystemChannel(ban.guild.id);
      if (!systemChannelId) {
        console.warn(`[WARN] No system channel configured for guild ${ban.guild.name}`);
        return;
      }

      const channel = ban.guild.channels.cache.get(systemChannelId);
      if (!channel) {
        console.warn(`[WARN] System channel ${systemChannelId} not found in guild ${ban.guild.name}`);
        return;
      }

      let finalMessage = config.message;

      // Replace placeholders
      finalMessage = finalMessage.replace(/\{USER\}/g, ban.user.username || ban.user.displayName || 'Unknown User');

      // Add reason if available from the ban event
      if (ban.reason) {
        finalMessage = finalMessage.replace(/\{REASON\}/g, ban.reason);
      } else {
        finalMessage = finalMessage.replace(/\{REASON\}/g, 'No reason provided');
      }

      // If it's a prompt, generate message via AI
      if (config.isPrompt) {
        try {
          finalMessage = await oai_interface.gerarMensagemBemVindoViaAPI(
            ban.guild.id,
            ban.user.id,
            ban.user.username || ban.user.displayName || 'Unknown User',
            'ban',
            finalMessage
          );
        } catch (error) {
          console.error(`[ERROR] Failed to generate ban message via AI:`, error);
          // Fall back to the original message without AI generation
        }
      }

      await channel.send(finalMessage);
      console.log(`[GUILD-BAN] Sent ban message for ${ban.user.tag || ban.user.username} in ${ban.guild.name}`);
    } catch (err) {
      console.error(`[ERROR-GUILD-BAN] Failed to handle ban event for ${ban.user.tag || ban.user.username}:`, err);
    }
  },
};