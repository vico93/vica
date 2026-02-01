/*
**  caminho: bot.js
**  últimaMod: 2025-09-23 09:21
**  autor: Vico
**  colaboração: ChatGPT, Gemini, Kimi AI, Roo Sonic (xai/grok-code-fast-1)
*/

/*
  Ponto de entrada do bot.
  - Carrega comandos e eventos dinamicamente;
  - Configura intents e partials;
  - Possui graceful shutdown via SIGINT/SIGTERM.
*/

const fs   = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const config   = require('./config.json');
const database = require('./core/database');
const toolLoader = require('./core/tool_loader');

// ----------------------------------------------------------
// Cliente Discord
// ----------------------------------------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember]
});

client.commands = new Collection();

// ----------------------------------------------------------
// Carregamento de comandos
// ----------------------------------------------------------
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const cmd = require(path.join(commandsPath, file));
  if ('data' in cmd && 'execute' in cmd) {
    client.commands.set(cmd.data.name, cmd);
  } else {
    console.warn(`[VICA][CMD] Comando ignorado (falta data/execute): ${file}`);
  }
}

// ----------------------------------------------------------
// Carregamento de eventos
// ----------------------------------------------------------
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
  const eventFiles = fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'));
  for (const file of eventFiles) {
    const eventPath = path.join(eventsPath, file);
    const event = require(eventPath);
    try {
      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
      } else {
        client.on(event.name, (...args) => event.execute(...args, client));
      }
      console.log(`[VICA][EVT] Registrado evento "${event.name}" de ${file}`);
    } catch (e) {
      console.error(`[VICA][EVT] Falha ao registrar evento de ${file}:`, e);
    }
  }
}

// ----------------------------------------------------------
// Ready event - Start MCP servers
// ----------------------------------------------------------
client.once('ready', async () => {
    console.log(`[BOT][INFO] Bot conectado como ${client.user.tag}`);
    
    // Start MCP servers
    try {
        await toolLoader.startMCPServers();
        console.log('[BOT][INFO] MCP servers iniciados com sucesso');
    } catch (error) {
        console.error('[BOT][ERROR] Falha ao iniciar MCP servers:', error);
        // Bot continues to work even if MCP servers fail to start
    }
});

// ----------------------------------------------------------
// Login
// ----------------------------------------------------------
client.login(config.discord.token);

// ----------------------------------------------------------
// Graceful shutdown
// ----------------------------------------------------------
process.on('SIGINT',  gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

async function gracefulShutdown() {
    console.log('\n[BOT][INFO] Recebido sinal de desligamento. Fechando recursos...');
    
    try {
        // Stop MCP servers
        await toolLoader.stopAllMCPServers();
        console.log('[BOT][INFO] MCP servers parados com sucesso');
    } catch (error) {
        console.error('[BOT][ERROR] Erro ao parar MCP servers:', error);
    }
    
    database.close();
    client.destroy();
    process.exit(0);
}