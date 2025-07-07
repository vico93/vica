// Arquivo: core/oai_interface.js

const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const config = require('../config.json');
// Importa o database para buscar o histórico de conversas
const database = require('./database');

// Carrega o prompt do sistema para o chatbot
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

// Carrega o prompt do sistema para o comando /perguntar
async function carregarSystemPromptPerguntar() {
  const filePath = path.join(__dirname, '..', 'data', 'system_prompt_perguntar.txt');
  try {
    const prompt = await fs.promises.readFile(filePath, 'utf-8');
    return prompt.trim();
  } catch (err) {
    console.error('[ERRO] Não foi possível ler system_prompt_perguntar.txt:', err);
    return 'Sua única função é gerar perguntas. Sua resposta deve ser apenas e exclusivamente a pergunta gerada.';
  }
}

const openai = new OpenAI({
  apiKey: config.openai.api_key,
  baseURL: config.openai.base_url,
});

// Função do comando /perguntar
async function gerarPerguntaViaAPI(promptUsuario = null) {
  const systemPrompt = await carregarSystemPromptPerguntar();
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: promptUsuario || 'Gere uma pergunta interessante para uma conversa descontraída.' },
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
    console.error('[ERRO] Falha na API em gerarPerguntaViaAPI:', error.message);
    throw error;
  }
}

// Função para resposta contextual (COM MEMÓRIA)
async function gerarRespostaContextual(guildId, canalId, usuarioId, mensagemUsuario) {
  const systemPrompt = await carregarSystemPrompt();
  
  // 1. Busca o histórico de mensagens do usuário no banco de dados
  const historico = await database.buscarHistoricoConversa(guildId, canalId, usuarioId);

  // 2. Monta o array de mensagens para a API
  const messages = [
    { role: 'system', content: systemPrompt }
  ];

  // 3. Adiciona as mensagens antigas do histórico
  for (const msg of historico) {
    // Adicionamos a mensagem do usuário
    messages.push({ role: 'user', content: msg });
    // Futuramente, poderíamos salvar a resposta da Vica e adicioná-la aqui
    // como { role: 'assistant', content: respostaDaVica } para um contexto ainda melhor.
  }

  // 4. Adiciona a mensagem atual que disparou o evento
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
    
    // Retorna apenas o texto, já que a Chat Completions API não tem 'response_id'
    return content.trim();
  } catch (error) {
    console.error('[ERRO] Falha na API em gerarRespostaContextual:', error.message);
    throw error;
  }
}

module.exports = {
  gerarPerguntaViaAPI,
  gerarRespostaContextual,
};