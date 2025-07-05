// Arquivo: commands/blacklist-add.js

const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const database = require('../core/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('blacklist-add')
    .setDescription('Adiciona um canal à blacklist para o bot não interagir.')
    .addChannelOption(option =>
      option.setName('canal')
        .setDescription('O canal a ser adicionado à blacklist')
        .setRequired(true))
    // Apenas membros com permissão de Gerenciar Canais podem usar
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
    // Comando não pode ser usado em DMs
    .setDMPermission(false),

  async execute(interaction) {
    const canal = interaction.options.getChannel('canal');
    const guildId = interaction.guild.id;

    try {
      const changes = await database.adicionarCanalBlacklist(guildId, canal.id);

      if (changes > 0) {
        await interaction.reply({
          content: `✅ O canal ${canal} foi adicionado à blacklist. Não responderei mais a menções aqui.`,
          ephemeral: true // Resposta visível apenas para quem executou o comando
        });
      } else {
        await interaction.reply({
          content: `ℹ️ O canal ${canal} já estava na blacklist.`,
          ephemeral: true
        });
      }
    } catch (err) {
      console.error('[BLACKLIST-ADD] Erro ao adicionar canal:', err);
      await interaction.reply({
        content: '❌ Ocorreu um erro ao tentar adicionar o canal à blacklist.',
        ephemeral: true
      });
    }
  }
};