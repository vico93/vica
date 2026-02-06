/*
** caminho: tools/audio_transcription.js
** desc: Tool para transcrever arquivos de áudio via API
*/
const fs = require('fs');
const path = require('path');
const https = require('https');
const { exec } = require('child_process');
const OpenAI = require('openai');
const config = require('../config.json');

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

    const tmpDir = path.join(__dirname, '..', 'tmp');
    if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
    }

    const timestamp = Date.now();
    const inputFile = path.join(tmpDir, `audio_${timestamp}_input`);
    const outputFile = path.join(tmpDir, `audio_${timestamp}.mp3`);

    try {
        console.log(`[TOOLS][TRANSCRIPTION] Iniciando transcrição de: ${url}`);

        // 1. Download do arquivo
        console.log(`[AUDIO] Baixando áudio de ${url}...`);
        await new Promise((resolve, reject) => {
            const file = fs.createWriteStream(inputFile);
            https.get(url, (response) => {
                response.pipe(file);
                file.on('finish', () => {
                    file.close(resolve);
                });
            }).on('error', (err) => {
                fs.unlink(inputFile, () => { });
                reject(err);
            });
        });

        // 2. Conversão com ffmpeg
        console.log('[AUDIO] Convertendo para MP3...');
        await new Promise((resolve, reject) => {
            const ffmpegPath = config.ffmpeg_path || 'ffmpeg';
            const command = `"${ffmpegPath}" -i "${inputFile}" "${outputFile}"`;

            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error(`[AUDIO][FFMPEG] Erro: ${error.message}`);
                    console.error(`[AUDIO][FFMPEG] Stderr: ${stderr}`);
                    return reject(error);
                }
                if (stderr) console.log(`[AUDIO][FFMPEG] Log: ${stderr}`);
                resolve();
            });
        });

        // 3. Transcrição via API
        console.log('[AUDIO] Enviando para transcrição...');

        // Debug: Check file size
        const stats = fs.statSync(outputFile);
        console.log(`[AUDIO] Tamanho do arquivo MP3: ${stats.size} bytes`);

        if (stats.size === 0) {
            throw new Error('Arquivo de áudio convertido está vazio (0 bytes). Falha no ffmpeg?');
        }

        let model = config.requesty?.transcriptions_model;
        let apiKey = config.requesty?.api_key;
        let baseURL = config.requesty?.base_url;

        // Configura cliente específico para o tool se necessário
        const clientConfig = { apiKey };

        if (baseURL) {
            if (baseURL.includes('/responses') || baseURL.includes('/chat/completions')) {
                baseURL = baseURL.replace(/\/responses\/?$/, '').replace(/\/chat\/completions\/?$/, '');
            }
            clientConfig.baseURL = baseURL;
        }

        const openai = new OpenAI(clientConfig);

        console.log(`[AUDIO] Usando Base URL: ${openai.baseURL}`);
        console.log(`[AUDIO] Usando Modelo: ${model}`);

        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(outputFile),
            model: model,
        }); // No retry wrapper for simplicity in tool, can add if needed.

        console.log(`[AUDIO] Transcrição concluída: "${transcription.text.substring(0, 50)}..."`);

        return `📝 **Transcrição:** "${transcription.text}"`;

    } catch (error) {
        console.error('[TOOLS][TRANSCRIPTION] Erro:', error);
        throw new Error(`Falha na transcrição: ${error.message}`);
    } finally {
        // Limpeza
        if (fs.existsSync(inputFile)) fs.unlinkSync(inputFile);
        if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
    }
}

module.exports = {
    execute
};
