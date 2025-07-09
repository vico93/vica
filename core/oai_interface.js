// Arquivo: core/oai_interface.js

const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const config = require('../config.json');
// --- MUDANÇA AQUI: Voltando a importar do arquivo único ---
const database = require('../core/database');

// --- FUNÇÃO ÚNICA PARA CARREGAR O PROMPT ---
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
  // Usando o prompt principal unificado
  const systemPrompt = await carregarSystemPrompt();

  const messages = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: promptUsuario || 'Nossos comerciais, por favor!',
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

// Função para resposta contextual
async function gerarRespostaContextual(guildId, canalId, usuarioId, mensagemUsuario) {
  const systemPrompt = await carregarSystemPrompt();
  
  const historico = await database.buscarHistoricoConversa(guildId, canalId, usuarioId);

  const messages = [
    { role: 'system', content: systemPrompt }
  ];

  for (const msg of historico) {
    messages.push({ role: 'user', content: msg });
  }

  messages.push({ role: 'user', content: mensagemUsuario });

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
    console.error('[ERRO] Não consegui gerar uma pergunta pela API da OpenAI:', error.message);
    throw error;
  }
}

module.exports = {
  gerarPerguntaViaAPI,
  gerarRespostaContextual,
};