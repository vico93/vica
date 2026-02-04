/*
** caminho: core/oai_interface.js
** últimaMod: 2025-09-24 00:37
** autor: Vico
** colaboração: Gemini, ChatGPT, Grok Code (Fast), GPT-5
*/

const OpenAI = require('openai');
const path = require('path');
const fs = require('fs');
const config = require('../config.json');
const database = require('../core/database');
const tagParser = require('../core/tagParser');
const toolLoader = require('../core/tool_loader');

const rateLimitMap = new Map();

/* --- Funções Helper Para Processar Chamadas de Ferramentas --- */
// (Removido suporte a tool-calls; manteremos somente tags SGML via tagParser)

/* --- Helper para detecção de thread de conversa --- */
// Função auxiliar para determinar se uma mensagem deve ser incluída no contexto da conversa
function shouldIncludeMessageInContext(message, originalAuthorId, botUserId) {
  // Sempre incluir mensagens do autor original
  if (message.author.id === originalAuthorId) {
    return true;
  }

  // Sempre incluir respostas do bot
  if (message.author.id === botUserId) {
    return true;
  }

  // Incluir mensagens que mencionam o autor original ou o bot
  if (message.mentions && (message.mentions.users.has(originalAuthorId) || message.mentions.users.has(botUserId))) {
    return true;
  }

  // Incluir mensagens que são respostas diretas ao autor original ou ao bot
  if (message.reference) {
    // Para casos onde temos o message.reference.guildId, mas pode não ter o messageId completo
    // Vamos assumir que se há referência, pode ser relevante
    return true;
  }

  // Para outros casos, incluir apenas se for uma mensagem recente e relevante
  // (evitar incluir mensagens muito antigas ou irrelevantes)
  const messageAge = Date.now() - message.createdTimestamp;
  const maxAge = 30 * 60 * 1000; // 30 minutos

  if (messageAge < maxAge) {
    // Para mensagens recentes, incluir apenas se tiver conteúdo substancial
    return message.content && message.content.length > 10;
  }

  return false;
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

/* --- Funções Para Processar Tags SGML --- */
// Padronizado via tagParser.parseTags(message, context). Suporte a [vica] removido.

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


/* --- Configuração de Clientes OpenAI --- */
// Cliente para Requesty Responses API (prioritário)
let responsesClient = null;
// Cliente para OpenAI legado (fallback)
let legacyClient = null;

// Inicializa o cliente Responses API se configurado
if (config.requesty?.base_url && config.requesty?.api_key) {
  responsesClient = new OpenAI({
    apiKey: config.requesty.api_key,
    baseURL: config.requesty.base_url,
    defaultHeaders: {
      "X-Title": "Vica",
    },
  });
  console.log('[OAI][INFO] Cliente Responses API inicializado:', config.requesty.base_url);
}

// Inicializa o cliente legado se configurado (fallback)
if (config.openai?.base_url && config.openai?.api_key) {
  legacyClient = new OpenAI({
    apiKey: config.openai.api_key,
    baseURL: config.openai.base_url,
    defaultHeaders: {
      "X-Title": "Vica",
    },
  });
  console.log('[OAI][INFO] Cliente legado inicializado:', config.openai.base_url);
}

// Cliente principal (para compatibilidade com código existente)
// Usa Responses API se disponível, senão usa legado
const openai = responsesClient || legacyClient;

// Verifica se há pelo menos um cliente configurado
if (!openai) {
  throw new Error('Nenhum cliente OpenAI configurado. Configure config.requesty ou config.openai');
}
/* --- Helper para obter configuração de retry --- */
function getRetryConfig() {
  // Prioriza Requesty, depois legado
  if (config.requesty) {
    return {
      maxRetries: Number.isInteger(config.requesty.retries) ? config.requesty.retries : 3,
      baseDelay: Number.isInteger(config.requesty.initial_delay_ms) ? config.requesty.initial_delay_ms : 1000,
    };
  }
  // Fallback para configuração legada
  if (config.openai) {
    return {
      maxRetries: Number.isInteger(config.openai.retries) ? config.openai.retries : 3,
      baseDelay: Number.isInteger(config.openai.initial_delay_ms) ? config.openai.initial_delay_ms : 1000,
    };
  }
  // Valores padrão
  return {
    maxRetries: 3,
    baseDelay: 1000,
  };
}

/* --- Helper para obter modelo a ser usado --- */
function getModel() {
  // Prioriza Requesty
  if (config.requesty?.model) {
    return config.requesty.model;
  }
  // Fallback para configuração legada
  if (config.openai?.model) {
    return config.openai.model;
  }
  throw new Error('Nenhum modelo configurado. Configure config.requesty.model ou config.openai.model');
}

/* --- Helper para obter modelo de embeddings --- */
function getEmbeddingModel() {
  // Prioriza configuração de embeddings do Requesty
  if (config.requesty?.model_embeddings) {
    return config.requesty.model_embeddings;
  }
  // Fallback para configuração legada
  if (config.openai?.model_embeddings) {
    return config.openai.model_embeddings;
  }
  throw new Error('Nenhum modelo de embeddings configurado. Configure config.requesty.model_embeddings ou config.openai.model_embeddings');
}

/* --- Helper para obter cliente de embeddings --- */
function getEmbeddingClient() {
  // Usa o mesmo cliente principal (Requesty ou legado)
  if (openai) {
    return openai;
  }
  throw new Error('Nenhum cliente de embeddings configurado. Configure config.requesty ou config.openai');
}

/* --- Helper de Retry com Backoff Exponencial e Jitter --- */
async function withRetries(fn, label = 'OAI_CALL') {
  const { maxRetries, baseDelay } = getRetryConfig();

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
      const isNetwork = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'].includes(code);

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
  // Verifica se deve enviar system prompt (prioriza Requesty, depois legado)
  const sendSystemPrompt = config.requesty?.sendSystemPrompt !== false &&
    config.openai?.sendSystemPrompt !== false;

  if (sendSystemPrompt) {
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
        model: getModel(),
        messages,
        temperature: 0.8,
        max_tokens: config.settings.maxTokens,
      }),
      '[CHAT][perguntar]'
    );

    const content = response?.choices?.[0]?.message?.content;
    if (!content) throw new Error('A API não retornou conteúdo na resposta.');
    const parsedTags = tagParser.parseTags(content, { guildId: null });
    return parsedTags.cleanedMessage;
  } catch (error) {
    console.error('[ERRO] Não consegui gerar uma pergunta pela API:', error.message);
    throw error;
  }
}

