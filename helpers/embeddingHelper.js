/*
** caminho: helpers/embeddingHelper.js
** últimaMod: 2025-09-07 02:33
** autor: Vico
** colaboração: Roo Sonic
** modificações: Conversão para CommonJS, uso de oai_interface.gerarEmbedding, suporte memory-only para buscas por similaridade
*/

const oai_interface = require('../core/oai_interface');

/*
** Função para gerar embedding usando o módulo oai_interface
*/
async function gerarEmbedding(texto) {
  return await oai_interface.gerarEmbedding(texto);
}

/*
** Função para calcular similaridade cosseno entre dois vetores
*/
function cosineSimilarity(vecA, vecB) {
  let dot = 0, normA = 0, normB = 0;
  const len = Math.min(vecA.length, vecB.length);
  for (let i = 0; i < len; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/*
** Função para buscar memórias relevantes baseado na similaridade de embedding
** memoryOnly: recebe array de memórias com propriedade embedding (JSON string) e fact
*/
async function buscarMemoriasRelevantes({ memoriaArray, contexto, topK = 5 }) {
  const contextEmbedding = await gerarEmbedding(contexto);

  // Calcula similaridade para cada memória
  const memoriaComScore = memoriaArray.map(memoria => {
    let embedding = [];
    try {
      embedding = JSON.parse(memoria.embedding);
    } catch (err) {
      console.warn('[EMBEDDING_HELPER][WARN] Falha ao parsear embedding da memória:', err.message);
      return { ...memoria, score: 0 };
    }
    return { ...memoria, score: cosineSimilarity(contextEmbedding, embedding) };
  });

  // Ordena por score decrescente e retorna topK
  const ranked = memoriaComScore
    .filter(m => m.score > 0) // Filtra memórias com embedding válido
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  console.log(`[EMBEDDING_HELPER][INFO] Encontradas ${ranked.length} memórias relevantes para contexto "${contexto.substring(0, 50)}..."`);
  return ranked;
}

module.exports = {
  gerarEmbedding,
  cosineSimilarity,
  buscarMemoriasRelevantes
};
