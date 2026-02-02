/*
** caminho: commands/gmemories.js
** últimaMod: 2026-02-01
** autor: Vico
** colaboração: Gemini, Roo Sonic e ChatGPT
*/

/* --- Imports --- */
const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    PermissionsBitField,
    ComponentType,
    MessageFlags
} = require('discord.js');
const toolLoader = require('../core/tool_loader');

/* --- Command Data --- */
const data = new SlashCommandBuilder()
    .setName('gmemories')
    .setDescription('Gerenciar memórias do servidor (MCP)')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .addSubcommand(subcommand =>
        subcommand
            .setName('list')
            .setDescription('Listar memórias do servidor')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('add')
            .setDescription('Adicionar uma memória ao servidor')
            .addStringOption(option =>
                option.setName('memory')
                    .setDescription('Memória a ser adicionada')
                    .setRequired(true)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('delete')
            .setDescription('Deletar uma memória do servidor')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('search')
            .setDescription('Buscar memórias por similaridade semântica')
            .addStringOption(option =>
                option.setName('query')
                    .setDescription('Query de busca')
                    .setRequired(true)
            )
    );

/* --- Execute Function --- */
async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const guildName = interaction.guild.name;

    // Helper to ensure guild entity exists
    const ensureGuildEntity = async () => {
        // Try to create/update the guild entity
        await toolLoader.executeTool('create_entities', {
            entities: [{
                name: guildId,
                entityType: 'guild',
                observations: [`Nome do servidor: ${guildName}`]
            }]
        });
    };

    if (subcommand === 'list') {
        await interaction.deferReply();

        try {
            // Read guild node
            const response = await toolLoader.executeTool('open_nodes', { names: [guildId] });

            if (!response.success) {
                return await interaction.editReply({ content: 'Erro ao acessar o sistema de memória: ' + response.error });
            }

            // Helper to parse MCP result
            let resultData = response.result;
            if (typeof resultData === 'string') {
                try { resultData = JSON.parse(resultData); } catch (e) {}
            }
            if (resultData && typeof resultData === 'object' && resultData.result && typeof resultData.result === 'string') {
                try { resultData = JSON.parse(resultData.result); } catch (e) {}
            }

            const entities = resultData?.entities || [];
            const guildEntity = entities.find(e => e.name === guildId);
            const memories = guildEntity?.observations || [];

            const embed = new EmbedBuilder()
                .setTitle('Memórias do Servidor (MCP)')
                .setColor(0x0099FF)
                .setDescription(memories.length > 0
                    ? memories.map((m, i) => `${i + 1}. ${m}`).join('\n')
                    : 'Nenhuma memória encontrada para este servidor.'
                );

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: 'Ocorreu um erro ao listar as memórias.' });
        }

    } else if (subcommand === 'add') {
        const memory = interaction.options.getString('memory');
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        try {
            await ensureGuildEntity();

            const response = await toolLoader.executeTool('add_observations', {
                observations: [{
                    entityName: guildId,
                    contents: [memory]
                }]
            });

            if (response.success) {
                await interaction.editReply({ content: 'Memória adicionada com sucesso ao servidor.' });
            } else {
                await interaction.editReply({ content: 'Erro ao adicionar memória: ' + response.error });
            }
        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: 'Ocorreu um erro ao processar sua solicitação.' });
        }

    } else if (subcommand === 'search') {
        const query = interaction.options.getString('query');
        await interaction.deferReply();

        try {
            const response = await toolLoader.executeTool('search_nodes', { query: query });

            if (!response.success) {
                return await interaction.editReply({ content: 'Erro na busca: ' + response.error });
            }

            // Helper to parse MCP result
            let resultData = response.result;
            if (typeof resultData === 'string') {
                try { resultData = JSON.parse(resultData); } catch (e) {}
            }
            if (resultData && typeof resultData === 'object' && resultData.result && typeof resultData.result === 'string') {
                try { resultData = JSON.parse(resultData.result); } catch (e) {}
            }

            const entities = resultData?.entities || [];

            const guildEntity = entities.find(e => e.name === guildId);

            const embed = new EmbedBuilder()
                .setTitle(`Busca por "${query}"`)
                .setColor(0x0099FF);

            if (guildEntity && guildEntity.observations.length > 0) {
                embed.setDescription(guildEntity.observations.map((m, i) => `${i + 1}. ${m}`).join('\n'));
                embed.setFooter({ text: 'Exibindo observações da entidade Servidor encontrada.' });
            } else {
                embed.setDescription('Nenhuma observação direta do servidor encontrada com esse termo.');
            }

            const otherEntities = entities.filter(e => e.name !== guildId);
            if (otherEntities.length > 0) {
                const othersText = otherEntities.map(e => `**${e.name}** (${e.entityType})`).join(', ');
                embed.addFields({ name: 'Outras Entidades Relacionadas', value: othersText.substring(0, 1024) });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: 'Erro na busca.' });
        }

    } else if (subcommand === 'delete') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        try {
            const response = await toolLoader.executeTool('open_nodes', { names: [guildId] });
            if (!response.success) {
                return await interaction.editReply({ content: 'Erro ao acessar memórias: ' + response.error });
            }

            // Helper to parse MCP result
            let resultData = response.result;
            if (typeof resultData === 'string') {
                try { resultData = JSON.parse(resultData); } catch (e) {}
            }
            if (resultData && typeof resultData === 'object' && resultData.result && typeof resultData.result === 'string') {
                try { resultData = JSON.parse(resultData.result); } catch (e) {}
            }

            const entities = resultData?.entities || [];
            const guildEntity = entities.find(e => e.name === guildId);
            const memories = guildEntity?.observations || [];

            if (memories.length === 0) {
                return await interaction.editReply({ content: 'Nenhuma memória encontrada para este servidor.' });
            }

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('select_memory_guild')
                .setPlaceholder('Selecione uma memória para deletar')
                .addOptions(
                    memories.map((m, i) => ({
                        label: `Memória ${i + 1}`,
                        value: i.toString(),
                        description: m.length > 50 ? m.substring(0, 47) + '...' : m
                    })).slice(0, 25)
                );

            const actionRow = new ActionRowBuilder().addComponents(selectMenu);

            const msg = await interaction.editReply({
                content: 'Selecione uma memória do servidor para deletar:',
                components: [actionRow]
            });

            const filter = (i) => i.customId === 'select_memory_guild' && i.user.id === interaction.user.id;
            const collector = msg.createMessageComponentCollector({ filter, componentType: ComponentType.StringSelect, time: 60000 });

            collector.on('collect', async i => {
                const index = parseInt(i.values[0]);
                const memoryContent = memories[index];

                await toolLoader.executeTool('delete_observations', {
                    deletions: [{
                        entityName: guildId,
                        observations: [memoryContent]
                    }]
                });

                await i.update({ content: `Memória removida com sucesso!`, components: [] });
                collector.stop();
            });

            collector.on('end', (_, reason) => {
                if (reason === 'time') interaction.editReply({ content: 'Tempo esgotado.', components: [] });
            });

        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: 'Erro ao carregar menu de deleção.' });
        }
    }
}

/* --- Exports --- */
module.exports = {
    data,
    execute
};