/* --- Função Role Congratulation API --- */
// Função para gerar parabéns por cargo via API
async function gerarParabensCargoViaAPI(guildId, userId, promptUsuario, roleName) {
  const messages = [];
  // Verifica se deve enviar system prompt (prioriza Requesty, depois legado)
  const sendSystemPrompt = config.requesty?.sendSystemPrompt !== false &&
    config.openai?.sendSystemPrompt !== false;

  if (sendSystemPrompt) {
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
        model: getModel(),
        messages,
        temperature: 0.8,
        max_tokens: config.settings.maxTokens,
      }),
      '[CHAT][role_congrats]'
    );

    const choice = response?.choices?.[0];
    const message = choice?.message;
    let content = message?.content || '';

    if (!content) {
      console.error('[ROLE-CONGRATS][DEBUG] API Response missing content. Choice:', JSON.stringify(choice, null, 2));
      throw new Error('A API não retornou conteúdo na resposta.');
    }

    // Processa tags [salvar_memoria] usando tagParser com contexto (guildId)
    const parsedTags = tagParser.parseTags(content, { guildId });

    // Adiciona automaticamente uma memória sobre o usuário estar no cargo
    if (roleName && userId) {
      try {
        const memoria = sanitizeFato(`Está no cargo ${roleName}`);
        await database.adicionarMemoriaUsuario(guildId, userId, memoria, {
          createdAt: Date.now()
        });
        console.log(`[ROLE-CONGRATS][MEM] Memória adicionada para usuário ${userId}: ${memoria}`);
      } catch (memError) {
        console.error('[ROLE-CONGRATS][MEM] Erro ao salvar memória do cargo:', memError);
      }
    }

    // Usa o conteúdo limpo do tagParser (tags já removidas)
    content = parsedTags.cleanedMessage;
    return content;
  } catch (error) {
    console.error('[ERRO] Não consegui gerar parabéns pela API:', error.message);
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
  // Verifica se deve enviar system prompt (prioriza Requesty, depois legado)
  const sendSystemPrompt = config.requesty?.sendSystemPrompt !== false &&
    config.openai?.sendSystemPrompt !== false;

  if (sendSystemPrompt) {
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
        model: getModel(),
        messages,
        temperature: 0.8,
        max_tokens: config.settings.maxTokens,
      }),
      '[CHAT][welcome_flow]'
    );

    const choice = response?.choices?.[0];
    const message = choice?.message;
    let content = message?.content || '';

    if (!content) throw new Error('A API não retornou conteúdo na resposta.');

    // Processa tags [salvar_memoria] usando tagParser com contexto (guildId)
    const parsedTags = tagParser.parseTags(content, { guildId });

    // Usa o conteúdo limpo do tagParser (tags já removidas)
    content = parsedTags.cleanedMessage;
    return content;
  } catch (error) {
    console.error(`[ERRO] Não consegui gerar mensagem de ${messageType} pela API:`, error.message);
    throw error;
  }
}

