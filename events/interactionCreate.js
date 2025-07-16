/*
**  caminho: events/interactionCreate.js
**  últimaMod: 16/07/2025 22:26
**  autor: Vico
**  colaboração: ChatGPT, Gemini, Kimi AI
*/

/*
  Handler genérico para comandos de barra (slash commands).
  Responsabilidades:
  1. Ignorar interações que não sejam comandos;
  2. Buscar comando na Collection;
  3. Executar com try/catch robusto;
  4. Em caso de erro, enviar mensagem de erro com fallback extra.
*/

const { MessageFlags } = require('discord.js');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) {
      console.error(`[VICA][CMD] Comando "${interaction.commandName}" não encontrado.`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`[VICA][CMD] Erro ao executar "${interaction.commandName}":`, error);

      const payload = { content: 'Ocorreu um erro ao executar este comando! 😢', flags: [MessageFlags.Ephemeral] };

      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(payload);
        } else {
          await interaction.reply(payload);
        }
      } catch (replyError) {
        console.error('[VICA][CMD] Falha crítica ao enviar mensagem de erro:', replyError);
      }
    }
  }
};