/*
** caminho: commands/gmemories.js
** últimaMod: 2025-09-06 20:53
** autor: Vico
** colaboração: Roo Sonic
*/

/* --- Imports --- */
const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField,
    ComponentType,
    MessageFlags
} = require('discord.js');
const { listarMemoriasGuild, adicionarMemoriaGuild, deletarMemoriaGuild } = require('../core/database');

/* --- Command Data --- */
const data = new SlashCommandBuilder()
    .setName('gmemories')
    .setDescription('Gerenciar memórias do servidor')
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
    );

/* --- Execute Function --- */
async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (subcommand === 'list') {
        /* --- List Subcommand --- */
        const memories = listarMemoriasGuild(guildId);

        const embed = new EmbedBuilder()
            .setTitle('Memórias do Servidor')
            .setColor(0x0099FF)
            .setDescription(memories.length > 0
                ? memories.map((m, i) => `${i + 1}. ${m.memory}`).join('\n')
                : 'Nenhuma memória encontrada para este servidor.'
            );

        await interaction.reply({ embeds: [embed] });

    } else if (subcommand === 'add') {
        /* --- Add Subcommand --- */
        const memory = interaction.options.getString('memory');

        adicionarMemoriaGuild(guildId, memory);

        await interaction.reply({
            content: 'Memória adicionada com sucesso ao servidor.',
            flags: [MessageFlags.Ephemeral]
        });

    } else if (subcommand === 'delete') {
        /* --- Delete Subcommand --- */
        const memories = listarMemoriasGuild(guildId);

        if (memories.length === 0) {
            return await interaction.reply({
                content: 'Nenhuma memória encontrada para este servidor.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_memory_guild')
            .setPlaceholder('Selecione uma memória para deletar')
            .addOptions(
                memories.map((m, i) => ({
                    label: `Memória ${i + 1}`,
                    value: m.id.toString(),
                    description: m.memory.length > 50 ? m.memory.substring(0, 47) + '...' : m.memory
                }))
            );

        const actionRow = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({
            content: 'Selecione uma memória do servidor para deletar:',
            components: [actionRow],
            flags: [MessageFlags.Ephemeral]
        });

        const filter = (i) => i.customId === 'select_memory_guild' && i.user.id === interaction.user.id;

        const selectCollector = interaction.channel.createMessageComponentCollector({
            filter,
            componentType: ComponentType.StringSelect,
            time: 60000
        });

        selectCollector.on('collect', async (selectInteraction) => {
            const memoryId = selectInteraction.values[0];
            const memory = memories.find(m => m.id == memoryId);

            const confirmButton = new ButtonBuilder()
                .setCustomId('confirm_delete_guild')
                .setLabel('Confirmar')
                .setStyle(ButtonStyle.Danger);

            const cancelButton = new ButtonBuilder()
                .setCustomId('cancel_delete_guild')
                .setLabel('Cancelar')
                .setStyle(ButtonStyle.Secondary);

            const buttonRow = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

            await selectInteraction.update({
                content: `Tem certeza que deseja deletar a memória "${memory.memory}" do servidor?`,
                components: [buttonRow]
            });

            const buttonFilter = (u) => u.user.id === interaction.user.id && (u.customId === 'confirm_delete_guild' || u.customId === 'cancel_delete_guild');

            const buttonCollector = selectInteraction.message.createMessageComponentCollector({
                filter: buttonFilter,
                componentType: ComponentType.Button,
                time: 30000
            });

            buttonCollector.on('collect', async (buttonInteraction) => {
                if (buttonInteraction.customId === 'confirm_delete_guild') {
                    deletarMemoriaGuild(memoryId);
                    await buttonInteraction.update({
                        content: 'Memória deletada com sucesso.',
                        components: []
                    });
                } else {
                    await buttonInteraction.update({
                        content: 'Deleção cancelada.',
                        components: []
                    });
                }
                selectCollector.stop();
                buttonCollector.stop();
            });

            buttonCollector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    await selectInteraction.editReply({
                        content: 'Tempo esgotado.',
                        components: []
                    });
                }
            });
        });

        selectCollector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                await interaction.editReply({
                    content: 'Tempo esgotado.',
                    components: []
                });
            }
        });
    }
}

/* --- Exports --- */
module.exports = {
    data,
    execute
};