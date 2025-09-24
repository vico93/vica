/*
** caminho: core/oai_interface.js
** últimaMod: 2025-09-23 10:53
** autor: Vico
** colaboração: Gemini, ChatGPT, Grok Code (Fast)
*/

const OpenAI = require('openai');
const path = require('path');
const fs = require('fs');
const config = require('../config.json');
const database = require('../core/database');
const tagParser = require('../core/tagParser');

const rateLimitMap = new Map();

/* --- Funções Helper Para Processar Chamadas de Ferramentas --- */
// (Removido suporte a tool-calls; manteremos somente tags SGML via tagParser)



// Função para sanitizar fato (truncar e remover quebras de linha)
function sanitizeFato(fato) {
  if (typeof fato !== 'string') return '';

  return fato
    .replace(/\n/g, ' ') // Remove newlines
    .replace(/\r/g, '')  // Remove carriage returns
    .replace(/\t/g, ' ') // Remove tabs
    .trim()              // Remove espaços extras
    .substring(0, 200);  // Truncate to 200 chars
   }
   
   /* --- Funções Para Processar Comandos de Tags SGML --- */
   
   // Função para extrair comandos das tags [vica]...[/vica]
   function parseTagCommands(content) {
     const commands = [];
     const tagRegex = /\[vica\](.*?)\[\/vica\]/gs;
     let match;

     // Log original content before processing
     // console.log(`[PARSE_TAG][DEBUG] Iniciando processamento de tags. Conteúdo original: "${content}"`);

     while ((match = tagRegex.exec(content)) !== null) {
       const tagContent = match[1];
       console.log(`[PARSE_TAG][DEBUG] Tag encontrada: "<vica>${tagContent}</vica>"`);

       try {
         const parts = tagContent.split(':');
         if (parts.length >= 2) {
           const commandName = parts[0];
           const params = {};
           for (let i = 1; i < parts.length; i += 2) {
             if (i + 1 < parts.length) {
               params[parts[i]] = parts[i + 1];
             }
           }
           commands.push({ command: commandName, params });
         } else {
           console.warn(`[PARSE_TAG][WARN] Tag malformada detectada: "${tagContent}". Poucas partes encontradas (${parts.length}). Continuando processamento.`);
         }
       } catch (error) {
         console.error(`[PARSE_TAG][ERRO] Erro ao processar tag "${tagContent}": ${error.message}. Continuando processamento.`, error);
       }
     }

     console.log(`[PARSE_TAG][INFO] ${commands.length} comandos extraídos com sucesso`);
     return commands;
   }
   
   // Função similar a processToolCallsFromResponse para processar comandos de tags
   function processTagCommands(commands, guildId, context = {}) {
     if (!commands || commands.length === 0) {
       console.log('[PROCESS_TAG][INFO] Nenhuma tag para processar');
       return { success: true, processed: 0 };
     }

     console.log(`[PROCESS_TAG][INFO] Processando ${commands.length} comandos de tags`);

     let processed = 0;
     const results = [];

     for (const cmd of commands) {
       try {
         if (cmd.command === 'salvar_memoria') {
           const args = cmd.params;
           const sanitizedFato = sanitizeFato(args.fato || '');

           let importance = parseFloat(args.importance) || 5;
           if (importance < 1 || importance > 10) importance = 5;
           importance = Math.round(importance);

           let confidence = parseFloat(args.confidence) || 0.5;
           if (confidence < 0 || confidence > 1) confidence = 0.5;

           const result = database.adicionarMemoriaUsuario(
             args.guild_id || guildId,
             args.user_id,
             sanitizedFato,
             {
               importance: importance,
               confidence: confidence,
               sourceMessageId: args.source_message_id || context.sourceMessageId,
               createdAt: parseInt(args.timestamp) || Date.now()
             }
           );

           console.log(`[${context.moduleTag || 'TAG'}][TAG] salvar_memoria guild=${args.guild_id || guildId} user=${args.user_id} fact="${sanitizedFato}" importance=${importance} confidence=${confidence} inserted=${result.inserted} duplicate=${result.duplicate}`);
           results.push({ command: 'salvar_memoria', result, success: true });
           processed++;
         } else {
           console.warn(`[PROCESS_TAG][WARN] Comando não reconhecido: ${cmd.command}`);
           results.push({ command: cmd.command, error: 'Comando não reconhecido', success: false });
         }
       } catch (e) {
         console.error(`[PROCESS_TAG][ERRO] Falha ao processar comando ${cmd.command}:`, e?.message || e);
         results.push({ command: cmd.command, error: e.message, success: false });
       }
     }

     console.log(`[PROCESS_TAG][INFO] Finalizado processamento de comandos. Comandos encontrados: ${commands.length}, Processados com sucesso: ${processed}`);
     return { success: true, processed, results };
   }
   
   // Carrega o system prompt do arquivo system_prompt.txt
