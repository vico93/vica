// Arquivo: core/oai_interface.js

const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const config = require('../config.json');

// --- FUNÇÃO 1: Prompt para o CHATBOT ---
async function carregarSystemPrompt() {
  const filePath = path.join(__dirname, '..', 'data', 'system_prompt.txt');
  try {
    const prompt = await fs.promises.readFile(filePath, 'utf-8');
    return prompt.trim();
  } catch (err) {
    console.error('[ERRO] Não foi possível ler system_prompt.txt:', err);
    // Fallback para o chatbot
    return 'Você é uma IA que responde a mensagens mencionando-a de forma criativa, divertida ou útil.';
  }
}

// --- FUNÇÃO 2: Prompt para o COMANDO /PERGUNTAR ---
async function carregarSystemPromptPerguntar() {
  const filePath = path.join(__dirname, '..', 'data', 'system_prompt_perguntar.txt');
  try {
    const prompt = await fs.promises.readFile(filePath, 'utf-8');
    return prompt.trim();
  } catch (err) {
    console.error('[ERRO] Não foi possível ler system_prompt_perguntar.txt:', err);
    // Fallback para o /perguntar
    return 'Você é uma IA que gera perguntas interessantes, criativas e divertidas. Sua única saída deve ser a pergunta em si, sem introduções, saudações ou qualquer texto adicional.';
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
    {
      role: 'user',
      content: promptUsuario
        ? promptUsuario
        : 'Gere uma pergunta interessante, criativa ou divertida para uma conversa descontraída entre amigos. Apenas a pergunta, sem explicações ou introduções.',
    },
  ];

  try {
    let response = await openai.chat.completions.create({
      model: config.openai.model,
      messages,
      temperature: 0.9,
      max_tokens: config.settings.maxTokens,
    });

    if (typeof response === 'string') {
      response = JSON.parse(response);
    }

    const content = response?.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      throw new Error('Resposta inesperada da API');
    }

    return content.trim();
  } catch (error) {
    console.error('[ERRO] Falha na chamada à Responses API:', error.message);
    throw error;
  }
}

// Função para resposta contextual (menções ou replies) - AGORA COMPLETA
async function gerarRespostaContextual(mensagemUsuario, urlImagem = null, previousResponseId = null) {
  const systemPrompt = await carregarSystemPrompt();
  const dataHoraAtual = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  const inputContent = [
    {
      type: 'input_text',
      text: `Agora são ${dataHoraAtual}.

${mensagemUsuario}`,
    },
  ];

  if (urlImagem) {
    inputContent.push({
      type: 'input_image',
      image_url: urlImagem,
    });
  }

  try {
    const requestPayload = {
      model: config.openai.model,
      input: [
        {
          role: 'user',
          content: inputContent,
        },
      ],
      system: systemPrompt,
    };

    if (previousResponseId) {
      requestPayload.previous_response_id = previousResponseId;
    }

    let response = await openai.responses.create(requestPayload);

    if (typeof response === 'string') {
      response = JSON.parse(response);
    }

    const content =
      response.output?.[0]?.content?.[0]?.text ||
      response.output_text ||
      null;

    const idResposta = response?.id;

    if (!content || typeof content !== 'string') {
      throw new Error('Resposta inesperada da API');
    }

    return {
      texto: content.trim(),
      response_id: idResposta || null,
    };
  } catch (error) {
    console.error('[ERRO] Falha ao gerar resposta contextual:', error.message);
    throw error;
  }
}

module.exports = {
  gerarPerguntaViaAPI,
  gerarRespostaContextual,
};