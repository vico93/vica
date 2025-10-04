/*
** caminho: commands/canal_noticia.js
** últimaMod: 2025-10-04 00:35
** autor: Vico
** colaboração: Grok Code (Fast)
*/

/*
  Comando para configurar o canal de notícias do servidor.
  Permite aos moderadores definir qual canal de fórum será usado para postar notícias.
*/

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  PermissionsBitField,
  MessageFlags,
  ComponentType,
  ChannelType
} = require('discord.js');
const database = require('../core/database');

/**
 * Gera ID único para componentes baseado no usuário
 */
function generateComponentId(userId, type) {
  return `${type}_${userId}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('canal-noticia')
    .setDescription('Define o canal de fórum onde as notícias serão postadas.')
    .addChannelOption(option =>
      option
        .setName('canal')
        .setDescription('O canal de fórum para notícias')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildForum)
    )
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
    .setDMPermission(false),

  async execute(interaction) {
    const channel = interaction.options.getChannel('canal');

    // Validação adicional do tipo de canal
    if (channel.type !== ChannelType.GuildForum) {
      return interaction.reply({
        content: '❌ O canal selecionado deve ser um canal de fórum.',
        flags: [MessageFlags.Ephemeral]
      });
    }

    // Verificar se o bot tem acesso ao canal
    if (!channel.permissionsFor(interaction.guild.members.me).has(PermissionsBitField.Flags.ViewChannel)) {
      return interaction.reply({
        content: '❌ O bot não tem acesso ao canal selecionado.',
        flags: [MessageFlags.Ephemeral]
      });
    }

    try {
      // Salvar no banco de dados
      const changes = database.setNewsChannel(interaction.guild.id, channel.id);

      if (changes > 0) {
        // Criar webhook para o canal de notícias
        try {
          const webhook = await channel.createWebhook({
            name: 'Vica News',
            avatar: interaction.guild.iconURL({ dynamic: true })
          });
          database.setWebhook(interaction.guild.id, webhook.id);
          console.log('[CANAL-NOTICIA][INFO] Webhook criado com sucesso:', webhook.id);
        } catch (webhookError) {
          console.error('[CANAL-NOTICIA][ERROR] Erro ao criar webhook:', webhookError);
          // Continua mesmo com erro no webhook
        }

        await interaction.reply({
          content: `✅ Canal de notícias definido com sucesso! As notícias serão postadas no canal ${channel}.`,
          flags: [MessageFlags.Ephemeral]
        });
      } else {
        await interaction.reply({
          content: `ℹ️ O canal ${channel} já estava configurado como canal de notícias.`,
          flags: [MessageFlags.Ephemeral]
        });
      }
    } catch (error) {
      console.error('[CANAL-NOTICIA][ERROR] Erro ao salvar canal de notícias:', error);
      await interaction.reply({
        content: '❌ Ocorreu um erro ao salvar a configuração. Tente novamente.',
        flags: [MessageFlags.Ephemeral]
      });
    }
  }
};