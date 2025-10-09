/*
** caminho: commands/system_channel.js
** últimaMod: 2025-10-09 17:25
** autor: Vico
** colaboração: xai/grok-code-fast-1
*/

/*
 * Comando para gerenciar o canal de sistema do servidor
 * Permite mostrar, definir e remover o canal onde mensagens automáticas são enviadas
 */

const {
    SlashCommandBuilder,
    PermissionsBitField,
    MessageFlags,
    ChannelType
} = require('discord.js');
const database = require('../core/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('system_channel')
        .setDescription('Gerenciar o canal de sistema para mensagens automáticas')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .setDMPermission(false)
        .addSubcommand(subcommand =>
            subcommand
                .setName('show')
                .setDescription('Mostrar o canal de sistema atualmente configurado')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Definir um canal como canal de sistema')
                .addChannelOption(option =>
                    option
                        .setName('canal')
                        .setDescription('Canal de texto para definir como sistema')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Remover a configuração do canal de sistema')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'show':
                await handleShow(interaction);
                break;
            case 'add':
                await handleAdd(interaction);
                break;
            case 'delete':
                await handleDelete(interaction);
                break;
        }
    }
};

/* --- Funções auxiliares --- */

/**
 * Manipula exibição do canal de sistema atual
 */
async function handleShow(interaction) {
    const systemChannelId = database.getSystemChannel(interaction.guild.id);

    if (systemChannelId) {
        const channel = interaction.guild.channels.cache.get(systemChannelId);
        if (channel) {
            await interaction.reply({
                content: `📢 Canal de sistema atual: <#${systemChannelId}>`,
                flags: [MessageFlags.Ephemeral]
            });
        } else {
            await interaction.reply({
                content: '⚠️ O canal de sistema configurado não existe mais. Considere removê-lo e definir um novo.',
                flags: [MessageFlags.Ephemeral]
            });
        }
    } else {
        await interaction.reply({
            content: 'ℹ️ Sem canal de sistema configurado!',
            flags: [MessageFlags.Ephemeral]
        });
    }
}

/**
 * Manipula definição de um novo canal de sistema
 */
async function handleAdd(interaction) {
    const channel = interaction.options.getChannel('canal');

    // Validar se é um canal de texto
    if (channel.type !== ChannelType.GuildText) {
        return interaction.reply({
            content: '❌ Apenas canais de texto podem ser definidos como canal de sistema.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    // Verificar se o canal já está configurado como sistema
    const currentSystemChannel = database.getSystemChannel(interaction.guild.id);
    if (currentSystemChannel === channel.id) {
        return interaction.reply({
            content: `⚠️ O canal ${channel} já está configurado como canal de sistema.`,
            flags: [MessageFlags.Ephemeral]
        });
    }

    // Definir o canal de sistema
    const changes = database.setSystemChannel(interaction.guild.id, channel.id);

    if (changes > 0) {
        await interaction.reply({
            content: `✅ Canal de sistema definido com sucesso: ${channel}`,
            flags: [MessageFlags.Ephemeral]
        });
    } else {
        await interaction.reply({
            content: '❌ Erro ao definir o canal de sistema.',
            flags: [MessageFlags.Ephemeral]
        });
    }
}

/**
 * Manipula remoção do canal de sistema
 */
async function handleDelete(interaction) {
    const currentSystemChannel = database.getSystemChannel(interaction.guild.id);

    if (!currentSystemChannel) {
        return interaction.reply({
            content: 'ℹ️ Nenhum canal de sistema está configurado.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    // Remover o canal de sistema (definir como null)
    const changes = database.setSystemChannel(interaction.guild.id, null);

    if (changes > 0) {
        await interaction.reply({
            content: '✅ Canal de sistema removido com sucesso! As mensagens voltarão aos canais originais.',
            flags: [MessageFlags.Ephemeral]
        });
    } else {
        await interaction.reply({
            content: '❌ Erro ao remover o canal de sistema.',
            flags: [MessageFlags.Ephemeral]
        });
    }
}