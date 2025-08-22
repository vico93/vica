/*
** caminho: events/guildMemberAdd.js
** últimaMod: 22/08/2025
** autor: Vico
** colaboração: ChatGPT, Roo Sonic
*/

const database = require('../core/database');
const oai_interface = require('../core/oai_interface');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member) {
    // Ignora eventos de servidores onde o bot pode não estar totalmente pronto
    if (!member.guild) return;

    try {
      // Handle welcome messages
      const settings = database.getWelcomeLeaveSettings(member.guild.id);
      if (!settings || !settings.welcome_message) return;

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

      let finalMessage = settings.welcome_message;

      // Replace placeholders
      finalMessage = finalMessage.replace(/\{@USER\}/g, `<@${member.id}>`).replace(/\{USER\}/g, member.user.username);

      // If it's a prompt, generate message via AI
      if (settings.welcome_is_prompt === 1) {
        try {
          finalMessage = await oai_interface.gerarMensagemBemVindoViaAPI(
            member.guild.id,
            member.id,
            member.user.username,
            'welcome',
            settings.welcome_message
          );
        } catch (error) {
          console.error(`[ERROR] Failed to generate welcome message via AI:`, error);
          // Fall back to the original message without AI generation
        }
      }

      await channel.send(finalMessage);
      console.log(`[MEMBER-WELCOME] Sent welcome message for ${member.user.tag} in ${member.guild.name}`);
    } catch (err) {
      console.error(`[ERROR-MEMBER-WELCOME] Failed to handle member welcome for ${member.user.tag}:`, err);
    }
  },
};