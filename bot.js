// Arquivo: bot.js

const fs = require('fs');
const path = require('path');
// --- MUDANÇA 1: Importar 'Partials' ---
const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const config = require('./config.json');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    // --- MUDANÇA 2: Adicionar a permissão para ver reações ---
    GatewayIntentBits.GuildMessageReactions
  ],
  // --- MUDANÇA 3: Habilitar a leitura de 'partials' para reações ---
  // Isso permite que o bot processe eventos em mensagens que não estão no cache
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.commands = new Collection();

// Carregar comandos
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.warn(`[AVISO] O comando em ${filePath} está faltando "data" ou "execute".`);
  }
}

// Carregar eventos
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }
  }
}

client.login(config.discord.token);