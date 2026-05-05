/*
** caminho: core/tool_loader.js
** últimaMod: 2026-04-19 14:25
** autor: Vico
** colaboração: Roo, ChatGPT (GPT-5), Claude Opus 4.6
*/

const fs = require('fs');
const path = require('path');
const config = require('./config');
const mcpClient = require('./mcp_client');

const MAX_WEB_SEARCH_CALLS_PER_RESPONSE = 2;

// Cache para ferramentas carregadas
let toolsCache = null;
let toolsConfigPath = null;

// Track running MCP servers
const mcpServers = new Map();

// Cache for MCP tools (to avoid repeated listTools calls)
let mcpToolsCache = null;

/**
 * Carrega o arquivo de configuração de ferramentas
 * @returns {Object} Configuração de ferramentas
 */
function loadToolsConfig() {
  if (toolsCache !== null) {
    return toolsCache;
  }

  // Determina o caminho do arquivo de configuração
  if (!toolsConfigPath) {
    const configuredPath = config.ai_tools?.tools_file || 'data/tools.json';
    toolsConfigPath = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.join(__dirname, '..', configuredPath);
  }

  try {
    const configContent = fs.readFileSync(toolsConfigPath, 'utf-8');
    toolsCache = JSON.parse(configContent);
    console.log(`[TOOL_LOADER][INFO] Configuração de ferramentas carregada de ${toolsConfigPath}`);
    return toolsCache;
  } catch (error) {
    console.error(`[TOOL_LOADER][ERRO] Falha ao carregar configuração de ferramentas:`, error.message);
    return { tools: [] };
  }
}

/**
 * Start MCP servers from configuration
 * @returns {Promise<void>}
 */
async function startMCPServers() {
  const config = loadToolsConfig();

  if (!config.tools || !Array.isArray(config.tools)) {
    return;
  }

  // Find all MCP server configurations
  const mcpConfigs = config.tools.filter(tool => tool.type === 'mcp');

  if (mcpConfigs.length === 0) {
    console.log('[TOOL_LOADER][INFO] Nenhum servidor MCP configurado');
    return;
  }

  console.log(`[TOOL_LOADER][INFO] Iniciando ${mcpConfigs.length} servidor(es) MCP`);

  for (const mcpConfig of mcpConfigs) {
    try {
      console.log(`[TOOL_LOADER][INFO] Iniciando servidor MCP: ${mcpConfig.name}`);

      // Start the MCP server
      const server = await mcpClient.startServer(mcpConfig);

      // Store server reference
      mcpServers.set(mcpConfig.name, server);

      console.log(`[TOOL_LOADER][INFO] Servidor MCP '${mcpConfig.name}' iniciado com sucesso`);
    } catch (error) {
      console.error(`[TOOL_LOADER][ERRO] Falha ao iniciar servidor MCP '${mcpConfig.name}':`, error.message);
      // Continue with other servers even if one fails
    }
  }
}

/**
 * Recarrega o cache de ferramentas (útil para desenvolvimento)
 */
async function reloadTools() {
  // Stop all MCP servers before reloading
  await stopAllMCPServers();

  // Clear caches
  toolsCache = null;
  mcpToolsCache = null;

  console.log('[TOOL_LOADER][INFO] Cache de ferramentas recarregado');

  // Restart MCP servers
  await startMCPServers();
}

/**
 * Obtém todas as ferramentas no formato OpenAI
 * @returns {Promise<Array>} Array de ferramentas no formato OpenAI
 */
