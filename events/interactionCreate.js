/*
** caminho: events/interactionCreate.js
** últimaMod: 2025-09-03 19:45
** autor: Vico
** colaboração: Roo Sonic (chatbot modal routing implementation)
*/

/*
  Handler genérico para comandos de barra e interações modais.
  Responsabilidades:
  1. Processar comandos de barra (slash commands);
  2. Processar submissões de modais baseado no customId;
  3. Routing de modal customIds para seus respectivos handlers;
  4. Implementar try/catch robusto para ambos os tipos;
  5. Em caso de erro, enviar mensagem de erro com fallback extra.
*/

const { MessageFlags } = require('discord.js');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {

    // /* --- PROCESSAMENTO DE COMANDOS DE BARRA --- */
    if (interaction.isChatInputCommand()) {
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
      return;
    }

    // /* --- PROCESSAMENTO DE INTERAÇÕES MODAIS --- */
    if (interaction.isModalSubmit()) {

      try {
        // Routing baseado no padrão do customId
        if (interaction.customId.startsWith('set_user_memory_modal_') ||
            interaction.customId.includes('set_multiplier_modal_') ||
            interaction.customId.includes('set_role_upgrade_modal_') ||
            interaction.customId.includes('edit_role_upgrade_modal_') ||
            interaction.customId.includes('add_guild_memory_modal') ||
            interaction.customId.includes('set_user_xp_modal_')) {

          // Route to config command's modal handler
          const configCommand = interaction.client.commands.get('config');
          if (!configCommand) {
            return interaction.reply({
              content: '❌ Erro interno: handler de configuração não encontrado.',
              flags: [MessageFlags.Ephemeral]
            });
          }

          if (!configCommand.handleModalSubmit) {
            return interaction.reply({
              content: '❌ Erro interno: handler de modal não implementado.',
              flags: [MessageFlags.Ephemeral]
            });
          }

          await configCommand.handleModalSubmit(interaction);
        } else {
          // Modal não reconhecido
          await interaction.reply({
            content: '❌ Interação não reconhecida. Isso pode indicar uma versão desatualizada.',
            flags: [MessageFlags.Ephemeral]
          });
        }
      } catch (error) {
        console.error(`[VICA][MODAL] Erro ao processar modal "${interaction.customId}":`, error);

        const payload = { content: 'Ocorreu um erro ao processar a interação! 😢', flags: [MessageFlags.Ephemeral] };

        try {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp(payload);
          } else {
            await interaction.reply(payload);
          }
        } catch (replyError) {
          console.error('[VICA][MODAL] Falha crítica ao enviar mensagem de erro:', replyError);
        }
      }
      return;
    }
  }
};