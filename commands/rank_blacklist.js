/*
** caminho: commands/rank_blacklist.js
** últimaMod: 2025-09-13 17:42
** autor: Vico
** colaboração: Roo Sonic (xai/grok-code-fast-1)
*/

/*
   Comando /rank_blacklist para gerenciar canais na blacklist do sistema de XP.
   Permite adicionar, mostrar e remover canais da blacklist.
*/

const { SlashCommandBuilder, PermissionsBitField, MessageFlags, ChannelType } = require('discord.js');
const database = require('../core/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank_blacklist')
    .setDescription('Gerenciar canais na blacklist do sistema de XP')

    /*
       Subcomando: add (adicionar canal)
    */
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Adicionar canal à blacklist do XP')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Canal a adicionar à blacklist')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)))

    /*
       Subcomando: show (mostrar canais)
    */
    .addSubcommand(subcommand =>
      subcommand
        .setName('show')
        .setDescription('Mostrar todos os canais na blacklist'))

    /*
       Subcomando: remove (remover canal)
    */
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remover canal da blacklist do XP')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Canal a remover da blacklist')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)))

    /*
       Restrição para administradores apenas
    */
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),

  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();
      const guildId = interaction.guild.id;

      console.log('[RANK_BLACKLIST][DEBUG] Subcommand:', subcommand);
      console.log('[RANK_BLACKLIST][DEBUG] Guild ID:', guildId);

      if (subcommand === 'add') {
        /*
           Subcomando: adicionar canal à blacklist
        */
        const channel = interaction.options.getChannel('channel');

        try {
          const changes = database.xpAdicionarCanal(guildId, channel.id);
          if (changes > 0) {
            await interaction.reply({
              content: `✅ Canal ${channel} adicionado à blacklist do XP com sucesso.`,
              flags: [MessageFlags.Ephemeral]
            });
          } else {
            await interaction.reply({
              content: `ℹ️ O canal ${channel} já está na blacklist do XP.`,
              flags: [MessageFlags.Ephemeral]
            });
          }
        } catch (error) {
          console.error('[RANK_BLACKLIST][ERROR] Falha ao adicionar canal:', error);
          await interaction.reply({
            content: '❌ Erro ao adicionar o canal à blacklist. Tente novamente.',
            flags: [MessageFlags.Ephemeral]
          });
        }

      } else if (subcommand === 'show') {
        /*
           Subcomando: mostrar canais na blacklist
        */
        try {
          const channels = database.xpListarCanais(guildId);
          if (channels.length > 0) {
            const channelList = channels.map(c => `<#${c.canal_id}>`).join('\n');
            await interaction.reply({
              content: `📋 Canais na blacklist do XP:\n${channelList}`,
              flags: [MessageFlags.Ephemeral]
            });
          } else {
            await interaction.reply({
              content: '📭 Nenhum canal está na blacklist do XP.',
              flags: [MessageFlags.Ephemeral]
            });
          }
        } catch (error) {
          console.error('[RANK_BLACKLIST][ERROR] Falha ao listar canais:', error);
          await interaction.reply({
            content: '❌ Erro ao buscar a lista de canais. Tente novamente.',
            flags: [MessageFlags.Ephemeral]
          });
        }

      } else if (subcommand === 'remove') {
        /*
           Subcomando: remover canal da blacklist
        */
        const channel = interaction.options.getChannel('channel');

        try {
          const changes = database.xpRemoverCanal(guildId, channel.id);
          if (changes > 0) {
            await interaction.reply({
              content: `🗑️ Canal ${channel} removido da blacklist do XP com sucesso.`,
              flags: [MessageFlags.Ephemeral]
            });
          } else {
            await interaction.reply({
              content: `ℹ️ O canal ${channel} não estava na blacklist do XP.`,
              flags: [MessageFlags.Ephemeral]
            });
          }
        } catch (error) {
          console.error('[RANK_BLACKLIST][ERROR] Falha ao remover canal:', error);
          await interaction.reply({
            content: '❌ Erro ao remover o canal da blacklist. Tente novamente.',
            flags: [MessageFlags.Ephemeral]
          });
        }
      }

    } catch (error) {
      console.error('[RANK_BLACKLIST][ERROR] Erro geral no comando:', error);
      await interaction.reply({
        content: '❌ Ocorreu um erro inesperado. Contate um administrador.',
        flags: [MessageFlags.Ephemeral]
      });
    }
  }
};