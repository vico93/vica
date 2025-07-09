// Arquivo: events/messageReactionAdd.js

const oai = require('../core/oai_interface');
const config = require('../config.json');

const VICA_EMOJI_ID = config.discord.reactionEmojiId;

module.exports = {
  name: 'messageReactionAdd',
  async execute(reaction, user) {
    // Garante que temos as informações completas da reação
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch (error) {
        console.error('Falha ao buscar a reação completa:', error);
        return;
      }
    }
    
    // Ignora reações de bots
    if (user.bot) return;

    if (!VICA_EMOJI_ID || reaction.emoji.id !== VICA_EMOJI_ID) {
      return;
    }

    try {
      if (reaction.message.partial) await reaction.message.fetch();
      const message = reaction.message;

      if (message.author.bot) return;

      const guildId = message.guild.id;
      const canalId = message.channel.id;
      const usuarioId = message.author.id;
      
      // --- LÓGICA DE PROMPT E IMAGEM ATUALIZADA ---
      let prompt = message.content;
      let imageUrl = null;

      // Verifica se há anexos na mensagem
      if (message.attachments.size > 0) {
        const attachment = message.attachments.first();
        if (attachment.contentType?.startsWith('image/')) {
          imageUrl = attachment.url;
        }
      }

      // Se não há texto NEM imagem, o bot não tem com o que trabalhar.
      if (!prompt && !imageUrl) {
        return;
      }

      // Se não há texto, mas HÁ uma imagem, cria um prompt padrão.
      if (!prompt && imageUrl) {
        prompt = "Em anexo...";
      }
      // --- FIM DA LÓGICA ATUALIZADA ---

      console.log(`[REACTION] Gatilho de reação por ${user.username} na mensagem de ${message.author.username}.`);

      await message.channel.sendTyping();

      const textoResposta = await oai.gerarRespostaContextual(guildId, canalId, usuarioId, prompt, imageUrl);

      await message.reply({
        content: textoResposta,
        failIfNotExists: false
      });

    } catch (error) {
      console.error('[ERRO-REACTION] Falha ao processar a reação:', error);
    }
  },
};