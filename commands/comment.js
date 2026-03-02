/*
** caminho: commands/comment.js
** últimaMod: 2026-03-02 19:05
** autor: Vico
** colaboração: Roo Sonic, OpenAI Codex
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
const {
  isUnknownInteraction,
  safeDeferReply,
  safeEditReply,
  safeReply
} = require('../core/discord_interaction');

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
    console.log('[COMMENT][START] Comando iniciado com parâmetros from/to');

    const from = interaction.options.getInteger('from');
    const to = interaction.options.getInteger('to');
    const channel = interaction.channel;
    const guild = interaction.guild;

    console.log(`[COMMENT][PARAMS] from=${from}, to=${to}, channel=${channel?.id}, guild=${guild?.id}`);

    try {
      await safeDeferReply(interaction);
      console.log('[COMMENT][DEFER] Interação reconhecida, processando em segundo plano');

      /* --- VALIDAÇÃO DE PARÂMETROS --- */
      if (to < from) {
        console.log('[COMMENT][VALIDATION] Parâmetros inválidos: to < from');
        return safeEditReply(interaction, {
          content: '❌ O valor de `to` deve ser maior ou igual a `from`.'
        });
      }

      const limit = to - from + 1;
      const offset = from - 1;
      console.log(`[COMMENT][CALC] limit=${limit}, offset=${offset}`);

      /* --- BUSCAR HISTÓRICO DE MENSAGENS POR INTERVALO --- */
      console.log('[COMMENT][DB] Buscando histórico no banco de dados...');
      const messageHistory = database.buscarHistoricoCanalRange(guild.id, channel.id, limit, offset);
      console.log(`[COMMENT][DB] Encontradas ${messageHistory.length} mensagens no histórico`);

      if (messageHistory.length === 0) {
        console.log('[COMMENT][DB] Nenhum histórico encontrado');
        return safeEditReply(interaction, {
          content: '❌ Não há mensagens suficientes no histórico deste canal.'
        });
      }

      /* --- BUSCAR CONTEÚDO DAS MENSAGENS --- */
      console.log('[COMMENT][FETCH] Buscando conteúdo das mensagens...');
      const messages = [];
      const participants = new Set();

      for (const record of messageHistory) {
        try {
          console.log(`[COMMENT][FETCH] Buscando mensagem ${record.message_id}`);
          const message = await channel.messages.fetch(record.message_id);
          if (!message.author.bot) { // Excluir mensagens de bots
            const nickname = message.member?.displayName || message.author.displayName || message.author.username;
            participants.add(nickname);
            messages.push({
              nickname,
              content: message.content
            });
            console.log(`[COMMENT][FETCH] Mensagem adicionada: ${nickname}`);
          } else {
            console.log(`[COMMENT][FETCH] Mensagem de bot pulada`);
          }
        } catch (error) {
          // Mensagem pode ter sido deletada, continuar
          console.log(`[COMMENT][FETCH] Mensagem ${record.message_id} não encontrada:`, error.message);
        }
      }

      console.log(`[COMMENT][FETCH] Total de mensagens válidas: ${messages.length}`);

      if (messages.length === 0) {
        console.log('[COMMENT][FETCH] Nenhuma mensagem válida encontrada');
        return safeEditReply(interaction, {
          content: '❌ Não há mensagens de usuários no histórico (apenas bots).'
        });
      }

      /* --- FORMATAR CONVERSA COM AGRUPAMENTO --- */
      console.log('[COMMENT][FORMAT] Formatando conversa...');
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

      console.log(`[COMMENT][FORMAT] Texto formatado com ${conversationText.length} caracteres`);

      /* --- VERIFICAR LIMITE DE CARACTERES --- */
      const maxChars = config.settings.maxTokens; // Usando como limite de caracteres
      console.log(`[COMMENT][LIMIT] Verificando limite: ${conversationText.length}/${maxChars}`);

      if (conversationText.length > maxChars) {
        console.log('[COMMENT][LIMIT] Texto muito longo, rejeitando');
        return safeEditReply(interaction, {
          content: `❌ Conversa muito longa (${conversationText.length} caracteres, máximo ${maxChars}). Reduza o número de mensagens.`
        });
      }

      /* --- GERAR COMENTÁRIO VIA API --- */
      console.log(`[COMMENT][API] Enviando para API: ${messages.length} mensagens (${conversationText.length} chars)`);

      const comment = await oaiInterface.gerarComentarioViaAPI(conversationText);

      console.log(`[COMMENT][API] Resposta recebida, tamanho: ${comment.length}`);

      /* --- RESPONDER NO CANAL --- */
      console.log('[COMMENT][REPLY] Enviando resposta...');
      await safeEditReply(interaction, comment);
      console.log('[COMMENT][SUCCESS] Comando executado com sucesso');

    } catch (error) {
      if (isUnknownInteraction(error)) {
        console.warn('[COMMENT][WARN] Interação expirou antes da resposta final (code 10062).');
        return;
      }

      console.error('[COMMENT][ERROR] Erro ao executar comando:', error);
      console.error('[COMMENT][ERROR] Stack trace:', error.stack);

      console.log('[COMMENT][ERROR] Enviando resposta de erro...');
      const payload = {
        content: '❌ Ocorreu um erro ao gerar o comentário. Tente novamente.'
      };

      try {
        if (interaction.deferred || interaction.replied) {
          await safeEditReply(interaction, payload);
        } else {
          await safeReply(interaction, { ...payload, flags: MessageFlags.Ephemeral });
        }
      } catch (replyError) {
        console.error('[COMMENT][ERROR] Falha ao enviar mensagem de erro:', replyError);
      }
    }
  },
};
