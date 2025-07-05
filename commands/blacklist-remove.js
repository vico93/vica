// Arquivo: commands/blacklist-remove.js

// --- MUDANÇA 1: Importar MessageFlags ---
const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require('discord.js');
const database = require('../core/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('blacklist-remove')
    .setDescription('Remove um canal da blacklist para o bot voltar a interagir.')
    .addChannelOption(option =>
      option.setName('canal')
        .setDescription('O canal a ser removido da blacklist')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
    .setDMPermission(false),

  async execute(interaction) {
    const canal = interaction.options.getChannel('canal');
    const guildId = interaction.guild.id;

    try {
      const changes = await database.removerCanalBlacklist(guildId, canal.id);

      if (changes > 0) {
        await interaction.reply({
          content: `👍 O canal ${canal} foi removido da blacklist. Voltarei a responder menções aqui!`,
          // --- MUDANÇA 2: Usar flags em vez de ephemeral ---
          flags: [MessageFlags.Ephemeral]
        });
      } else {
        await interaction.reply({
          content: `🤔 O canal ${canal} não estava na blacklist.`,
          flags: [MessageFlags.Ephemeral]
        });
      }
    } catch (err) {
      console.error('[BLACKLIST-REMOVE] Erro ao remover canal:', err);
      await interaction.reply({
        content: '❌ Ocorreu um erro ao tentar remover o canal da blacklist.',
        flags: [MessageFlags.Ephemeral]
      });
    }
  }
};