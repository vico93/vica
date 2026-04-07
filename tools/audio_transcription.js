/*
** caminho: tools/audio_transcription.js
** desc: Tool para transcrever arquivos de áudio via API
*/
const fs = require('fs');
const path = require('path');
const https = require('https');
const { exec } = require('child_process');
const OpenAI = require('openai');
const config = require('../core/config');

const MAX_CHUNK_DURATION_SECONDS = 25;
const CHUNK_OVERLAP_SECONDS = 1;

function getLLMConfig() {
    return config.getModelConfig('transcriptions');
}

function normalizeBaseUrl(baseUrl) {
    return String(baseUrl || '')
        .trim()
        .replace(/\/(responses|chat\/completions)\/?$/, '')
        .replace(/\/+$/, '');
}

function getFfmpegPath() {
    return config.ffmpeg_path || 'ffmpeg';
}

function getFfprobePath() {
    const ffmpegPath = getFfmpegPath();

    if (ffmpegPath.toLowerCase().endsWith('ffmpeg.exe')) {
        return ffmpegPath.replace(/ffmpeg\.exe$/i, 'ffprobe.exe');
    }

    if (ffmpegPath.toLowerCase().endsWith('/ffmpeg')) {
        return ffmpegPath.replace(/ffmpeg$/i, 'ffprobe');
    }

    if (ffmpegPath.toLowerCase().endsWith('\\ffmpeg')) {
        return ffmpegPath.replace(/ffmpeg$/i, 'ffprobe');
    }

    return 'ffprobe';
}

function execCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                error.stdout = stdout;
                error.stderr = stderr;
                return reject(error);
            }

            resolve({ stdout, stderr });
        });
    });
}

async function convertToMp3(inputFile, outputFile) {
    const command = `"${getFfmpegPath()}" -y -i "${inputFile}" "${outputFile}"`;
    const { stderr } = await execCommand(command);

    if (stderr) {
        console.log(`[AUDIO][FFMPEG] Log: ${stderr}`);
    }
}

async function getAudioDurationInSeconds(filePath) {
    const command = `"${getFfprobePath()}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`;
    const { stdout } = await execCommand(command);
    const duration = Number.parseFloat(String(stdout || '').trim());

    if (!Number.isFinite(duration) || duration <= 0) {
        throw new Error('Nao foi possivel determinar a duracao do audio.');
    }

    return duration;
}

async function createAudioChunk(sourceFile, chunkFile, startTimeSeconds, durationSeconds) {
    const safeStart = Math.max(0, startTimeSeconds);
    const safeDuration = Math.max(0.1, durationSeconds);
    const command = `"${getFfmpegPath()}" -y -i "${sourceFile}" -ss ${safeStart.toFixed(3)} -t ${safeDuration.toFixed(3)} "${chunkFile}"`;
    const { stderr } = await execCommand(command);

    if (stderr) {
        console.log(`[AUDIO][CHUNK] Log: ${stderr}`);
    }
}

async function transcribeAudioFile(openai, model, filePath) {
    const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: model,
    });

    return typeof transcription?.text === 'string' ? transcription.text.trim() : '';
}

function buildChunkPlan(durationSeconds) {
    if (durationSeconds <= MAX_CHUNK_DURATION_SECONDS) {
        return [{
            start: 0,
            duration: durationSeconds,
        }];
    }

    const chunks = [];
    const step = MAX_CHUNK_DURATION_SECONDS - CHUNK_OVERLAP_SECONDS;
    let start = 0;

    while (start < durationSeconds) {
        const remaining = durationSeconds - start;
        const chunkDuration = Math.min(MAX_CHUNK_DURATION_SECONDS, remaining);

        chunks.push({
            start,
            duration: chunkDuration,
        });

        if (remaining <= MAX_CHUNK_DURATION_SECONDS) {
            break;
        }

        start += step;
    }

    return chunks;
}

