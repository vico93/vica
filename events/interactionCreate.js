/*
** caminho: events/interactionCreate.js
** últimaMod: 2025-10-03 22:07
** autor: Vico
** colaboração: Grok Code (Fast)
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
const database = require('../core/database');

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

    // /* --- PROCESSAMENTO DE INTERAÇÕES DE BOTÃO --- */
    if (interaction.isButton()) {
      try {
        if (interaction.customId.startsWith('delete_emoji_')) {
          // Parse do customId: delete_emoji_${emojiId}_${originalUserId}
          const parts = interaction.customId.split('_');
          if (parts.length !== 4 || parts[0] !== 'delete' || parts[1] !== 'emoji') {
            await interaction.reply({
              content: '❌ ID do botão inválido.',
              flags: [MessageFlags.Ephemeral]
            });
            return;
          }
          const emojiId = parts[2];
          const originalUserId = parts[3];
          // Verificar se o usuário é o mesmo que criou a interação
          if (interaction.user.id !== originalUserId) {
            await interaction.reply({
              content: '❌ Você não tem permissão para deletar este emoji.',
              flags: [MessageFlags.Ephemeral]
            });
            return;
          }
          // Deletar o emoji do banco de dados
          const changes = database.deleteReactionEmoji(interaction.guild.id, emojiId);
          if (changes > 0) {
            await interaction.reply({
              content: '✅ Emoji deletado com sucesso!',
              flags: [MessageFlags.Ephemeral]
            });
          } else {
            await interaction.reply({
              content: '❌ Emoji não encontrado ou já deletado.',
              flags: [MessageFlags.Ephemeral]
            });
          }
        }
        // Se a interação do botão não corresponder a nenhum dos casos acima,
        // não fazemos nada aqui para permitir que coletores específicos (nos arquivos de comando)
        // processem a interação.
      } catch (error) {
        console.error(`[VICA][BUTTON] Erro ao processar botão "${interaction.customId}":`, error);
        const payload = { content: 'Ocorreu um erro ao processar a interação! 😢', flags: [MessageFlags.Ephemeral] };
        try {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp(payload);
          } else {
            await interaction.reply(payload);
          }
        } catch (replyError) {
          console.error('[VICA][BUTTON] Falha crítica ao enviar mensagem de erro:', replyError);
        }
      }
      return;
    }
  }
};