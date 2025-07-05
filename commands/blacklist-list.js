// Arquivo: commands/blacklist-list.js

const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require('discord.js');
const database = require('../core/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('blacklist-list')
    .setDescription('Lista todos os canais que estão na blacklist do bot.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels) // Só para administradores
    .setDMPermission(false), // Não funciona em DMs

  async execute(interaction) {
    try {
      const guildId = interaction.guild.id;
      const canaisNaBlacklist = await database.listarCanaisBlacklist(guildId);

      // Se a lista estiver vazia
      if (canaisNaBlacklist.length === 0) {
        return interaction.reply({
          content: '✅ Não há nenhum canal na blacklist deste servidor.',
          flags: [MessageFlags.Ephemeral] // Resposta visível apenas para o usuário
        });
      }

      // Se houver canais, formata a lista para exibição
      // O formato <#ID_DO_CANAL> cria um link clicável para o canal no Discord
      const listaFormatada = canaisNaBlacklist
        .map(row => `- <#${row.canal_id}>`)
        .join('\n');

      const resposta = `**🚫 Canais na blacklist deste servidor:**\n${listaFormatada}`;

      await interaction.reply({
        content: resposta,
        flags: [MessageFlags.Ephemeral]
      });

    } catch (err) {
      console.error('[BLACKLIST-LIST] Erro ao listar canais:', err);
      await interaction.reply({
        content: '❌ Ocorreu um erro ao tentar buscar a lista da blacklist.',
        flags: [MessageFlags.Ephemeral]
      });
    }
  }
};