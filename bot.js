/*
**  caminho: bot.js
**  últimaMod: 16/07/2025 22:27
**  autor: Vico
**  colaboração: ChatGPT, Gemini, Kimi AI
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

// ----------------------------------------------------------
// Cliente Discord
// ----------------------------------------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers
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
// Login
// ----------------------------------------------------------
client.login(config.discord.token);

// ----------------------------------------------------------
// Graceful shutdown
// ----------------------------------------------------------
process.on('SIGINT',  gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

function gracefulShutdown() {
  console.log('\n[VICA] Recebido sinal de desligamento. Fechando recursos...');
  database.close();
  client.destroy();
  process.exit(0);
}