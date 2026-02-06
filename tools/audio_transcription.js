/*
** caminho: tools/audio_transcription.js
** desc: Tool para transcrever arquivos de áudio via API
*/

const oai = require('../core/oai_interface');

/**
 * Handler for transcribing audio files.
 * 
 * @param {Object} args - Tool arguments
 * @param {string} args.url - URL of the audio file to transcribe
 * @param {Object} context - Injected context
 */
async function execute(args, context) {
    const { url } = args;

    if (!url) {
        throw new Error('URL do áudio é obrigatória.');
    }

    try {
        console.log(`[TOOLS][TRANSCRIPTION] Iniciando transcrição de: ${url}`);

        // Usecase: The existing function in oai_interface handles download, conversion and API call.
        // We reuse it here to avoid duplication.
        const transcription = await oai.transcreverAudio(url);

        if (!transcription) {
            return "Não foi possível transcrever o áudio (retorno vazio).";
        }

        return `📝 **Transcrição:** "${transcription}"`;

    } catch (error) {
        console.error('[TOOLS][TRANSCRIPTION] Erro:', error);
        throw new Error(`Falha na transcrição: ${error.message}`);
    }
}

module.exports = {
    execute
};
