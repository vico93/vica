/*
**  caminho: events/messageReactionAdd.js
**  últimaMod: 2025-09-11 20:07
**  autor: Vico
** colaboração: Roo Sonic (xai/grok-code-fast-1), Copilot (gpt-4o), GLM 4.5 Air
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
const database = require('../core/database');

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
    if (user.bot && !reaction.message.webhookId) return;

    // Buscar reactionEmojis do banco de dados
    const guildId = reaction.message.guild.id;
    const reactionEmojis = database.listReactionEmojis(guildId);
    console.log(`[DEBUG][REACTION] Fetched reactionEmojis: ${reactionEmojis.map(e => e.reaction_emoji_id).join(', ')} for guildId: ${guildId}`);

    if (!reactionEmojis.length || !reactionEmojis.some(emoji => emoji.reaction_emoji_id === reaction.emoji.id)) {
      if (!reactionEmojis.length) {
        console.warn(`[VICA][REACTION] Nenhum reactionEmoji configurado para guild ${guildId}`);
      }
      return;
    }

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