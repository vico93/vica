/*
** caminho: events/guildMemberAdd.js
** últimaMod: 2025-09-12 20:35
** autor: Vico
** colaboração: ChatGPT, Roo Sonic, Roo Sonic (xai/grok-code-fast-1)
*/

const database = require('../core/database');
const oai_interface = require('../core/oai_interface');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member) {
    // Ignora eventos de servidores onde o bot pode não estar totalmente pronto
    if (!member.guild) return;

    // Ignora bots
    if (member.user.bot) return;

    try {
      // Handle welcome messages
      const messageConfig = database.getMessageByType(member.guild.id, 'welcome');
      if (!messageConfig || !messageConfig.message) return;

      // Use system channel
      const systemChannelId = database.getSystemChannel(member.guild.id);
      if (!systemChannelId) {
        console.warn(`[GUILDMEMBERADD][WARN] No system channel configured for guild ${member.guild.name}`);
        return;
      }

      const channel = member.guild.channels.cache.get(systemChannelId);
      if (!channel) {
        console.warn(`[GUILDMEMBERADD][WARN] System channel ${systemChannelId} not found in guild ${member.guild.name}`);
        return;
      }

      let finalMessage = messageConfig.message;

      // Replace placeholders - use mention for welcome messages
      finalMessage = finalMessage.replace(/\{@USER\}/g, `<@${member.id}>`).replace(/\{USER\}/g, `<@${member.id}>`);

      // If it's a prompt, generate message via AI
      if (messageConfig.isPrompt) {
        try {
          finalMessage = await oai_interface.gerarMensagemBemVindoViaAPI(
            member.guild.id,
            member.id,
            `<@${member.id}>`,
            'welcome',
            messageConfig.message
          );
        } catch (error) {
          console.error(`[GUILDMEMBERADD][ERROR] Failed to generate welcome message via AI:`, error);
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