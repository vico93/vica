/*
** caminho: commands/up_role.js
** últimaMod: 2025-09-12 22:13
** autor: Vico
** colaboração: Roo Sonic (xai/grok-code-fast-1)
*/

/*
  Comando /up_role para gerenciar mensagens de parabéns por cargo.
  Permite configurar mensagens estáticas ou prompts para IA quando um usuário ganha um cargo específico.
*/

const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require('discord.js');
const database = require('../core/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('up_role')
    .setDescription('Gerenciar mensagens de parabéns por cargo')

    /*
      Subcomando: add
    */
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Adicionar ou atualizar mensagem de parabéns para um cargo')
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('O cargo para configurar')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('message')
            .setDescription('Texto da mensagem ou prompt para IA. Placeholders: {@USER} (menção), {USER} (nome), {ROLE} (nome do cargo), {@ROLE} (menção do cargo)')
            .setRequired(true))
        .addBooleanOption(option =>
          option.setName('isprompt')
            .setDescription('Se verdadeira, usa IA para gerar mensagem personalizada')
            .setRequired(true)))

    /*
      Subcomando: show
    */
    .addSubcommand(subcommand =>
      subcommand
        .setName('show')
        .setDescription('Mostrar mensagem de parabéns atual para um cargo')
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('O cargo para verificar')
            .setRequired(true)))

    /*
      Subcomando: delete
    */
    .addSubcommand(subcommand =>
      subcommand
        .setName('delete')
        .setDescription('Remover mensagem de parabéns para um cargo')
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('O cargo para remover configuração')
            .setRequired(true)))

    /*
      Restrição para administradores apenas
    */
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),

  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();
      const guildId = interaction.guild.id;

      console.log('[UP_ROLE][DEBUG] Subcommand:', subcommand);
      console.log('[UP_ROLE][DEBUG] Guild ID:', guildId);

      if (subcommand === 'add') {
        /*
          Subcomando: adicionar mensagem
        */
        const role = interaction.options.getRole('role');
        const message = interaction.options.getString('message');
        const isPrompt = interaction.options.getBoolean('isprompt');

        try {
          database.setRoleCongratsConfig(guildId, role.id, message, isPrompt);
          const promptText = isPrompt ? ' (como prompt para IA)' : ' (mensagem estática)';
          await interaction.reply({
            content: `✅ Mensagem de parabéns para o cargo ${role} configurada com sucesso${promptText}:\n\`${message}\``,
            flags: [MessageFlags.Ephemeral]
          });
        } catch (error) {
          console.error('[UP_ROLE][ERROR] Falha ao salvar mensagem:', error);
          await interaction.reply({
            content: '❌ Erro ao salvar a mensagem. Tente novamente.',
            flags: [MessageFlags.Ephemeral]
          });
        }

      } else if (subcommand === 'show') {
        /*
          Subcomando: mostrar mensagem atual
        */
        const role = interaction.options.getRole('role');

        console.log('[UP_ROLE][DEBUG] Showing config for role:', role.id);
        try {
          const configs = database.listRoleCongratsConfigs(guildId);
          const config = configs.find(c => c.roleId === role.id);

          if (!config) {
            console.log('[UP_ROLE][DEBUG] No config found for role');
            await interaction.reply({
              content: `📭 Nenhuma mensagem de parabéns configurada para o cargo ${role}.`,
              flags: [MessageFlags.Ephemeral]
            });
          } else {
            const promptText = config.isPrompt ? ' (usando IA)' : ' (estática)';
            await interaction.reply({
              content: `📋 Mensagem de parabéns atual para o cargo ${role}${promptText}:\n\`${config.prompt}\``,
              flags: [MessageFlags.Ephemeral]
            });
          }
        } catch (error) {
          console.error('[UP_ROLE][ERROR] Falha ao buscar mensagem:', error);
          await interaction.reply({
            content: '❌ Erro ao buscar a mensagem atual. Tente novamente.',
            flags: [MessageFlags.Ephemeral]
          });
        }

      } else if (subcommand === 'delete') {
        /*
          Subcomando: deletar mensagem
        */
        const role = interaction.options.getRole('role');

        try {
          const changes = database.clearRoleCongratsConfig(guildId, role.id);

          if (changes > 0) {
            await interaction.reply({
              content: `🗑️ Mensagem de parabéns para o cargo ${role} removida com sucesso.`,
              flags: [MessageFlags.Ephemeral]
            });
          } else {
            await interaction.reply({
              content: `📭 Nenhuma mensagem de parabéns estava configurada para o cargo ${role}.`,
              flags: [MessageFlags.Ephemeral]
            });
          }
        } catch (error) {
          console.error('[UP_ROLE][ERROR] Falha ao deletar mensagem:', error);
          await interaction.reply({
            content: '❌ Erro ao remover a mensagem. Tente novamente.',
            flags: [MessageFlags.Ephemeral]
          });
        }
      }

    } catch (error) {
      console.error('[UP_ROLE][ERROR] Erro geral no comando:', error);
      await interaction.reply({
        content: '❌ Ocorreu um erro inesperado. Contate um administrador.',
        flags: [MessageFlags.Ephemeral]
      });
    }
  }
};