/*
**  caminho: events/messageReactionAdd.js
**  últimaMod: 16/07/2025 22:35
**  autor: Vico
**  colaboração: ChatGPT, Gemini, Kimi AI
*/

/*
  Evento disparado quando alguém reage com o emoji configurado.
  Responsabilidades:
  1. Ignorar bots e emojis errados;
  2. Verificar blacklist do canal;
  3. Gerar resposta via IA (respeitando imagem ou texto);
  4. Remover a reação do usuário para evitar spam (opcional).
*/

const oai      = require('../core/oai_interface');
const database = require('../core/database');   // <-- linha adicionada
const config   = require('../config.json');

const VICA_EMOJI_ID = config.discord.reactionEmojiId;

module.exports = {
  name: 'messageReactionAdd',
  async execute(reaction, user) {
    // Garante objeto completo
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch (err) {
        console.error('[VICA][REACTION] Falha ao buscar reação parcial:', err);
        return;
      }
    }

    // Filtros básicos
    if (user.bot) return;
    if (!VICA_EMOJI_ID || reaction.emoji.id !== VICA_EMOJI_ID) return;

    try {
      const message = reaction.message.partial
        ? await reaction.message.fetch()
        : reaction.message;

      if (message.author.bot) return;

      const guildId  = message.guild.id;
      const canalId  = message.channel.id;
      const usuarioId = message.author.id;

      // Respeita blacklist
      if (database.chatbotCanalNaBlacklist(guildId, canalId)) return;

      let prompt = message.content;
      let imageUrl = null;

      if (message.attachments.size) {
        const att = message.attachments.first();
        if (att.contentType?.startsWith('image/')) imageUrl = att.url;
      }

      if (!prompt && imageUrl) prompt = 'Em anexo...';
      if (!prompt && !imageUrl) return;

      console.log(`[VICA][REACTION] Gatilho por ${user.tag} na msg de ${message.author.tag}`);

      await message.channel.sendTyping();

      const resposta = await oai.gerarRespostaContextual(
        guildId, canalId, usuarioId, message.client.user.id, prompt, imageUrl
      );

      await message.reply({ content: resposta, failIfNotExists: false });

      // Remove reação para evitar spam
      try {
        await reaction.users.remove(user.id);
      } catch {
        /* ignora se faltar permissão */
      }
    } catch (err) {
      console.error('[VICA][REACTION] Falha ao processar reação:', err);
    }
  }
};