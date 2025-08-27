/*
** caminho: commands/comment.js
** últimaMod: 2025-08-27 00:38
** autor: Vico
** colaboração: Roo Sonic
*/

/*
 * Comando /comment para gerar comentários sobre conversas recentes
 * Analisa as últimas mensagens do canal e gera um comentário inteligente
 */

const {
  SlashCommandBuilder,
  MessageFlags
} = require('discord.js');
const database = require('../core/database');
const oaiInterface = require('../core/oai_interface');
const config = require('../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('comment')
    .setDescription('Gera um comentário sobre as últimas mensagens do canal')
    .addIntegerOption(option =>
      option.setName('number')
        .setDescription('Número de mensagens recentes para analisar (máx. 20)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(20)),

  async execute(interaction) {
    const number = interaction.options.getInteger('number');
    const channel = interaction.channel;
    const guild = interaction.guild;

    try {
      /* --- BUSCAR HISTÓRICO DE MENSAGENS --- */
      const messageHistory = database.buscarHistoricoCanal(guild.id, channel.id, number);

      if (messageHistory.length === 0) {
        return interaction.reply({
          content: '❌ Não há mensagens suficientes no histórico deste canal.',
          flags: [MessageFlags.Ephemeral]
        });
      }

      /* --- BUSCAR CONTEÚDO DAS MENSAGENS --- */
      const messages = [];
      const participants = new Set();

      for (const record of messageHistory) {
        try {
          const message = await channel.messages.fetch(record.message_id);
          if (!message.author.bot) { // Excluir mensagens de bots
            const nickname = message.member?.displayName || message.author.displayName || message.author.username;
            participants.add(nickname);
            messages.push({
              nickname,
              content: message.content
            });
          }
        } catch (error) {
          // Mensagem pode ter sido deletada, continuar
          console.log(`[COMMENT] Mensagem ${record.message_id} não encontrada, pulando...`);
        }
      }

      if (messages.length === 0) {
        return interaction.reply({
          content: '❌ Não há mensagens de usuários no histórico (apenas bots).',
          flags: [MessageFlags.Ephemeral]
        });
      }

      /* --- FORMATAR CONVERSA --- */
      const participantList = Array.from(participants).join(', ');
      let conversationText = `**Participantes:** ${participantList}\n\n`;

      for (const msg of messages) {
        conversationText += `${msg.nickname}: ${msg.content}\n`;
      }

      /* --- VERIFICAR LIMITE DE CARACTERES --- */
      const maxChars = config.settings.maxTokens; // Usando como limite de caracteres
      if (conversationText.length > maxChars) {
        return interaction.reply({
          content: `❌ Conversa muito longa (${conversationText.length} caracteres, máximo ${maxChars}). Reduza o número de mensagens.`,
          flags: [MessageFlags.Ephemeral]
        });
      }

      /* --- GERAR COMENTÁRIO VIA API --- */
      console.log(`[COMMENT] Gerando comentário para ${messages.length} mensagens (${conversationText.length} chars)`);

      const comment = await oaiInterface.gerarComentarioViaAPI(conversationText);

      /* --- RESPONDER NO CANAL --- */
      await interaction.reply(comment);

    } catch (error) {
      console.error('[COMMENT][ERROR] Erro ao executar comando:', error);

      if (!interaction.replied) {
        await interaction.reply({
          content: '❌ Ocorreu um erro ao gerar o comentário. Tente novamente.',
          flags: [MessageFlags.Ephemeral]
        });
      }
    }
  },
};