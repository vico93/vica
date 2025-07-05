const oai = require('../core/oai_interface');
const database = require('../core/database');

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (message.author.bot || !message.guild) return;

    const guildId = message.guild.id;
    const canalId = message.channel.id;
    const usuarioId = message.author.id;

    // Ignora canais na blacklist
    if (await database.canalNaBlacklist(guildId, canalId)) return;

    // Salva a mensagem no banco
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

    const botId = client.user.id;
    const foiMencionadoDiretamente = message.mentions.has(botId);
    const foiRespondidoComMention = (
      message.reference &&
      message.mentions.has(botId)
    );

    if (!foiMencionadoDiretamente && !foiRespondidoComMention) return;

    try {
      // Remove a menção para usar só o texto limpo
      const prompt = message.content.replace(`<@${botId}>`, '').trim();

      // Busca o último response_id para manter o contexto
      const lastResponseId = await database.buscarUltimoResponseId(guildId, canalId, usuarioId);

      // Verifica se a mensagem tem anexo de imagem para enviar à API
      let imageUrl = null;
      if (message.attachments.size > 0) {
        // Pega a URL do primeiro anexo que for imagem
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

      // Envia a resposta no canal, mencionando o usuário e reply na mensagem original
      await message.channel.send({
        content: `<@${usuarioId}> ${respostaObj.texto}`,
        reply: {
          messageReference: message.id,
          failIfNotExists: false
        }
      });
    } catch (err) {
      console.error('[ERRO] Falha ao responder:', err);
      await message.channel.send({
        content: `<@${usuarioId}> deu erro ao tentar responder 😢`,
        reply: {
          messageReference: message.id,
          failIfNotExists: false
        }
      });
    }
  }
};
