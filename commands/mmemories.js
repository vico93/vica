/*
** caminho: commands/mmemories.js
** últimaMod: 2024-09-06 17:49
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
const { listarMemoriasUsuario, adicionarMemoriaUsuario, removerMemoriaUsuario } = require('../core/database');

/* --- Command Data --- */
const data = new SlashCommandBuilder()
    .setName('mmemories')
    .setDescription('Gerenciar memórias de membros')
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
    );

/* --- Execute Function --- */
async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const member = interaction.options.getUser('member');
    const guildId = interaction.guild.id;

    if (subcommand === 'list') {
        /* --- List Subcommand --- */
        const memories = listarMemoriasUsuario(guildId, member.id);

        const embed = new EmbedBuilder()
            .setTitle(`Memórias de ${member.displayName}`)
            .setColor(0x0099FF)
            .setDescription(memories.length > 0
                ? memories.map((m, i) => `${i + 1}. ${m.memory}`).join('\n')
                : 'Nenhuma memória encontrada.'
            );

        await interaction.reply({ embeds: [embed] });

    } else if (subcommand === 'add') {
        /* --- Add Subcommand --- */
        const memory = interaction.options.getString('memory');

        adicionarMemoriaUsuario(guildId, member.id, memory);

        await interaction.reply({
            content: `Memória adicionada com sucesso a ${member.displayName}.`,
            flags: [MessageFlags.Ephemeral]
        });

    } else if (subcommand === 'delete') {
        /* --- Delete Subcommand --- */
        const memories = listarMemoriasUsuario(guildId, member.id);

        if (memories.length === 0) {
            return await interaction.reply({
                content: `Nenhuma memória encontrada para ${member.displayName}.`,
                flags: [MessageFlags.Ephemeral]
            });
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_memory')
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
            content: `Selecione uma memória de ${member.displayName} para deletar:`,
            components: [actionRow],
            flags: [MessageFlags.Ephemeral]
        });

        const filter = (i) => i.customId === 'select_memory' && i.user.id === interaction.user.id;

        const selectCollector = interaction.channel.createMessageComponentCollector({
            filter,
            componentType: ComponentType.StringSelect,
            time: 60000
        });

        selectCollector.on('collect', async (selectInteraction) => {
            const memoryId = selectInteraction.values[0];
            const memory = memories.find(m => m.id == memoryId);

            const confirmButton = new ButtonBuilder()
                .setCustomId('confirm_delete')
                .setLabel('Confirmar')
                .setStyle(ButtonStyle.Danger);

            const cancelButton = new ButtonBuilder()
                .setCustomId('cancel_delete')
                .setLabel('Cancelar')
                .setStyle(ButtonStyle.Secondary);

            const buttonRow = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

            await selectInteraction.update({
                content: `Tem certeza que deseja deletar a memória "${memory.memory}" de ${member.displayName}?`,
                components: [buttonRow]
            });

            const buttonFilter = (u) => u.user.id === interaction.user.id && (u.customId === 'confirm_delete' || u.customId === 'cancel_delete');

            const buttonCollector = selectInteraction.message.createMessageComponentCollector({
                filter: buttonFilter,
                componentType: ComponentType.Button,
                time: 30000
            });

            buttonCollector.on('collect', async (buttonInteraction) => {
                if (buttonInteraction.customId === 'confirm_delete') {
                    const memoryIndex = memories.findIndex(m => m.id == memoryId);
                    removerMemoriaUsuario(guildId, member.id, memoryIndex);
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