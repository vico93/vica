/*
** caminho: core/config.js
** últimaMod: 2026-06-06 01:15
** autor: Vico
** colaboração: ChatGPT (GPT-5.4), Claude Opus 4.6
*/

const fs = require('fs');
const path = require('path');
const toml = require('toml');

const CONFIG_FILE_PATH = path.join(__dirname, '..', 'config.toml');

function normalizeString(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function normalizeInteger(value, fallback) {
  return Number.isInteger(value) ? value : fallback;
}

function normalizeBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeHeaders(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const result = {};
  for (const [key, val] of Object.entries(value)) {
    if (typeof key === 'string' && key.trim() && typeof val === 'string') {
      result[key.trim()] = val;
    }
  }

  return result;
}

function normalizeDiscordId(value) {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new Error('discord.client_id deve ser string no config.toml para evitar perda de precisão.');
    }

    return String(value);
  }

  return '';
}

function normalizeModelSection(section) {
  return {
    base_url: normalizeString(section?.base_url),
    api_key: normalizeString(section?.api_key),
    model: normalizeString(section?.model),
    headers: normalizeHeaders(section?.headers),
  };
}

function mergeModelConfig(defaultConfig, overrideConfig = {}) {
  const mergedHeaders = {
    ...defaultConfig.headers,
    ...overrideConfig.headers,
  };

  return {
    base_url: overrideConfig.base_url || defaultConfig.base_url,
    api_key: overrideConfig.api_key || defaultConfig.api_key,
    model: overrideConfig.model || defaultConfig.model,
    headers: Object.keys(mergedHeaders).length > 0 ? mergedHeaders : {},
  };
}

function normalizeVisionToolStrategy(value) {
  const normalized = normalizeString(value).toLowerCase();

  if (normalized === 'direct' || normalized === 'handoff' || normalized === 'auto') {
    return normalized;
  }

  return 'auto';
}

function normalizeTokenizerStrategy(value) {
  const normalized = normalizeString(value).toLowerCase();

  if (normalized === 'zai' || normalized === 'openrouter') {
    return normalized;
  }

  // Backwards compat: boolean true maps to 'zai'
  if (value === true) {
    return 'zai';
  }

  return 'none';
}

function normalizeAISettings(settings = {}) {
  const sendSystemPrompt = normalizeBoolean(
    settings.send_system_prompt,
    typeof settings.sendSystemPrompt === 'boolean' ? settings.sendSystemPrompt : true
  );
  const initialDelayMs = normalizeInteger(settings.initial_delay_ms, normalizeInteger(settings.initialDelayMs, 1000));
  const historyLimit = normalizeInteger(settings.historyLimit, 6);
  const historyMaxAge = normalizeInteger(settings.historyMaxAge, 60);
  const budgetTokenLimit = normalizeInteger(settings.budgetTokenLimit, 3000);
  const rateLimitMs = normalizeInteger(settings.rate_limit_ms, normalizeInteger(settings.rateLimitMs, 5000));
  const maxTokens = normalizeInteger(settings.maxTokens, normalizeInteger(settings.max_tokens, budgetTokenLimit));
  const maxToolTurns = normalizeInteger(settings.maxToolTurns, normalizeInteger(settings.max_tool_turns, 5));
  const maxToolResultChars = normalizeInteger(settings.maxToolResultChars, normalizeInteger(settings.max_tool_result_chars, 4000));
  const maxSearchCallsPerResponse = normalizeInteger(settings.maxSearchCallsPerResponse, normalizeInteger(settings.max_search_calls_per_response, 2));
  const mcpToolTimeoutMs = normalizeInteger(settings.mcpToolTimeoutMs, normalizeInteger(settings.mcp_tool_timeout_ms, 30000));

  return {
    send_system_prompt: sendSystemPrompt,
    sendSystemPrompt,
    retries: normalizeInteger(settings.retries, 3),
    initial_delay_ms: initialDelayMs,
    initialDelayMs,
    historyLimit,
    historyMaxAge,
    budgetTokenLimit,
    rate_limit_ms: rateLimitMs,
    rateLimitMs,
    maxTokens,
    maxToolTurns,
    maxToolResultChars,
    max_search_calls_per_response: maxSearchCallsPerResponse,
    maxSearchCallsPerResponse,
    mcpToolTimeoutMs,
    disableToolsOnVision: normalizeBoolean(settings.disableToolsOnVision, true),
    visionToolStrategy: normalizeVisionToolStrategy(settings.visionToolStrategy),
    memoryStrictMode: normalizeBoolean(settings.memoryStrictMode, true),
    useModelVision: normalizeBoolean(settings.useModelVision, false),
    // useTokenizer removed – o OpenRouter free tem limite de 200k tokens
  };
}

