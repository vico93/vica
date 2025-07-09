// Arquivo: events/messageReactionAdd.js

const oai = require('../core/oai_interface');
const config = require('../config.json');

// O ID do seu emoji customizado :vica:
const VICA_EMOJI_ID = config.discord.reactionEmojiId;

module.exports = {
  name: 'messageReactionAdd',
  async execute(reaction, user) {
    // Ignora reações de bots
    if (user.bot) return;

    // Verifica se a reação é o emoji correto
    // Se o ID do emoji não estiver configurado, a função não faz nada.
    if (!VICA_EMOJI_ID || reaction.emoji.id !== VICA_EMOJI_ID) {
      return;
    }

    try {
      // Garante que temos as informações completas da mensagem (importante para mensagens antigas)
      if (reaction.message.partial) await reaction.message.fetch();
      const message = reaction.message;

      // Ignora reações em mensagens de bots (incluindo as da própria Vica)
      if (message.author.bot) return;

      // Pega as informações necessárias da mensagem original
      const guildId = message.guild.id;
      const canalId = message.channel.id;
      const usuarioId = message.author.id; // O autor da MENSAGEM, não de quem reagiu
      const prompt = message.content;

      // Se o prompt estiver vazio (ex: só uma imagem), não faz nada
      if (!prompt) return;

      console.log(`[REACTION] Gatilho de reação por ${user.username} na mensagem de ${message.author.username}.`);

      // Mostra o indicador "Digitando..."
      await message.channel.sendTyping();

      // Chama a IA com o conteúdo da mensagem que recebeu a reação
      const textoResposta = await oai.gerarRespostaContextual(guildId, canalId, usuarioId, prompt);

      // Responde à mensagem original
      await message.reply({
        content: textoResposta,
        failIfNotExists: false
      });

    } catch (error) {
      console.error('[ERRO-REACTION] Falha ao processar a reação:', error);
    }
  },
};