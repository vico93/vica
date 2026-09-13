/*
** caminho: commands/chat_blacklist.js
** últimaMod: 2025-10-09 17:20
** autor: Vico
** colaboração: xai/grok-code-fast-1
*/

/*
 * Comando para gerenciar a blacklist de canais do chatbot
 * Permite adicionar, remover e listar canais onde o bot não deve responder
 */

const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    PermissionsBitField,
    MessageFlags,
    ComponentType,
    ChannelType
} = require('discord.js');
const database = require('../core/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('chat_blacklist')
        .setDescription('Gerenciar canais na blacklist do chatbot')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .setDMPermission(false)
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Listar todos os canais na blacklist do chatbot')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Adicionar um canal à blacklist do chatbot')
                .addChannelOption(option =>
                    option
                        .setName('canal')
                        .setDescription('Canal de texto para adicionar à blacklist')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Remover um canal da blacklist do chatbot')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'list':
                await handleList(interaction);
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
 * Manipula listagem de canais na blacklist
 */
async function handleList(interaction) {
    const channels = database.chatbotListarCanais(interaction.guild.id);

    if (channels.length === 0) {
        return interaction.reply({
            content: 'ℹ️ Nenhum canal encontrado na blacklist do chatbot.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    const embed = new EmbedBuilder()
        .setTitle('🚫 Canais na Blacklist do Chatbot')
        .setDescription(channels.map(c => `- <#${c.canal_id}>`).join('\n'))
        .setColor('#FF6B6B')
        .setTimestamp();

    await interaction.reply({
        embeds: [embed],
        flags: [MessageFlags.Ephemeral]
    });
}

/**
 * Manipula adição de canal à blacklist
 */
async function handleAdd(interaction) {
    const channel = interaction.options.getChannel('canal');

    // Validar se é um canal de texto
    if (channel.type !== ChannelType.GuildText) {
        return interaction.reply({
            content: '❌ Apenas canais de texto podem ser adicionados à blacklist.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    // Verificar se o canal já está na blacklist
    const exists = database.chatbotCanalNaBlacklist(interaction.guild.id, channel.id);
    if (exists) {
        return interaction.reply({
            content: `⚠️ O canal ${channel} já está na blacklist do chatbot.`,
            flags: [MessageFlags.Ephemeral]
        });
    }

    // Adicionar à blacklist
    const changes = database.chatbotAdicionarCanal(interaction.guild.id, channel.id);

    if (changes > 0) {
        await interaction.reply({
            content: `✅ O canal ${channel} foi adicionado à blacklist do chatbot.`,
            flags: [MessageFlags.Ephemeral]
        });
    } else {
        await interaction.reply({
            content: '❌ Erro ao adicionar o canal à blacklist.',
            flags: [MessageFlags.Ephemeral]
        });
    }
}

/**
 * Manipula remoção de canal da blacklist
 */
async function handleDelete(interaction) {
    const channels = database.chatbotListarCanais(interaction.guild.id);

    if (channels.length === 0) {
        return interaction.reply({
            content: 'ℹ️ Nenhum canal encontrado na blacklist do chatbot.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    const options = channels.map(c => {
        const channel = interaction.guild.channels.cache.get(c.canal_id);
        return {
            label: channel ? channel.name : `ID: ${c.canal_id}`,
            value: c.canal_id,
            description: channel ? `ID: ${c.canal_id}` : 'Canal não encontrado'
        };
    });

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`delete_channel_select_${interaction.user.id}`)
        .setPlaceholder('Selecione um canal para remover')
        .addOptions(options.slice(0, 25));

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const reply = await interaction.reply({
        content: 'Selecione o canal para remover da blacklist do chatbot:',
        components: [row],
        flags: [MessageFlags.Ephemeral]
    });

    const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 60000
    });

    collector.on('collect', i => {
        if (i.user.id !== interaction.user.id) {
            return i.reply({ content: '⛔ Apenas quem executou o comando pode interagir aqui.', ephemeral: true });
        }

        const channelId = i.values[0];
        const changes = database.chatbotRemoverCanal(interaction.guild.id, channelId);

        const channel = interaction.guild.channels.cache.get(channelId);

        if (changes > 0) {
            i.update({
                content: `✅ O canal ${channel || `ID: ${channelId}`} foi removido da blacklist do chatbot.`,
                components: []
            });
        } else {
            i.update({
                content: `⚠️ O canal ${channel || `ID: ${channelId}`} não estava na blacklist do chatbot.`,
                components: []
            });
        }
    });

    collector.on('end', collected => {
        if (collected.size === 0) {
            interaction.editReply({ content: '⏰ O tempo para selecionar um canal expirou.', components: [] });
        }
    });
}