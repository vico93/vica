/*
**  caminho: delete-commands.js
**  últimaMod: 16/07/2025 22:29
**  autor: Vico
**  colaboração: ChatGPT, Gemini, Kimi AI
*/

/*
  Script de limpeza de slash commands.
  CLI:
    node delete-commands.js --global
    node delete-commands.js --guild 123
  (podem ser usados juntos)
  Dependência: npm i minimist
*/

const { REST, Routes } = require('discord.js');
const args   = require('minimist')(process.argv.slice(2));
const config = require('./core/config');

const rest = new REST({ version: '10' }).setToken(config.discord.token);

(async () => {
  try {
    console.log('=== [VICA][DELETE] Iniciando limpeza ===');

    // 1. Comandos globais
    if (args.global || (!args.guild)) {
      console.log('[VICA][DELETE] Removendo comandos globais...');
      await rest.put(Routes.applicationCommands(config.discord.clientId), { body: [] });
      console.log('[VICA][DELETE] Comandos globais removidos.');
    }

    // 2. Guild específica
    if (args.guild) {
      console.log(`[VICA][DELETE] Removendo comandos da guild ${args.guild}...`);
      await rest.put(
        Routes.applicationGuildCommands(config.discord.clientId, args.guild),
        { body: [] }
      );
      console.log('[VICA][DELETE] Comandos de guild removidos.');
    }

    console.log('=== [VICA][DELETE] Limpeza finalizada ===');
  } catch (err) {
    console.error('[VICA][DELETE] Erro:', err);
  }
})();