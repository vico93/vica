// Arquivo: events/messageCreate.js

const oai = require('../core/oai_interface');
const database = require('../core/database');

// Função para remover caracteres repetidos em sequência
function removerRepetidos(texto) {
  return texto.toLowerCase().replace(/(.)\1+/g, '$1');
}

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    // Verificações iniciais
    if (message.author.bot || !message.guild) return;

    const guildId = message.guild.id;
    const canalId = message.channel.id;
    const usuarioId = message.author.id;

    // ===============================================
    //           LÓGICA DE GANHO DE XP
    // ===============================================
    try {
      // 1. Verifica se o canal está na blacklist de XP
      if (!(await database.xpCanalNaBlacklist(guildId, canalId))) {
        const agora = Date.now();
        const usuarioXP = await database.buscarUsuarioXP(guildId, usuarioId) || { ultima_mensagem_timestamp: 0 };
        const cooldown = 5000; // 5 segundos

        if (agora - usuarioXP.ultima_mensagem_timestamp > cooldown) {
          const textoLimpo = removerRepetidos(message.content);

          if (message.content.length > 5 && textoLimpo.length > 12) {
            const xpMin = Math.ceil(textoLimpo.length / 7);
            const xpMax = Math.ceil(textoLimpo.length / 4);
            let xpGanho = Math.floor(Math.random() * (xpMax - xpMin + 1)) + xpMin;
            xpGanho = Math.min(xpGanho, 35);

            // Busca o multiplicador de XP do usuário
            const userRoles = Array.from(message.member.roles.cache.keys());
            const multipliers = await database.buscarMultiplicadoresParaUsuario(guildId, userRoles);
            const multiplicadorFinal = multipliers.length > 0 ? Math.max(...multipliers) : 1;
            const xpFinal = Math.ceil(xpGanho * multiplicadorFinal);

            if (xpFinal > 0) {
              const levelUpInfo = await database.atualizarUsuarioXP(guildId, usuarioId, xpFinal, agora);
              if (levelUpInfo.levelUp) {
                await message.channel.send(`🎉 Parabéns, <@${usuarioId}>! Você avançou para o nível **${levelUpInfo.novoNivel}**!`);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('[ERRO-XP] Falha ao processar XP para o usuário:', usuarioId, err);
    }

    // ===============================================
    //         LÓGICA DE RESPOSTA DO CHATBOT
    // ===============================================

    // 1. Verifica se o canal está na blacklist do CHATBOT
    if (await database.chatbotCanalNaBlacklist(guildId, canalId)) return;
    
    // 2. Verifica se o bot foi mencionado
    const botId = client.user.id;
    const foiMencionadoDiretamente = message.mentions.has(botId);
    const foiRespondidoComMention = message.reference && (await message.channel.messages.fetch(message.reference.messageId)).author.id === botId;

    // Se não foi mencionado de nenhuma forma, para aqui.
    if (!foiMencionadoDiretamente && !foiRespondidoComMention) return;

    // Se foi mencionado, continua para gerar a resposta
    try {
      // Salva a mensagem no banco para o histórico do chatbot
      await database.inserirMensagem(
        guildId,
        canalId,
        usuarioId,
        message.content,
        message.createdTimestamp
      );
        
      // Remove a menção para usar só o texto limpo
      const prompt = message.content.replace(`<@${botId}>`, '').trim();

      // Busca o último response_id para manter o contexto
      const lastResponseId = await database.buscarUltimoResponseId(guildId, canalId, usuarioId);

      // Verifica se a mensagem tem anexo de imagem para enviar à API
      let imageUrl = null;
      if (message.attachments.size > 0) {
        const attachment = message.attachments.find(a => a.contentType?.startsWith('image'));
        if (attachment) {
          imageUrl = attachment.url;
        }
      }

      // Gera a resposta contextual usando o prompt, imagem e lastResponseId
      const respostaObj = await oai.gerarRespostaContextual(prompt, imageUrl, lastResponseId);

      // Atualiza o último response_id no banco
      if (respostaObj.response_id) {
        await database.atualizarUltimoResponseId(guildId, canalId, usuarioId, respostaObj.response_id);
      }

      // Envia a resposta no canal, respondendo à mensagem original
      await message.reply({
        content: respostaObj.texto,
        failIfNotExists: false
      });

    } catch (err) {
      console.error('[ERRO-CHATBOT] Falha ao responder:', err);
      await message.reply({
        content: `Deu um tilt aqui nos meus circuitos, não consegui processar sua mensagem. 😢`,
        failIfNotExists: false
      });
    }
  }
};