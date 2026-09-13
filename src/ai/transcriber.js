/*
** caminho: core/transcriber.js
** últimaMod: 2025-09-21 11:31
** autor: Vico
** colaboração: Roo Sonic (xai/grok-code-fast-1)
*/

/*
** Módulo responsável por lidar com a transcrição de áudio.
** Centraliza a chamada para a função de transcrição da API OpenAI.
*/

const oai_interface = require('./oai_interface');

/*
** Função assíncrona para transcrever um arquivo de áudio.
** Recebe o caminho do arquivo de áudio como parâmetro.
** Retorna o texto transcrito se bem-sucedido, ou null em caso de falha.
*/
async function transcribe(filePath) {
  return await oai_interface.transcribeAudio(filePath);
}

module.exports = {
  transcribe,
};