function normalizeAITools(tools = {}) {
  const toolsFile = normalizeString(tools.tools_file)
    || normalizeString(tools.toolsFile)
    || normalizeString(tools.config_file)
    || normalizeString(tools.configFile)
    || 'data/tools.json';

  return {
    enabled: normalizeBoolean(tools.enabled, true),
    tools_file: toolsFile,
    toolsFile,
    config_file: toolsFile,
    configFile: toolsFile,
  };
}

function getToolRuntimeConfig(toolDefinition = {}) {
  return normalizeModelSection(
    toolDefinition?.runtime
    || toolDefinition?.llm
    || toolDefinition?.model_config
  );
}

function getPrimaryProviderConfig(parsed = {}) {
  return normalizeModelSection(
    parsed.ai_provider
    || parsed.aiProvider
    || parsed.models?.default
  );
}

function getMergedModelMap(primaryProvider, rawModels = {}) {
  const defaultModel = normalizeModelSection(primaryProvider);

  if (!defaultModel.base_url || !defaultModel.api_key || !defaultModel.model) {
    throw new Error('Configuração inválida em config.toml: [ai_provider] precisa definir base_url, api_key e model.');
  }

  const mergedModels = {
    default: defaultModel,
  };

  for (const capability of ['vision', 'transcriptions', 'imagegen']) {
    mergedModels[capability] = mergeModelConfig(defaultModel, normalizeModelSection(rawModels[capability]));
  }

  return mergedModels;
}

function parseConfig() {
  let rawContent;
  try {
    rawContent = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
  } catch (error) {
    throw new Error(`Não foi possível ler config.toml em ${CONFIG_FILE_PATH}: ${error.message}`);
  }

  let parsed;
  try {
    parsed = toml.parse(rawContent);
  } catch (error) {
    const location = Number.isInteger(error.line) && Number.isInteger(error.column)
      ? ` (linha ${error.line}, coluna ${error.column})`
      : '';
    throw new Error(`Falha ao interpretar config.toml${location}: ${error.message}`);
  }

  const discordToken = normalizeString(parsed.discord?.token);
  const clientId = normalizeDiscordId(parsed.discord?.client_id ?? parsed.discord?.clientId);
  const aiProvider = getPrimaryProviderConfig(parsed);
  const models = getMergedModelMap(aiProvider, parsed.models);
  const aiSettings = normalizeAISettings(parsed.ai_settings);
  const aiTools = normalizeAITools(parsed.ai_tools);
  const ffmpegPath = normalizeString(parsed.ffmpeg?.path || parsed.ffmpeg_path);

  if (!discordToken) {
    throw new Error('Configuração inválida em config.toml: discord.token é obrigatório.');
  }

  if (!clientId) {
    throw new Error('Configuração inválida em config.toml: discord.client_id é obrigatório.');
  }

  const config = {
    discord: {
      token: discordToken,
      client_id: clientId,
      clientId,
    },
    ai_provider: aiProvider,
    models,
    ai_settings: aiSettings,
    settings: aiSettings,
    ai_tools: aiTools,
    tools: aiTools,
    ffmpeg_path: ffmpegPath,
    config_file_path: CONFIG_FILE_PATH,
    getModelConfig(capability = 'default') {
      return models[capability] || models.default;
    },
    getToolRuntimeConfig(toolDefinition = {}) {
      return getToolRuntimeConfig(toolDefinition);
    },
    resolveToolModelConfig(toolDefinition = {}, fallbackCapability = 'default') {
      return mergeModelConfig(this.getModelConfig(fallbackCapability), getToolRuntimeConfig(toolDefinition));
    },
    hasModelOverride(capability) {
      return capability === 'default'
        ? false
        : !!parsed.models?.[capability];
    },
  };

  return config;
}

const config = parseConfig();

module.exports = config;
