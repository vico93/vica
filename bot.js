/*
**  caminho: bot.js
**  últimaMod: 2026-02-24 20:05
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
const { Client, GatewayIntentBits, Collection, Partials, Events } = require('discord.js');
const config   = require('./core/config');
const database = require('./core/database');
const toolLoader = require('./core/tool_loader');
const voiceXp = require('./core/voice_xp');

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
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates
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
client.once(Events.ClientReady, async () => {
    console.log(`[BOT][INFO] Bot conectado como ${client.user.tag}`);
    
    // Start MCP servers
    try {
        await toolLoader.startMCPServers();
        console.log('[BOT][INFO] MCP servers iniciados com sucesso');
    } catch (error) {
        console.error('[BOT][ERROR] Falha ao iniciar MCP servers:', error);
        // Bot continues to work even if MCP servers fail to start
    }

    try {
        voiceXp.startVoiceXpService(client, database);
    } catch (error) {
        console.error('[BOT][ERROR] Falha ao iniciar serviço de XP por voz:', error);
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

    try {
        voiceXp.stopVoiceXpService();
    } catch (error) {
        console.error('[BOT][ERROR] Erro ao parar serviço de XP por voz:', error);
    }
    
    database.close();
    client.destroy();
    process.exit(0);
}
