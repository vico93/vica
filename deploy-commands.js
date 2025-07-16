/*
**  caminho: deploy-commands.js
**  últimaMod: 16/07/2025 22:28
**  autor: Vico
**  colaboração: ChatGPT, Gemini, Kimi AI
*/

/*
  Script de deploy de slash commands.
  Suporta CLI:
    node deploy-commands.js              -> global
    node deploy-commands.js --guild 123 -> guild 123
  Dependência: npm i minimist
*/

const { REST, Routes } = require('discord.js');
const fs   = require('fs');
const path = require('path');
const args = require('minimist')(process.argv.slice(2));
const config = require('./config.json');

// ----------------------------------------------------------
// Coleta comandos
// ----------------------------------------------------------
const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath)
                      .filter(f => f.endsWith('.js') && f !== 'index.js');

for (const file of commandFiles) {
  const cmd = require(path.join(commandsPath, file));
  if ('data' in cmd && 'execute' in cmd) {
    commands.push(cmd.data.toJSON());
  } else {
    console.warn(`[VICA][DEPLOY] Comando ignorado (falta data/execute): ${file}`);
  }
}

const rest = new REST({ version: '10' }).setToken(config.discord.token);

(async () => {
  try {
    const guildIdCLI = args.guild;

    console.log(
      guildIdCLI
        ? `[VICA][DEPLOY] Enviando ${commands.length} comandos para guild ${guildIdCLI}`
        : `[VICA][DEPLOY] Enviando ${commands.length} comandos GLOBALMENTE`
    );

    if (guildIdCLI) {
      await rest.put(
        Routes.applicationGuildCommands(config.discord.clientId, guildIdCLI),
        { body: commands }
      );
      console.log('[VICA][DEPLOY] Comandos de guild enviados com sucesso.');
    } else {
      await rest.put(
        Routes.applicationCommands(config.discord.clientId),
        { body: commands }
      );
      console.log('[VICA][DEPLOY] Comandos globais enviados com sucesso.');
      console.log('[VICA][DEPLOY] Pode levar até 1 hora para aparecer em todos os servidores.');
    }
  } catch (err) {
    console.error('[VICA][DEPLOY] Erro:', err);
  }
})();