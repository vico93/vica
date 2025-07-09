// Arquivo: events/messageCreate.js

const oai = require('../core/oai_interface');
const database = require('../core/database');

// Função para remover caracteres repetidos
function removerRepetidos(texto) {
  return texto.toLowerCase().replace(/(.)\1+/g, '$1');
}

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    // Ignora mensagens de bots ou de MDs
    if (message.author.bot || !message.guild) return;

    const guildId = message.guild.id;
    const canalId = message.channel.id;
    const usuarioId = message.author.id;

    // Lógica de XP
    try {
      if (!(await database.xpCanalNaBlacklist(guildId, canalId))) {
        const agora = Date.now();
        const usuarioXP = await database.buscarUsuarioXP(guildId, usuarioId) || { ultima_mensagem_timestamp: 0 };
        const cooldown = 5000;

        if (agora - usuarioXP.ultima_mensagem_timestamp > cooldown) {
          const textoLimpo = removerRepetidos(message.content);
          if (message.content.length > 5 && textoLimpo.length > 12) {
            const xpMin = Math.ceil(textoLimpo.length / 7);
            const xpMax = Math.ceil(textoLimpo.length / 4);
            let xpGanho = Math.floor(Math.random() * (xpMax - xpMin + 1)) + xpMin;
            xpGanho = Math.min(xpGanho, 35);

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

    // Lógica do Chatbot

    // 1. Verifica se o canal está na blacklist do CHATBOT
    if (await database.chatbotCanalNaBlacklist(guildId, canalId)) return;
    
    const botId = client.user.id;
    const foiMencionadoDiretamente = message.mentions.has(botId);
    const foiRespondidoComMention = message.reference && (await message.channel.messages.fetch(message.reference.messageId)).author.id === botId;

    // Salva a mensagem no banco ANTES de verificar a menção, para que todo o histórico seja registrado
    try {
      await database.inserirMensagem(
        guildId,
        canalId,
        usuarioId,
        message.content,
        message.createdTimestamp
      );
    } catch (err) {
      console.error('[DB] Erro ao inserir mensagem:', err);
    }

    if (!foiMencionadoDiretamente && !foiRespondidoComMention) return;

    try {
      await message.channel.sendTyping();
      
      const prompt = message.content.replace(/<@!?\d+>/g, '').trim();

      // --- VERIFICAÇÃO DE IMAGENS ---
      let imageUrl = null;
      if (message.attachments.size > 0) {
        const attachment = message.attachments.first();
        if (attachment.contentType?.startsWith('image/')) {
          imageUrl = attachment.url;
        }
      }
      // --- FIM DA VERIFICAÇÃO ---

      // Chama a função contextual passando a URL da imagem (ou null)
      const textoResposta = await oai.gerarRespostaContextual(guildId, canalId, usuarioId, prompt, imageUrl);

      await message.reply({
        content: textoResposta,
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