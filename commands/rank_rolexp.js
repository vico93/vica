/*
** caminho: commands/rank_rolexp.js
** últimaMod: 2025-09-13 17:45
** autor: Vico
** colaboração: Roo Sonic (xai/grok-code-fast-1)
*/

/*
  Comando /rank_rolexp para gerenciar multiplicadores de XP para cargos.
  Permite adicionar, mostrar e remover multiplicadores para roles do servidor.
*/

const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require('discord.js');
const database = require('../core/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank_rolexp')
    .setDescription('Gerenciar multiplicadores de XP para cargos')

    /*
      Subcomando: add
    */
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Adicionar multiplicador de XP para um cargo')
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('Cargo para aplicar o multiplicador')
            .setRequired(true))
        .addNumberOption(option =>
          option.setName('multiplier')
            .setDescription('Multiplicador de XP (ex: 1.5 para 50% extra)')
            .setRequired(true)
            .setMinValue(0.1)
            .setMaxValue(10.0)))

    /*
      Subcomando: show
    */
    .addSubcommand(subcommand =>
      subcommand
        .setName('show')
        .setDescription('Mostrar todos os multiplicadores de XP para cargos'))

    /*
      Subcomando: remove
    */
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remover multiplicador de XP para um cargo')
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('Cargo para remover o multiplicador')
            .setRequired(true)))

    /*
      Restrição para administradores apenas
    */
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),

  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();
      const guildId = interaction.guild.id;

      console.log('[RANK_ROLEXP][DEBUG] Subcommand:', subcommand);
      console.log('[RANK_ROLEXP][DEBUG] Guild ID:', guildId);

      if (subcommand === 'add') {
        /*
          Subcomando: adicionar multiplicador
        */
        const role = interaction.options.getRole('role');
        const multiplier = interaction.options.getNumber('multiplier');

        if (!role) {
          return await interaction.reply({
            content: '❌ Cargo inválido.',
            flags: [MessageFlags.Ephemeral]
          });
        }

        try {
          const changes = database.definirMultiplicadorRole(guildId, role.id, multiplier);
          await interaction.reply({
            content: `✅ Multiplicador de XP definido para o cargo ${role.name}: ${multiplier}x`,
            flags: [MessageFlags.Ephemeral]
          });
        } catch (error) {
          console.error('[RANK_ROLEXP][ERROR] Falha ao definir multiplicador:', error);
          await interaction.reply({
            content: '❌ Erro ao salvar o multiplicador. Tente novamente.',
            flags: [MessageFlags.Ephemeral]
          });
        }

      } else if (subcommand === 'show') {
        /*
          Subcomando: mostrar multiplicadores
        */
        try {
          const multipliers = database.listarMultiplicadoresRole(guildId);

          if (!multipliers || multipliers.length === 0) {
            await interaction.reply({
              content: '📭 Nenhum multiplicador de XP configurado.',
              flags: [MessageFlags.Ephemeral]
            });
          } else {
            let list = '📋 Multiplicadores de XP para cargos:\n';
            for (const mult of multipliers) {
              const role = interaction.guild.roles.cache.get(mult.role_id);
              const roleName = role ? role.name : `Cargo desconhecido (${mult.role_id})`;
              list += `• ${roleName}: ${mult.multiplier}x\n`;
            }
            await interaction.reply({
              content: list,
              flags: [MessageFlags.Ephemeral]
            });
          }
        } catch (error) {
          console.error('[RANK_ROLEXP][ERROR] Falha ao listar multiplicadores:', error);
          await interaction.reply({
            content: '❌ Erro ao buscar os multiplicadores. Tente novamente.',
            flags: [MessageFlags.Ephemeral]
          });
        }

      } else if (subcommand === 'remove') {
        /*
          Subcomando: remover multiplicador
        */
        const role = interaction.options.getRole('role');

        if (!role) {
          return await interaction.reply({
            content: '❌ Cargo inválido.',
            flags: [MessageFlags.Ephemeral]
          });
        }

        try {
          const changes = database.removerMultiplicadorRole(guildId, role.id);

          if (changes > 0) {
            await interaction.reply({
              content: `🗑️ Multiplicador de XP removido para o cargo ${role.name}.`,
              flags: [MessageFlags.Ephemeral]
            });
          } else {
            await interaction.reply({
              content: `📭 Nenhum multiplicador de XP estava configurado para o cargo ${role.name}.`,
              flags: [MessageFlags.Ephemeral]
            });
          }
        } catch (error) {
          console.error('[RANK_ROLEXP][ERROR] Falha ao remover multiplicador:', error);
          await interaction.reply({
            content: '❌ Erro ao remover o multiplicador. Tente novamente.',
            flags: [MessageFlags.Ephemeral]
          });
        }
      }

    } catch (error) {
      console.error('[RANK_ROLEXP][ERROR] Erro geral no comando:', error);
      await interaction.reply({
        content: '❌ Ocorreu um erro inesperado. Contate um administrador.',
        flags: [MessageFlags.Ephemeral]
      });
    }
  }
};