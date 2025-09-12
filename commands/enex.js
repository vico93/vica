/*
** caminho: commands/enex.js
** últimaMod: 2025-09-11 21:21
** autor: Vico
** colaboração: Roo Sonic (xai/grok-code-fast-1)
*/

/*
  Comando /enex para gerenciar mensagens de entrada/saída (join/leave/kick/ban).
  Permite configurar mensagens estáticas ou prompts para IA quando ocorrem eventos específicos.
*/

const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require('discord.js');
const database = require('../core/database');

/*
  Mapeamento de tipos de mensagem para nomes amigáveis (compatível com config existente)
*/
const JOIN_LEAVE_TYPES = {
  welcome: '👋 Boas-vindas',
  leave: '🚪 Saída (Normal)',
  kick: '👢 Saída (Expulsão)',
  ban: '🚫 Saída (Banimento)'
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('enex')
    .setDescription('Gerenciar mensagens de entrada e saída do servidor')

    /*
      Subcommand group: join (boas-vindas)
    */
    .addSubcommandGroup(group =>
      group
        .setName('join')
        .setDescription('Configurar mensagens de boas-vindas')
        .addSubcommand(subcommand =>
          subcommand
            .setName('add')
            .setDescription('Adicionar mensagem de boas-vindas')
            .addStringOption(option =>
              option.setName('message')
                .setDescription('Texto da mensagem ou prompt para IA')
                .setRequired(true))
            .addBooleanOption(option =>
              option.setName('isprompt')
                .setDescription('Se verdadeira, usa IA para gerar mensagem personalizada')
                .setRequired(true)))
        .addSubcommand(subcommand =>
          subcommand
            .setName('show')
            .setDescription('Mostrar mensagem de boas-vindas atual'))
        .addSubcommand(subcommand =>
          subcommand
            .setName('delete')
            .setDescription('Remover mensagem de boas-vindas')))

    /*
      Subcommand group: leave (saída normal)
    */
    .addSubcommandGroup(group =>
      group
        .setName('leave')
        .setDescription('Configurar mensagens de saída normal')
        .addSubcommand(subcommand =>
          subcommand
            .setName('add')
            .setDescription('Adicionar mensagem de saída')
            .addStringOption(option =>
              option.setName('message')
                .setDescription('Texto da mensagem ou prompt para IA')
                .setRequired(true))
            .addBooleanOption(option =>
              option.setName('isprompt')
                .setDescription('Se verdadeira, usa IA para gerar mensagem personalizada')
                .setRequired(true)))
        .addSubcommand(subcommand =>
          subcommand
            .setName('show')
            .setDescription('Mostrar mensagem de saída atual'))
        .addSubcommand(subcommand =>
          subcommand
            .setName('delete')
            .setDescription('Remover mensagem de saída')))

    /*
      Subcommand group: kick (expulsão)
    */
    .addSubcommandGroup(group =>
      group
        .setName('kick')
        .setDescription('Configurar mensagens de expulsão')
        .addSubcommand(subcommand =>
          subcommand
            .setName('add')
            .setDescription('Adicionar mensagem de expulsão')
            .addStringOption(option =>
              option.setName('message')
                .setDescription('Texto da mensagem ou prompt para IA')
                .setRequired(true))
            .addBooleanOption(option =>
              option.setName('isprompt')
                .setDescription('Se verdadeira, usa IA para gerar mensagem personalizada')
                .setRequired(true)))
        .addSubcommand(subcommand =>
          subcommand
            .setName('show')
            .setDescription('Mostrar mensagem de expulsão atual'))
        .addSubcommand(subcommand =>
          subcommand
            .setName('delete')
            .setDescription('Remover mensagem de expulsão')))

    /*
      Subcommand group: ban (banimento)
    */
    .addSubcommandGroup(group =>
      group
        .setName('ban')
        .setDescription('Configurar mensagens de banimento')
        .addSubcommand(subcommand =>
          subcommand
            .setName('add')
            .setDescription('Adicionar mensagem de banimento')
            .addStringOption(option =>
              option.setName('message')
                .setDescription('Texto da mensagem ou prompt para IA')
                .setRequired(true))
            .addBooleanOption(option =>
              option.setName('isprompt')
                .setDescription('Se verdadeira, usa IA para gerar mensagem personalizada')
                .setRequired(true)))
        .addSubcommand(subcommand =>
          subcommand
            .setName('show')
            .setDescription('Mostrar mensagem de banimento atual'))
        .addSubcommand(subcommand =>
          subcommand
            .setName('delete')
            .setDescription('Remover mensagem de banimento')))

    /*
      Restrição para administradores apenas
    */
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),

  async execute(interaction) {
    try {
      const subcommandGroup = interaction.options.getSubcommandGroup();
      const subcommand = interaction.options.getSubcommand();
      const guildId = interaction.guild.id;

      console.log('[ENEX][DEBUG] Subcommand group:', subcommandGroup);
      console.log('[ENEX][DEBUG] Subcommand:', subcommand);
      console.log('[ENEX][DEBUG] Guild ID:', guildId);

      /*
        Determinar o tipo baseado no subcommand group
      */
      const type = subcommandGroup; // join, leave, kick, ban

      console.log('[ENEX][DEBUG] Type determined:', type);
      console.log('[ENEX][DEBUG] JOIN_LEAVE_TYPES keys:', Object.keys(JOIN_LEAVE_TYPES));
      console.log('[ENEX][DEBUG] JOIN_LEAVE_TYPES[type]:', JOIN_LEAVE_TYPES[type]);

      if (subcommand === 'add') {
        /*
          Subcomando: adicionar mensagem
        */
        const message = interaction.options.getString('message');
        const isPrompt = interaction.options.getBoolean('isprompt');

        try {
          database.setMessageByType(guildId, type, message, isPrompt);
          const promptText = isPrompt ? ' (como prompt para IA)' : ' (mensagem estática)';
          await interaction.reply({
            content: `✅ Mensagem de ${JOIN_LEAVE_TYPES[type]} configurada com sucesso${promptText}:\n\`${message}\``,
            flags: [MessageFlags.Ephemeral]
          });
        } catch (error) {
          console.error('[ENEX][ERROR] Falha ao salvar mensagem:', error);
          await interaction.reply({
            content: '❌ Erro ao salvar a mensagem. Tente novamente.',
            flags: [MessageFlags.Ephemeral]
          });
        }

      } else if (subcommand === 'show') {
        /*
          Subcomando: mostrar mensagem atual
        */
        console.log('[ENEX][DEBUG] In show subcommand, type:', type);
        console.log('[ENEX][DEBUG] Calling database.getMessageByType with type:', type);
        try {
          const currentMessage = database.getMessageByType(guildId, type);
          console.log('[ENEX][DEBUG] currentMessage result:', currentMessage);
          console.log('[ENEX][DEBUG] JOIN_LEAVE_TYPES[type] for display:', JOIN_LEAVE_TYPES[type]);

          if (!currentMessage) {
            console.log('[ENEX][DEBUG] No message found, replying with undefined display');
            await interaction.reply({
              content: `📭 Nenhuma mensagem de ${JOIN_LEAVE_TYPES[type]} configurada.`,
              flags: [MessageFlags.Ephemeral]
            });
          } else {
            const promptText = currentMessage.isPrompt ? ' (usando IA)' : ' (estática)';
            await interaction.reply({
              content: `📋 Mensagem atual de ${JOIN_LEAVE_TYPES[type]}${promptText}:\n\`${currentMessage.message}\``,
              flags: [MessageFlags.Ephemeral]
            });
          }
        } catch (error) {
          console.error('[ENEX][ERROR] Falha ao buscar mensagem:', error);
          await interaction.reply({
            content: '❌ Erro ao buscar a mensagem atual. Tente novamente.',
            flags: [MessageFlags.Ephemeral]
          });
        }

      } else if (subcommand === 'delete') {
        /*
          Subcomando: deletar mensagem
        */
        try {
          const changes = database.deleteMessageByType(guildId, type);

          if (changes > 0) {
            await interaction.reply({
              content: `🗑️ Mensagem de ${JOIN_LEAVE_TYPES[type]} removida com sucesso.`,
              flags: [MessageFlags.Ephemeral]
            });
          } else {
            await interaction.reply({
              content: `📭 Nenhuma mensagem de ${JOIN_LEAVE_TYPES[type]} estava configurada.`,
              flags: [MessageFlags.Ephemeral]
            });
          }
        } catch (error) {
          console.error('[ENEX][ERROR] Falha ao deletar mensagem:', error);
          await interaction.reply({
            content: '❌ Erro ao remover a mensagem. Tente novamente.',
            flags: [MessageFlags.Ephemeral]
          });
        }
      }

    } catch (error) {
      console.error('[ENEX][ERROR] Erro geral no comando:', error);
      await interaction.reply({
        content: '❌ Ocorreu um erro inesperado. Contate um administrador.',
        flags: [MessageFlags.Ephemeral]
      });
    }
  }
};