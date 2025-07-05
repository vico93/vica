const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
// Filtra para garantir que não estamos pegando arquivos "intrusos" sem querer
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') && file !== 'index.js');

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);

  if ('data' in command && 'execute' in command) {
    commands.push(command.data.toJSON());
  } else {
    console.log(`[AVISO] O comando em "${filePath}" foi ignorado por não ter 'data' ou 'execute'.`);
  }
}

const rest = new REST({ version: '10' }).setToken(config.discord.token);

(async () => {
  try {
    console.log(`Iniciando atualização de ${commands.length} comandos de barra (slash commands) de forma GLOBAL.`);

    // --- MUDANÇA PRINCIPAL AQUI ---

    // O deploy de servidor (guild) agora está comentado.
    /*
    await rest.put(
      Routes.applicationGuildCommands(config.discord.clientId, 'SEU_ID_DE_SERVIDOR_AQUI'),
      { body: commands },
    );
    */

    // O deploy GLOBAL agora está ATIVO.
    await rest.put(
      Routes.applicationCommands(config.discord.clientId),
      { body: commands },
    );
    
    // --- FIM DA MUDANÇA ---

    console.log(`Comandos globais enviados para atualização com sucesso!`);
    console.log(`Lembre-se: a atualização pode levar até 1 hora para ser aplicada em todos os servidores.`);

  } catch (error) {
    console.error(error);
  }
})();