function mergeChunkTranscriptions(transcriptions) {
    return transcriptions
        .map(text => String(text || '').trim())
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Handler for transcribing audio files.
 * 
 * @param {Object} args - Tool arguments
 * @param {string} args.url - URL of the audio file to transcribe
 * @param {Object} context - Injected context
 */
async function execute(args, context) {
    void context;

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
        try {
            await convertToMp3(inputFile, outputFile);
        } catch (error) {
            console.error(`[AUDIO][FFMPEG] Erro: ${error.message}`);
            console.error(`[AUDIO][FFMPEG] Stderr: ${error.stderr}`);
            throw error;
        }

        // 3. Transcrição via API
        console.log('[AUDIO] Enviando para transcrição...');

        // Debug: Check file size
        const stats = fs.statSync(outputFile);
        console.log(`[AUDIO] Tamanho do arquivo MP3: ${stats.size} bytes`);

        if (stats.size === 0) {
            throw new Error('Arquivo de áudio convertido está vazio (0 bytes). Falha no ffmpeg?');
        }

        const llmConfig = getLLMConfig();
        const model = llmConfig?.model;
        const apiKey = llmConfig?.api_key;
        const baseURL = normalizeBaseUrl(llmConfig?.base_url);

        if (!apiKey || !baseURL) {
            throw new Error('Configuracao LLM invalida. Verifique [models.default] ou [models.transcriptions] em config.toml.');
        }

        if (!model) {
            throw new Error('Configuracao LLM invalida. Verifique model em [models.default] ou [models.transcriptions] no config.toml.');
        }

        // Configura cliente específico para o tool se necessário
        const clientConfig = {
            apiKey,
            baseURL,
            defaultHeaders: {
                'X-Title': 'Vica',
            },
        };

        const openai = new OpenAI(clientConfig);

        console.log(`[AUDIO] Usando Base URL: ${openai.baseURL}`);
        console.log(`[AUDIO] Usando Modelo: ${model}`);
        const durationSeconds = await getAudioDurationInSeconds(outputFile);
        console.log(`[AUDIO] Duracao detectada: ${durationSeconds.toFixed(2)}s`);

        let finalTranscriptionText = '';

        if (durationSeconds <= 30) {
            finalTranscriptionText = await transcribeAudioFile(openai, model, outputFile);
        } else {
            const chunkPlan = buildChunkPlan(durationSeconds);
            const chunkTexts = [];

            console.log(`[AUDIO] Audio acima do limite; dividindo em ${chunkPlan.length} partes.`);

            for (let index = 0; index < chunkPlan.length; index++) {
                const chunk = chunkPlan[index];
                const chunkFile = path.join(tmpDir, `audio_${timestamp}_chunk_${index + 1}.mp3`);

                try {
                    console.log(`[AUDIO] Gerando chunk ${index + 1}/${chunkPlan.length} (${chunk.start.toFixed(2)}s -> ${(chunk.start + chunk.duration).toFixed(2)}s)...`);
                    await createAudioChunk(outputFile, chunkFile, chunk.start, chunk.duration);

                    const chunkStats = fs.statSync(chunkFile);
                    if (chunkStats.size === 0) {
                        throw new Error(`Chunk ${index + 1} foi gerado vazio.`);
                    }

                    console.log(`[AUDIO] Transcrevendo chunk ${index + 1}/${chunkPlan.length}...`);
                    const chunkText = await transcribeAudioFile(openai, model, chunkFile);

                    if (chunkText) {
                        chunkTexts.push(chunkText);
                    }
                } finally {
                    if (fs.existsSync(chunkFile)) {
                        fs.unlinkSync(chunkFile);
                    }
                }
            }

            finalTranscriptionText = mergeChunkTranscriptions(chunkTexts);
        }

        console.log(`[AUDIO] Transcrição concluída: "${finalTranscriptionText.substring(0, 50)}..."`);

        return `[voice_message]${finalTranscriptionText}[/voice_message]`;

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
