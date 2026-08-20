import { createMCPTools } from '@openrouter/mcp';
import { logger } from '../utils/logger.js';

function buildAuth(server) {
  if (server?.headers && typeof server.headers === 'object') {
    return { kind: 'headers', headers: server.headers };
  }
  if (server?.token) {
    return { kind: 'bearer', token: server.token };
  }
  return undefined;
}

/**
 * Carrega servidores MCP remotos de `mcp.json` (config.mcpServers).
 * Apenas Streamable HTTP/SSE (url); servidores stdio são ignorados com aviso.
 *
 * @param {Record<string, { url?: string, headers?: object, token?: string, command?: string }>} mcpServers
 * @returns {Promise<{ tools: import('@openrouter/agent').Tool[], handles: import('@openrouter/mcp').MCPToolsHandle[] }>}
 */
export async function loadMcpTools(mcpServers) {
  const tools = [];
  const handles = [];

  for (const [name, server] of Object.entries(mcpServers || {})) {
    if (!server?.url) {
      if (server?.command) {
        logger.warn(`Servidor MCP "${name}" usa stdio (fora de escopo) e será ignorado.`);
      }
      continue;
    }

    try {
      const options = {
        url: server.url,
        auth: buildAuth(server)
      };
      if (server.toolNamePrefix) {
        options.toolNamePrefix = server.toolNamePrefix;
      }

      const handle = await createMCPTools(options);
      tools.push(...handle.tools);
      handles.push(handle);
      logger.info(`MCP "${name}" conectado: ${handle.tools.length} ferramenta(s).`);
    } catch (err) {
      logger.error(`Falha ao conectar ao MCP "${name}":`, err.message);
    }
  }

  return { tools, handles };
}
