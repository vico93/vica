/*
** caminho: events/messageCreate.js
** últimaMod: 2026-04-19 03:15
** autor: Vico
** colaboração: Grok Code (Fast), ChatGPT (GPT-5)
*/

/*
  Evento disparado sempre que uma mensagem é enviada em algum canal.
  Responsabilidades:
  1. Conceder XP ao autor (se canal não estiver na blacklist e respeitar cooldown);
  2. Armazenar a mensagem no histórico para o chatbot;
  3. Verificar se a VICA foi mencionada ou se a mensagem respondeu à VICA;
  4. Gerar resposta via IA (respeitando blacklist) e enviar.
*/

const { PermissionsBitField } = require('discord.js');
const oai = require('../core/oai_interface');
const database = require('../core/database');
const tagParser = require('../core/tagParser');
const { processAliases } = require('../core/aliasProcessor');
const {
  isImageAttachment,
  isAudioAttachment,
  isPdfAttachment,
  isTextAttachment,
  getFirstAttachmentByPredicate,
  buildAttachmentHint
} = require('../helpers/message_attachments');
const { isVideoAttachment, extractFirstFrameFromVideo } = require('../helpers/video_frame');

/* ----------------------------------------------------------
   Cooldown local em memória (guildId:userId -> timestamp)
---------------------------------------------------------- */
const cooldownMap = new Map();
const COOLDOWN_MS = 5_000;

