/*
** caminho: events/messageCreate.js
** últimaMod: 2025-09-23 10:41
** autor: Vico
** colaboração: Grok Code (Fast)
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

    if (message.reference?.messageId) {
      try {
        const replied = await message.channel.messages.fetch(message.reference.messageId);
        respondeuBot = replied.author.id === botId;
      } catch {
        // ignora erro de fetch
      }
    }

    if (!mencionadoDireto && !respondeuBot) return;

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

      if (message.attachments.size) {
        const att = message.attachments.first();
        if (att.contentType?.startsWith('image/')) {
          imageUrl = att.url;
        } else if (att.contentType?.startsWith('audio/') || att.contentType === 'video/ogg' || att.name.endsWith('.ogg') || att.name.endsWith('.mp3') || att.name.endsWith('.wav')) {
          // Detecta áudio (incluindo notas de voz do Discord que podem ser audio/ogg ou video/ogg)
          try {
            await message.channel.sendTyping();
            console.log(`[VICA][AUDIO] Transcrevendo áudio de ${message.author.tag}...`);
            const transcricao = await oai.transcreverAudio(att.url);

            if (transcricao) {
              prompt = (prompt ? prompt + '\n' : '') + `[audio] ${transcricao}`;
              await message.reply({
                content: `🎤 **Transcrição do áudio:**\n> ${transcricao}`,
                failIfNotExists: false
              });
            }
          } catch (audioErr) {
            console.error('[VICA][AUDIO] Falha ao processar áudio:', audioErr);
            await message.reply({
              content: '🔇 Não consegui ouvir seu áudio direito. Verifique se é um formato válido ou se estou com cera no ouvido (erro interno).',
              failIfNotExists: false
            });
          }
        }
      }

      if (imageUrl) {
        prompt = prompt ? '[imagem] ' + prompt : '[imagem]';
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