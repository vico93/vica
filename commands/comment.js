/*
** caminho: commands/comment.js
** últimaMod: 2025-08-27 00:52
** autor: Vico
** colaboração: Roo Sonic
*/

/*
 * Comando /comment para gerar comentários sobre conversas recentes
 * Analisa mensagens específicas do canal por intervalo e gera um comentário inteligente
 * Suporta agrupamento de mensagens consecutivas do mesmo usuário
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
    .setDescription('Gera um comentário sobre mensagens específicas do canal')
    .addIntegerOption(option =>
      option.setName('from')
        .setDescription('Posição inicial da mensagem (1 = mais recente)')
        .setRequired(true)
        .setMinValue(1))
    .addIntegerOption(option =>
      option.setName('to')
        .setDescription('Posição final da mensagem (deve ser >= from)')
        .setRequired(true)
        .setMinValue(1)),

  async execute(interaction) {
    const from = interaction.options.getInteger('from');
    const to = interaction.options.getInteger('to');
    const channel = interaction.channel;
    const guild = interaction.guild;

    /* --- VALIDAÇÃO DE PARÂMETROS --- */
    if (to < from) {
      return interaction.reply({
        content: '❌ O valor de `to` deve ser maior ou igual a `from`.',
        flags: [MessageFlags.Ephemeral]
      });
    }

    const limit = to - from + 1;
    const offset = from - 1;

    try {
      /* --- BUSCAR HISTÓRICO DE MENSAGENS POR INTERVALO --- */
      const messageHistory = database.buscarHistoricoCanalRange(guild.id, channel.id, limit, offset);

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

      /* --- FORMATAR CONVERSA COM AGRUPAMENTO --- */
      const participantList = Array.from(participants).join(', ');
      let conversationText = `**Participantes:** ${participantList}\n\n`;

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const prevMsg = i > 0 ? messages[i - 1] : null;

        if (prevMsg && msg.nickname === prevMsg.nickname) {
          // Mensagem consecutiva do mesmo usuário - indentar
          conversationText += `        ${msg.content}\n`;
        } else {
          // Primeira mensagem do usuário ou usuário diferente
          conversationText += `<${msg.nickname}>: ${msg.content}\n`;
        }
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