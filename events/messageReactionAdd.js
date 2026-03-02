/*
**  caminho: events/messageReactionAdd.js
**  últimaMod: 2026-03-01 03:55
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

const oai = require('../core/oai_interface');
const database = require('../core/database');

/* ----------------------------------------------------------
    Helpers
---------------------------------------------------------- */


// Divide texto em chunks de até 2000 caracteres, preservando palavras
function splitText(text, maxLength = 2000) {
  if (typeof text !== 'string') return [];

  const normalizedText = text.trim();
  if (!normalizedText) return [];
  if (normalizedText.length <= maxLength) return [normalizedText];

  const chunks = [];
  let start = 0;
  while (start < normalizedText.length) {
    let end = Math.min(start + maxLength, normalizedText.length);
    if (end === normalizedText.length) {
      chunks.push(normalizedText.slice(start));
      break;
    }
    // Encontra o último espaço antes do limite
    const lastSpace = normalizedText.lastIndexOf(' ', end);
    if (lastSpace > start) {
      chunks.push(normalizedText.slice(start, lastSpace));
      start = lastSpace + 1;
    } else {
      // Sem espaço, corta forçadamente
      chunks.push(normalizedText.slice(start, end));
      start = end;
    }
  }
  return chunks;
}

async function getOpenThreadForMessage(message) {
  if (!message?.hasThread) return null;

  if (message.thread && !message.thread.archived) {
    return message.thread;
  }

  try {
    if (message.channel?.threads?.fetch) {
      const fetchedThread = await message.channel.threads.fetch(message.id);
      if (fetchedThread && !fetchedThread.archived) {
        return fetchedThread;
      }
    }
  } catch {
    // ignore and fallback below
  }

  try {
    if (message.guild?.channels?.fetch) {
      const fallbackThread = await message.guild.channels.fetch(message.id);
      if (fallbackThread?.isThread?.() && !fallbackThread.archived) {
        return fallbackThread;
      }
    }
  } catch {
    // ignore fallback errors
  }

  return null;
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

      const guildId = message.guild.id;
      const canalId = message.channel.id;
      const usuarioId = message.author.id;

      const openThread = await getOpenThreadForMessage(message);
      const responseChannel = openThread || message.channel;
      const responseChannelId = responseChannel.id;

      // Respeita blacklist
      if (database.chatbotCanalNaBlacklist(guildId, canalId)) return;

      // Se a mensagem for de webhook, inclui a tag [webhook] antes do conteúdo (para a IA não tentar salvar memória)
      let prompt = message.webhookId
        ? `[webhook] ${message.content}`
        : message.content;

      let imageUrl = null;

      if (message.attachments.size) {
        const att = message.attachments.first();
        if (att.contentType?.startsWith('image/')) {
          imageUrl = att.url;
        } else if (att.contentType?.startsWith('audio/') || att.contentType === 'video/ogg' || att.name.endsWith('.ogg') || att.name.endsWith('.mp3') || att.name.endsWith('.wav')) {
          // Adiciona hint de áudio ao prompt
          prompt = (prompt ? prompt + '\n' : '') + `[Attachment: type=audio, url=${att.url}]`;
        }
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

        await responseChannel.sendTyping();

        const resposta = await oai.gerarRespostaContextual(
          guildId, responseChannelId, usuarioId, message.client.user.id, prompt, imageUrl, responseChannel, message.id, usuarioId
        );

        const chunks = splitText(resposta).filter(chunk => typeof chunk === 'string' && chunk.trim().length > 0);
        if (chunks.length === 0) {
          console.warn('[VICA][REACTION][WARN] IA retornou resposta vazia após sanitização. Enviando fallback.');
          if (responseChannel.id === message.channel.id) {
            await message.reply({
              content: 'Bah, dei uma travada e não consegui montar a resposta 😵‍💫. Tenta de novo em seguida.',
              failIfNotExists: false
            });
          } else {
            await responseChannel.send('Bah, dei uma travada e não consegui montar a resposta 😵‍💫. Tenta de novo em seguida.');
          }
          return;
        }

        if (chunks.length > 1) {
          console.log('[VICA][REACTION][INFO] Response length > 2000, splitting into ' + chunks.length + ' chunks');
        }
        if (responseChannel.id === message.channel.id) {
          await message.reply({ content: chunks[0], failIfNotExists: false });
        } else {
          await responseChannel.send(chunks[0]);
        }
        for (let i = 1; i < chunks.length; i++) {
          await responseChannel.send(chunks[i]);
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

            const chunks = splitText(replyContent).filter(chunk => typeof chunk === 'string' && chunk.trim().length > 0);
            if (chunks.length === 0) {
              console.warn('[VICA][TRANSLATE][WARN] Tradução vazia após sanitização.');
              await message.reply({
                content: 'Bah, não consegui montar a tradução agora 😵‍💫. Tenta novamente em instantes.',
                failIfNotExists: false
              });
              return;
            }

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
