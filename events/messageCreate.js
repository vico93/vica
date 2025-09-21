/*
** caminho: events/messageCreate.js
** últimaMod: 2025-09-21 12:24
** autor: Vico
** colaboração: Roo Sonic (xai/grok-code-fast-1)
*/

/*
  Evento disparado sempre que uma mensagem é enviada em algum canal.
  Responsabilidades:
  1. Conceder XP ao autor (se canal não estiver na blacklist e respeitar cooldown);
  2. Armazenar a mensagem no histórico para o chatbot;
  3. Verificar se a VICA foi mencionada ou se a mensagem respondeu à VICA;
  4. Gerar resposta via IA (respeitando blacklist) e enviar.
*/

const oai      = require('../core/oai_interface');
const database = require('../core/database');
const tagParser = require('../core/tagParser');
const transcriber = require('../core/transcriber');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

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

/* ----------------------------------------------------------
   Helpers
---------------------------------------------------------- */
// Remove caracteres repetidos para evitar spam
function removerRepetidos(str) {
  return str.toLowerCase().replace(/(.)\1+/g, '$1');
}

// Calcula XP baseado no texto limpo
function calcularXP(textoLimpo) {
  const min = Math.ceil(textoLimpo.length / 7);
  const max = Math.ceil(textoLimpo.length / 4);
  let ganho = Math.floor(Math.random() * (max - min + 1)) + min;
  return Math.min(ganho, 35); // teto
}

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

/* ----------------------------------------------------------
   Exporta o handler
---------------------------------------------------------- */
module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    // Ignora bots e mensagens em DM
    if ((message.author.bot && message.author.id !== client.user.id) || !message.guild) return;

    const guildId  = message.guild.id;
    const canalId  = message.channel.id;
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

    if (message.reference?.messageId) {
      try {
        const replied = await message.channel.messages.fetch(message.reference.messageId);
        respondeuBot = replied.author.id === botId;
      } catch {
        // ignora erro de fetch
      }
    }

    if (!mencionadoDireto && !respondeuBot) return;

    /* --- Processamento de Voz --- */
    // Verifica se há anexos de áudio e os processa para transcrição
    let audioAttachment = null;
    for (const att of message.attachments.values()) {
      if (att.contentType?.startsWith('audio/') ||
          att.name?.toLowerCase().endsWith('.ogg') ||
          att.name?.toLowerCase().endsWith('.mp3')) {
        audioAttachment = att;
        break;
      }
    }

    if (audioAttachment) {
      const tempFile = path.join(os.tmpdir(), crypto.randomBytes(16).toString('hex') + path.extname(audioAttachment.name || '.tmp'));
      try {
        await new Promise((resolve, reject) => {
          const fileStream = fs.createWriteStream(tempFile);
          https.get(audioAttachment.url, (res) => {
            res.pipe(fileStream);
            fileStream.on('finish', resolve);
            fileStream.on('error', reject);
          }).on('error', reject);
        });

        const transcribed = await transcriber.transcribe(tempFile);
        if (transcribed) {
          const voiceText = `[voice] ${transcribed}`;
          if (message.content) {
            message.content = voiceText + ' ' + message.content;
          } else {
            message.content = voiceText;
          }
        } else {
          console.error('[MESSAGECREATE][ERROR] Falha na transcrição do áudio:', audioAttachment.url);
        }
      } catch (err) {
        console.error('[MESSAGECREATE][ERROR] Erro ao baixar/processar áudio:', err);
      } finally {
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {
          // Ignora erros ao deletar arquivo temporário
        }
      }
    }
    try {
      await message.channel.sendTyping();

      // Buscar contexto da mensagem respondida se for resposta ao bot
      let repliedContext = '';
      if (respondeuBot) {
        try {
          const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
          repliedContext = `Contexto da pergunta anterior do bot: "${repliedMsg.content}"\n`;
        } catch (err) {
          console.warn('[VICA][CHATBOT] Falha ao buscar mensagem respondida para contexto:', err.message);
        }
      }

      // Parse message for tags and extract memories before AI processing
      const parsedContent = tagParser.parseTags(message.content);

      let prompt = repliedContext + parsedContent.cleanedMessage.replace(/<@!?\d+>/g, '').trim();
      let imageUrl = null;

      // Process memories found in tags
      if (parsedContent.memories && parsedContent.memories.length > 0) {
        for (const memory of parsedContent.memories) {
          if (!memory.hasErrors) {
            try {
              const memoryResult = database.adicionarMemoriaUsuario(
                memory.guildId,
                memory.userId,
                memory.fact,
                {
                  confidence: memory.confidence,
                  sourceMessageId: message.id,
                  importance: memory.importance
                }
              );
              console.log(`[TAG_PROCESSOR] Salvando memória: ${memory.guildId}:${memory.userId}:${memory.fact}(importance=${memory.importance}, confidence=${memory.confidence})`);
            } catch (memoryErr) {
              console.error('[TAG_PROCESSOR][ERROR] Falhou ao salvar memória:', memoryErr.message);
            }
          } else {
            console.error(`[TAG_PROCESSOR][ERROR] Memória malformada: ${memory.errorMessage}`);
          }
        }
      }

      if (message.attachments.size) {
        const att = message.attachments.first();
        if (att.contentType?.startsWith('image/')) imageUrl = att.url;
      }

      if (imageUrl) {
        prompt = prompt ? '[imagem] ' + prompt : '[imagem]';
      }

      // Adicionar contexto do usuário para o prompt
      const username = message.author.username;
      const userId = message.author.id;
      prompt = `${username}: ${prompt} [meta]user:${username}|id:${userId}[/meta]`;

      if (!prompt) return;

      const resposta = await oai.gerarRespostaContextual(
        guildId, canalId, usuarioId, message.client.user.id, prompt, imageUrl, message.channel, message.id
      );

      const chunks = splitText(resposta);
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