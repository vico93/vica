// Arquivo: delete-commands.js

const { REST, Routes } = require('discord.js');
const config = require('./config.json');

// ====================================================================
// CONFIGURE AQUI O ID DO SERVIDOR ONDE OS COMANDOS DE TESTE ESTAVAM
// ====================================================================
const guildId = 'ID_DO_SEU_SERVIDOR_AQUI';
// ====================================================================


const rest = new REST({ version: '10' }).setToken(config.discord.token);

// Função assíncrona para rodar o processo
(async () => {
    try {
        console.log('Iniciando a remoção de todos os comandos...');

        // 1. Remover comandos GLOBAIS
        console.log('Removendo comandos globais (application commands)...');
        // Para remover, enviamos um array vazio para o método PUT
        await rest.put(
            Routes.applicationCommands(config.discord.clientId),
            { body: [] },
        );
        console.log('Comandos globais removidos com sucesso.');

        // 2. Remover comandos do SERVIDOR ESPECÍFICO (Guild)
        console.log(`Removendo comandos do servidor (guild commands) com ID: ${guildId}...`);
        await rest.put(
            Routes.applicationGuildCommands(config.discord.clientId, guildId),
            { body: [] },
        );
        console.log('Comandos de servidor removidos com sucesso.');


        console.log('\nOperação de limpeza de comandos concluída!');

    } catch (error) {
        console.error('Ocorreu um erro ao remover os comandos:');
        console.error(error);
    }
})();