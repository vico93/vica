// Arquivo: commands/blacklist-add.js

const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require('discord.js');
const database = require('../core/database');

// A CORREÇÃO ESTÁ AQUI: module.exports com 'e' minúsculo
module.exports = {
  data: new SlashCommandBuilder()
    .setName('blacklist-add')
    .setDescription('Adiciona um canal à blacklist para o bot não interagir.')
    .addChannelOption(option =>
      option.setName('canal')
        .setDescription('O canal a ser adicionado à blacklist')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
    .setDMPermission(false),

  async execute(interaction) {
    const canal = interaction.options.getChannel('canal');
    const guildId = interaction.guild.id;

    try {
      const changes = await database.adicionarCanalBlacklist(guildId, canal.id);

      if (changes > 0) {
        await interaction.reply({
          content: `✅ O canal ${canal} foi adicionado à blacklist. Não responderei mais a menções aqui.`,
          flags: [MessageFlags.Ephemeral]
        });
      } else {
        await interaction.reply({
          content: `ℹ️ O canal ${canal} já estava na blacklist.`,
          flags: [MessageFlags.Ephemeral]
        });
      }
    } catch (err) {
      console.error('[BLACKLIST-ADD] Erro ao adicionar canal:', err);
      await interaction.reply({
        content: '❌ Ocorreu um erro ao tentar adicionar o canal à blacklist.',
        flags: [MessageFlags.Ephemeral]
      });
    }
  }
};