async function getOpenAITools({ excludeTools = [] } = {}) {
  const config = loadToolsConfig();

  if (!config.tools || !Array.isArray(config.tools)) {
    console.warn('[TOOL_LOADER][WARN] Nenhuma ferramenta encontrada na configuração');
    return [];
  }

  const excludeSet = new Set(
    Array.isArray(excludeTools) ? excludeTools : []
  );

  const openaiTools = [];

  // Process custom tools (with handler)
  for (const tool of config.tools) {
    // Skip MCP servers (they will be processed separately)
    if (tool.type === 'mcp') {
      continue;
    }

    // Skip excluded tools
    if (excludeSet.size > 0 && excludeSet.has(tool.name)) {
      console.log(`[TOOL_LOADER][INFO] Ferramenta '${tool.name}' excluída por filtro.`);
      continue;
    }

    // If the tool has a type (native OpenAI tool like web_search), return as is
    if (tool.type) {
      console.log(`[TOOL_LOADER][INFO] Ferramenta nativa do OpenAI: ${tool.type}`);
      openaiTools.push(tool);
      continue;
    }

    // Otherwise, it's a custom tool with handler
    openaiTools.push({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    });
  }

  // Add MCP tools (filtered by excludeSet)
  const mcpTools = await getMCPTools();
  for (const mcpTool of mcpTools) {
    if (excludeSet.size > 0 && excludeSet.has(mcpTool.function?.name)) {
      console.log(`[TOOL_LOADER][INFO] Ferramenta MCP '${mcpTool.function?.name}' excluída por filtro.`);
      continue;
    }
    openaiTools.push(mcpTool);
  }

  return openaiTools;
}

/**
 * Get all tools from MCP servers
 * @returns {Promise<Array>} Array of MCP tools in OpenAI function format
 */
async function getMCPTools() {
  // Return cached tools if available
  if (mcpToolsCache !== null) {
    return mcpToolsCache;
  }

  const mcpTools = [];

  for (const [serverName, server] of mcpServers) {
    try {
      console.log(`[TOOL_LOADER][INFO] Listando ferramentas do servidor MCP: ${serverName}`);

      // Get tools from the MCP server
      const tools = await mcpClient.listTools(server);

      // Add server metadata to each tool
      const toolsWithMetadata = tools.map(tool => ({
        ...tool,
        _mcpServer: serverName
      }));

      mcpTools.push(...toolsWithMetadata);
      console.log(`[TOOL_LOADER][INFO] ${tools.length} ferramenta(s) encontrada(s) no servidor '${serverName}'`);
    } catch (error) {
      console.error(`[TOOL_LOADER][ERRO] Falha ao listar ferramentas do servidor '${serverName}':`, error.message);
    }
  }

  // Cache the results
  mcpToolsCache = mcpTools;

  return mcpTools;
}

/**
 * Obtém uma ferramenta específica pelo nome
 * @param {string} toolName - Nome da ferramenta
 * @returns {Promise<Object|null>} Definição da ferramenta ou null se não encontrada
 */
async function getTool(toolName) {
  const config = loadToolsConfig();

  if (!config.tools || !Array.isArray(config.tools)) {
    return null;
  }

  // First, check custom tools (skipping MCP server configs)
  const customTool = config.tools.find(tool => tool.name === toolName && tool.type !== 'mcp');
  if (customTool) {
    return customTool;
  }

  // Then, check MCP tools
  const mcpTools = await getMCPTools();
  const mcpTool = mcpTools.find(tool => tool.function?.name === toolName);
  if (mcpTool) {
    return mcpTool;
  }

  return null;
}

function isValidDiscordId(id) {
  return typeof id === 'string' && /^\d{17,19}$/.test(id);
}

