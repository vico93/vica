/*
** caminho: core/oai_interface.js
** últimaMod: 31/08/2025 19:55
** autor: Vico
** colaboração: Gemini, ChatGPT, Roo Sonic
*/

const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const config = require('../config.json');
const database = require('../core/database');

// Define a função para salvar memórias de longo prazo
const salvarMemoriaFunction = {
  name: 'salvar_memoria',
  description: 'Salva uma memória de longo prazo sobre um usuário do Discord baseada em fatos estáveis, como preferências, hábitos ou marcos pessoais. Use apenas para informações valiosas e não sensíveis.',
  parameters: {
    type: 'object',
    properties: {
      user_id: {
        type: 'string',
        description: 'O ID numérico do usuário no Discord (ex: "171003562363584513").'
      },
      fato: {
        type: 'string',
        description: 'Um fato curto em português sobre o usuário (máx. ~200 caracteres, sem quebras de linha). Ex: "Gosta de maçãs", "Torcedor do São Paulo".'
      }
    },
    required: ['user_id', 'fato']
  }
};

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
      tools: [salvarMemoriaFunction],
    });

    const message = response?.choices?.[0]?.message;
    let content = message?.content || '';

    // Processa chamadas de ferramentas (function calls)
    if (message?.tool_calls) {
      for (const toolCall of message.tool_calls) {
        if (toolCall.function.name === 'salvar_memoria') {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            const result = database.adicionarMemoriaUsuario(guildId, args.user_id, args.fato, {
              createdAt: Date.now()
            });
            console.log(`[ROLE-CONGRATS][TOOL] salvar_memoria guild=${guildId} user=${args.user_id} fact="${args.fato}" inserted=${result.inserted} duplicate=${result.duplicate}`);
          } catch (e) {
            console.error('[ROLE-CONGRATS][TOOL][ERRO] Falha ao processar chamada de ferramenta salvar_memoria:', e?.message || e);
          }
        }
      }
    }

    if (!content) throw new Error('A API não retornou conteúdo na resposta.');

    // Adiciona automaticamente uma memória sobre o usuário estar no cargo
    if (roleName && userId) {
      try {
        const memoria = `Está no cargo ${roleName}`;
        database.adicionarMemoriaUsuario(guildId, userId, memoria, {
          createdAt: Date.now()
        });
        console.log(`[ROLE-CONGRATS][MEM] Memória adicionada para usuário ${userId}: ${memoria}`);
      } catch (memError) {
        console.error('[ROLE-CONGRATS][MEM] Erro ao salvar memória do cargo:', memError);
      }
    }

    return content.trim();
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
     // Create a clean request without tools to test basic functionality
     const requestBody = {
       model: config.openai.model,
       messages,
       temperature: 0.8,
       max_tokens: config.settings.maxTokens,
       tools: [salvarMemoriaFunction],
     };

     const response = await openai.chat.completions.create(requestBody);
 
     const message = response?.choices?.[0]?.message;
     let content = message?.content || '';
 
     // Processa chamadas de ferramentas (function calls)
     if (message?.tool_calls) {
       for (const toolCall of message.tool_calls) {
         if (toolCall.function.name === 'salvar_memoria') {
           try {
             const args = JSON.parse(toolCall.function.arguments);
             const result = database.adicionarMemoriaUsuario(guildId, args.user_id, args.fato, {
               createdAt: Date.now()
             });
             console.log(`[WELCOME][TOOL] salvar_memoria guild=${guildId} user=${args.user_id} fact="${args.fato}" inserted=${result.inserted} duplicate=${result.duplicate}`);
           } catch (e) {
             console.error('[WELCOME][TOOL][ERRO] Falha ao processar chamada de ferramenta salvar_memoria:', e?.message || e);
           }
         }
       }
     }
 
     if (!content) throw new Error('A API não retornou conteúdo na resposta.');
 
     return content.trim();
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
     console.log('[DEBUG] Sending request to OpenAI API:');
     console.log(`- Model: ${config.openai.model}`);
     console.log(`- Messages count: ${messages.length}`);
     console.log(`- First message type: ${messages[0]?.role}/${typeof messages[0]?.content === 'object' ? messages[0]?.content?.type || 'array' : 'text'}`);
     console.log(`- Has tools: true`);
     console.log(`- Tools length: 1`);
     console.log(`- System prompt length: ${systemPrompt.length} characters`);
     console.log(`- Request excerpt:`, {
       model: config.openai.model,
       messages: messages.length,
       temperature: 0.8,
       max_tokens: config.settings.maxTokens,
       tools: ['salvar_memoria']
     });
     const response = await openai.chat.completions.create({
       model: config.openai.model,
       messages,
       temperature: 0.8,
       max_tokens: config.settings.maxTokens,
       tools: [salvarMemoriaFunction],
     });

     const message = response?.choices?.[0]?.message;
     let content = message?.content || '';

     // Processa chamadas de ferramentas (function calls)
     if (message?.tool_calls) {
       for (const toolCall of message.tool_calls) {
         if (toolCall.function.name === 'salvar_memoria') {
           try {
             const args = JSON.parse(toolCall.function.arguments);
             const result = database.adicionarMemoriaUsuario(guildId, args.user_id, args.fato, {
               sourceMessageId
             });
             console.log(`[VICA][TOOL] salvar_memoria guild=${guildId} user=${args.user_id} fact="${args.fato}" inserted=${result.inserted} duplicate=${result.duplicate}`);
           } catch (e) {
             console.error('[VICA][TOOL][ERRO] Falha ao processar chamada de ferramenta salvar_memoria:', e?.message || e);
           }
         }
       }
     }

     if (!content) {
       // Caso não haja conteúdo mas houve chamadas de ferramentas, assume sucesso
       if (message?.tool_calls?.length > 0) {
         console.log('[VICA][TOOL] Sem conteúdo textual, mas ferramentas executadas com sucesso');
         content = 'Memória salva/atualizada com sucesso!';
       } else {
         throw new Error('A API não retornou conteúdo na resposta.');
       }
     }

     // Remove qualquer referência a ferramentas do conteúdo final
     const cleaned = content.trim();
     return cleaned;
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