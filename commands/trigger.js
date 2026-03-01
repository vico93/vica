/*
** caminho: commands/trigger.js
** últimaMod: 2026-03-01 03:55
** autor: Vico
** colaboração: Roo Sonic (xai/grok-code-fast-1)
*/

const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require('discord.js');
const oai_interface = require('../core/oai_interface');

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
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const prompt = interaction.options.getString('prompt');

    try {
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

      await interaction.editReply({ content: 'Trigger enviado com sucesso.', flags: [MessageFlags.Ephemeral] });
    } catch (error) {
      console.error('[TRIGGER][ERROR] Erro ao processar trigger:', error);
      await interaction.editReply({ content: 'Erro ao processar o trigger.', flags: [MessageFlags.Ephemeral] });
    }
  }
};