// Se não conseguir ler o arquivo, retorna um prompt padrão
async function carregarSystemPrompt() {
 const filePath = path.join(__dirname, '..', 'data', 'system_prompt.txt');

 try {
   let prompt = await fs.promises.readFile(filePath, 'utf-8');
   prompt = prompt.trim();

   // Adiciona data e hora atual ao system prompt
   const datetimeString = getCurrentDatetimeString();
   prompt += `\n\n${datetimeString}`;

   return prompt;
 } catch (err) {
   console.error('[ERRO] Não foi possível ler system_prompt.txt:', err);
   return 'Você é uma IA que responde a mensagens de forma criativa e útil.';
 }
}

// Função helper para obter a string de data e hora atual
function getCurrentDatetimeString() {
 const now = new Date();
 const formattedTime = now.toLocaleTimeString('pt-BR', {
   timeZone: 'America/Sao_Paulo',
   hour: '2-digit',
   minute: '2-digit'
 });
 const formattedDate = now.toLocaleDateString('pt-BR', {
   timeZone: 'America/Sao_Paulo'
 });
 return `São ${formattedTime} do dia ${formattedDate}.`;
}


const openai = new OpenAI({
  apiKey: config.openai.api_key,
  baseURL: config.openai.base_url,
  defaultHeaders: {
    "X-Title": "Vica",
  },
});
/* --- Helper de Retry com Backoff Exponencial e Jitter --- */
async function withRetries(fn, label = 'OAI_CALL') {
  const maxRetries = Number.isInteger(config.openai?.retries) ? config.openai.retries : 3;
  const baseDelay = Number.isInteger(config.openai?.initial_delay_ms) ? config.openai.initial_delay_ms : 1000;

  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      const status = err?.status || err?.response?.status;
      const code = err?.code;
      const isRate = status === 429;
      const is5xx = status >= 500 && status <= 599;
      const isNetwork = ['ECONNRESET','ETIMEDOUT','ENOTFOUND','EAI_AGAIN'].includes(code);

      if (!(isRate || is5xx || isNetwork) || attempt > maxRetries) {
        console.error(`[RETRY][FALHA] ${label} erro definitivo (tentativa ${attempt}/${maxRetries}):`, err?.message || String(err));
        throw err;
      }

      const jitter = Math.floor(Math.random() * 250);
      const delay = baseDelay * Math.pow(2, attempt - 1) + jitter;
      console.warn(`[RETRY][AVISO] ${label} tentativa ${attempt}/${maxRetries} falhou (status=${status || 'N/A'}, code=${code || 'N/A'}). Retentando em ${delay}ms...`);
      await new Promise(res => setTimeout(res, delay));
    }
  }
}


// Função do comando /perguntar
// Função do comando /perguntar
async function gerarPerguntaViaAPI(promptUsuario = null) {
  const messages = [];
  if (config.openai.sendSystemPrompt !== false) {
    const systemPrompt = await carregarSystemPrompt();
    messages.push({ role: 'system', content: systemPrompt });
  }

  messages.push({
   role: 'user',
   content: promptUsuario || '[pergunta]',
  });
  try {
    const response = await withRetries(
      () => openai.chat.completions.create({
        model: config.openai.model,
        messages,
        temperature: 0.8,
        max_tokens: config.settings.maxTokens,
      }),
      '[CHAT][perguntar]'
    );

    const content = response?.choices?.[0]?.message?.content;
    if (!content) throw new Error('A API não retornou conteúdo na resposta.');
    return content.trim();
  } catch (error) {
    console.error('[ERRO] Não consegui gerar uma pergunta pela API da OpenAI:', error.message);
    throw error;
  }
}

