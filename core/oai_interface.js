/*
** caminho: core/oai_interface.js
** últimaMod: 02/09/2025 18:14
** autor: Vico
** colaboração: Gemini, ChatGPT, Roo Sonic
*/

const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const config = require('../config.json');
const database = require('../core/database');


/* --- Funções Helper Para Processar Chamadas de Ferramentas --- */

// Função helper para extrair tool calls de uma choice de forma robusta
function extractToolCallsFromChoice(choice) {
  try {
    // Verificar diferentes formatos possíveis
    const message = choice?.message;
    if (!message) {
      console.warn('[EXTRACT_TOOL][WARN] Choice.message ausente');
      return [];
    }

    const toolCalls = message.tool_calls;
    if (toolCalls) {
      console.log(`[EXTRACT_TOOL][INFO] Encontradas ${toolCalls.length} tool calls na mensagem`);
      return toolCalls;
    }

    // Fallback: verificar se está na propriedade 'function_call' (formato antigo)
    if (message.function_call) {
      console.warn('[EXTRACT_TOOL][WARN] Detectado formato antigo function_call, convertendo para tool_calls');
      return [{
        id: 'legacy_function_call',
        type: 'function',
        function: message.function_call
      }];
    }

    console.log('[EXTRACT_TOOL][INFO] Nenhuma tool call encontrada na mensagem');
    return [];
  } catch (error) {
    console.error('[EXTRACT_TOOL][ERRO] Falha ao extrair tool calls:', error.message);
    return [];
  }
}

// Função helper para processar tool calls e executar as funções
function processToolCallsFromResponse(toolCalls, guildId, context = {}) {
  if (!toolCalls || toolCalls.length === 0) {
    console.log('[PROCESS_TOOL][INFO] Nenhuma tool call para processar');
    return { success: true, processed: 0 };
  }

  console.log(`[PROCESS_TOOL][INFO] Processando ${toolCalls.length} tool calls`);

  let processed = 0;
  const results = [];

  for (const toolCall of toolCalls) {
    try {
      if (toolCall.function?.name === 'salvar_memoria') {
        const args = parseJsonSafely(toolCall.function.arguments, context.moduleTag || '[TOOL]');
        if (args) {
          // Sanitizar o fato
          const sanitizedFato = sanitizeFato(args.fato);

          // Validate importance (1-10, fallback 5)
          let importance = args.importance;
          if (typeof importance !== 'number' || importance < 1 || importance > 10) {
            importance = 5; // default fallback
          }
          importance = Math.round(importance); // ensure integer

          // Validate confidence (0-1, fallback 1.0)
          let confidence = args.confidence;
          if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
            confidence = 1.0; // default fallback
          }

          const result = database.adicionarMemoriaUsuario(
            args.guild_id || guildId,
            args.user_id,
            sanitizedFato,
            {
              importance: importance,
              confidence: confidence,
              sourceMessageId: args.source_message_id || context.sourceMessageId,
              createdAt: args.timestamp || Date.now()
            }
          );

          console.log(`[${context.moduleTag || 'TOOL'}][TOOL] salvar_memoria guild=${args.guild_id || guildId} user=${args.user_id} fact="${sanitizedFato}" importance=${importance} confidence=${confidence} inserted=${result.inserted} duplicate=${result.duplicate}`);
          results.push({ function: 'salvar_memoria', result, success: true });
          processed++;
        }
      } else {
        console.warn(`[PROCESS_TOOL][WARN] Tool call não reconhecida: ${toolCall.function?.name}`);
        results.push({ function: toolCall.function?.name, error: 'Função não reconhecida', success: false });
      }
    } catch (e) {
      console.error(`[PROCESS_TOOL][ERRO] Falha ao processar tool call ${toolCall.function?.name}:`, e?.message || e);
      results.push({ function: toolCall.function?.name, error: e.message, success: false });
    }
  }

  return { success: true, processed, results };
}

