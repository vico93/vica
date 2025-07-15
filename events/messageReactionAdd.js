// events/messageReactionAdd.js  (performance-refactored)

const oai    = require('../core/oai_interface');
const config = require('../config.json');

const VICA_EMOJI_ID = config.discord.reactionEmojiId;

module.exports = {
  name: 'messageReactionAdd',
  async execute(reaction, user) {
    // 1. Make sure we have a full reaction object
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch (err) {
        console.error('Falha ao buscar reação parcial:', err);
        return;
      }
    }

    // 2. Ignore bot reactions & wrong emoji
    if (user.bot) return;
    if (!VICA_EMOJI_ID || reaction.emoji.id !== VICA_EMOJI_ID) return;

    try {
      // 3. Ensure full message
      const message = reaction.message.partial
        ? await reaction.message.fetch()
        : reaction.message;

      if (message.author.bot) return;

      const guildId  = message.guild.id;
      const canalId  = message.channel.id;
      const usuarioId = message.author.id;

      // 4. Build prompt & image handling
      let prompt = message.content;
      let imageUrl = null;

      if (message.attachments.size) {
        const att = message.attachments.first();
        if (att.contentType?.startsWith('image/')) imageUrl = att.url;
      }

      if (!prompt && imageUrl) prompt = 'Em anexo...';
      if (!prompt && !imageUrl) return; // nothing to process

      console.log(`[REACTION] Gatilho de reação por ${user.tag} na msg de ${message.author.tag}`);

      await message.channel.sendTyping();

      const replyText = await oai.gerarRespostaContextual(
        guildId, canalId, usuarioId, prompt, imageUrl
      );

      await message.reply({ content: replyText, failIfNotExists: false });

      // Optional: remove the trigger reaction to prevent spam
      try {
        await reaction.users.remove(user.id);
      } catch { /* ignore if missing permissions */ }
    } catch (err) {
      console.error('[REACTION] Falha ao processar reação:', err);
    }
  }
};