/* --- Função Role Congratulation API --- */
// Função para gerar parabéns por cargo via API
async function gerarParabensCargoViaAPI(guildId, userId, promptUsuario, roleName) {
  const messages = [];
  if (config.openai.sendSystemPrompt !== false) {
    const systemPrompt = await carregarSystemPrompt();
    messages.push({ role: 'system', content: systemPrompt });
  }

  messages.push({
   role: 'user',
   content: promptUsuario,
  });

  try {
    const response = await withRetries(
      () => openai.chat.completions.create({
        model: config.openai.model,
        messages,
        temperature: 0.8,
        max_tokens: 100, // Resposta curta e objetiva para parabéns
      }),
      '[CHAT][role_congrats]'
    );

    const choice = response?.choices?.[0];
    const message = choice?.message;
    let content = message?.content || '';

    // Processa comandos de tags usando helpers de tags
    const commands = parseTagCommands(content);
    const tagResults = processTagCommands(commands, guildId, {
      moduleTag: '[ROLE-CONGRATS]',
      sourceMessageId: null
    });

    if (tagResults.processed > 0) {
      console.log(`[ROLE-CONGRATS][TAG] Processadas ${tagResults.processed} comandos de tags`);
    }

    if (!content) throw new Error('A API não retornou conteúdo na resposta.');

    // Adiciona automaticamente uma memória sobre o usuário estar no cargo
    if (roleName && userId) {
      try {
        const memoria = sanitizeFato(`Está no cargo ${roleName}`);
        database.adicionarMemoriaUsuario(guildId, userId, memoria, {
          createdAt: Date.now()
        });
        console.log(`[ROLE-CONGRATS][MEM] Memória adicionada para usuário ${userId}: ${memoria}`);
      } catch (memError) {
        console.error('[ROLE-CONGRATS][MEM] Erro ao salvar memória do cargo:', memError);
      }
    }

    // Strip tags from content before returning
    const originalTaggedContent = content;
    content = content.replace(/\[vica\].*?\[\/vica\]/gs, '').trim();
    console.log(`[ROLE-CONGRATS][CLEAN] Conteúdo limpo após remoção de tags. Original (com tags): "${originalTaggedContent}". Limpo: "${content}"`);
    return content;
  } catch (error) {
    console.error('[ERRO] Não consegui gerar parabéns pela API da OpenAI:', error.message);
    throw error;
  }
}

   // Função para gerar mensagens de boas-vindas/saída via API
   async function gerarMensagemBemVindoViaAPI(guildId, userId, userName, messageType, prompt, roleName = null, roleMention = null) {
     // Mapeamento de tipos de mensagem para tags correspondentes (case-insensitive)
     const messageTypeMapping = {
       'welcome': 'welcome',
       'leave': 'leave',
       'kick': 'kick',
       'ban': 'ban',
       'up_role': 'up_role'
     };
   

     // Obter tag baseada no tipo de mensagem (case-insensitive, default para 'welcome')
     const tag = (messageType && messageTypeMapping[messageType.toLowerCase()]) || 'welcome';
  
     const messages = [];
     if (config.openai.sendSystemPrompt !== false) {
       const systemPrompt = await carregarSystemPrompt();
       messages.push({ role: 'system', content: systemPrompt });
     }
  
     messages.push({
       role: 'user',
       content: `[${tag}]` + prompt.replace(/\{@USER\}/g, `<@${userId}>`).replace(/\{USER\}/g, userName).replace(/\{ROLE\}/g, roleName || '').replace(/\{@ROLE\}/g, roleMention || ''),
     });
  
     try {
       const response = await withRetries(
         () => openai.chat.completions.create({
           model: config.openai.model,
           messages,
           temperature: 0.8,
           max_tokens: config.settings.maxTokens,
         }),
         '[CHAT][welcome_flow]'
       );
 
       const choice = response?.choices?.[0];
       const message = choice?.message;
       let content = message?.content || '';
 
       // Processa comandos de tags usando helpers de tags
       const commands = parseTagCommands(content);
       const tagResults = processTagCommands(commands, guildId, {
         moduleTag: `[${tag.toUpperCase()}]`,
         sourceMessageId: null
       });
 
       if (tagResults.processed > 0) {
         console.log(`[${tag.toUpperCase()}][TAG] Processadas ${tagResults.processed} comandos de tags`);
       }
 
       if (!content) throw new Error('A API não retornou conteúdo na resposta.');
 
       // Strip tags from content before returning
       const originalTaggedContent = content;
       content = content.replace(/\[vica\].*?\[\/vica\]/gs, '').trim();
       console.log(`[${tag.toUpperCase()}][CLEAN] Conteúdo limpo após remoção de tags. Original (com tags): "${originalTaggedContent}". Limpo: "${content}"`);
       return content;
     } catch (error) {
       console.error(`[ERRO] Não consegui gerar mensagem de ${messageType} pela API da OpenAI:`, error.message);
       throw error;
     }
   }
 
 // Função para gerar uma resposta à partir da API
 async function gerarRespostaContextual(guildId, canalId, usuarioId, botUserId, mensagemUsuario, imageUrl = null, channel = null, sourceMessageId = null) {
    // Rate limiting check per user+guild
    const rateLimitMs = config.settings.rate_limit_ms || 5000; // fallback 5 seconds
    if (guildId && usuarioId) {
      const rateLimitKey = `${guildId}:${usuarioId}`;
      const lastTimestamp = rateLimitMap.get(rateLimitKey);
      if (lastTimestamp && (Date.now() - lastTimestamp < rateLimitMs)) {
        console.log(`[RATE_LIMIT][BLOCK] Request blocked for user ${usuarioId} in guild ${guildId}`);
        return "⚠️ Please wait a few seconds before asking me again!";
      }
      // Update cooldown timestamp
      rateLimitMap.set(rateLimitKey, Date.now());
    }
    const messages = [];
    if (config.openai.sendSystemPrompt !== false) {
      let systemPrompt = await carregarSystemPrompt();

      /* --- Busca Semântica de Memórias por Similaridade de Embedding --- */
      try {
        // Gera embedding para a mensagem do usuário
        const userEmbedding = await gerarEmbedding(mensagemUsuario);
        console.log('[OAI_SEMANTIC][INFO] Embedding da mensagem do usuário gerado com sucesso');

        // Busca memórias de usuário mais similares
        const topUserMemories = await buscarMemoriasUsuarioSemanitcas(guildId, usuarioId, userEmbedding, 3); // top 3

        // Busca memórias da guild mais similares
        const topGuildMemories = await buscarMemoriasGuildSemanticas(guildId, userEmbedding, 2); // top 2

        // Combina e injeta memórias relevantes no system prompt
        const allRelevantMemories = [...topUserMemories, ...topGuildMemories];

        if (allRelevantMemories.length > 0) {
          // Separa memórias do usuário e da guild
          const userMemoryFacts = topUserMemories.map(m => `- ${m.fact}`);
          const guildMemoryFacts = topGuildMemories.map(m => `- ${m.fact}`);

          if (userMemoryFacts.length > 0) {
            systemPrompt += `\n\n[user_memories]\n${userMemoryFacts.join('\n')}\n[/user_memories]`;
          }

          if (guildMemoryFacts.length > 0) {
            systemPrompt += `\n\n**Memórias relevantes sobre este servidor:**\n${guildMemoryFacts.join('\n')}`;
          }

          console.log(`[OAI_SEMANTIC][INFO] Injetadas ${topUserMemories.length} memórias de usuário e ${topGuildMemories.length} memórias da guild`);
        } else {
          console.log('[OAI_SEMANTIC][INFO] Nenhuma memória relevante encontrada via busca semântica');
        }
      } catch (embedError) {
        console.error('[OAI_SEMANTIC][ERRO] Falha na busca semântica de memórias:', embedError.message);
        // Fallback: carrega memórias recentes caso a busca semântica falhe
        try {
          console.log('[OAI_SEMANTIC][INFO] Tentando fallback para carregamento de memórias recentes...');

          // Carrega últimas memórias como fallback (não semântico)
          const guildMems = database.listarMemoriasGuild(guildId, 5); // últimos 5
          if (guildMems && guildMems.length > 0) {
            const memoriasTexto = guildMems.map(m => `- ${m.fact}`).join('\n');
            systemPrompt += `\n\n**Memórias recentes sobre este servidor:**\n${memoriasTexto}`;
          }

          const userMems = database.listarMemoriasUsuario(guildId, usuarioId, 5); // últimos 5
          if (userMems && userMems.length > 0) {
            const memoriasUsuarioTexto = userMems.map(m => `- ${m.fact}`).join('\n');
            systemPrompt += `\n\n[user_memories]${memoriasUsuarioTexto}[/user_memories]`;
          }

          console.log('[OAI_SEMANTIC][INFO] Fallback realizado com sucesso');
        } catch (fallbackError) {
          console.error('[OAI_SEMANTIC][ERRO] Fallback também falhou:', fallbackError.message);
        }
      }

      // Carrega ranking de participação e injeta no system prompt
      try {
        const ranking = database.buscarRank(guildId, 5);
        if (ranking && ranking.length > 0) {
          const rankingLines = ranking.map((user, index) =>
            `${index + 1}. <@${user.usuario_id}> (${user.xp} XP)`
          );
          systemPrompt += `\n\n**Ranking de participação:**\n${rankingLines.join(', ')}`;
        }
      } catch (e) {
        console.error('[OAI] Erro ao buscar ranking de participação:', e);
      }

      messages.push({ role: 'system', content: systemPrompt });
    }

    // Agora o histórico retorna IDs de mensagens do Discord
    const historyLimit = (config.settings && Number.isInteger(config.settings.historyLimit)) ? config.settings.historyLimit : 6;
    const historicoIds = await database.buscarHistoricoConversa(guildId, canalId, usuarioId, historyLimit);

   // Se tivermos o channel, buscamos o conteúdo atual das mensagens por ID
   let historicoTextos = [];
   if (channel && typeof channel.messages?.fetch === 'function') {
     try {
       const fetched = await Promise.all(
         historicoIds.map(async (id) => {
           try {
             const m = await channel.messages.fetch(id);
             if (m?.content) {
               return { content: m.content, authorId: m.author.id, username: m.author.username };
             }
             return null;
           } catch {
             return null;
           }
         })
       );
       historicoTextos = fetched.filter(Boolean);
     } catch (e) {
       console.warn('[WARN] Falha ao buscar histórico por IDs, seguindo sem histórico.', e?.message || e);
     }
   }

   for (const msg of historicoTextos) {
     const isBot = msg.authorId === botUserId;
     const content = isBot ? msg.content : `${msg.username}: ${msg.content} [meta]user:${msg.username}|id:${msg.authorId}[/meta]`;
     messages.push({ role: isBot ? 'assistant' : 'user', content: content });
   }

   // Add the current user message
   let userContent;
   if (imageUrl) {
     userContent = [
       { type: 'text', text: mensagemUsuario },
       { type: 'image_url', image_url: { url: imageUrl } }
     ];
   } else {
     userContent = mensagemUsuario;
   }

   messages.push({ role: 'user', content: userContent });

   try {
     // Use the full message array with system prompt and conversation history
     const response = await withRetries(
       () => openai.chat.completions.create({
         model: config.openai.model,
         messages,
         temperature: 0.8,
         max_tokens: config.settings.maxTokens,
       }),
       '[CHAT][resposta_contextual]'
     );

     const choice = response?.choices?.[0];
     const message = choice?.message;
     let content = message?.content || '';

     // Processa tags [salvar_memoria] usando tagParser com contexto (guildId)
     console.log(`[AI_RESPONSE_PROCESSOR][DEBUG] Context guildId: ${guildId}, AI response content length: ${content.length}`);
     console.log(`[AI_RESPONSE_PROCESSOR][DEBUG] AI response content (first 500 chars): ${content.substring(0, 500)}${content.length > 500 ? '...' : ''}`);
     const context = { guildId };
     const parsedTags = tagParser.parseTags(content, context);
     console.log(`[AI_RESPONSE_PROCESSOR][DEBUG] Parsed tags result - cleanedMessage length: ${parsedTags.cleanedMessage.length}, memories found: ${parsedTags.memories.length}`);
     let memoriesProcessed = 0;

     // Processa memórias encontradas nas tags
     if (parsedTags.memories && parsedTags.memories.length > 0) {
       for (const memory of parsedTags.memories) {
         if (!memory.hasErrors) {
           try {
             console.log(`[AI_RESPONSE_PROCESSOR][INFO] Processando memória: ${memory.guildId}:${memory.userId}:${memory.fact}...`);
             const result = database.adicionarMemoriaUsuario(
               memory.guildId,
               memory.userId,
               memory.fact,
               {
                 importance: memory.importance,
                 confidence: memory.confidence,
                 sourceMessageId: sourceMessageId,
                 createdAt: Date.now()
               }
             );
             console.log(`[AI_RESPONSE_PROCESSOR][SUCCESS] Memória salva: inserted=${result.inserted} duplicate=${result.duplicate} importance=${memory.importance} confidence=${memory.confidence}`);
             memoriesProcessed++;
           } catch (memError) {
             console.error(`[AI_RESPONSE_PROCESSOR][ERROR] Falha ao salvar memória: ${memError.message}`);
           }
         } else {
           console.warn(`[AI_RESPONSE_PROCESSOR][WARN] Memória com erros ignorada: ${memory.errorMessage}`);
         }
       }
     }

     if (memoriesProcessed > 0) {
       console.log(`[AI_RESPONSE_PROCESSOR][INFO] Total memórias processadas: ${memoriesProcessed}`);
     }

     // Usa o conteúdo limpo do tagParser (tags já removidas)
     content = parsedTags.cleanedMessage;

     if (!content) {
       // Caso não haja conteúdo mas houve impegnias memórias processadas, assume sucesso
       if (memoriesProcessed > 0) {
         console.log('[AI_RESPONSE_PROCESSOR][INFO] Sem conteúdo textual, mas memórias salvas com sucesso');
         content = 'Memória salva/atualizada com sucesso!';
       } else {
         throw new Error('A API não retornou conteúdo na resposta.');
       }
     }
     return content;
   } catch (error) {
     console.error('[ERRO] Não consegui gerar uma resposta pela API da OpenAI:', error.message);
     throw error;
   }
 }

 // Função para gerar comentário baseado em conversa via API
  async function gerarComentarioViaAPI(conversationText) {
    const messages = [];
    if (config.openai.sendSystemPrompt !== false) {
      const systemPrompt = await carregarSystemPrompt();
      messages.push({ role: 'system', content: systemPrompt });
    }

    messages.push({
      role: 'user',
      content: `Analise a seguinte conversa do Discord e faça um comentário interessante ou engraçado sobre ela:\n\n${conversationText}`,
    });

    try {
      const response = await withRetries(
        () => openai.chat.completions.create({
          model: config.openai.model,
          messages,
          temperature: 0.8,
          max_tokens: config.settings.maxTokens,
        }),
        '[CHAT][comentario]'
      );

     // /* --- Logging da Resposta Raw da API --- */
     console.log('[OAI][DEBUG] Resposta raw da API recebida (gerarComentarioViaAPI):');
     console.log(`- Status HTTP: ${response.status || 'N/A'}`);
     console.log(`- Cabeçalhos importantes:`, {
       'content-type': response.headers?.get?.('content-type') || 'N/A',
       'x-ratelimit-remaining': response.headers?.get?.('x-ratelimit-remaining') || 'N/A'
     });

     // Sanitizar resposta para logging (remover dados sensíveis)
     const sanitizedResponse = {
       id: response.id,
       object: response.object,
       created: response.created,
       model: response.model,
       choices: response.choices,
       usage: response.usage
     };
     console.log('- Resposta completa (sanitizada):', JSON.stringify(sanitizedResponse, null, 2));
     console.log('- Detalhes de choices[0]:', response.choices?.[0] ? JSON.stringify(response.choices[0], null, 2) : 'N/A');

     const mainChoice = response.choices?.[0];
     if (mainChoice) {
       console.log('- Tipo da resposta:', typeof mainChoice);
       console.log('- Tem mensagem:', !!mainChoice.message);
       if (mainChoice.message) {
         console.log('- Conteúdo da mensagem:', mainChoice.message.content ? 'Presente' : 'Ausente');
         console.log('- Tool calls:', mainChoice.message.tool_calls ? `Presente (${mainChoice.message.tool_calls.length})` : 'Ausente');
       }
       console.log('- Finish reason:', mainChoice.finish_reason || 'N/A');
     } else {
       console.log('- ERRO: Não há choices[0] na resposta!');
     }

     const content = response?.choices?.[0]?.message?.content;
     if (!content) throw new Error('A API não retornou conteúdo na resposta.');
     return content.trim();
   } catch (error) {
     console.error('[ERRO] Não consegui gerar comentário pela API da OpenAI:', error.message);
     throw error;
   }
   }
 
 /* --- Funções de Busca Semântica com Embeddings --- */

 // Função auxiliar para calcular similaridade ponderada considerando importância
 function calculateWeightedSimilarity(baseSimilarity, importance, configWeight) {
   const weight = configWeight || 0.1; // peso padrão de 0.1
   const importanceMultiplier = 1 + (importance || 5) * weight / 10; // normaliza 1-10 para multiplicador
   return baseSimilarity * importanceMultiplier;
 }

 // Função para buscar memórias de usuário por similaridade de embedding
 async function buscarMemoriasUsuarioSemanitcas(guildId, userId, userEmbedding, topK = 3) {
   try {
     console.log(`[SEMANTIC_SEARCH][INFO] Buscando memórias semânticas de usuário ${userId} em guild ${guildId}, topK=${topK}`);

     const userMemories = database.listarMemoriasUsuarioComEmbedding(guildId, userId, 100); // limit to 100 for performance
     console.log(`[SEMANTIC_SEARCH][INFO] Encontradas ${userMemories.length} memórias de usuário com embeddings`);

     const similarities = [];

     for (const memory of userMemories) {
       try {
         if (memory.embedding) {
           const memoryEmbedding = JSON.parse(memory.embedding);
           const similarity = cosineSimilarity(userEmbedding, memoryEmbedding);

           // Calcula similaridade ponderada pela importância
           const weightedSimilarity = calculateWeightedSimilarity(similarity, memory.importance, config.ai?.memory_weight || 0.1);

           similarities.push({
             ...memory,
             embedding: undefined, // remove embedding to save memory
             baseSimilarity: similarity,
             weightedSimilarity: weightedSimilarity
           });
         }
       } catch (embedParseError) {
         console.warn(`[SEMANTIC_SEARCH][WARN] Erro ao processar embedding da memória ${memory.id}:`, embedParseError.message);
       }
     }

     // Ordenar por similaridade ponderada decrescente e retornar top K
     similarities.sort((a, b) => b.weightedSimilarity - a.weightedSimilarity);
     const topMemories = similarities.slice(0, topK);

     console.log(`[SEMANTIC_SEARCH][INFO] Retornadas ${topMemories.length} memórias de usuário mais similares`);
     return topMemories;

   } catch (error) {
     console.error('[SEMANTIC_SEARCH][ERRO] Falha ao buscar memórias semânticas de usuário:', error.message);
     return [];
   }
 }

 // Função para buscar memórias da guild por similaridade de embedding
 async function buscarMemoriasGuildSemanticas(guildId, userEmbedding, topK = 2) {
   try {
     console.log(`[SEMANTIC_SEARCH][INFO] Buscando memórias semânticas da guild ${guildId}, topK=${topK}`);

     const guildMemories = database.listarMemoriasGuildComEmbedding(guildId, 100); // limit to 100 for performance
     console.log(`[SEMANTIC_SEARCH][INFO] Encontradas ${guildMemories.length} memórias da guild com embeddings`);

     const similarities = [];

     for (const memory of guildMemories) {
       try {
         if (memory.embedding) {
           const memoryEmbedding = JSON.parse(memory.embedding);
           const similarity = cosineSimilarity(userEmbedding, memoryEmbedding);

           // Memórias da guild não têm campo importance, similaridade simples
           similarities.push({
             ...memory,
             embedding: undefined, // remove embedding to save memory
             baseSimilarity: similarity,
             weightedSimilarity: similarity
           });
         }
       } catch (embedParseError) {
         console.warn(`[SEMANTIC_SEARCH][WARN] Erro ao processar embedding da memória da guild ${memory.id}:`, embedParseError.message);
       }
     }

     // Ordenar por similaridade decrescente e retornar top K
     similarities.sort((a, b) => b.weightedSimilarity - a.weightedSimilarity);
     const topMemories = similarities.slice(0, topK);

     console.log(`[SEMANTIC_SEARCH][INFO] Retornadas ${topMemories.length} memórias da guild mais similares`);
     return topMemories;

   } catch (error) {
     console.error('[SEMANTIC_SEARCH][ERRO] Falha ao buscar memórias semânticas da guild:', error.message);
     return [];
   }
 }

 /* --- Funções de Processamento de Embeddings --- */

 // Função para gerar embedding usando o modelo especificado no config
 async function gerarEmbedding(text) {
   if (!text || typeof text !== 'string') {
     console.error('[EMBEDDING][ERRO] Texto inválido fornecido para gerarEmbedding');
     throw new Error('Texto deve ser uma string não vazia');
   }

   try {
     console.log(`[EMBEDDING][INFO] Gerando embedding para texto de ${text.length} caracteres usando modelo ${config.openai.model_embeddings}`);

     const response = await withRetries(
       () => openai.embeddings.create({
         model: config.openai.model_embeddings,
         input: text,
       }),
       '[EMBEDDING]'
     );

     const embedding = response?.data?.[0]?.embedding;
     if (!embedding) {
       throw new Error('A API não retornou os dados de embedding na resposta');
     }

     console.log(`[EMBEDDING][INFO] Embedding gerado com sucesso: ${embedding.length} dimensões`);
     return embedding; // Retorna o array de floats diretamente
   } catch (error) {
     console.error('[EMBEDDING][ERRO] Falha ao gerar embedding:', error.message);
     throw error;
   }
 }
 
 // Função para calcular similaridade coseno entre dois vetores
 function cosineSimilarity(vecA, vecB) {
   if (!Array.isArray(vecA) || !Array.isArray(vecB)) {
     console.error('[COSINE][ERRO] Ambos os parâmetros devem ser arrays');
     throw new Error('vecA e vecB devem ser arrays');
   }
 
   if (vecA.length !== vecB.length) {
     console.error('[COSINE][ERRO] Vetores devem ter o mesmo tamanho:', vecA.length, 'vs', vecB.length);
     throw new Error('Vetores devem ter o mesmo comprimento');
   }
 
   if (vecA.length === 0) {
     console.error('[COSINE][ERRO] Vetores não podem estar vazios');
     throw new Error('Vetores não podem estar vazios');
   }
 
   try {
     let dotProduct = 0;
     let normA = 0;
     let normB = 0;
 
     for (let i = 0; i < vecA.length; i++) {
       const a = parseFloat(vecA[i]);
       const b = parseFloat(vecB[i]);
 
       if (isNaN(a) || isNaN(b)) {
         console.error('[COSINE][ERRO] Valores não numéricos encontrados nos vetores');
         throw new Error('Todos os elementos dos vetores devem ser números');
       }
 
       dotProduct += a * b;
       normA += a * a;
       normB += b * b;
     }
 
     const magnitudeA = Math.sqrt(normA);
     const magnitudeB = Math.sqrt(normB);
 
     if (magnitudeA === 0 || magnitudeB === 0) {
       console.warn('[COSINE][WARN] Um dos vetores tem magnitude zero, retornando similaridade 0');
       return 0;
     }
 
     const similarity = dotProduct / (magnitudeA * magnitudeB);
     console.log(`[COSINE][INFO] Similaridade coseno calculada: ${similarity.toFixed(4)}`);
     return similarity;
   } catch (error) {
     console.error('[COSINE][ERRO] Falha ao calcular similaridade coseno:', error.message);
     throw error;
   }
 }
 
 module.exports = {
   gerarPerguntaViaAPI,
   gerarRespostaContextual,
   gerarParabensCargoViaAPI,
   gerarMensagemBemVindoViaAPI,
   gerarComentarioViaAPI,
   gerarEmbedding,
   cosineSimilarity,
   // Funções de busca semântica
   buscarMemoriasUsuarioSemanitcas,
   buscarMemoriasGuildSemanticas,
   // Configuração de peso para memórias (função auxiliar)
   calculateWeightedSimilarity,
 };