// Função para parse de JSON com fallback via regex
function parseJsonSafely(jsonString, moduleTag = '[PARSE]') {
  try {
    // Tentar parse normal primeiro
    return JSON.parse(jsonString);
  } catch (parseError) {
    console.warn(`${moduleTag}[JSON_PARSE][WARN] Parse JSON normal falhou, tentando regex fallback:`, parseError.message);

    // Fallback: tentar extrair argumentos via regex
    const regexPattern = /"(\w+)":\s*(?:"([^"]*)"|(\d+(?:\.\d+)?))/g;
    const args = {};
    let match;

    try {
      while ((match = regexPattern.exec(jsonString)) !== null) {
        const [, key, strValue, numValue] = match;
        args[key] = strValue !== undefined ? strValue : (numValue ? parseFloat(numValue) : match[0]);
      }

      if (Object.keys(args).length === 0) {
        throw new Error('Nenhum argumento extraído via regex');
      }

      console.log(`${moduleTag}[JSON_PARSE][INFO] Extraído via regex:`, args);
      return args;
    } catch (regexError) {
      console.error(`${moduleTag}[JSON_PARSE][ERRO] Fallback regex também falhou:`, regexError.message);
      return null;
    }
  }
}

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
   
   // Função para extrair comandos das tags <vica>...</vica>
   function parseTagCommands(content) {
     const commands = [];
     const tagRegex = /<vica>(.*?)<\/vica>/gs;
     let match;

     // Log original content before processing
     console.log(`[PARSE_TAG][DEBUG] Iniciando processamento de tags. Conteúdo original: "${content}"`);

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
    const now = new Date();
    const formattedTime = now.toLocaleTimeString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit'
    });
    const formattedDate = now.toLocaleDateString('pt-BR', {
      timeZone: 'America/Sao_Paulo'
    });
    const datetimeString = `São ${formattedTime} do dia ${formattedDate}.`;

    prompt += `\n\n${datetimeString}`;

    return prompt;
  } catch (err) {
    console.error('[ERRO] Não foi possível ler system_prompt.txt:', err);
    return 'Você é uma IA que responde a mensagens de forma criativa e útil.';
  }
}

// Custom fetch function to mimic curl headers and avoid API blocking
const customFetch = async (url, options = {}) => {
  const fetch = require('node-fetch');

  // Build headers conditionally to avoid empty Authorization header
  const minimalHeaders = {
    'Content-Type': 'application/json',
    'User-Agent': 'curl/7.81.0', // Mimic curl's user agent
  };

  // Only add Authorization header if it exists and is not empty
  if (options.headers?.Authorization && options.headers.Authorization.trim() !== '') {
    minimalHeaders['Authorization'] = options.headers.Authorization;
  } else {
    // If no Authorization header, construct it from config
    const config = require('../config.json');
    if (config.openai?.api_key) {
      minimalHeaders['Authorization'] = `Bearer ${config.openai.api_key}`;
    }
  }

  // Remove problematic headers that might cause blocking
  const cleanOptions = {
    ...options,
    headers: minimalHeaders,
  };


  return fetch(url, cleanOptions);
};

