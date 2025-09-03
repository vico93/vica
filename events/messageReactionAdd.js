/*
**  caminho: events/messageReactionAdd.js
**  últimaMod: 2025-09-03 14:47
**  autor: Vico
**  colaboração: Roo Sonic
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

      if (imageUrl) {
        if (prompt) {
          prompt = '[imagem] ' + prompt;
        } else {
          prompt = '[imagem]';
        }
      }

      // Adicionar contexto do usuário para o prompt
      const username = message.author.username;
      const userId = message.author.id;
      prompt = `${username}: ${prompt} [meta]user:${username}|id:${userId}[/meta]`;

      if (!prompt) return;

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