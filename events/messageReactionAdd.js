/*
**  caminho: events/messageReactionAdd.js
**  últimaMod: 2025-09-23 11:26
**  autor: Vico
** colaboração: Copilot (gpt-4o), GLM 4.5 Air, Grok Code (Fast)
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

/* ----------------------------------------------------------
    Helpers
---------------------------------------------------------- */


// Divide texto em chunks de até 2000 caracteres, preservando palavras
function splitText(text, maxLength = 2000) {
  if (!text || text.length <= maxLength) return [text || ''];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxLength, text.length);
    if (end === text.length) {
      chunks.push(text.slice(start));
      break;
    }
    // Encontra o último espaço antes do limite
    const lastSpace = text.lastIndexOf(' ', end);
    if (lastSpace > start) {
      chunks.push(text.slice(start, lastSpace));
      start = lastSpace + 1;
    } else {
      // Sem espaço, corta forçadamente
      chunks.push(text.slice(start, end));
      start = end;
    }
  }
  return chunks;
}

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

    // Buscar reactionEmojis do banco de dados
    const guildId = reaction.message.guild.id;
    const reactionEmojis = database.listReactionEmojis(guildId);


    try {
      const message = reaction.message.partial
        ? await reaction.message.fetch()
        : reaction.message;


      if (message.author.bot && !message.webhookId) return;

      const guildId  = message.guild.id;
      const canalId  = message.channel.id;
      const usuarioId = message.author.id;

      // Respeita blacklist
      if (database.chatbotCanalNaBlacklist(guildId, canalId)) return;

      // Se a mensagem for de webhook, inclui a tag [webhook] antes do conteúdo (para a IA não tentar salvar memória)
      let prompt = message.webhookId
        ? `[webhook] ${message.content}`
        : message.content;

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

      if (reactionEmojis.some(emoji => emoji.reaction_emoji_id === reaction.emoji.id)) {
        console.log(`[VICA][REACTION] Gatilho por ${user.tag} na msg de ${message.author.tag}`);

        await message.channel.sendTyping();

        const resposta = await oai.gerarRespostaContextual(
          guildId, canalId, usuarioId, message.client.user.id, prompt, imageUrl, message.channel, message.id, usuarioId
        );

        const chunks = splitText(resposta);
        if (chunks.length > 1) {
          console.log('[VICA][REACTION][INFO] Response length > 2000, splitting into ' + chunks.length + ' chunks');
        }
        await message.reply({ content: chunks[0], failIfNotExists: false });
        for (let i = 1; i < chunks.length; i++) {
          await message.channel.send(chunks[i]);
        }

        // Remove reação para evitar spam
        try {
          await reaction.users.remove(user.id);
        } catch {
          /* ignora se faltar permissão */
        }
      }

      // Verificar tradução 🌐
      const translationEmoji = database.getTranslationEmoji(guildId);
      // Verifica se o emoji corresponde (pode ser ID ou nome/unicode)
      const isTranslationReaction = translationEmoji && (reaction.emoji.id === translationEmoji || reaction.emoji.name === translationEmoji);

      if (isTranslationReaction) {
        console.log(`[VICA][TRANSLATE] Tradução solicitada por ${user.tag}`);
        
        const textToTranslate = message.content;
        
        if (textToTranslate) {
           await message.channel.sendTyping();
           try {
             const traducao = await oai.gerarTraducao(textToTranslate);
             // Envia a tradução com o prefixo para ser ignorado pelo contexto
             const replyContent = `🔄 Tradução:\n\n${traducao}`;
             
             const chunks = splitText(replyContent);
             await message.reply({ content: chunks[0], failIfNotExists: false });
             for (let i = 1; i < chunks.length; i++) {
               await message.channel.send(chunks[i]);
             }
           } catch (tErr) {
             console.error('[VICA][TRANSLATE] Erro na tradução:', tErr);
           }
           
           // Remove reação
           try {
             await reaction.users.remove(user.id);
           } catch {
             /* ignora */
           }
        }
      }

      // Verificar criação de thread na reação 🧵
      if (reaction.emoji.name === '🧵' && database.isThreadReactionEnabled(guildId) && !message.hasThread) {
        try {
          const thread = await message.startThread({ name: 'Tópico automaticamente aberto (renomear depois)', autoArchiveDuration: 60 });
          console.log(`[VICA][THREAD] Tópico criado: ${thread.name} à pedido de ${user.tag}`);
          await reaction.users.remove(user.id);
        } catch (err) {
          console.error('[VICA][THREAD] Erro ao criar tópico:', err);
        }
      }
    } catch (err) {
      console.error('[VICA][REACTION] Falha ao processar reação:', err);
    }
  }
};