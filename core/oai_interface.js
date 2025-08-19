// Arquivo: core/oai_interface.js

const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const config = require('../config.json');
const database = require('../core/database');

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

/**
 * Processa tags de memória no formato:
 *   <VICA!salvar_memoria(USER_ID, 'FATO')!>
 * - USER_ID: numérico (string de dígitos)
 * - FATO: texto curto entre aspas simples; aspas internas devem ser escapadas como \'
 * Remove as tags do texto final e salva as memórias no banco.
 * Retorna { cleaned, count }.
 */
function processVicaMemoryTags(rawText, ctx) {
  try {
    if (typeof rawText !== 'string') return { cleaned: rawText, count: 0 };
    const tagRegex = /<\s*VICA!salvar_memoria\s*\(\s*(\d{5,})\s*,\s*'((?:\\'|[^'])*)'\s*\)\s*!>/g;
    let match;
    let count = 0;

    while ((match = tagRegex.exec(rawText)) !== null) {
      const userId = match[1];
      const fact = match[2].replace(/\\'/g, "'");
      try {
        const r = database.adicionarMemoriaUsuario(ctx.guildId, userId, fact, {
          sourceMessageId: ctx.sourceMessageId
        });
        console.log(`[VICA][MEM] salvar_memoria guild=${ctx.guildId} user=${userId} fact="${fact}" inserted=${r.inserted} duplicate=${r.duplicate}`);
      } catch (e) {
        console.error('[VICA][MEM][ERRO] Falha ao salvar memória:', e?.message || e);
      }
      count++;
    }

    tagRegex.lastIndex = 0;
    const cleaned = rawText.replace(tagRegex, "").trim();
    return { cleaned, count };
  } catch (e) {
    console.error('[VICA][MEM][ERRO] Parser de tags falhou:', e?.message || e);
    return { cleaned: rawText, count: 0 };
  }
}
 
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
    });
    const content = response?.choices?.[0]?.message?.content;
    if (!content) throw new Error('A API não retornou conteúdo na resposta.');

    // Processa tags VICA de memória e remove-as do texto final
    const { cleaned } = processVicaMemoryTags(content, { guildId });
    
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
    
    return cleaned.trim();
  } catch (error) {
    console.error('[ERRO] Não consegui gerar parabéns pela API da OpenAI:', error.message);
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
     });
     const content = response?.choices?.[0]?.message?.content;
     if (!content) throw new Error('A API não retornou conteúdo na resposta.');

     // Processa tags VICA de memória e remove-as do texto final
     const { cleaned } = processVicaMemoryTags(content, { guildId, sourceMessageId });
     return cleaned.trim();
   } catch (error) {
     console.error('[ERRO] Não consegui gerar uma resposta pela API da OpenAI:', error.message);
     throw error;
   }
 }

module.exports = {
  gerarPerguntaViaAPI,
  gerarRespostaContextual,
  gerarParabensCargoViaAPI,
};