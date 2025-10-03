/*
** caminho: commands/reaction_emoji.js
** últimaMod: 2025-10-03 19:08
** autor: Vico
** colaboração: Grok Code (Fast)
*/

/*
  Comando para gerenciamento de emojis de reação.
  Permite adicionar, listar e remover emojis de reação configurados para o servidor.
  Acesso restrito a administradores.
*/

const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField,
    MessageFlags
} = require('discord.js');
const database = require('../core/database');

/* --- CONSTANTES --- */
const EMOJI_REGEX = /^[0-9]+$/; // Para validar IDs numéricos

/* --- UTILITÁRIOS --- */

/**
 * Valida se um ID de emoji é válido e acessível no servidor
 */
function validateEmoji(emojiId, client, guild) {
    try {
        // Tentar resolver o emoji no servidor
        const emoji = guild.emojis.resolve(emojiId);
        if (emoji) return { valid: true, emoji };
        
        // Verificar se é um emoji padrão do Discord
        const unicodeEmoji = client.emojis.resolve(emojiId);
        if (unicodeEmoji) return { valid: true, emoji: unicodeEmoji };
        
        return { valid: false, reason: 'Emoji não encontrado no servidor ou inválido' };
    } catch (error) {
        console.error('[REACTION_EMOJI][ERROR] Erro ao validar emoji:', error.message);
        return { valid: false, reason: 'Erro interno ao validar emoji' };
    }
}

/**
 * Cria embed para mostrar emojis configurados
 */
function createShowEmbed(reactionEmojis, guild) {
    const embed = new EmbedBuilder()
        .setTitle('🎯 Emojis de Reação Configurados')
        .setColor('#FFD700')
        .setTimestamp();

    if (reactionEmojis.length === 0) {
        embed.setDescription('Nenhum emoji de reação configurado para este servidor.');
        embed.addFields({
            name: '📝 Como adicionar',
            value: 'Use `/reaction_emoji add <emoji_id>` para adicionar um emoji.\nO ID deve ser o identificador numérico do emoji.'
        });
    } else {
        embed.setDescription(`Total de emojis configurados: **${reactionEmojis.length}**`);

        // Mostrar até 10 emojis por vez
        const emojisList = reactionEmojis.slice(0, 10).map(re => {
            const emoji = guild.emojis.resolve(re.reaction_emoji_id);
            const emojiText = emoji ? `<:${emoji.name}:${emoji.id}>` : `:${re.reaction_emoji_id}:`;
            return `• ${emojiText} (ID: \`${re.reaction_emoji_id}\`)`;
        }).join('\n');

        embed.addFields({
            name: '🎯 Emojis',
            value: emojisList || 'Nenhum emoji encontrado'
        });

        if (reactionEmojis.length > 10) {
            embed.setFooter({ text: `Mostrando 10 de ${reactionEmojis.length} emojis` });
        }
    }

    return embed;
}

/**
 * Cria botões para deletar emojis (máximo 5 por linha)
 */
function createDeleteButtons(reactionEmojis, userId) {
    const buttons = reactionEmojis.slice(0, 20).map(re => { // Limitar a 20 para não exceder limite do Discord
        return new ButtonBuilder()
            .setCustomId(`delete_emoji_${re.reaction_emoji_id}_${userId}`)
            .setLabel(`Remover ${re.reaction_emoji_id}`)
            .setStyle(ButtonStyle.Danger);
    });

    // Dividir em linhas de até 5 botões
    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    }

    return rows;
}

/* --- DEFINIÇÃO DO COMANDO --- */
module.exports = {
    data: new SlashCommandBuilder()
        .setName('reaction_emoji')
        .setDescription('Gerencia emojis de reação para o servidor')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('show')
                .setDescription('Mostra todos os emojis de reação configurados'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Adiciona um novo emoji de reação')
                .addStringOption(option =>
                    option
                        .setName('emoji_id')
                        .setDescription('ID numérico do emoji a ser adicionado')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Remove emojis de reação configurados')),

    async execute(interaction) {
        const { client, guild, user } = interaction;
        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'show': {
                    const reactionEmojis = database.listReactionEmojis(guild.id);
                    const embed = createShowEmbed(reactionEmojis, guild);

                    await interaction.reply({
                        embeds: [embed],
                        flags: [MessageFlags.Ephemeral]
                    });
                    break;
                }

                case 'add': {
                    const emojiId = interaction.options.getString('emoji_id');

                    // Validar formato do ID
                    if (!EMOJI_REGEX.test(emojiId)) {
                        return await interaction.reply({
                            content: '❌ O ID do emoji deve conter apenas números.',
                            flags: [MessageFlags.Ephemeral]
                        });
                    }

                    // Validar se o emoji existe
                    const validation = validateEmoji(emojiId, client, guild);
                    if (!validation.valid) {
                        return await interaction.reply({
                            content: `❌ ${validation.reason}`,
                            flags: [MessageFlags.Ephemeral]
                        });
                    }

                    // Adicionar ao banco de dados
                    const changes = database.addReactionEmoji(guild.id, emojiId);

                    if (changes > 0) {
                        await interaction.reply({
                            content: `✅ Emoji ${validation.emoji} adicionado com sucesso!`,
                            flags: [MessageFlags.Ephemeral]
                        });
                    } else {
                        await interaction.reply({
                            content: '⚠️ Este emoji já está configurado para este servidor.',
                            flags: [MessageFlags.Ephemeral]
                        });
                    }
                    break;
                }

                case 'delete': {
                    const reactionEmojis = database.listReactionEmojis(guild.id);

                    if (reactionEmojis.length === 0) {
                        return await interaction.reply({
                            content: '❌ Nenhum emoji de reação configurado para remover.',
                            flags: [MessageFlags.Ephemeral]
                        });
                    }

                    const embed = createShowEmbed(reactionEmojis, guild);
                    embed.setTitle('🗑️ Remover Emojis de Reação');
                    embed.setDescription('Clique nos botões abaixo para remover os emojis desejados:');

                    const components = createDeleteButtons(reactionEmojis, user.id);

                    await interaction.reply({
                        embeds: [embed],
                        components,
                        flags: [MessageFlags.Ephemeral]
                    });
                    break;
                }
            }
        } catch (error) {
            console.error('[REACTION_EMOJI][ERROR] Erro ao executar comando:', error.message);

            if (!interaction.replied) {
                await interaction.reply({
                    content: '❌ Ocorreu um erro interno. Tente novamente mais tarde.',
                    flags: [MessageFlags.Ephemeral]
                });
            } else {
                await interaction.followUp({
                    content: '❌ Ocorreu um erro interno.',
                    flags: [MessageFlags.Ephemeral]
                });
            }
        }
    }
};