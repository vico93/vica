/*
** caminho: events/messageCreate.js
** últimaMod: 2026-03-01 03:55
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

const oai = require('../core/oai_interface');
const database = require('../core/database');
const tagParser = require('../core/tagParser');

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

function isImageAttachment(attachment) {
  if (!attachment) return false;
  if (attachment.contentType?.startsWith('image/')) return true;

  const fileName = (attachment.name || '').toLowerCase();
  return fileName.endsWith('.png') ||
    fileName.endsWith('.jpg') ||
    fileName.endsWith('.jpeg') ||
    fileName.endsWith('.webp') ||
    fileName.endsWith('.gif') ||
    fileName.endsWith('.bmp');
}

function isAudioAttachment(attachment) {
  if (!attachment) return false;
  if (attachment.contentType?.startsWith('audio/')) return true;
  if (attachment.contentType === 'video/ogg') return true;

  const fileName = (attachment.name || '').toLowerCase();
  return fileName.endsWith('.ogg') ||
    fileName.endsWith('.mp3') ||
    fileName.endsWith('.wav') ||
    fileName.endsWith('.m4a') ||
    fileName.endsWith('.aac') ||
    fileName.endsWith('.flac') ||
    fileName.endsWith('.opus');
}

function getFirstAttachmentByPredicate(message, predicate) {
  if (!message?.attachments?.size) return null;

  for (const attachment of message.attachments.values()) {
    if (predicate(attachment)) return attachment;
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

    try {
      await message.channel.sendTyping();

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
          repliedContext += 'A mensagem anterior do bot contem uma imagem anexada. Use essa imagem como contexto visual.\n';
        }
      }

      // Parse message for tags and extract memories before AI processing
      const parsedContent = tagParser.parseTags(message.content);

      let prompt = repliedContext + parsedContent.cleanedMessage.replace(/<@!?\d+>/g, '').trim();
      let imageUrl = null;

      const userImageAttachment = getFirstAttachmentByPredicate(message, isImageAttachment);
      const userAudioAttachment = getFirstAttachmentByPredicate(message, isAudioAttachment);

      let imageTag = null;
      if (userImageAttachment?.url) {
        imageUrl = userImageAttachment.url;
        imageTag = '[imagem]';
      } else if (repliedBotImageUrl) {
        imageUrl = repliedBotImageUrl;
        imageTag = '[imagem_gerada]';
      }

      if (userAudioAttachment?.url) {
        // Apenas notifica o prompt sobre o arquivo de áudio disponível
        // A IA decidirá se deve chamar a tool 'audio_transcription'
        prompt = (prompt ? prompt + '\n' : '') + `[Attachment: type=audio, url=${userAudioAttachment.url}]`;
      }

      if (imageTag) {
        prompt = prompt ? `${imageTag} ${prompt}` : imageTag;
      }

      // Adicionar contexto do usuário para o prompt
      const username = message.author.username;
      const globalName = message.author.globalName || username;
      const userId = message.author.id;
      prompt = `${username}: ${prompt} [meta]user:${username}|globalname:${globalName}|id:${userId}[/meta]`;

      if (!prompt) return;

      const resposta = await oai.gerarRespostaContextual(
        guildId, canalId, usuarioId, message.client.user.id, prompt, imageUrl, message.channel, message.id, usuarioId
      );

      const chunks = splitText(resposta).filter(chunk => typeof chunk === 'string' && chunk.trim().length > 0);
      if (chunks.length === 0) {
        console.warn('[VICA][CHATBOT][WARN] IA retornou resposta vazia após sanitização. Enviando fallback.');
        await message.reply({
          content: 'Bah, dei uma travada e não consegui montar a resposta 😵‍💫. Tenta de novo em seguida.',
          failIfNotExists: false
        });
        return;
      }

      if (chunks.length > 1) {
        console.log('[VICA][CHATBOT][INFO] Response length > 2000, splitting into ' + chunks.length + ' chunks');
      }
      await message.reply({ content: chunks[0], failIfNotExists: false });
      for (let i = 1; i < chunks.length; i++) {
        await message.channel.send(chunks[i]);
      }
    } catch (err) {
      console.error('[VICA][CHATBOT] Falha ao responder:', err);
      await message.reply({
        content: 'Deu um tilt aqui nos meus circuitos, não consegui processar sua mensagem. 😢',
        failIfNotExists: false
      });
    }
  }
};