// Função para gerar uma resposta à partir da API
async function gerarRespostaContextual(guildId, canalId, usuarioId, botUserId, mensagemUsuario, imageUrl = null, channel = null, sourceMessageId = null, originalAuthorId = null) {
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
  // Verifica se deve enviar system prompt (prioriza Requesty, depois legado)
  const sendSystemPrompt = config.requesty?.sendSystemPrompt !== false &&
    config.openai?.sendSystemPrompt !== false;

  if (sendSystemPrompt) {
    let systemPrompt = await carregarSystemPrompt();

    /* --- Busca Semântica de Memórias por Similaridade de Embedding (DESATIVADO - MIGRADO PARA MCP) --- */
    /*
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
    */

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

  // Nova lógica de thread de conversa com contexto melhorado
  let historicoTextos = [];

  // Se temos originalAuthorId (caso de reação), usar lógica de thread de conversa
  if (originalAuthorId && channel && typeof channel.messages?.fetch === 'function') {
    try {
      console.log(`[CONVERSATION_THREAD][INFO] Buscando thread de conversa para autor original ${originalAuthorId} no canal ${canalId}`);

      // Buscar mensagens recentes do canal (últimas 20 mensagens)
      const recentMessages = await channel.messages.fetch({ limit: 20 });

      // Filtrar mensagens relevantes para o contexto da conversa
      const relevantConversation = [];

      for (const [msgId, message] of recentMessages) {
        if (shouldIncludeMessageInContext(message, originalAuthorId, botUserId)) {
          relevantConversation.push({
            content: message.content,
            authorId: message.author.id,
            username: message.author.username,
            globalName: message.author.globalName || message.author.username,
            createdAt: message.createdTimestamp
          });
        }
      }

      // Ordenar por timestamp (mais antigas primeiro) e limitar
      relevantConversation.sort((a, b) => a.createdAt - b.createdAt);
      historicoTextos = relevantConversation.slice(-6); // últimas 6 mensagens relevantes

      console.log(`[CONVERSATION_THREAD][INFO] Encontradas ${historicoTextos.length} mensagens relevantes no thread de conversa`);

    } catch (e) {
      console.warn('[CONVERSATION_THREAD][WARN] Falha ao buscar thread de conversa, usando fallback.', e?.message || e);
      // Fallback para o método antigo se houver erro
      try {
        const historyLimit = (config.settings && Number.isInteger(config.settings.historyLimit)) ? config.settings.historyLimit : 6;
        const historicoIds = await database.buscarHistoricoConversa(guildId, canalId, usuarioId, historyLimit);

        const fetched = await Promise.all(
          historicoIds.map(async (id) => {
            try {
              const m = await channel.messages.fetch(id);
              if (m?.content) {
                return {
                  content: m.content,
                  authorId: m.author.id,
                  username: m.author.username,
                  globalName: m.author.globalName || m.author.username
                };
              }
              return null;
            } catch {
              return null;
            }
          })
        );
        historicoTextos = fetched.filter(Boolean);
      } catch (fallbackError) {
        console.warn('[CONVERSATION_THREAD][WARN] Fallback também falhou.', fallbackError?.message || fallbackError);
      }
    }
  } else {
    // Método tradicional para casos sem originalAuthorId (como comandos normais)
    try {
      const historyLimit = (config.settings && Number.isInteger(config.settings.historyLimit)) ? config.settings.historyLimit : 6;
      const historicoIds = await database.buscarHistoricoConversa(guildId, canalId, usuarioId, historyLimit);

      if (channel && typeof channel.messages?.fetch === 'function') {
        const fetched = await Promise.all(
          historicoIds.map(async (id) => {
            try {
              const m = await channel.messages.fetch(id);
              if (m?.content) {
                return {
                  content: m.content,
                  authorId: m.author.id,
                  username: m.author.username,
                  globalName: m.author.globalName || m.author.username
                };
              }
              return null;
            } catch {
              return null;
            }
          })
        );
        historicoTextos = fetched.filter(Boolean);
      }
    } catch (e) {
      console.warn('[WARN] Falha ao buscar histórico tradicional, seguindo sem histórico.', e?.message || e);
    }
  }

  for (const msg of historicoTextos) {
    const isBot = msg.authorId === botUserId;
    const content = isBot ? msg.content : `${msg.username}: ${msg.content} [meta]user:${msg.username}|globalname:${msg.globalName}|id:${msg.authorId}[/meta]`;
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
    // Carrega ferramentas disponíveis se estiverem habilitadas
    let tools = [];
    let hasTools = false;

    if (config.tools?.enabled !== false) {
      tools = await toolLoader.getOpenAITools();
      hasTools = tools && tools.length > 0;

      if (hasTools) {
        console.log(`[TOOLS][INFO] ${tools.length} ferramentas disponíveis para uso: ${tools.map(t => t.function?.name).join(', ')}`);
      }
    } else {
      console.log('[TOOLS][INFO] Ferramentas desabilitadas na configuração');
    }

    // Prepara os parâmetros da requisição
    const requestParams = {
      model: getModel(),
      messages,
      temperature: 0.8,
      max_tokens: config.settings.maxTokens,
    };

    // Adiciona ferramentas se disponíveis
    if (hasTools) {
      requestParams.tools = tools;
    }

    // Use the full message array with system prompt and conversation history
    let response = await withRetries(
      () => openai.chat.completions.create(requestParams),
      '[CHAT][resposta_contextual]'
    );

    let choice = response?.choices?.[0];
    let message = choice?.message;
    let toolCalls = message?.tool_calls;

    // Loop para lidar com chamadas de ferramentas recursivas (max 5 turnos)
    let turns = 0;
    const maxTurns = 5;

    while (toolCalls && toolCalls.length > 0 && turns < maxTurns) {
      turns++;
      console.log(`[TOOLS][INFO] Turno ${turns}: API retornou ${toolCalls.length} chamadas de ferramentas`);

      // Adiciona a resposta do assistente com as chamadas de ferramentas ao histórico
      messages.push({
        role: 'assistant',
        tool_calls: toolCalls
      });

      // Cria contexto para as ferramentas
      const context = {
        guildId,
        channel,
        client: channel?.client || channel?.guild?.client
      };

      // Executa as ferramentas
      const toolResults = await toolLoader.executeToolCalls(toolCalls, context);

      // Adiciona os resultados das ferramentas ao histórico
      for (const toolResult of toolResults) {
        messages.push({
          role: 'tool',
          tool_call_id: toolResult.tool_call_id,
          content: toolResult.result
        });
      }

      // Faz uma nova requisição com o histórico atualizado
      response = await withRetries(
        () => openai.chat.completions.create(requestParams),
        `[CHAT][resposta_contextual_turn_${turns}]`
      );

      choice = response?.choices?.[0];
      message = choice?.message;
      toolCalls = message?.tool_calls;
    }

    if (turns >= maxTurns && toolCalls) {
      console.warn(`[TOOLS][WARN] Atingido limite de ${maxTurns} turnos de ferramentas.`);
    }

    let content = message?.content || '';

    // Handle case where response was truncated due to token limits
    if (choice?.finish_reason === 'length') {
      content = 'Desculpe, minha resposta ficou muito longa devido aos limites de tokens! Tente dividir a conversa em partes menores ou usar mensagens mais curtas. 😊';
    }

    // Processa tags [salvar_memoria] usando tagParser com contexto (guildId)
    const context = { guildId };
    const parsedTags = tagParser.parseTags(content, context);

    // Usa o conteúdo limpo do tagParser (tags já removidas)
    content = parsedTags.cleanedMessage;

    if (!content) {
      // Se não há conteúdo e não há tool_calls pendentes (ou limite atingido)
      throw new Error('A API não retornou conteúdo na resposta após execução de ferramentas.');
    }
    return content;
  } catch (error) {
    console.error('[ERRO] Não consegui gerar uma resposta pela API:', error.message);
    throw error;
  }
}

// Função para gerar comentário baseado em conversa via API
async function gerarComentarioViaAPI(conversationText) {
  const messages = [];
  // Verifica se deve enviar system prompt (prioriza Requesty, depois legado)
  const sendSystemPrompt = config.requesty?.sendSystemPrompt !== false &&
    config.openai?.sendSystemPrompt !== false;

  if (sendSystemPrompt) {
    const systemPrompt = await carregarSystemPrompt();
    messages.push({ role: 'system', content: systemPrompt });
  }

  messages.push({
    role: 'user',
    content: `Analise a seguinte conversa do Discord e faça um comentário interessante ou engraçado sobre ela:\n\n${conversationText}`,
  });

  try {
    // Carrega ferramentas disponíveis se estiverem habilitadas
    let tools = [];
    let hasTools = false;

    if (config.tools?.enabled !== false) {
      tools = await toolLoader.getOpenAITools();
      hasTools = tools && tools.length > 0;

      if (hasTools) {
        console.log(`[TOOLS][INFO] ${tools.length} ferramentas disponíveis para uso em gerarComentarioViaAPI`);
      }
    } else {
      console.log('[TOOLS][INFO] Ferramentas desabilitadas na configuração');
    }

    // Prepara os parâmetros da requisição
    const requestParams = {
      model: getModel(),
      messages,
      temperature: 0.8,
      max_tokens: config.settings.maxTokens,
    };

    // Adiciona ferramentas se disponíveis
    if (hasTools) {
      requestParams.tools = tools;
    }

    let response = await withRetries(
      () => openai.chat.completions.create(requestParams),
      '[CHAT][comentario]'
    );

    let choice = response?.choices?.[0];
    let message = choice?.message;
    let toolCalls = message?.tool_calls;

    // Loop para lidar com chamadas de ferramentas recursivas (max 5 turnos)
    let turns = 0;
    const maxTurns = 5;

    while (toolCalls && toolCalls.length > 0 && turns < maxTurns) {
      turns++;
      console.log(`[TOOLS][INFO] Turno ${turns} (Comentário): API retornou ${toolCalls.length} chamadas de ferramentas`);

      // Adiciona a resposta do assistente com as chamadas de ferramentas
      messages.push({
        role: 'assistant',
        tool_calls: toolCalls
      });

      // Executa as ferramentas
      const toolResults = await toolLoader.executeToolCalls(toolCalls);

      // Adiciona os resultados das ferramentas
      for (const toolResult of toolResults) {
        messages.push({
          role: 'tool',
          tool_call_id: toolResult.tool_call_id,
          content: toolResult.result
        });
      }

      // Faz uma nova requisição com os resultados das ferramentas
      response = await withRetries(
        () => openai.chat.completions.create(requestParams),
        `[CHAT][comentario_followup_turn_${turns}]`
      );

      choice = response?.choices?.[0];
      message = choice?.message;
      toolCalls = message?.tool_calls;
    }

    if (turns >= maxTurns && toolCalls) {
      console.warn(`[TOOLS][WARN] Atingido limite de ${maxTurns} turnos de ferramentas em gerarComentarioViaAPI.`);
    }

    let content = message?.content || '';

    // Handle case where response was truncated due to token limits
    if (choice?.finish_reason === 'length') {
      content = 'Desculpe, minha resposta ficou muito longa devido aos limites de tokens! Tente dividir a conversa em partes menores ou usar mensagens mais curtas. 😊';
    }

    if (!content) {
      throw new Error('A API não retornou conteúdo na resposta após execução de ferramentas.');
    }
    const parsedTags = tagParser.parseTags(content, { guildId: null });
    return parsedTags.cleanedMessage;
  } catch (error) {
    console.error('[ERRO] Não consegui gerar comentário pela API:', error.message);
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
    const userMemories = database.listarMemoriasUsuarioComEmbedding(guildId, userId, 100); // limit to 100 for performance

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

    return topMemories;

  } catch (error) {
    console.error('[SEMANTIC_SEARCH][ERRO] Falha ao buscar memórias semânticas de usuário:', error.message);
    return [];
  }
}

// Função para buscar memórias da guild por similaridade de embedding
async function buscarMemoriasGuildSemanticas(guildId, userEmbedding, topK = 2) {
  try {
    const guildMemories = database.listarMemoriasGuildComEmbedding(guildId, 100); // limit to 100 for performance

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
    const embeddingModel = getEmbeddingModel();
    const embeddingClient = getEmbeddingClient();

    const response = await withRetries(
      () => embeddingClient.embeddings.create({
        model: embeddingModel,
        input: text,
      }),
      '[EMBEDDING]'
    );

    const embedding = response?.data?.[0]?.embedding;
    if (!embedding) {
      throw new Error('A API não retornou os dados de embedding na resposta');
    }

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
    return similarity;
  } catch (error) {
    console.error('[COSINE][ERRO] Falha ao calcular similaridade coseno:', error.message);
    throw error;
  }
}

const buscarMemoriasUsuarioSemanticas = buscarMemoriasUsuarioSemanitcas;

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
  buscarMemoriasUsuarioSemanticas,
  buscarMemoriasGuildSemanticas,
  // Configuração de peso para memórias (função auxiliar)
  calculateWeightedSimilarity,
};