import fs from 'node:fs';
import path from 'node:path';
import { parse as parseToml } from 'smol-toml';

const DEFAULT_CONFIG = {
  bot: {
    prefix: '!',
    auto_delete_commands: false,
    token: ''
  },
  osmium: {
    endpoint: 'wss://osmium.chat/api/v1/gateway'
  },
  ai: {
    model: 'anthropic/claude-3.5-sonnet',
    reaction_emoji: '',
    persona_file: 'src/ai/persona.md',
    api_key: ''
  },
  database: {
    path: './data/vica.sqlite'
  },
  xp: {
    voice_xp_per_minute: 1
  },
  logging: {
    level: 'info'
  }
};

/**
 * Carrega e valida arquivos de configuração com fallback para templates/defaults.
 * @param {string} [baseDir=process.cwd()]
 */
export function loadConfig(baseDir = process.cwd()) {
  const configPath = path.resolve(baseDir, 'config.toml');
  const exampleConfigPath = path.resolve(baseDir, 'config.example.toml');

  let parsedToml = {};
  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      parsedToml = parseToml(raw);
    } catch (err) {
      throw new Error(`Erro ao ler/parsear config.toml: ${err.message}`);
    }
  } else if (fs.existsSync(exampleConfigPath)) {
    try {
      const raw = fs.readFileSync(exampleConfigPath, 'utf8');
      parsedToml = parseToml(raw);
    } catch (err) {
      throw new Error(`Erro ao ler/parsear config.example.toml: ${err.message}`);
    }
  } else {
    throw new Error('Nenhum arquivo config.toml ou config.example.toml encontrado.');
  }

  // Mescla com defaults
  const config = {
    bot: { ...DEFAULT_CONFIG.bot, ...(parsedToml.bot || {}) },
    osmium: { ...DEFAULT_CONFIG.osmium, ...(parsedToml.osmium || {}) },
    ai: { ...DEFAULT_CONFIG.ai, ...(parsedToml.ai || {}) },
    database: { ...DEFAULT_CONFIG.database, ...(parsedToml.database || {}) },
    xp: { ...DEFAULT_CONFIG.xp, ...(parsedToml.xp || {}) },
    logging: { ...DEFAULT_CONFIG.logging, ...(parsedToml.logging || {}) }
  };

  // Carrega tools.json (ou tools.example.json)
  const toolsPath = path.resolve(baseDir, 'tools.json');
  const exampleToolsPath = path.resolve(baseDir, 'tools.example.json');
  let tools = { tools: [] };

  if (fs.existsSync(toolsPath)) {
    try {
      tools = JSON.parse(fs.readFileSync(toolsPath, 'utf8'));
    } catch (err) {
      throw new Error(`Erro ao ler/parsear tools.json: ${err.message}`);
    }
  } else if (fs.existsSync(exampleToolsPath)) {
    try {
      tools = JSON.parse(fs.readFileSync(exampleToolsPath, 'utf8'));
    } catch (err) {
      throw new Error(`Erro ao ler/parsear tools.example.json: ${err.message}`);
    }
  }

  // Carrega mcp.json (ou mcp.example.json)
  const mcpPath = path.resolve(baseDir, 'mcp.json');
  const exampleMcpPath = path.resolve(baseDir, 'mcp.example.json');
  let mcp = { mcpServers: {} };

  if (fs.existsSync(mcpPath)) {
    try {
      mcp = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
    } catch (err) {
      throw new Error(`Erro ao ler/parsear mcp.json: ${err.message}`);
    }
  } else if (fs.existsSync(exampleMcpPath)) {
    try {
      mcp = JSON.parse(fs.readFileSync(exampleMcpPath, 'utf8'));
    } catch (err) {
      throw new Error(`Erro ao ler/parsear mcp.example.json: ${err.message}`);
    }
  }

  return {
    ...config,
    tools: Array.isArray(tools.tools) ? tools.tools : [],
    mcpServers: mcp.mcpServers || {}
  };
}
