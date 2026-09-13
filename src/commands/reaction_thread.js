/*
** caminho: commands/reaction_thread.js
** últimaMod: 2025-09-23 11:09
** autor: Vico
** colaboração: Grok Code (Fast)
*/

const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require('discord.js');
const database = require('../core/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reaction_thread')
    .setDescription('Enable or disable thread creation on :thread: reaction')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .addBooleanOption(option =>
      option.setName('enabled')
        .setDescription('Enable or disable thread creation on :thread: reaction')
        .setRequired(true)
    ),

  execute: async (interaction) => {
    const guildId = interaction.guild.id;
    const enabled = interaction.options.getBoolean('enabled');
    database.setThreadReactionEnabled(guildId, enabled);
    await interaction.reply({
      content: `Feature ${enabled ? 'enabled' : 'disabled'} successfully.`,
      flags: [MessageFlags.Ephemeral]
    });
  }
};