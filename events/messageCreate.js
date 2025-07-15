// events/messageCreate.js  (performance-refactored)

const oai      = require('../core/oai_interface');
const database = require('../core/database');

// ------------------------------------------------------------------
// XP helpers
// ------------------------------------------------------------------

// Simple TTL map (guildId+userId -> timestamp)
const cooldown = new Map();
const COOLDOWN_MS = 5000;

// Strips repeated chars so "heeeeeey" counts as 4 chars
function removerRepetidos(str) {
  return str.toLowerCase().replace(/(.)\1+/g, '$1');
}

// Returns earned XP or 0 if message is too short / on cooldown
function calculateXP(message) {
  const txt = removerRepetidos(message.content);
  if (txt.length <= 12 || message.content.length <= 5) return 0;

  const min = Math.ceil(txt.length / 7);
  const max = Math.ceil(txt.length / 4);
  let earned = Math.floor(Math.random() * (max - min + 1)) + min;
  return Math.min(earned, 35); // cap
}

// ------------------------------------------------------------------
// Main handler
// ------------------------------------------------------------------
module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (message.author.bot || !message.guild) return;

    const guildId  = message.guild.id;
    const canalId  = message.channel.id;
    const usuarioId = message.author.id;

    // ----------------------------------------------------------------
    // 1. XP logic
    // ----------------------------------------------------------------
    if (!database.xpCanalNaBlacklist(guildId, canalId)) {
      const key = guildId + usuarioId;
      const now = Date.now();

      if (!cooldown.has(key) || now - cooldown.get(key) > COOLDOWN_MS) {
        let xpEarned = calculateXP(message);
        if (xpEarned) {
          const roleIds = Array.from(message.member.roles.cache.keys());
          const mults   = database.buscarMultiplicadoresParaUsuario(guildId, roleIds);
          const mult    = mults.length ? Math.max(...mults) : 1;
          xpEarned = Math.ceil(xpEarned * mult);

          const { levelUp, novoNivel } = database.atualizarUsuarioXP(
            guildId, usuarioId, xpEarned, now
          );
          if (levelUp) {
            message.channel.send(
              `🎉 Parabéns, <@${usuarioId}>! Você avançou para o nível **${novoNivel}**!`
            );
          }
        }
        cooldown.set(key, now);
      }
    }

    // ----------------------------------------------------------------
    // 2. Persist message for chatbot context
    // ----------------------------------------------------------------
    try {
      database.inserirMensagem(
        guildId,
        canalId,
        usuarioId,
        message.content,
        message.createdTimestamp
      );
    } catch (err) {
      console.error('[DB] Falha ao inserir mensagem:', err);
    }

    // ----------------------------------------------------------------
    // 3. Chatbot trigger (mention or reply)
    // ----------------------------------------------------------------
    if (database.chatbotCanalNaBlacklist(guildId, canalId)) return;

    const botId = client.user.id;
    const foiMencionadoDiretamente = message.mentions.has(botId);
    let foiRespondidoComMention = false;

    if (message.reference?.messageId) {
      try {
        const replied = await message.channel.messages.fetch(message.reference.messageId);
        foiRespondidoComMention = replied.author.id === botId;
      } catch { /* ignore fetch errors */ }
    }

    if (!foiMencionadoDiretamente && !foiRespondidoComMention) return;

    try {
      await message.channel.sendTyping();

      // Build prompt
      let prompt = message.content.replace(/<@!?\d+>/g, '').trim();

      // Handle images
      let imageUrl = null;
      if (message.attachments.size) {
        const att = message.attachments.first();
        if (att.contentType?.startsWith('image/')) imageUrl = att.url;
      }

      // If only an image was sent, use placeholder prompt
      if (!prompt && imageUrl) prompt = 'Em anexo...';
      if (!prompt && !imageUrl) return; // nothing to do

      const replyText = await oai.gerarRespostaContextual(
        guildId, canalId, usuarioId, prompt, imageUrl
      );

      await message.reply({ content: replyText, failIfNotExists: false });
    } catch (err) {
      console.error('[CHATBOT] Falha ao responder:', err);
      await message.reply({
        content: 'Deu um tilt aqui nos meus circuitos, não consegui processar sua mensagem. 😢',
        failIfNotExists: false
      });
    }
  }
};