/*
** caminho: core/channel_context.js
** últimaMod: 2026-06-06 14:00
** autor: Vico
** colaboração: Kimi AI
*/

/*
  Gerenciamento de contexto ativo de canal/tópico.
  - Extrai entidades de mensagens recentes usando regras/heurísticas (fase 1)
  - Persiste contexto ativo no SQLite
  - Injeta resumo no prompt via [canal_contexto]
  - Sem chamadas de API na fase 1 (zero custo extra)
*/

const database = require('./database');
const config = require('./config');

const MAX_PREVIEW_LENGTH = 200;
const DEFAULT_TOPIC_TTL_MS = 30 * 60 * 1000; // 30 minutos
const DEFAULT_REEVAL_EVERY = 3;
const DEFAULT_MAX_SNAPSHOT_CHARS = 400;
const SIGNIFICANT_SHIFT_THRESHOLD = 0.5; // 50% de diferença no Jaccard

/*
  Lista expansível de tópicos/entidades conhecidas do servidor.
  O objetivo não é cobrir tudo — é dar peso a termos que ajudam a formar
  um "active topic" quando aparecem em conversas. Nomes próprios capitalizados
  detectados dinamicamente (extractProperNames) são a principal fonte de entidades.
  Esta lista apenas complementa com termos comuns que podem não seguir
  padrão de nome próprio ou que merecem prioridade.

  Para adicionar novos tópicos: coloque aqui termos em minúsculo, sem acento.
*/
const KNOWN_TOPICS = new Set([
  // Jogos que a Vica menciona/interessa
  'minecraft', 'project zomboid', 'zomboid', 'spore', 'chrono trigger', 'chrono cross',
  'factorio', 'satisfactory', 'rimworld', 'stardew valley', 'hades', 'hollow knight',
  'elden ring', 'dark souls', 'bloodborne', 'sekiro', 'zelda',
  // Tecnologia/programação comuns
  'javascript', 'typescript', 'python', 'rust', 'go', 'csharp', 'c#', 'c++', 'java',
  'nodejs', 'node.js', 'bun', 'deno', 'react', 'vue', 'svelte', 'angular',
  'docker', 'kubernetes', 'k8s', 'linux', 'ubuntu', 'debian', 'arch', 'windows',
  'openai', 'anthropic', 'google', 'deepseek', 'qwen', 'llama', 'mistral',
  'discord', 'discord.js', 'telegram', 'whatsapp',
  // Hardware/PC
  'rtx', 'gtx', 'ryzen', 'intel', 'amd', 'nvidia', 'ssd', 'nvme', 'ram', 'placa de video',
  // Mitologia/cultura pop
  'ares', 'atena', 'afrodite', 'hefesto', 'zeus', 'poseidon', 'hades', 'olimpo',
  'rock', 'punk', 'metal', 'alternativo'
]);

// Placares e resultados numéricos (esportes, ranking, etc.)
const SCORE_RE = /\b(\d{1,2})\s*(?:x|×|-|–|—)\s*(\d{1,2})\b/gi;
// Nomes próprios, marcas, produtos, siglas técnicas.
// Captura: "Project Zomboid", "VS Code", "OpenAI", "RTX 4090", "API Gateway"
// NÃO captura através de preposições (evita "A API do" como nome próprio)
const PROPER_NAME_RE = /\b(?:[A-ZÀ-Ú][a-zA-ZÀ-Ú0-9à-ú]*|\d+|[A-ZÀ-Ú]{2,})(?:[\s\/\-]+(?:[A-ZÀ-Ú][a-zA-ZÀ-Ú0-9à-ú]*|\d+|[A-ZÀ-Ú]{2,}))+\b|\b[A-ZÀ-Ú][a-zA-ZÀ-Ú0-9à-ú]*\b/g;
// Tech names with file extensions: Node.js, script.py, etc.
const TECH_NAME_RE = /\b[A-ZÀ-Ú]?[a-zà-ú]*\.(?:js|ts|py|go|rs|cpp|c|java|css|html|json|yaml|yml|toml|sh|md)\b/gi;
// Hashtags
const HASHTAG_RE = /#(\w+)/g;
// Sinais de que a conversa está sobre um evento/discusão técnica específica
const TOPIC_SIGNAL_WORDS = /\b(versão|update|patch|dlc|mod|build|release|lançamento|evento|live|stream|server|servidor|bug|erro|crash|fix|atualização)\b/gi;