function normalizeString(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function getToolUsageState(context = {}) {
  if (!context || typeof context !== 'object') {
    return null;
  }

  if (!context.toolUsageState || typeof context.toolUsageState !== 'object') {
    context.toolUsageState = {};
  }

  return context.toolUsageState;
}

function enforceConversationToolLimits(toolName, context = {}) {
  const usageState = getToolUsageState(context);
  if (!usageState) {
    return { allowed: true };
  }

  // Limit web search tools (legacy + MCP)
  const searchTools = ['web_search', 'google-search', 'ddg-search'];
  if (searchTools.includes(toolName)) {
    const currentCount = Number.isInteger(usageState.webSearchCalls)
      ? usageState.webSearchCalls
      : 0;

    if (currentCount >= MAX_WEB_SEARCH_CALLS_PER_RESPONSE) {
      return {
        allowed: false,
        reason: `Limite de buscas por resposta atingido (${MAX_WEB_SEARCH_CALLS_PER_RESPONSE}). Use os resultados já obtidos ou informe o usuário.`
      };
    }

    usageState.webSearchCalls = currentCount + 1;
  }

  // Limit fetch tools
  const fetchTools = ['fetch', 'fetch_content'];
  if (fetchTools.includes(toolName)) {
    const currentCount = Number.isInteger(usageState.fetchCalls)
      ? usageState.fetchCalls
      : 0;

    if (currentCount >= MAX_WEB_SEARCH_CALLS_PER_RESPONSE) {
      return {
        allowed: false,
        reason: `Limite de fetch por resposta atingido (${MAX_WEB_SEARCH_CALLS_PER_RESPONSE}). Use os resultados já obtidos ou tente get_message_embeds.`
      };
    }

    usageState.fetchCalls = currentCount + 1;
  }

  return { allowed: true };
}

function containsToolPayloadMarkup(value) {
  if (typeof value !== 'string') {
    return false;
  }

  return /<\/?\s*(arg_key|arg_value|tool_call)\s*>/i.test(value);
}

function sanitizeToolName(toolName) {
  if (typeof toolName !== 'string') {
    return '';
  }

  const trimmed = toolName.trim();
  if (!trimmed) {
    return '';
  }

  if (/^[a-zA-Z0-9_-]{1,80}$/.test(trimmed)) {
    return trimmed;
  }

  const firstToken = trimmed.match(/[a-zA-Z][a-zA-Z0-9_-]{0,79}/);
  return firstToken ? firstToken[0] : '';
}

function isMalformedToolName(rawToolName, normalizedToolName) {
  if (typeof rawToolName !== 'string') {
    return true;
  }

  const trimmed = rawToolName.trim();
  if (!trimmed || !normalizedToolName) {
    return true;
  }

  if (containsToolPayloadMarkup(trimmed)) {
    return true;
  }

  return /[<>{}]/.test(trimmed);
}

function truncateForLog(value, maxLength = 140) {
  if (typeof value !== 'string') {
    return '[valor_invalido]';
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '[vazio]';
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}

function normalizeStringArray(values, maxItems = 30, maxLength = 280) {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalized = [];
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }

    normalized.push(trimmed.slice(0, maxLength));
    if (normalized.length >= maxItems) {
      break;
    }
  }

  return normalized;
}

function isMemoryStrictModeEnabled() {
  return config.settings?.memoryStrictMode !== false;
}

function getAllowedContextEntityIds(context = {}) {
  const ids = new Set();

  const userId = normalizeString(String(context.userId || ''));
  const guildId = normalizeString(String(context.guildId || ''));

  if (isValidDiscordId(userId)) {
    ids.add(userId);
  }

  if (isValidDiscordId(guildId)) {
    ids.add(guildId);
  }

  return ids;
}

