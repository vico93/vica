/*
** caminho: commands/trigger.js
** últimaMod: 2026-03-02 19:05
** autor: Vico
** colaboração: Roo Sonic (xai/grok-code-fast-1), OpenAI Codex
*/

const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require('discord.js');
const oai_interface = require('../core/oai_interface');
const {
  isUnknownInteraction,
  safeDeferReply,
  safeEditReply,
  safeReply
} = require('../core/discord_interaction');

function splitText(text, maxLength = 2000) {
  if (typeof text !== 'string') return [];

  const normalizedText = text.trim();
  if (!normalizedText) return [];
  if (normalizedText.length <= maxLength) return [normalizedText];

  const chunks = [];
  let start = 0;

  while (start < normalizedText.length) {
    let end = Math.min(start + maxLength, normalizedText.length);
    if (end === normalizedText.length) {
      chunks.push(normalizedText.slice(start));
      break;
    }

    const lastSpace = normalizedText.lastIndexOf(' ', end);
    if (lastSpace > start) {
      chunks.push(normalizedText.slice(start, lastSpace));
      start = lastSpace + 1;
    } else {
      chunks.push(normalizedText.slice(start, end));
      start = end;
    }
  }

  return chunks;
}

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
