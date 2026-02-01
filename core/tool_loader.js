/*
** caminho: core/tool_loader.js
** últimaMod: 2026-02-01
** autor: Vico
** colaboração: Roo
*/

const fs = require('fs');
const path = require('path');
const mcpClient = require('./mcp_client');

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
    toolsConfigPath = path.join(__dirname, '..', 'data', 'tools.json');
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
async function getOpenAITools() {
  const config = loadToolsConfig();

  if (!config.tools || !Array.isArray(config.tools)) {
    console.warn('[TOOL_LOADER][WARN] Nenhuma ferramenta encontrada na configuração');
    return [];
  }

  const openaiTools = [];

  // Process custom tools (with handler)
  for (const tool of config.tools) {
    // Skip MCP servers (they will be processed separately)
    if (tool.type === 'mcp') {
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

  // Add MCP tools
  const mcpTools = await getMCPTools();
  openaiTools.push(...mcpTools);

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

  // First, check custom tools
  const customTool = config.tools.find(tool => tool.name === toolName);
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

/**
 * Executa uma ferramenta específica
 * @param {string} toolName - Nome da ferramenta
 * @param {Object} args - Argumentos para a ferramenta
 * @returns {Promise<Object>} Resultado da execução da ferramenta
 */
async function executeTool(toolName, args) {
  const tool = await getTool(toolName);

  if (!tool) {
    const error = `Ferramenta '${toolName}' não encontrada`;
    console.error(`[TOOL_LOADER][ERRO] ${error}`);
    return {
      success: false,
      error: error
    };
  }

  // Check if it's an MCP tool
  if (tool._mcpServer) {
    return await executeMCPTool(toolName, args, tool._mcpServer);
  }

  // Check if it's a custom tool with handler
  if (!tool.handler) {
    const error = `Ferramenta '${toolName}' não possui handler definido`;
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
      const error = `Handler da ferramenta '${toolName}' não possui função execute`;
      console.error(`[TOOL_LOADER][ERRO] ${error}`);
      return {
        success: false,
        error: error
      };
    }

    console.log(`[TOOL_LOADER][INFO] Executando ferramenta '${toolName}' com args:`, JSON.stringify(args));

    // Executa o handler
    const result = await handler.execute(args);

    console.log(`[TOOL_LOADER][INFO] Ferramenta '${toolName}' executada com sucesso`);

    return {
      success: true,
      result: result
    };
  } catch (error) {
    console.error(`[TOOL_LOADER][ERRO] Erro ao executar ferramenta '${toolName}':`, error.message);
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
async function executeMCPTool(toolName, args, serverName) {
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
    console.log(`[TOOL_LOADER][INFO] Executando ferramenta MCP '${toolName}' no servidor '${serverName}' com args:`, JSON.stringify(args));

    // Call the MCP tool
    const result = await mcpClient.callTool(server, toolName, args);

    console.log(`[TOOL_LOADER][INFO] Ferramenta MCP '${toolName}' executada com sucesso`);

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
 * @returns {Promise<Array>} Array de resultados das ferramentas
 */
async function executeToolCalls(toolCalls) {
  if (!toolCalls || !Array.isArray(toolCalls)) {
    return [];
  }

  const results = [];

  for (const toolCall of toolCalls) {
    const toolName = toolCall.function?.name;
    const toolArgs = toolCall.function?.arguments;

    if (!toolName) {
      console.warn('[TOOL_LOADER][WARN] Tool call sem nome definido');
      continue;
    }

    let parsedArgs = {};
    try {
      parsedArgs = typeof toolArgs === 'string' ? JSON.parse(toolArgs) : toolArgs;
    } catch (parseError) {
      console.error(`[TOOL_LOADER][ERRO] Erro ao fazer parse dos argumentos da ferramenta '${toolName}':`, parseError.message);
      results.push({
        tool_call_id: toolCall.id,
        result: JSON.stringify({
          success: false,
          error: 'Argumentos inválidos: ' + parseError.message
        })
      });
      continue;
    }

    const executionResult = await executeTool(toolName, parsedArgs);

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
