// Arquivo: events/messageReactionAdd.js (com uma pequena melhoria)

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
      const prompt = message.content;

      if (!prompt) return;

      console.log(`[REACTION] Gatilho de reação por ${user.username} na mensagem de ${message.author.username}.`);

      await message.channel.sendTyping();

      const textoResposta = await oai.gerarRespostaContextual(guildId, canalId, usuarioId, prompt);

      await message.reply({
        content: textoResposta,
        failIfNotExists: false
      });

    } catch (error) {
      console.error('[ERRO-REACTION] Falha ao processar a reação:', error);
    }
  },
};