const openai = new OpenAI({
  apiKey: config.openai.api_key,
  baseURL: config.openai.base_url,
  fetch: customFetch, // Use our custom fetch function
});

 
// Função do comando /perguntar
async function gerarPerguntaViaAPI(promptUsuario = null) {
  const systemPrompt = await carregarSystemPrompt();
  const messages = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: promptUsuario || '/perguntar acionado!',
    },
  ];
  try {
    const response = await openai.chat.completions.create({
      model: config.openai.model,
      messages,
      temperature: 0.9,
      max_tokens: config.settings.maxTokens,
    });

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
  const systemPrompt = await carregarSystemPrompt();
  const messages = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: promptUsuario,
    },
  ];

  try {
    const response = await openai.chat.completions.create({
      model: config.openai.model,
      messages,
      temperature: 0.8,
      max_tokens: 100, // Slightly higher for more complete responses
    });

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
    content = content.replace(/<vica>.*?<\/vica>/gs, '').trim();
    console.log(`[ROLE-CONGRATS][CLEAN] Conteúdo limpo após remoção de tags. Original (com tags): "${originalTaggedContent}". Limpo: "${content}"`);
    return content;
  } catch (error) {
    console.error('[ERRO] Não consegui gerar parabéns pela API da OpenAI:', error.message);
    throw error;
  }
}

   // Função para gerar mensagens de boas-vindas/saída via API
 async function gerarMensagemBemVindoViaAPI(guildId, userId, userName, messageType, prompt) {
   const systemPrompt = await carregarSystemPrompt();
   const messages = [
     { role: 'system', content: systemPrompt },
     {
       role: 'user',
       content: prompt.replace(/\{@USER\}/g, `<@${userId}>`).replace(/\{USER\}/g, userName),
     },
   ];
 
   try {
     const response = await openai.chat.completions.create({
       model: config.openai.model,
       messages,
       temperature: 0.8,
       max_tokens: config.settings.maxTokens,
     });
 
     const choice = response?.choices?.[0];
     const message = choice?.message;
     let content = message?.content || '';
 
     // Processa comandos de tags usando helpers de tags
     const commands = parseTagCommands(content);
     const tagResults = processTagCommands(commands, guildId, {
       moduleTag: '[WELCOME]',
       sourceMessageId: null
     });
 
     if (tagResults.processed > 0) {
       console.log(`[WELCOME][TAG] Processadas ${tagResults.processed} comandos de tags`);
     }
 
     if (!content) throw new Error('A API não retornou conteúdo na resposta.');
 
     // Strip tags from content before returning
     const originalTaggedContent = content;
     content = content.replace(/<vica>.*?<\/vica>/gs, '').trim();
     console.log(`[WELCOME][CLEAN] Conteúdo limpo após remoção de tags. Original (com tags): "${originalTaggedContent}". Limpo: "${content}"`);
     return content;
   } catch (error) {
     console.error(`[ERRO] Não consegui gerar mensagem de ${messageType} pela API da OpenAI:`, error.message);
     throw error;
   }
 }
 
 // Função para gerar uma resposta à partir da API
 async function gerarRespostaContextual(guildId, canalId, usuarioId, botUserId, mensagemUsuario, imageUrl = null, channel = null, sourceMessageId = null) {
   let systemPrompt = await carregarSystemPrompt();

   // Carrega memórias da guild e injeta no system prompt
   try {
     const guildMems = database.listarMemoriasGuild(guildId);
     if (guildMems && guildMems.length > 0) {
       const memoriasTexto = guildMems.map(m => `- ${m.fact}`).join('\n');
       systemPrompt += `\n\n**Memórias sobre este servidor (use-as para guiar suas respostas):**\n${memoriasTexto}`;
     }
   } catch (e) {
     console.error('[OAI] Erro ao buscar memórias da guild:', e);
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

   // Carrega memórias específicas do usuário e injeta no system prompt
   try {
     const userMems = database.listarMemoriasUsuario(guildId, usuarioId);
     if (userMems && userMems.length > 0) {
       const memoriasUsuarioTexto = userMems.map(m => `- ${m.fact}`).join('\n');
       systemPrompt += `\n\n**Memórias sobre este usuário (use-as para guiar suas respostas):**\n${memoriasUsuarioTexto}`;
     }
   } catch (e) {
     console.error('[OAI] Erro ao buscar memórias do usuário:', e);
   }


   // Agora o histórico retorna IDs de mensagens do Discord
   const historicoIds = await database.buscarHistoricoConversa(guildId, canalId, usuarioId);

   const messages = [
     { role: 'system', content: systemPrompt }
   ];

   // Se tivermos o channel, buscamos o conteúdo atual das mensagens por ID
   let historicoTextos = [];
   if (channel && typeof channel.messages?.fetch === 'function') {
     try {
       const fetched = await Promise.all(
         historicoIds.map(async (id) => {
           try {
             const m = await channel.messages.fetch(id);
             if (m?.content) {
               return { content: m.content, authorId: m.author.id };
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
     messages.push({ role: isBot ? 'assistant' : 'user', content: msg.content });
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
     const response = await openai.chat.completions.create({
       model: config.openai.model,
       messages,
       temperature: 0.8,
       max_tokens: config.settings.maxTokens,
     });

     const choice = response?.choices?.[0];
     const message = choice?.message;
     let content = message?.content || '';

     // Processa chamadas de ferramentas usando helpers robustos
     const commands = parseTagCommands(content);
     const tagResults = processTagCommands(commands, guildId, {
       moduleTag: '[VICA]',
       sourceMessageId
     });

     if (tagResults.processed > 0) {
       console.log(`[VICA][TAG] Processadas ${tagResults.processed} comandos de tags`);
     }

     if (!content) {
       // Caso não haja conteúdo mas houve comandos de tags, assume sucesso
       if (tagResults.processed > 0) {
         console.log('[VICA][TAG] Sem conteúdo textual, mas comandos de tags executados com sucesso');
         content = 'Memória salva/atualizada com sucesso!';
       } else {
         throw new Error('A API não retornou conteúdo na resposta.');
       }
     }

     // Strip tags from content before returning
     const originalTaggedContent = content;
     content = content.replace(/<vica>.*?<\/vica>/gs, '').trim();
     // console.log(`[VICA][CLEAN] Conteúdo limpo após remoção de tags. Original (com tags): "${originalTaggedContent}". Limpo: "${content}"`);
     return content;
   } catch (error) {
     console.error('[ERRO] Não consegui gerar uma resposta pela API da OpenAI:', error.message);
     throw error;
   }
 }

 // Função para gerar comentário baseado em conversa via API
 async function gerarComentarioViaAPI(conversationText) {
   const systemPrompt = await carregarSystemPrompt();
   const messages = [
     { role: 'system', content: systemPrompt },
     {
       role: 'user',
       content: `Analise a seguinte conversa do Discord e faça um comentário interessante ou engraçado sobre ela:\n\n${conversationText}`,
     },
   ];

   try {
     const response = await openai.chat.completions.create({
       model: config.openai.model,
       messages,
       temperature: 0.8,
       max_tokens: config.settings.maxTokens,
     });

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

module.exports = {
  gerarPerguntaViaAPI,
  gerarRespostaContextual,
  gerarParabensCargoViaAPI,
  gerarMensagemBemVindoViaAPI,
  gerarComentarioViaAPI,
};