// Arquivo: events/interactionCreate.js

// --- MUDANÇA 1: Importar MessageFlags ---
const { MessageFlags } = require('discord.js');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
      console.error(`Nenhum comando correspondente a "${interaction.commandName}" foi encontrado.`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`Erro ao executar o comando "${interaction.commandName}"`);
      console.error(error);

      // --- MUDANÇA 2: Usar flags em vez de ephemeral ---
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'Ocorreu um erro ao executar este comando! 😢', flags: [MessageFlags.Ephemeral] });
      } else {
        await interaction.reply({ content: 'Ocorreu um erro ao executar este comando! 😢', flags: [MessageFlags.Ephemeral] });
      }
    }
  },
};