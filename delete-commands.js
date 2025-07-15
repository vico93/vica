// delete-commands.js  (CLI flag support)

const { REST, Routes } = require('discord.js');
const config = require('./config.json');
const args   = require('minimist')(process.argv.slice(2));
//  node delete-commands.js --global
//  node delete-commands.js --guild 123
//  (both flags can be used together)

const rest = new REST({ version: '10' }).setToken(config.discord.token);

(async () => {
  try {
    console.log('===  Limpando comandos  ===');

    // 1. GLOBAL
    if (args.global || (!args.guild)) {
      console.log('Removendo comandos globais...');
      await rest.put(Routes.applicationCommands(config.discord.clientId), { body: [] });
      console.log('✅ Comandos globais removidos.');
    }

    // 2. SPECIFIC GUILD
    if (args.guild) {
      console.log(`Removendo comandos da guild ${args.guild}...`);
      await rest.put(
        Routes.applicationGuildCommands(config.discord.clientId, args.guild),
        { body: [] }
      );
      console.log('✅ Comandos de guild removidos.');
    }

    console.log('===  Limpeza concluída  ===');
  } catch (err) {
    console.error('Erro ao remover comandos:', err);
  }
})();