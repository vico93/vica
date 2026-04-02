/*
** caminho: commands/rank_profile.js
** últimaMod: 2026-04-02 09:55
** autor: Vico
** colaboração: Factory Droid
*/

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const database = require('../core/database');

function formatarData(data) {
    if (!data) {
        return 'Data de entrada indisponível';
    }

    const unixTimestamp = Math.floor(data.getTime() / 1000);
    return `<t:${unixTimestamp}:D>`;
}

function montarListaCargos(member) {
    const roles = member.roles.cache
        .filter(role => role.id !== member.guild.id)
        .sort((a, b) => b.position - a.position)
        .map(role => `<@&${role.id}>`);

    return roles.length > 0 ? roles.join(', ') : 'Nenhum cargo';
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rank_profile')
        .setDescription('Exibe os detalhes de um membro no ranking')
        .addUserOption(option =>
            option
                .setName('member')
                .setDescription('Membro para exibir no perfil de ranking')
                .setRequired(false)
        )
        .setDMPermission(false),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const targetUser = interaction.options.getUser('member') || interaction.user;
            const member = await interaction.guild.members.fetch(targetUser.id);
            const rankData = database.buscarUsuarioXP(interaction.guild.id, member.id) || { nivel: 0, xp: 0 };
            const displayName = member.displayName || member.user.globalName || member.user.username;

            const embed = new EmbedBuilder()
                .setAuthor({ name: 'Perfil no ranking' })
                .setTitle(displayName)
                .setURL(`https://discord.com/users/${member.id}`)
                .setThumbnail(member.displayAvatarURL({ size: 512 }))
                .setDescription(`No grupo desde: **${formatarData(member.joinedAt)}**`)
                .addFields(
                    {
                        name: 'Nível',
                        value: String(rankData.nivel ?? 0),
                        inline: true
                    },
                    {
                        name: 'XP',
                        value: String(rankData.xp ?? 0),
                        inline: true
                    },
                    {
                        name: 'Cargos',
                        value: montarListaCargos(member),
                        inline: false
                    }
                )
                .setColor(0x23650b);

            await interaction.editReply({
                content: '',
                embeds: [embed]
            });
        } catch (error) {
            console.error('[RANK_PROFILE][ERROR] Erro ao exibir perfil:', error);
            await interaction.editReply({
                content: 'Ocorreu um erro ao buscar o perfil do ranking.'
            });
        }
    }
};
