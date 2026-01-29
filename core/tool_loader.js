/*
** caminho: core/tool_loader.js
** últimaMod: 2026-01-29
** autor: Vico
** colaboração: Roo
*/

const fs = require('fs');
const path = require('path');

// Cache para ferramentas carregadas
let toolsCache = null;
let toolsConfigPath = null;

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
 * Recarrega o cache de ferramentas (útil para desenvolvimento)
 */
function reloadTools() {
  toolsCache = null;
  console.log('[TOOL_LOADER][INFO] Cache de ferramentas recarregado');
}

/**
 * Obtém todas as ferramentas no formato OpenAI
 * @returns {Array} Array de ferramentas no formato OpenAI
 */
function getOpenAITools() {
  const config = loadToolsConfig();
  
  if (!config.tools || !Array.isArray(config.tools)) {
    console.warn('[TOOL_LOADER][WARN] Nenhuma ferramenta encontrada na configuração');
    return [];
  }

  // Converte para o formato OpenAI
  return config.tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }));
}

/**
 * Obtém uma ferramenta específica pelo nome
 * @param {string} toolName - Nome da ferramenta
 * @returns {Object|null} Definição da ferramenta ou null se não encontrada
 */
function getTool(toolName) {
  const config = loadToolsConfig();
  
  if (!config.tools || !Array.isArray(config.tools)) {
    return null;
  }

  return config.tools.find(tool => tool.name === toolName) || null;
}

/**
 * Executa uma ferramenta específica
 * @param {string} toolName - Nome da ferramenta
 * @param {Object} arguments - Argumentos para a ferramenta
 * @returns {Promise<Object>} Resultado da execução da ferramenta
 */
async function executeTool(toolName, args) {
  const tool = getTool(toolName);
  
  if (!tool) {
    const error = `Ferramenta '${toolName}' não encontrada`;
    console.error(`[TOOL_LOADER][ERRO] ${error}`);
    return {
      success: false,
      error: error
    };
  }

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

module.exports = {
  loadToolsConfig,
  reloadTools,
  getOpenAITools,
  getTool,
  executeTool,
  executeToolCalls
};
