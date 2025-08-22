/*
** caminho: core/oai_interface.js
** últimaMod: 22/08/2025 01:18
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
    const prompt = await fs.promises.readFile(filePath, 'utf-8');
    return prompt.trim();
  } catch (err) {
    console.error('[ERRO] Não foi possível ler system_prompt.txt:', err);
    return 'Você é uma IA que responde a mensagens de forma criativa e útil.';
  }
}

const openai = new OpenAI({
  apiKey: config.openai.api_key,
  baseURL: config.openai.base_url,
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
      max_tokens: config.settings.maxTokens,
      tools: [salvarMemoriaFunction],
      tool_choice: 'auto',
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
     const response = await openai.chat.completions.create({
       model: config.openai.model,
       messages,
       temperature: 0.8,
       max_tokens: config.settings.maxTokens,
       tools: [salvarMemoriaFunction],
       tool_choice: 'auto',
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
 async function gerarRespostaContextual(guildId, canalId, usuarioId, mensagemUsuario, imageUrl = null, channel = null, sourceMessageId = null) {
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
             return m?.content || null;
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

   for (const txt of historicoTextos) {
     messages.push({ role: 'user', content: txt });
   }

   // Monta o conteúdo da mensagem atual do usuário
   const userMessageContent = [];
   // Adiciona a parte de texto
   userMessageContent.push({ type: 'text', text: mensagemUsuario });

   // Se houver uma URL de imagem, adiciona a parte de imagem
   if (imageUrl) {
     userMessageContent.push({
       type: 'image_url',
       image_url: { url: imageUrl },
     });
     console.log(`[DEBUG] Enviando imagem para a IA: ${imageUrl}`);
   }

   // Adiciona o conteúdo completo (texto e/ou imagem) à lista de mensagens
   messages.push({ role: 'user', content: userMessageContent });

   try {
     const response = await openai.chat.completions.create({
       model: config.openai.model,
       messages,
       temperature: 0.8,
       max_tokens: config.settings.maxTokens,
       tools: [salvarMemoriaFunction],
       tool_choice: 'auto',
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

     if (!content) throw new Error('A API não retornou conteúdo na resposta.');

     // Remove qualquer referência a ferramentas do conteúdo final
     const cleaned = content.trim();
     return cleaned;
   } catch (error) {
     console.error('[ERRO] Não consegui gerar uma resposta pela API da OpenAI:', error.message);
     throw error;
   }
 }

module.exports = {
  gerarPerguntaViaAPI,
  gerarRespostaContextual,
  gerarParabensCargoViaAPI,
  gerarMensagemBemVindoViaAPI,
};