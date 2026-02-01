/*
** caminho: commands/mmemories.js
** últimaMod: 2026-02-01
** autor: Vico
** colaboração: Gemini,Roo Sonic e ChatGPT
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
    .setName('mmemories')
    .setDescription('Gerenciar memórias de membros (MCP)')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .addSubcommand(subcommand =>
        subcommand
            .setName('list')
            .setDescription('Listar memórias de um membro')
            .addUserOption(option =>
                option.setName('member')
                    .setDescription('Membro cuja memórias serão listadas')
                    .setRequired(true)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('add')
            .setDescription('Adicionar uma memória a um membro')
            .addUserOption(option =>
                option.setName('member')
                    .setDescription('Membro')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('memory')
                    .setDescription('Memória a ser adicionada')
                    .setRequired(true)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('delete')
            .setDescription('Deletar uma memória de um membro')
            .addUserOption(option =>
                option.setName('member')
                    .setDescription('Membro cuja memória será deletada')
                    .setRequired(true)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('search')
            .setDescription('Buscar memórias de um membro por similaridade semântica')
            .addUserOption(option =>
                option.setName('member')
                    .setDescription('Membro cuja memórias serão buscadas')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('query')
                    .setDescription('Query de busca')
                    .setRequired(true)
            )
    );

/* --- Execute Function --- */
async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const member = interaction.options.getUser('member');
    const guildId = interaction.guild.id;

    // Helper to ensure user entity exists and is related to guild
    const ensureUserEntity = async () => {
        // Create user entity
        await toolLoader.executeTool('create_entities', {
            entities: [{
                name: member.id,
                entityType: 'user',
                observations: [
                    `Username: ${member.username}`,
                    `Global Name: ${member.globalName || member.username}`
                ]
            }]
        });

        // Create relation to guild
        await toolLoader.executeTool('create_relations', {
            relations: [{
                from: member.id,
                to: guildId,
                relationType: 'member_of'
            }]
        });
    };

    if (subcommand === 'list') {
        await interaction.deferReply();

        try {
            const response = await toolLoader.executeTool('open_nodes', { names: [member.id] });

            if (!response.success) {
                return await interaction.editReply({ content: 'Erro ao acessar o sistema de memória: ' + response.error });
            }

            const entities = response.result?.entities || [];
            const userEntity = entities.find(e => e.name === member.id);
            const memories = userEntity?.observations || [];

            const embed = new EmbedBuilder()
                .setTitle(`Memórias de ${member.displayName} (MCP)`)
                .setColor(0x0099FF)
                .setDescription(memories.length > 0
                    ? memories.map((m, i) => `${i + 1}. ${m}`).join('\n')
                    : 'Nenhuma memória encontrada.'
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
            await ensureUserEntity();

            const response = await toolLoader.executeTool('add_observations', {
                observations: [{
                    entityName: member.id,
                    contents: [memory]
                }]
            });

            if (response.success) {
                await interaction.editReply({ content: `Memória adicionada com sucesso a ${member.displayName}.` });
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

            const entities = response.result?.entities || [];
            const userEntity = entities.find(e => e.name === member.id);

            const embed = new EmbedBuilder()
                .setTitle(`Memórias de ${member.displayName} - Busca por "${query}"`)
                .setColor(0x0099FF);

            if (userEntity && userEntity.observations.length > 0) {
                embed.setDescription(userEntity.observations.map((m, i) => `${i + 1}. ${m}`).join('\n'));
            } else {
                embed.setDescription('Nenhuma observação direta encontrada para este membro com esse termo.');
            }

            // Could possibly show relations here too

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: 'Erro na busca.' });
        }

    } else if (subcommand === 'delete') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        try {
            const response = await toolLoader.executeTool('open_nodes', { names: [member.id] });
            if (!response.success) {
                return await interaction.editReply({ content: 'Erro ao acessar memórias: ' + response.error });
            }

            const entities = response.result?.entities || [];
            const userEntity = entities.find(e => e.name === member.id);
            const memories = userEntity?.observations || [];

            if (memories.length === 0) {
                return await interaction.editReply({ content: `Nenhuma memória encontrada para ${member.displayName}.` });
            }

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('select_memory')
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
                content: `Selecione uma memória de ${member.displayName} para deletar:`,
                components: [actionRow]
            });

            const filter = (i) => i.customId === 'select_memory' && i.user.id === interaction.user.id;
            const collector = msg.createMessageComponentCollector({ filter, componentType: ComponentType.StringSelect, time: 60000 });

            collector.on('collect', async i => {
                const index = parseInt(i.values[0]);
                const memoryContent = memories[index];

                await toolLoader.executeTool('delete_observations', {
                    deletions: [{
                        entityName: member.id,
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