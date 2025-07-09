// Arquivo: events/messageReactionAdd.js

const oai = require('../core/oai_interface');
// --- MUDANÇA 1: Importar o arquivo de configuração ---
const config = require('../config.json');

// --- MUDANÇA 2: Usar o valor do config.json ---
const VICA_EMOJI_ID = config.discord.reactionEmojiId;

module.exports = {
  name: 'messageReactionAdd',
  async execute(reaction, user) {
    // Ignora reações de bots
    if (user.bot) return;

    // --- MUDANÇA 3: Adicionada uma verificação de segurança ---
    // Se o ID do emoji não estiver configurado, a função não faz nada.
    if (!VICA_EMOJI_ID || reaction.emoji.id !== VICA_EMOJI_ID) {
      return;
    }

    try {
      // Garante que temos as informações completas da mensagem
      if (reaction.message.partial) await reaction.message.fetch();
      const message = reaction.message;

      // Ignora reações em mensagens de bots
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