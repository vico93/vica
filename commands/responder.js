const axios = require('axios');
const config = require('../config.json');

async function gerarPerguntaViaAPI() {
  const prompt = 'Gere uma pergunta interessante, criativa ou divertida para uma conversa descontraída entre amigos. Apenas a pergunta, sem explicações ou introduções.';

  const payload = {
    model: config.openai.model,
    messages: [
      { role: 'system', content: 'Você é uma IA que faz perguntas únicas, criativas e curiosas para iniciar conversas.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.9,
    max_tokens: config.settings.maxTokens
  };

  try {
    const response = await axios.post(`${config.openai.base_url}`, payload, {
      headers: {
        'Authorization': `Bearer ${config.openai.api_key}`,
        'Content-Type': 'application/json'
      }
    });

    // Adaptar dependendo do formato retornado pela Responses API
    const content = response.data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('Resposta inesperada da API');
    return content.trim();
  } catch (error) {
    console.error('[ERRO] Falha na chamada à Responses API:', error.message);
    throw error;
  }
}

module.exports = { gerarPerguntaViaAPI };
