// deploy-commands.js  (CLI flag support)

const { REST, Routes } = require('discord.js');
const fs   = require('fs');
const path = require('path');
const config = require('./config.json');

// ------------------  CLI parsing  ------------------
const args = require('minimist')(process.argv.slice(2));
//  node deploy-commands.js                  ->  GLOBAL
//  node deploy-commands.js --guild 123     ->  guild 123
const guildIdCLI = args.guild;

// ------------------  load commands  ------------------
const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath)
                      .filter(f => f.endsWith('.js') && f !== 'index.js');

for (const file of commandFiles) {
  const cmd = require(path.join(commandsPath, file));
  if ('data' in cmd && 'execute' in cmd) commands.push(cmd.data.toJSON());
  else console.log(`[AVISO] Comando ignorado (falta data/execute): ${file}`);
}

const rest = new REST({ version: '10' }).setToken(config.discord.token);

(async () => {
  try {
    console.log(
      guildIdCLI
        ? `Iniciando deploy de ${commands.length} comandos para guild ${guildIdCLI}`
        : `Iniciando deploy GLOBAL de ${commands.length} comandos`
    );

    if (guildIdCLI) {
      await rest.put(
        Routes.applicationGuildCommands(config.discord.clientId, guildIdCLI),
        { body: commands }
      );
      console.log('✅ Comandos de guild enviados.');
    } else {
      await rest.put(
        Routes.applicationCommands(config.discord.clientId),
        { body: commands }
      );
      console.log('✅ Comandos globais enviados.');
      console.log('Lembre-se: pode levar até 1 hora para aparecer em todos os servidores.');
    }
  } catch (err) {
    console.error(err);
  }
})();