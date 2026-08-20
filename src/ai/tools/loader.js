import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { tool } from '@openrouter/agent';
import { logger } from '../../utils/logger.js';

/**
 * Carrega ferramentas locais a partir do índice `tools.json` (config.tools).
 * Cada entrada: { name, module, enabled } onde `module` é o caminho relativo
 * à raiz do projeto. O módulo exporta { name, description, inputSchema (zod),
 * execute } — o contrato fica no código, o JSON só indexa (SPEC §6.3).
 *
 * @param {Array<{ name?: string, module?: string, enabled?: boolean }>} entries
 * @returns {Promise<import('@openrouter/agent').Tool[]>}
 */
export async function loadLocalTools(entries) {
  const tools = [];
  for (const entry of entries || []) {
    if (!entry || entry.enabled === false) continue;
    if (!entry.module) {
      logger.warn('Entrada de ferramenta sem "module" foi ignorada:', entry.name || JSON.stringify(entry));
      continue;
    }

    try {
      const modulePath = path.resolve(process.cwd(), entry.module);
      const mod = await import(pathToFileURL(modulePath).href);
      const def = mod.default ?? mod.tool ?? mod;

      if (!def || typeof def.execute !== 'function' || !def.name || !def.inputSchema) {
        logger.warn(`Ferramenta "${entry.name}" inválida (precisa exportar name/description/inputSchema/execute).`);
        continue;
      }

      tools.push(tool(def));
      logger.debug(`Ferramenta local carregada: ${def.name}`);
    } catch (err) {
      logger.error(`Falha ao carregar ferramenta "${entry.name}":`, err.message);
    }
  }
  return tools;
}