function sanitizeMemoryToolArgs(toolName, args, context = {}) {
  const safeArgs = args && typeof args === 'object' ? args : {};
  const allowedEntityTypes = new Set(['user', 'guild']);
  const allowedContextIds = getAllowedContextEntityIds(context);
  const enforceContextScope = context?.source === 'chat' && allowedContextIds.size > 0;

  const isScopedEntityAllowed = (id) => {
    if (!isValidDiscordId(id)) {
      return false;
    }

    if (enforceContextScope && !allowedContextIds.has(id)) {
      return false;
    }

    return true;
  };

  if (toolName === 'create_entities') {
    const entities = Array.isArray(safeArgs.entities) ? safeArgs.entities : [];
    const filtered = [];

    for (const entity of entities) {
      const name = normalizeString(entity?.name);
      const entityType = normalizeString(entity?.entityType).toLowerCase();

      if (!isScopedEntityAllowed(name)) {
        continue;
      }

      if (!allowedEntityTypes.has(entityType)) {
        continue;
      }

      const observations = normalizeStringArray(entity?.observations, 30, 280);
      filtered.push({
        name,
        entityType,
        observations
      });
    }

    if (filtered.length === 0) {
      return {
        allowed: false,
        reason: 'Nenhuma entidade valida para memoria (apenas user/guild com ID do Discord).'
      };
    }

    return {
      allowed: true,
      args: { entities: filtered }
    };
  }

  if (toolName === 'add_observations') {
    const observations = Array.isArray(safeArgs.observations) ? safeArgs.observations : [];
    const filtered = [];

    for (const item of observations) {
      const entityName = normalizeString(item?.entityName);
      if (!isScopedEntityAllowed(entityName)) {
        continue;
      }

      const contents = normalizeStringArray(item?.contents, 30, 280);
      if (contents.length === 0) {
        continue;
      }

      filtered.push({
        entityName,
        contents
      });
    }

    if (filtered.length === 0) {
      return {
        allowed: false,
        reason: 'Nenhuma observacao valida para memoria (escopo restrito a user/guild).'
      };
    }

    return {
      allowed: true,
      args: { observations: filtered }
    };
  }

  if (toolName === 'create_relations' || toolName === 'delete_relations') {
    const relations = Array.isArray(safeArgs.relations) ? safeArgs.relations : [];
    const filtered = [];

    const scopedUserId = isValidDiscordId(normalizeString(String(context.userId || ''))) ? String(context.userId) : null;
    const scopedGuildId = isValidDiscordId(normalizeString(String(context.guildId || ''))) ? String(context.guildId) : null;

    for (const relation of relations) {
      const from = normalizeString(relation?.from);
      const to = normalizeString(relation?.to);
      const relationType = normalizeString(relation?.relationType).toLowerCase();

      if (relationType !== 'member_of') {
        continue;
      }

      if (!isScopedEntityAllowed(from) || !isScopedEntityAllowed(to)) {
        continue;
      }

      if (enforceContextScope && scopedUserId && scopedGuildId) {
        if (!(from === scopedUserId && to === scopedGuildId)) {
          continue;
        }
      }

      filtered.push({
        from,
        to,
        relationType: 'member_of'
      });
    }

    if (filtered.length === 0) {
      return {
        allowed: false,
        reason: 'Nenhuma relacao valida para memoria (apenas member_of user->guild).'
      };
    }

    return {
      allowed: true,
      args: { relations: filtered }
    };
  }

  if (toolName === 'delete_observations') {
    const deletions = Array.isArray(safeArgs.deletions) ? safeArgs.deletions : [];
    const filtered = [];

    for (const deletion of deletions) {
      const entityName = normalizeString(deletion?.entityName);
      if (!isScopedEntityAllowed(entityName)) {
        continue;
      }

      const observations = normalizeStringArray(deletion?.observations, 30, 280);
      if (observations.length === 0) {
        continue;
      }

      filtered.push({
        entityName,
        observations
      });
    }

    if (filtered.length === 0) {
      return {
        allowed: false,
        reason: 'Nenhuma delecao de observacao valida para memoria.'
      };
    }

    return {
      allowed: true,
      args: { deletions: filtered }
    };
  }

  if (toolName === 'delete_entities') {
    const entityNames = normalizeStringArray(
      Array.isArray(safeArgs.entityNames)
        ? safeArgs.entityNames
        : (Array.isArray(safeArgs.names) ? safeArgs.names : []),
      50,
      30
    ).filter(isScopedEntityAllowed);

    if (entityNames.length === 0) {
      return {
        allowed: false,
        reason: 'Nenhuma entidade valida para remocao.'
      };
    }

    return {
      allowed: true,
      args: { entityNames }
    };
  }

  if (toolName === 'open_nodes') {
    const requestedNames = normalizeStringArray(
      Array.isArray(safeArgs.names) ? safeArgs.names : [],
      50,
      30
    );

    let names = requestedNames.filter(isScopedEntityAllowed);

    if (names.length === 0 && enforceContextScope) {
      names = Array.from(allowedContextIds);
    }

    if (names.length === 0) {
      return {
        allowed: false,
        reason: 'Nenhum node valido para leitura.'
      };
    }

    return {
      allowed: true,
      args: { names }
    };
  }

  if (toolName === 'read_graph' && enforceContextScope) {
    return {
      allowed: false,
      reason: 'read_graph bloqueado no modo estrito de memoria durante conversa.'
    };
  }

  if (toolName === 'search_nodes') {
    const query = normalizeString(safeArgs.query).slice(0, 300);

    if (!query) {
      return {
        allowed: false,
        reason: 'Query invalida para search_nodes.'
      };
    }

    return {
      allowed: true,
      args: { query }
    };
  }

  return {
    allowed: true,
    args: safeArgs
  };
}

