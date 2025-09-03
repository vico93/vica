/*
** caminho: events/messageCreate.js
** últimaMod: 2025-09-03 14:47
** autor: Vico
** colaboração: Roo Sonic
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

// Calcula XP baseado no texto limpo
function calcularXP(textoLimpo) {
  const min = Math.ceil(textoLimpo.length / 7);
  const max = Math.ceil(textoLimpo.length / 4);
  let ganho = Math.floor(Math.random() * (max - min + 1)) + min;
  return Math.min(ganho, 35); // teto
}

/* ----------------------------------------------------------
   Exporta o handler
---------------------------------------------------------- */
module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    // Ignora bots e mensagens em DM
    if (message.author.bot || !message.guild) return;

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

      // Parse message for tags and extract memories before AI processing
      const parsedContent = tagParser.parseTags(message.content);

      let prompt = parsedContent.cleanedMessage.replace(/<@!?\d+>/g, '').trim();
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

      await message.reply({ content: resposta, failIfNotExists: false });
    } catch (err) {
      console.error('[VICA][CHATBOT] Falha ao responder:', err);
      await message.reply({
        content: 'Deu um tilt aqui nos meus circuitos, não consegui processar sua mensagem. 😢',
        failIfNotExists: false
      });
    }
  }
};