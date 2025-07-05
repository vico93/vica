// Arquivo: commands/blacklist-remove.js

const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const database = require('../core/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('blacklist-remove')
    .setDescription('Remove um canal da blacklist para o bot voltar a interagir.')
    .addChannelOption(option =>
      option.setName('canal')
        .setDescription('O canal a ser removido da blacklist')
        .setRequired(true))
    // Apenas membros com permissão de Gerenciar Canais podem usar
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
    // Comando não pode ser usado em DMs
    .setDMPermission(false),

  async execute(interaction) {
    const canal = interaction.options.getChannel('canal');
    const guildId = interaction.guild.id;

    try {
      const changes = await database.removerCanalBlacklist(guildId, canal.id);

      if (changes > 0) {
        await interaction.reply({
          content: `👍 O canal ${canal} foi removido da blacklist. Voltarei a responder menções aqui!`,
          ephemeral: true // Resposta visível apenas para quem executou o comando
        });
      } else {
        await interaction.reply({
          content: `🤔 O canal ${canal} não estava na blacklist.`,
          ephemeral: true
        });
      }
    } catch (err) {
      console.error('[BLACKLIST-REMOVE] Erro ao remover canal:', err);
      await interaction.reply({
        content: '❌ Ocorreu um erro ao tentar remover o canal da blacklist.',
        ephemeral: true
      });
    }
  }
};