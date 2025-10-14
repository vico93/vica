/*
** caminho: commands/trigger.js
** últimaMod: 2025-09-20 20:46
** autor: Vico
** colaboração: Roo Sonic (xai/grok-code-fast-1)
*/

const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require('discord.js');
const oai_interface = require('../core/oai_interface');

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

      await interaction.channel.send(response);

      await interaction.editReply({ content: 'Trigger enviado com sucesso.', flags: [MessageFlags.Ephemeral] });
    } catch (error) {
      console.error('[TRIGGER][ERROR] Erro ao processar trigger:', error);
      await interaction.editReply({ content: 'Erro ao processar o trigger.', flags: [MessageFlags.Ephemeral] });
    }
  }
};