function getSettings() {
  const settings = config.settings || {};
  return {
    enabled: settings.channelContextEnabled !== false,
    ttlMs: (settings.channelContextTtlMinutes || 30) * 60 * 1000,
    reevalEvery: Math.max(1, settings.channelContextReevalEvery || DEFAULT_REEVAL_EVERY),
    maxSnapshotChars: Math.min(1000, Math.max(100, settings.channelContextMaxChars || DEFAULT_MAX_SNAPSHOT_CHARS))
  };
}

function normalizeText(text) {
  if (typeof text !== 'string') return '';
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function cleanPreview(text) {
  if (typeof text !== 'string') return '';
  let cleaned = text
    .replace(/<@!?(\d+)>/g, '@usuario')
    .replace(/<#(\d+)>/g, '#canal')
    .replace(/<@&(\d+)>/g, '@cargo')
    .replace(/https?:\/\/\S+/g, '[link]')
    .replace(/```[\s\S]*?```/g, '[codigo]')
    .replace(/`[^`]*`/g, '[codigo]')
    .replace(/\n+/g, ' ')
    .trim();
  return cleaned.length > MAX_PREVIEW_LENGTH ? cleaned.slice(0, MAX_PREVIEW_LENGTH) : cleaned;
}

function extractScore(text) {
  const scores = [];
  let match;
  while ((match = SCORE_RE.exec(text)) !== null) {
    scores.push(`${match[1]}x${match[2]}`);
  }
  return scores;
}

function extractKnownEntities(text) {
  const normalized = normalizeText(text);
  const found = [];

  for (const topic of KNOWN_TOPICS) {
    // Match por palavra inteira para evitar "gol" -> "go" ou "programaram" -> "ram"
    const pattern = new RegExp(`(?:^|[^a-z0-9])${topic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^a-z0-9]|$)`, 'i');
    if (pattern.test(normalized)) {
      found.push(topic);
    }
  }

  return [...new Set(found)];
}

function extractProperNames(text) {
  const properMatches = text.match(PROPER_NAME_RE) || [];
  const techMatches = text.match(TECH_NAME_RE) || [];
  const matches = [...properMatches, ...techMatches];
  // Filtra nomes comuns/falsos positivos
  const stopNames = new Set([
    'Discord', 'Vica',
    'O', 'A', 'Os', 'As', 'Um', 'Uma', 'Uns', 'Umas',
    'Eu', 'Tu', 'Ele', 'Ela', 'Nós', 'Vós', 'Eles', 'Elas',
    'Mim', 'Comigo', 'Ti', 'Si', 'Consigo',
    'Me', 'Te', 'Se', 'Nos', 'Vos', 'Lhe', 'Lhes',
    'Isso', 'Isto', 'Aquilo', 'Este', 'Esta', 'Esse', 'Essa', 'Aquele', 'Aquela',
    'Meu', 'Minha', 'Meus', 'Minhas',
    'Teu', 'Tua', 'Teus', 'Tuas',
    'Seu', 'Sua', 'Seus', 'Suas',
    'Dele', 'Dela', 'Deles', 'Delas',
    'Nosso', 'Nossa', 'Nossos', 'Nossas',
    'Vosso', 'Vossa', 'Vossos', 'Vossas',
    'Você', 'Vocês', 'Voce', 'Voces',
    'Alguém', 'Algum', 'Alguma', 'Alguns', 'Algumas',
    'Ninguém', 'Nenhum', 'Nenhuma',
    'Todo', 'Toda', 'Todos', 'Todas', 'Cada', 'Outro', 'Outra', 'Outros', 'Outras',
    'Mesmo', 'Mesma', 'Mesmos', 'Mesmas',
    'Próprio', 'Própria', 'Próprios', 'Próprias',
    'Qualquer', 'Quaisquer',
    'Quem', 'Que', 'Onde', 'Quando', 'Como', 'Porque', 'Porquê', 'Por Quê',
    'Qual', 'Quais', 'Quanto', 'Quanta', 'Quantos', 'Quantas',
    'Bem', 'Mal', 'Mais', 'Menos', 'Muito', 'Muita', 'Muitos', 'Muitas',
    'Pouco', 'Pouca', 'Poucos', 'Poucas', 'Tanto', 'Tanta', 'Tantos', 'Tantas',
    'Bastante', 'Demais',
    'Aqui', 'Aí', 'Ali', 'Lá', 'Cá', 'Acolá',
    'Agora', 'Hoje', 'Ontem', 'Amanhã', 'Sempre', 'Nunca', 'Já', 'Ainda',
    'Talvez', 'Provavelmente', 'Realmente', 'Simplesmente', 'Basicamente',
    'Então', 'Depois', 'Antes', 'Durante', 'Enquanto', 'Desde', 'Após', 'Até',
    'Sobre', 'Entre', 'Contra', 'Sem', 'Com', 'Para', 'Por', 'Pelo', 'Pela',
    'Bem', 'Pois', 'Mas', 'Porém', 'Entretanto', 'Contudo',
    'Bah', 'Ah', 'Oh', 'Eh', 'Hmm', 'Hein', 'Né', 'Neh', 'Cara', 'Mano', 'Vei',
    'Vou', 'Vai', 'Vamos', 'Vão', 'Ia', 'Iamos', 'Iam',
    'Sou', 'É', 'Somos', 'São', 'Era', 'Eram', 'Foi', 'Foram',
    'Tenho', 'Tem', 'Temos', 'Têm', 'Tinha', 'Tinham', 'Teve', 'Tiveram',
    'Faço', 'Faz', 'Fazemos', 'Fazem', 'Fiz', 'Fez', 'Fizemos', 'Fizeram',
    'Digo', 'Diz', 'Dizemos', 'Dizem', 'Disse', 'Disseram',
    'Vejo', 'Vê', 'Vemos', 'Veem', 'Vi', 'Viu', 'Vimos', 'Viram',
    'Posso', 'Pode', 'Podemos', 'Podem', 'Pude', 'Pôde', 'Pudemos', 'Puderam',
    'Quero', 'Quer', 'Queremos', 'Querem', 'Quis', 'Quisemos', 'Quiseram',
    'Sinto', 'Sente', 'Sentimos', 'Sentem'
  ]);
  const cleaned = matches
    .map(name => {
      // Remove artigos no início: "A API" -> "API", "O VS Code" -> "VS Code"
      return name.replace(/^(?:O|A|Os|As|Um|Uma|Uns|Umas)\s+/i, '').trim();
    })
    .filter(name => name.length >= 2)
    .filter(name => {
      const lower = name.toLowerCase();
      return ![...stopNames].some(stop => stop.toLowerCase() === lower);
    });

  // Deduplica: "Node" e "Node.js" viram só "Node.js"
  const deduped = [];
  for (const name of cleaned) {
    const key = name.toLowerCase().replace(/\.(js|ts|py|go|rs|cpp|c|java|css|html|json|yaml|yml|toml|sh|md)$/i, '');
    const existingIndex = deduped.findIndex(n => n.toLowerCase().replace(/\.(js|ts|py|go|rs|cpp|c|java|css|html|json|yaml|yml|toml|sh|md)$/i, '') === key);
    if (existingIndex !== -1) {
      // Prefere a versão com extensão (mais longa)
      const existing = deduped[existingIndex];
      if (name.length > existing.length) {
        deduped[existingIndex] = name;
      }
    } else {
      deduped.push(name);
    }
  }

  return [...new Set(deduped)];
}

function extractHashtags(text) {
  const matches = text.match(HASHTAG_RE) || [];
  return [...new Set(matches.map(m => m.slice(1).toLowerCase()))];
}

function extractEntities(text) {
  const cleaned = cleanPreview(text);
  const known = extractKnownEntities(cleaned);
  const scores = extractScore(cleaned);
  const proper = extractProperNames(cleaned).slice(0, 6);
  const hashtags = extractHashtags(cleaned).slice(0, 4);
  const topicSignals = TOPIC_SIGNAL_WORDS.test(cleaned);

  return {
    known,
    scores,
    proper,
    hashtags,
    hasTopicSignal: topicSignals
  };
}

function entitiesToArray(entities) {
  const arr = [...entities.known];
  if (entities.scores.length > 0) {
    arr.push(`placar ${entities.scores[0]}`);
  }
  arr.push(...entities.proper);
  arr.push(...entities.hashtags);
  return [...new Set(arr)].slice(0, 12);
}

function jaccardIndex(a, b) {
  if (!a.length || !b.length) return a.length === b.length ? 1 : 0;
  const setA = new Set(a.map(normalizeText));
  const setB = new Set(b.map(normalizeText));
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

function buildActiveTopic(entities) {
  const parts = [];

  // Prioridade 1: tópicos conhecidos genéricos
  const knownTopics = entities.known.filter(e => KNOWN_TOPICS.has(e));
  if (knownTopics.length > 0) {
    parts.push(...knownTopics.slice(0, 3).map(t => t.replace(/\b\w/g, l => l.toUpperCase())));
  }

  // Prioridade 2: nomes próprios detectados (provavelmente o tema principal)
  if (entities.proper.length > 0) {
    const topProper = entities.proper.slice(0, 3);
    for (const name of topProper) {
      const normalizedName = normalizeText(name);
      if (!parts.some(p => normalizeText(p).includes(normalizedName) || normalizedName.includes(normalizeText(p)))) {
        parts.push(name);
      }
    }
  }

  if (entities.scores.length > 0) {
    parts.push(`placar ${entities.scores[0]}`);
  }

  if (parts.length === 0 && entities.hasTopicSignal) {
    parts.push('discussão técnica/evento');
  }

  return parts.join(' · ');
}

function buildTopicSnapshot(activeTopic, entities, allEntities, messageCount) {
  if (!activeTopic) return '';

  const snapshot = [];
  snapshot.push(activeTopic);

  const extras = allEntities
    .filter(e => !activeTopic.toLowerCase().includes(e.toLowerCase()))
    .slice(0, 6);

  if (extras.length > 0) {
    snapshot.push(`Entidades: ${extras.join(', ')}`);
  }

  if (messageCount > 1) {
    snapshot.push(`(${messageCount} mensagens sobre o tema)`);
  }

  return snapshot.join(' · ');
}

function shouldUpdateContext(currentContext, newEntities, newEntityArray, settings) {
  if (!currentContext) return true;

  const now = Date.now();
  if (now > currentContext.expiresAt) return true;

  if ((currentContext.messageCount || 0) % settings.reevalEvery === 0) {
    const currentEntities = parseEntitiesJson(currentContext.extractedEntities);
    const similarity = jaccardIndex(currentEntities, newEntityArray);
    if (similarity < (1 - SIGNIFICANT_SHIFT_THRESHOLD)) return true;
  }

  // Se o tema atual é vazio mas novo tem entidades, atualiza
  if (!currentContext.activeTopic && newEntityArray.length > 0) return true;

  // Se entidades importantes novas surgiram (tópicos conhecidos ou placar)
  if (newEntities.known.length > 0 || newEntities.scores.length > 0) {
    const currentEntities = parseEntitiesJson(currentContext.extractedEntities);
    const hasNewImportant = newEntityArray.some(e => !currentEntities.includes(e));
    if (hasNewImportant) return true;
  }

  return false;
}

function parseEntitiesJson(json) {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatContextForPrompt(context, maxChars = DEFAULT_MAX_SNAPSHOT_CHARS) {
  if (!context || !context.topicSnapshot) return '';

  let snapshot = context.topicSnapshot;
  if (snapshot.length > maxChars) {
    snapshot = snapshot.slice(0, maxChars - 3) + '...';
  }

  return `[canal_contexto] ${snapshot} [/canal_contexto]`;
}

async function updateChannelContext(guildId, channelId, recentPreviews) {
  const settings = getSettings();
  if (!settings.enabled) return null;

  if (!Array.isArray(recentPreviews) || recentPreviews.length === 0) return null;

  // Expira contextos antigos periodicamente
  database.deleteExpiredChannelContexts();

  const combinedText = recentPreviews.filter(Boolean).join(' ');
  const entities = extractEntities(combinedText);
  const entityArray = entitiesToArray(entities);

  const currentContext = database.getChannelContext(guildId, channelId);

  if (!shouldUpdateContext(currentContext, entities, entityArray, settings)) {
    // Só atualiza timestamp de expiração e contador
    const now = Date.now();
    const activeTopic = currentContext.activeTopic;
    const snapshot = currentContext.topicSnapshot;
    const existingEntities = parseEntitiesJson(currentContext.extractedEntities);
    const mergedEntities = [...new Set([...existingEntities, ...entityArray])].slice(0, 12);
    const messageCount = (currentContext.messageCount || 0) + recentPreviews.length;

    database.setChannelContext(
      guildId,
      channelId,
      activeTopic,
      snapshot,
      mergedEntities,
      messageCount,
      now,
      now + settings.ttlMs
    );
    return database.getChannelContext(guildId, channelId);
  }

  const activeTopic = buildActiveTopic(entities);
  if (!activeTopic) return currentContext;

  const snapshot = buildTopicSnapshot(activeTopic, entities, entityArray, 1);
  const now = Date.now();

  database.setChannelContext(
    guildId,
    channelId,
    activeTopic,
    snapshot,
    entityArray,
    currentContext ? (currentContext.messageCount || 0) + recentPreviews.length : recentPreviews.length,
    now,
    now + settings.ttlMs
  );

  console.log(`[CHANNEL_CONTEXT][INFO] Contexto atualizado para ${guildId}/${channelId}: ${activeTopic}`);
  return database.getChannelContext(guildId, channelId);
}

function getChannelContext(guildId, channelId) {
  database.deleteExpiredChannelContexts();
  return database.getChannelContext(guildId, channelId);
}

module.exports = {
  getChannelContext,
  updateChannelContext,
  formatContextForPrompt,
  extractEntities,
  cleanPreview
};
