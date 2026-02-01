/*
** caminho: scripts/migrate_memories.js
** descrição: Migra memórias do banco SQLite (legacy) para o servidor MCP "memory"
** uso: node scripts/migrate_memories.js
*/

const Database = require('better-sqlite3');
const path = require('path');
const toolLoader = require('../core/tool_loader');

// Caminho do banco de dados
const dbPath = path.join(__dirname, '..', 'data', 'database.db');

async function migrate() {
    console.log('--- Iniciando Migração de Memórias ---');

    // 1. Conectar ao banco de dados SQLite
    if (!require('fs').existsSync(dbPath)) {
        console.error(`[MIGRATE] Banco de dados não encontrado em: ${dbPath}`);
        process.exit(1);
    }

    const db = new Database(dbPath, { readonly: true });
    console.log('[MIGRATE] Conectado ao banco de dados SQLite.');

    // 2. Iniciar Servidores MCP
    // Isso vai iniciar o servidor 'memory' conforme configurado em data/tools.json
    try {
        await toolLoader.startMCPServers();
        console.log('[MIGRATE] Servidores MCP iniciados.');

        // Pequena pausa para garantir inicialização
        await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
        console.error('[MIGRATE] Erro ao iniciar servidores MCP:', e);
        process.exit(1);
    }

    // 3. Migrar Memórias de Guild
    try {
        console.log('[MIGRATE] Lendo memórias de Guild...');
        const guildMemories = db.prepare('SELECT * FROM guild_memories').all();
        console.log(`[MIGRATE] Encontradas ${guildMemories.length} memórias de guild.`);

        for (const mem of guildMemories) {
            const guildId = mem.guild_id;
            const content = mem.content;

            // Criar Entidade da Guild (Idempotente)
            await toolLoader.executeTool('create_entities', {
                entities: [{
                    name: guildId,
                    entityType: 'guild',
                    observations: []
                }]
            });

            // Adicionar Observação
            const res = await toolLoader.executeTool('add_observations', {
                observations: [{
                    entityName: guildId,
                    contents: [content]
                }]
            });

            if (!res.success) {
                console.error(`[MIGRATE][ERRO] Falha ao migrar memória de guild ${guildId}: ${res.error}`);
            } else {
                console.log(`[MIGRATE][OK] Guild ${guildId}: "${content.substring(0, 30)}..."`);
            }
        }
    } catch (e) {
        console.error('[MIGRATE] Erro ao processar memórias de guild:', e);
    }

    // 4. Migrar Memórias de Usuário
    try {
        console.log('[MIGRATE] Lendo memórias de Usuário...');
        const userMemories = db.prepare('SELECT * FROM user_memories').all();
        console.log(`[MIGRATE] Encontradas ${userMemories.length} memórias de usuário.`);

        for (const mem of userMemories) {
            const userId = mem.user_id;
            const guildId = mem.guild_id;
            const content = mem.content;

            // Criar Entidade de Usuário
            await toolLoader.executeTool('create_entities', {
                entities: [{
                    name: userId,
                    entityType: 'user',
                    observations: []
                }]
            });

            // Assegurar Entidade de Guild para relação
            await toolLoader.executeTool('create_entities', {
                entities: [{
                    name: guildId,
                    entityType: 'guild',
                    observations: []
                }]
            });

            // Criar Relação (User -> Guild)
            // Assumimos 'member_of'
            await toolLoader.executeTool('create_relations', {
                relations: [{
                    from: userId,
                    to: guildId,
                    relationType: 'member_of'
                }]
            });

            // Adicionar Observação
            const res = await toolLoader.executeTool('add_observations', {
                observations: [{
                    entityName: userId,
                    contents: [content]
                }]
            });

            if (!res.success) {
                console.error(`[MIGRATE][ERRO] Falha ao migrar memória de usuário ${userId}: ${res.error}`);
            } else {
                console.log(`[MIGRATE][OK] User ${userId}: "${content.substring(0, 30)}..."`);
            }
        }

    } catch (e) {
        console.error('[MIGRATE] Erro ao processar memórias de usuário:', e);
    }

    // Encerrar
    console.log('[MIGRATE] Migração concluída.');

    // Parar servidores
    await toolLoader.stopAllMCPServers();
    db.close();
    process.exit(0);
}

migrate();
