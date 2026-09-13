/*
** caminho: commands/canal_noticia.js
** últimaMod: 2025-10-04 01:15
** autor: Vico
** colaboração: Grok Code (Fast) e Claude
*/

/*
  Comando para configurar o canal de notícias do servidor.
  Permite aos moderadores definir qual canal (fórum ou texto) será usado para postar notícias.
  Suporta webhooks manuais para canais de fórum.
*/

const {
  SlashCommandBuilder,
  PermissionsBitField,
  MessageFlags,
  ChannelType
} = require('discord.js');
const database = require('../core/database');

/**
 * Extrai ID e token de uma URL de webhook do Discord
 */
function parseWebhookUrl(url) {
  const match = url.match(/discord(?:app)?\.com\/api\/webhooks\/(\d+)\/([a-zA-Z0-9_-]+)/);
  if (!match) return null;
  return {
    id: match[1],
    token: match[2]
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('canal-noticia')
    .setDescription('Define o canal onde as notícias serão postadas.')
    .addChannelOption(option =>
      option
        .setName('canal')
        .setDescription('O canal de fórum ou texto para notícias')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildForum, ChannelType.GuildText)
    )
    .addStringOption(option =>
      option
        .setName('webhook-url')
        .setDescription('URL do webhook (obrigatório para fóruns, opcional para texto)')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
    .setDMPermission(false),

  async execute(interaction) {
    const channel = interaction.options.getChannel('canal');
    const webhookUrl = interaction.options.getString('webhook-url');

    // Validação do tipo de canal
    if (channel.type !== ChannelType.GuildForum && channel.type !== ChannelType.GuildText) {
      return interaction.reply({
        content: '❌ O canal selecionado deve ser um canal de fórum ou de texto.',
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
      // Salvar canal no banco de dados
      database.setNewsChannel(interaction.guild.id, channel.id);

      let webhookInfo = null;
      let webhookCreated = false;

      // Se webhook URL foi fornecida, validar e usar
      if (webhookUrl) {
        const parsed = parseWebhookUrl(webhookUrl);
        if (!parsed) {
          return interaction.reply({
            content: '❌ URL de webhook inválida. Use o formato: `https://discord.com/api/webhooks/ID/TOKEN`',
            flags: [MessageFlags.Ephemeral]
          });
        }

        // Verificar se o webhook é válido
        try {
          const webhook = await interaction.client.fetchWebhook(parsed.id, parsed.token);
          
          // Verificar se o webhook pertence ao canal correto
          if (webhook.channelId !== channel.id) {
            return interaction.reply({
              content: `❌ Este webhook não pertence ao canal ${channel}. Crie um webhook específico para este canal.`,
              flags: [MessageFlags.Ephemeral]
            });
          }

          database.setWebhook(interaction.guild.id, parsed.id, parsed.token);
          webhookInfo = { id: parsed.id, token: parsed.token };
          console.log('[CANAL-NOTICIA][INFO] Webhook manual configurado:', parsed.id);

        } catch (webhookError) {
          console.error('[CANAL-NOTICIA][ERROR] Webhook inválido:', webhookError);
          return interaction.reply({
            content: '❌ Não foi possível validar o webhook. Verifique se a URL está correta e o webhook ainda existe.',
            flags: [MessageFlags.Ephemeral]
          });
        }
      } 
      // Se não foi fornecido webhook e é canal de TEXTO, tentar criar automaticamente
      else if (channel.type === ChannelType.GuildText) {
        try {
          const webhook = await channel.createWebhook({
            name: 'Plantão Vico\'s Manor',
            avatar: interaction.client.user.displayAvatarURL({ dynamic: true })
          });
          
          database.setWebhook(interaction.guild.id, webhook.id, webhook.token);
          webhookInfo = { id: webhook.id, token: webhook.token };
          webhookCreated = true;
          console.log('[CANAL-NOTICIA][INFO] Webhook criado automaticamente:', webhook.id);

        } catch (webhookError) {
          console.error('[CANAL-NOTICIA][ERROR] Erro ao criar webhook:', webhookError);
          return interaction.reply({
            content: '⚠️ Não foi possível criar o webhook automaticamente. Use o parâmetro `webhook-url` para fornecer um webhook criado manualmente.',
            flags: [MessageFlags.Ephemeral]
          });
        }
      }
      // Se é FÓRUM e não foi fornecido webhook, avisar
      else if (channel.type === ChannelType.GuildForum) {
        return interaction.reply({
          content: `⚠️ Para canais de fórum, você precisa fornecer uma URL de webhook.\n\n` +
                   `**Como criar um webhook:**\n` +
                   `1. Vá nas configurações do canal ${channel}\n` +
                   `2. Clique em "Integrações" → "Webhooks" → "Novo Webhook"\n` +
                   `3. Copie a URL do webhook\n` +
                   `4. Execute novamente: \`/canal-noticia canal:${channel.name} webhook-url:[URL]\``,
          flags: [MessageFlags.Ephemeral]
        });
      }

      const tipoCanal = channel.type === ChannelType.GuildForum ? 'fórum' : 'texto';
      const webhookStatus = webhookCreated 
        ? ' (webhook criado automaticamente)' 
        : webhookInfo 
          ? ' (webhook configurado)' 
          : '';
      
      await interaction.reply({
        content: `✅ Canal de notícias (${tipoCanal}) definido com sucesso${webhookStatus}!\n` +
                 `As notícias serão postadas no canal ${channel}.`,
        flags: [MessageFlags.Ephemeral]
      });

    } catch (error) {
      console.error('[CANAL-NOTICIA][ERROR] Erro ao salvar canal de notícias:', error);
      await interaction.reply({
        content: '❌ Ocorreu um erro ao salvar a configuração. Tente novamente.',
        flags: [MessageFlags.Ephemeral]
      });
    }
  }
};