/* ----------------------------------------------------------
   Helpers
---------------------------------------------------------- */
// Remove caracteres repetidos para evitar spam
function removerRepetidos(str) {
  return str.toLowerCase().replace(/(.)\1+/g, '$1');
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

/* ----------------------------------------------------------
    Calcula XP baseado no texto limpo
 ---------------------------------------------------------- */
function calcularXP(textoLimpo) {
  const min = Math.ceil(textoLimpo.length / 7);
  const max = Math.ceil(textoLimpo.length / 4);
  let ganho = Math.floor(Math.random() * (max - min + 1)) + min;
  return Math.min(ganho, 35); // teto
}

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

/* ----------------------------------------------------------
   Exporta o handler
---------------------------------------------------------- */
module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    // Ignora bots e mensagens em DM
    if ((message.author.bot && message.author.id !== client.user.id) || !message.guild) return;

    const guildId = message.guild.id;
    const canalId = message.channel.id;
    const usuarioId = message.author.id;

    /* ---------------- Macros ---------------- */
    if (message.content.startsWith('!')) {
      const macroName = message.content.slice(1).split(/\s+/)[0].toLowerCase().trim();
      if (macroName) {
        try {
          const macro = database.getMacro(guildId, macroName);
          if (macro) {
            // Verifica se é moderador-only
            if (macro.moderatorOnly && !message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
              // Silenciosamente ignora se não for moderador
              return;
            }

            // Deleta a mensagem do usuário
            try {
              await message.delete();
            } catch (deleteErr) {
              console.warn('[MACRO][WARN] Falha ao deletar mensagem do usuário:', deleteErr.message);
            }

            // Processa alias no conteúdo
            const processedContent = processAliases(macro.content, {
              member: message.member,
              guild: message.guild,
              channel: message.channel
            });

            // Envia como mensagem nova separada (não reply)
            await message.channel.send(processedContent);
            return;
          }
        } catch (macroErr) {
          console.error('[MACRO][ERROR] Erro ao processar macro:', macroErr);
        }
      }
    }

    /* ---------------- XP ---------------- */
    if (!database.xpCanalNaBlacklist(guildId, canalId)) {
      const key = `${guildId}:${usuarioId}`;
      const now = Date.now();

      if (!cooldownMap.has(key) || now - cooldownMap.get(key) > COOLDOWN_MS) {
        const textoLimpo = removerRepetidos(message.content);
        if (message.content.length > 5 && textoLimpo.length > 12) {
          let xpGanho = calcularXP(textoLimpo);

          const roleIds = Array.from(message.member.roles.cache.keys());
          const multiplicadores = database.buscarMultiplicadoresParaUsuario(guildId, roleIds);
          const multiplicadorFinal = multiplicadores.length ? Math.max(...multiplicadores) : 1;
          xpGanho = Math.ceil(xpGanho * multiplicadorFinal);

          const { levelUp, novoNivel } = database.atualizarUsuarioXP(
            guildId, usuarioId, xpGanho, now
          );

          if (levelUp) {
            // --- LÓGICA DE CANAL DE SISTEMA ---
            const systemChannelId = database.getSystemChannel(guildId);
            let targetChannel = message.channel; // Padrão: canal atual

            if (systemChannelId) {
              const foundChannel = message.guild.channels.cache.get(systemChannelId);
              if (foundChannel) {
                targetChannel = foundChannel; // Se encontrou o canal configurado, usa ele
              } else {
                console.warn(`[AVISO] Canal de sistema (${systemChannelId}) não encontrado no servidor ${guildId}. Usando canal de origem.`);
              }
            }

            try {
              await targetChannel.send(
                `🎉 Parabéns, <@${usuarioId}>! Você avançou para o nível **${novoNivel}**!`
              );
            } catch (err) {
              console.error(`[ERRO] Falha ao enviar mensagem de level up no canal ${targetChannel.id}:`, err);
            }
            // --- FIM DA LÓGICA ---
          }
        }
        cooldownMap.set(key, now);
      }
    }

    /* ---------------- Histórico da IA ---------------- */
    try {
      database.inserirMensagem(
        guildId,
        canalId,
        usuarioId,
        message.id,
        message.createdTimestamp
      );
    } catch (err) {
      console.error('[VICA][DB] Falha ao inserir mensagem:', err, '| ID:', message.id);
    }

    /* ---------------- Chatbot ---------------- */
    if (database.chatbotCanalNaBlacklist(guildId, canalId)) return;

    // Impede o bot de responder às suas próprias mensagens
    if (message.author.id === client.user.id) return;

    const botId = client.user.id;
    const mencionadoDireto = message.mentions.has(botId);
    let respondeuBot = false;
    let repliedMsg = null;

    if (message.reference?.messageId) {
      try {
        repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
        respondeuBot = repliedMsg.author.id === botId;
      } catch {
        // ignora erro de fetch
      }
    }

    if (!mencionadoDireto && !respondeuBot) return;

    let responseChannel = message.channel;
    if (repliedMsg && !message.channel.isThread?.()) {
      const openThread = await getOpenThreadForMessage(repliedMsg);
      if (openThread) {
        responseChannel = openThread;
      }
    }
    const responseChannelId = responseChannel.id;

    try {
      await responseChannel.sendTyping();

      // Buscar contexto da mensagem respondida se for resposta ao bot
      let repliedContext = '';
      let repliedBotImageUrl = null;
      if (respondeuBot && repliedMsg) {
        const repliedText = (repliedMsg.content || '').trim();
        repliedContext = repliedText
          ? `Contexto da pergunta anterior do bot: "${repliedText}"\n`
          : 'Contexto da pergunta anterior do bot: [mensagem sem texto]\n';

        const repliedImageAttachment = getFirstAttachmentByPredicate(repliedMsg, isImageAttachment);
        if (repliedImageAttachment?.url) {
          repliedBotImageUrl = repliedImageAttachment.url;
          repliedContext += 'A mensagem anterior do bot contem uma imagem anexada.\n';
        }
      }

      // Parse message for tags and extract memories before AI processing
      const parsedContent = tagParser.parseTags(message.content);

      let prompt = repliedContext + parsedContent.cleanedMessage.replace(/<@!?\d+>/g, '').trim();
      let imageUrl = null;
      let imageDataUrl = null;

      const userImageAttachment = getFirstAttachmentByPredicate(message, isImageAttachment);
      const userVideoAttachment = getFirstAttachmentByPredicate(message, isVideoAttachment);
      const userAudioAttachment = getFirstAttachmentByPredicate(message, isAudioAttachment);
      const userPdfAttachment = getFirstAttachmentByPredicate(message, isPdfAttachment);
      const userTextAttachment = getFirstAttachmentByPredicate(message, isTextAttachment);

      let imageTag = null;
      if (userImageAttachment?.url) {
        imageUrl = userImageAttachment.url;
        imageTag = '[imagem]';
        prompt = (prompt ? prompt + '\n' : '') + buildAttachmentHint({
          type: 'image',
          url: userImageAttachment.url,
          name: userImageAttachment.name,
          content_type: userImageAttachment.contentType,
          size_bytes: userImageAttachment.size
        });
      } else if (userVideoAttachment?.url) {
        imageDataUrl = await extractFirstFrameFromVideo(userVideoAttachment.url);
        if (imageDataUrl) {
          imageTag = '[imagem]';
          prompt = (prompt ? prompt + '\n' : '') + buildAttachmentHint({
            type: 'image',
            attachment_id: 'video_frame',
            name: `${userVideoAttachment.name || 'video'}.first-frame.png`,
            source: 'video_first_frame'
          });
        }
      } else if (repliedBotImageUrl) {
        imageUrl = repliedBotImageUrl;
        imageTag = '[imagem_gerada]';
        prompt = (prompt ? prompt + '\n' : '') + buildAttachmentHint({
          type: 'image',
          url: repliedBotImageUrl,
          source: 'replied_bot_image'
        });
      }

      if (userAudioAttachment?.url) {
        // Apenas notifica o prompt sobre o arquivo de áudio disponível
        // A IA decidirá se deve chamar a tool 'audio_transcription'
        prompt = (prompt ? prompt + '\n' : '') + buildAttachmentHint({
          type: 'audio',
          url: userAudioAttachment.url,
          name: userAudioAttachment.name,
          content_type: userAudioAttachment.contentType
        });
      }

      if (userPdfAttachment?.url) {
        prompt = (prompt ? prompt + '\n' : '') + buildAttachmentHint({
          type: 'pdf',
          url: userPdfAttachment.url,
          name: userPdfAttachment.name,
          content_type: userPdfAttachment.contentType,
          size_bytes: userPdfAttachment.size
        });
      }

      if (userTextAttachment?.url) {
        prompt = (prompt ? prompt + '\n' : '') + buildAttachmentHint({
          type: 'text',
          url: userTextAttachment.url,
          name: userTextAttachment.name,
          content_type: userTextAttachment.contentType,
          size_bytes: userTextAttachment.size
        });
      }

      if (imageTag) {
        prompt = prompt ? `${imageTag} ${prompt}` : imageTag;
      }

      // Add has_embed tag if message contains embeds
      if (message.embeds?.length > 0) {
        prompt = prompt ? `${prompt} [has_embed]` : '[has_embed]';
      }

      // Adicionar contexto do usuário para o prompt
      const username = message.author.username;
      const globalName = message.author.globalName || username;
      const userId = message.author.id;
      prompt = `${username}: ${prompt} [meta]user:${username}|globalname:${globalName}|id:${userId}[/meta]`;

      if (!prompt) return;

      const resposta = await oai.gerarRespostaContextual(
        guildId, responseChannelId, usuarioId, message.client.user.id, prompt, imageUrl, responseChannel, message.id, usuarioId, imageDataUrl
      );

      const chunks = splitText(resposta).filter(chunk => typeof chunk === 'string' && chunk.trim().length > 0);
      if (chunks.length === 0) {
        console.warn('[VICA][CHATBOT][WARN] IA retornou resposta vazia após sanitização. Enviando fallback.');
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
        console.log('[VICA][CHATBOT][INFO] Response length > 2000, splitting into ' + chunks.length + ' chunks');
      }
      if (responseChannel.id === message.channel.id) {
        await message.reply({ content: chunks[0], failIfNotExists: false });
      } else {
        await responseChannel.send(chunks[0]);
      }
      for (let i = 1; i < chunks.length; i++) {
        await responseChannel.send(chunks[i]);
      }
    } catch (err) {
      console.error('[VICA][CHATBOT] Falha ao responder:', err);

      const apiErrorCode = err?.error?.code;
      const apiErrorMessage = err?.error?.message;
      const httpStatus = err?.status;

      let userMessage;
      if (apiErrorCode && apiErrorMessage) {
        userMessage = `<:red_cross:1415557583191801906> Erro __${httpStatus || ''}__ (cód. API **${apiErrorCode}**): *${apiErrorMessage}*`;
      } else {
        userMessage = 'Deu um tilt aqui nos meus circuitos, não consegui processar sua mensagem. 😢';
      }

      if (responseChannel.id === message.channel.id) {
        await message.reply({ content: userMessage, failIfNotExists: false });
      } else {
        await responseChannel.send(userMessage);
      }
    }
  }
};
