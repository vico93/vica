/*
** caminho: src/commands/trigger.js
** últimaMod: 2026-03-02 19:05
** autor: Vico
** colaboração: Roo Sonic (xai/grok-code-fast-1), OpenAI Codex
*/

const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require('discord.js');
const oai_interface = require('../ai/oai_interface');
const {
  isUnknownInteraction,
  safeDeferReply,
  safeEditReply,
  safeReply
} = require('../discord/discord_interaction');
const { splitText } = require('../discord/text');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('trigger')
    .setDescription('Envia um prompt de trigger para a IA gerar uma resposta.')
    .addStringOption(option =>
      option.setName('prompt')
        .setDescription('O prompt de trigger para enviar à IA.')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),

  async execute(interaction) {
    const prompt = interaction.options.getString('prompt');

    try {
      await safeDeferReply(interaction, { flags: MessageFlags.Ephemeral });

      const prefixedPrompt = '[trigger] ' + prompt;

      const response = await oai_interface.gerarRespostaContextual(
        interaction.guild.id,
        interaction.channel.id,
        interaction.user.id,
        interaction.client.user.id,
        prefixedPrompt,
        null, // no image
        interaction.channel,
        null, // no sourceMessageId since it's a command
        null // originalAuthorId for context - trigger commands start fresh conversations
      );

      const chunks = splitText(response).filter(chunk => typeof chunk === 'string' && chunk.trim().length > 0);

      if (chunks.length === 0) {
        await interaction.channel.send('Bah, não consegui montar o trigger agora 😵‍💫. Tenta de novo em seguida.');
      } else {
        await interaction.channel.send(chunks[0]);
        for (let i = 1; i < chunks.length; i++) {
          await interaction.channel.send(chunks[i]);
        }
      }

      await safeEditReply(interaction, { content: 'Trigger enviado com sucesso.' });
    } catch (error) {
      console.error('[TRIGGER][ERROR] Erro ao processar trigger:', error);

      if (isUnknownInteraction(error)) {
        console.warn('[TRIGGER][WARN] Interação expirou antes da resposta final (code 10062).');
        return;
      }

      const payload = { content: 'Erro ao processar o trigger.' };

      try {
        if (interaction.deferred || interaction.replied) {
          await safeEditReply(interaction, payload);
        } else {
          await safeReply(interaction, { ...payload, flags: MessageFlags.Ephemeral });
        }
      } catch (replyError) {
        console.error('[TRIGGER][ERROR] Falha ao enviar mensagem de erro:', replyError);
      }
    }
  }
};
