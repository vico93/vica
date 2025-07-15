// bot.js  (graceful-shutdown addition)

const fs   = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const config   = require('./config.json');
const database = require('./core/database');   // for graceful close

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

client.commands = new Collection();

// ------------------  command loader  ------------------
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
  const cmd = require(path.join(commandsPath, file));
  if ('data' in cmd && 'execute' in cmd) client.commands.set(cmd.data.name, cmd);
}

// ------------------  event loader  ------------------
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
  const eventFiles = fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'));
  for (const file of eventFiles) {
    const event = require(path.join(eventsPath, file));
    if (event.once) client.once(event.name, (...args) => event.execute(...args, client));
    else            client.on (event.name, (...args) => event.execute(...args, client));
  }
}

// ------------------  login  ------------------
client.login(config.discord.token);

// ------------------  graceful shutdown  ------------------
process.on('SIGINT',  closeResources);
process.on('SIGTERM', closeResources);

function closeResources() {
  console.log('\nGracefully shutting down...');
  database.close();      // flush WAL
  client.destroy();
  process.exit(0);
}