/*
** caminho: events/interactionCreate.js
** últimaMod: 2026-03-02 19:05
** autor: Vico
** colaboração: Grok Code (Fast), OpenAI Codex
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
const {
  isUnknownInteraction,
  safeFollowUp,
  safeReply
} = require('../core/discord_interaction');

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
        if (isUnknownInteraction(error)) {
          console.warn(`[VICA][CMD][WARN] Interação expirada ao executar "${interaction.commandName}" (code 10062).`);
          return;
        }

        console.error(`[VICA][CMD] Erro ao executar "${interaction.commandName}":`, error);

        const payload = { content: 'Ocorreu um erro ao executar este comando! 😢', flags: MessageFlags.Ephemeral };

        try {
          if (interaction.replied || interaction.deferred) {
            await safeFollowUp(interaction, payload);
          } else {
            await safeReply(interaction, payload);
          }
        } catch (replyError) {
          if (isUnknownInteraction(replyError)) {
            console.warn(`[VICA][CMD][WARN] Não foi possível enviar erro para "${interaction.commandName}" porque a interação expirou.`);
            return;
          }

          console.error('[VICA][CMD] Falha crítica ao enviar mensagem de erro:', replyError);
        }
      }
      return;
    }

    // /* --- PROCESSAMENTO DE INTERAÇÕES MODAIS --- */
    if (interaction.isModalSubmit()) {

      try {
        if (interaction.customId.includes('set_multiplier_modal_') ||
            interaction.customId.includes('set_role_upgrade_modal_') ||
            interaction.customId.includes('edit_role_upgrade_modal_')) {
          await interaction.reply({
            content: '❌ Interação modal não reconhecida. Isso pode indicar uma versão desatualizada.',
            flags: [MessageFlags.Ephemeral]
          });
        } else {
          await interaction.reply({
            content: '❌ Interação não reconhecida. Isso pode indicar uma versão desatualizada.',
            flags: [MessageFlags.Ephemeral]
          });
        }
      } catch (error) {
        if (isUnknownInteraction(error)) {
          console.warn(`[VICA][MODAL][WARN] Interação modal expirada "${interaction.customId}" (code 10062).`);
          return;
        }

        console.error(`[VICA][MODAL] Erro ao processar modal "${interaction.customId}":`, error);

        const payload = { content: 'Ocorreu um erro ao processar a interação! 😢', flags: MessageFlags.Ephemeral };

        try {
          if (interaction.replied || interaction.deferred) {
            await safeFollowUp(interaction, payload);
          } else {
            await safeReply(interaction, payload);
          }
        } catch (replyError) {
          if (isUnknownInteraction(replyError)) {
            console.warn(`[VICA][MODAL][WARN] Não foi possível enviar erro para modal "${interaction.customId}" porque a interação expirou.`);
            return;
          }

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
        if (isUnknownInteraction(error)) {
          console.warn(`[VICA][BUTTON][WARN] Interação de botão expirada "${interaction.customId}" (code 10062).`);
          return;
        }

        console.error(`[VICA][BUTTON] Erro ao processar botão "${interaction.customId}":`, error);
        const payload = { content: 'Ocorreu um erro ao processar a interação! 😢', flags: MessageFlags.Ephemeral };
        try {
          if (interaction.replied || interaction.deferred) {
            await safeFollowUp(interaction, payload);
          } else {
            await safeReply(interaction, payload);
          }
        } catch (replyError) {
          if (isUnknownInteraction(replyError)) {
            console.warn(`[VICA][BUTTON][WARN] Não foi possível enviar erro para botão "${interaction.customId}" porque a interação expirou.`);
            return;
          }

          console.error('[VICA][BUTTON] Falha crítica ao enviar mensagem de erro:', replyError);
        }
      }
      return;
    }
  }
};
