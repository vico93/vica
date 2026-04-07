/*
** caminho: helpers/video_frame.js
** últimaMod: 2026-03-17 18:51
** autor: Vico
** colaboração: GPT-5.4
** modificações: Adição de suporte a múltiplos formatos de vídeo, melhorias na extração do frame usando ffmpeg, tratamento de erros mais robusto e limpeza de arquivos temporários. Conversão para CommonJS.
*/

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFile } = require('child_process');

const config = require('../core/config');

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v']);

function isVideoAttachment(attachment) {
  if (!attachment) return false;
  if (attachment.contentType?.startsWith('video/')) return true;

  const fileName = (attachment.name || '').toLowerCase();
  return VIDEO_EXTENSIONS.has(path.extname(fileName));
}

async function downloadToFile(url, targetPath) {
  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(targetPath);
    https.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 400) {
        file.close(() => fs.unlink(targetPath, () => {}));
        return reject(new Error(`Falha no download do vídeo: HTTP ${response.statusCode}`));
      }

      response.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (error) => {
      file.close(() => fs.unlink(targetPath, () => {}));
      reject(error);
    });
  });
}

async function extractFirstFrameFromVideo(videoUrl) {
  if (!videoUrl) return null;

  const tmpDir = path.join(__dirname, '..', 'tmp');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  const timestamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const inputFile = path.join(tmpDir, `video_${timestamp}`);
  const outputFile = path.join(tmpDir, `video_frame_${timestamp}.png`);
  const ffmpegPath = config.ffmpeg_path || 'ffmpeg';

  try {
    await downloadToFile(videoUrl, inputFile);

    await new Promise((resolve, reject) => {
      execFile(
        ffmpegPath,
        ['-y', '-i', inputFile, '-frames:v', '1', '-update', '1', outputFile],
        (error, stdout, stderr) => {
          if (error) {
            console.error('[VIDEO][FFMPEG] Erro ao extrair frame:', error.message);
            if (stderr) {
              console.error('[VIDEO][FFMPEG] Stderr:', stderr);
            }
            return reject(error);
          }

          if (stdout) {
            console.log('[VIDEO][FFMPEG] Stdout:', stdout);
          }
          if (stderr) {
            console.log('[VIDEO][FFMPEG] Log:', stderr);
          }
          resolve();
        }
      );
    });

    const frameBuffer = await fs.promises.readFile(outputFile);
    if (!frameBuffer.length) {
      throw new Error('Frame extraído do vídeo está vazio.');
    }

    return `data:image/png;base64,${frameBuffer.toString('base64')}`;
  } catch (error) {
    console.warn('[VIDEO] Falha ao extrair primeiro frame:', error.message);
    return null;
  } finally {
    for (const filePath of [inputFile, outputFile]) {
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }
}

module.exports = {
  isVideoAttachment,
  extractFirstFrameFromVideo
};