/**
 * Executa uma ferramenta específica
 * @param {string} toolName - Nome da ferramenta
 * @param {Object} args - Argumentos para a ferramenta
 * @param {Object} context - Contexto adicional (client, guild, channel, etc.)
 * @returns {Promise<Object>} Resultado da execução da ferramenta
 */
async function executeTool(toolName, args, context = {}) {
  const normalizedToolName = sanitizeToolName(toolName);

  if (isMalformedToolName(toolName, normalizedToolName)) {
    const safeName = truncateForLog(toolName);
    const error = `Nome de ferramenta invalido recebido do modelo: '${safeName}'`;
    console.error(`[TOOL_LOADER][ERRO] ${error}`);
    return {
      success: false,
      error: 'Nome de ferramenta invalido recebido do modelo.'
    };
  }

  const tool = await getTool(normalizedToolName);

  if (!tool) {
    const error = `Ferramenta '${normalizedToolName}' não encontrada`;
    console.error(`[TOOL_LOADER][ERRO] ${error}`);
    return {
      success: false,
      error: error
    };
  }

  const toolLimitCheck = enforceConversationToolLimits(normalizedToolName, context);
  if (!toolLimitCheck.allowed) {
    console.warn(`[TOOL_LOADER][WARN] Tool '${normalizedToolName}' bloqueada por limite de conversa: ${toolLimitCheck.reason}`);
    return {
      success: false,
      error: toolLimitCheck.reason
    };
  }

  // Check if it's an MCP tool
  if (tool._mcpServer) {
    return await executeMCPTool(normalizedToolName, args, tool._mcpServer, context);
  }

  // Check if it's a custom tool with handler
  if (!tool.handler) {
    const error = `Ferramenta '${normalizedToolName}' não possui handler definido`;
    console.error(`[TOOL_LOADER][ERRO] ${error}`);
    return {
      success: false,
      error: error
    };
  }

  try {
    // Resolve o caminho do handler relativo ao diretório raiz do projeto
    const handlerPath = path.join(__dirname, '..', tool.handler);

    // Carrega o handler dinamicamente
    const handler = require(handlerPath);

    if (typeof handler.execute !== 'function') {
      const error = `Handler da ferramenta '${normalizedToolName}' não possui função execute`;
      console.error(`[TOOL_LOADER][ERRO] ${error}`);
      return {
        success: false,
        error: error
      };
    }

    // Executa o handler
    const result = await handler.execute(args, {
      ...context,
      toolDefinition: tool
    });

    return {
      success: true,
      result: result
    };
  } catch (error) {
    console.error(`[TOOL_LOADER][ERRO] Erro ao executar ferramenta '${normalizedToolName}':`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Execute an MCP tool
 * @param {string} toolName - Name of the tool
 * @param {Object} args - Arguments for the tool
 * @param {string} serverName - Name of the MCP server
 * @returns {Promise<Object>} Result of the tool execution
 */
async function executeMCPTool(toolName, args, serverName, context = {}) {
  const server = mcpServers.get(serverName);

  if (!server) {
    const error = `Servidor MCP '${serverName}' não encontrado`;
    console.error(`[TOOL_LOADER][ERRO] ${error}`);
    return {
      success: false,
      error: error
    };
  }

  try {
    let effectiveArgs = args;

    if (serverName === 'memory' && isMemoryStrictModeEnabled()) {
      const sanitization = sanitizeMemoryToolArgs(toolName, args, context);

      if (!sanitization.allowed) {
        const error = `Tool '${toolName}' bloqueada pelo modo estrito de memoria: ${sanitization.reason}`;
        console.warn(`[TOOL_LOADER][WARN] ${error}`);
        return {
          success: false,
          error: error
        };
      }

      effectiveArgs = sanitization.args;
    }

    // Call the MCP tool
    const result = await mcpClient.callTool(server, toolName, effectiveArgs);

    // Return consistent format
    return {
      success: !result.isError,
      result: result.content || result,
      error: result.isError ? result.content : null
    };
  } catch (error) {
    console.error(`[TOOL_LOADER][ERRO] Erro ao executar ferramenta MCP '${toolName}':`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Processa múltiplas chamadas de ferramentas de uma resposta da API
 * @param {Array} toolCalls - Array de tool_calls da resposta da API
 * @param {Object} context - Contexto adicional (client, guild, channel, etc.)
 * @returns {Promise<Array>} Array de resultados das ferramentas
 */
async function executeToolCalls(toolCalls, context = {}) {
  if (!toolCalls || !Array.isArray(toolCalls)) {
    return [];
  }

  const results = [];

  for (const toolCall of toolCalls) {
    const toolName = toolCall.function?.name;
    const normalizedToolName = sanitizeToolName(toolName);
    const toolArgs = toolCall.function?.arguments;

    if (!toolName) {
      console.warn('[TOOL_LOADER][WARN] Tool call sem nome definido');
      continue;
    }

    if (isMalformedToolName(toolName, normalizedToolName)) {
      console.error(`[TOOL_LOADER][ERRO] Tool call com nome invalido recebido do modelo: '${truncateForLog(toolName)}'`);
      results.push({
        tool_call_id: toolCall.id,
        result: JSON.stringify({
          success: false,
          error: 'Nome de ferramenta invalido recebido do modelo.'
        })
      });
      continue;
    }

    let parsedArgs = {};
    try {
      parsedArgs = typeof toolArgs === 'string' ? JSON.parse(toolArgs) : toolArgs;
    } catch (parseError) {
      console.error(`[TOOL_LOADER][ERRO] Erro ao fazer parse dos argumentos da ferramenta '${normalizedToolName}':`, parseError.message);
      results.push({
        tool_call_id: toolCall.id,
        result: JSON.stringify({
          success: false,
          error: 'Argumentos inválidos: ' + parseError.message
        })
      });
      continue;
    }

    const executionResult = await executeTool(normalizedToolName, parsedArgs, context);

    results.push({
      tool_call_id: toolCall.id,
      result: JSON.stringify(executionResult)
    });
  }

  return results;
}

/**
 * Stop all running MCP servers
 * @returns {Promise<void>}
 */
async function stopAllMCPServers() {
  if (mcpServers.size === 0) {
    console.log('[TOOL_LOADER][INFO] Nenhum servidor MCP para parar');
    return;
  }

  console.log(`[TOOL_LOADER][INFO] Parando ${mcpServers.size} servidor(es) MCP`);

  const stopPromises = [];
  for (const [serverName, server] of mcpServers) {
    stopPromises.push(
      mcpClient.stopServer(server).catch(error => {
        console.error(`[TOOL_LOADER][ERRO] Erro ao parar servidor '${serverName}':`, error.message);
      })
    );
  }

  await Promise.allSettled(stopPromises);

  // Clear server cache
  mcpServers.clear();

  // Clear MCP tools cache
  mcpToolsCache = null;

  console.log('[TOOL_LOADER][INFO] Todos os servidores MCP parados');
}

/**
 * Get all running MCP servers
 * @returns {Map} Map of running MCP servers
 */
function getMCPServers() {
  return mcpServers;
}

module.exports = {
  loadToolsConfig,
  reloadTools,
  getOpenAITools,
  getTool,
  executeTool,
  executeToolCalls,
  startMCPServers,
  stopAllMCPServers,
  getMCPServers,
  getMCPTools
};
