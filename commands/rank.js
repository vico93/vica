// Arquivo: commands/rank.js (Versão com o argumento "mencionar")

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const database = require('../core/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rank')
        .setDescription('Exibe o ranking de XP do servidor.')
        .addMentionableOption(option => // <-- O argumento está de volta
            option.setName('mencionar')
                .setDescription('Menciona um cargo ou @everyone junto com o ranking.')
                .setRequired(false))
        .setDMPermission(false),

    async execute(interaction) {
        const paraMencionar = interaction.options.getMentionable('mencionar');

        await interaction.deferReply();

        try {
            const ranking = await database.buscarRank(interaction.guild.id, 10);

            if (ranking.length === 0) {
                return interaction.editReply({ content: 'Ainda não há ninguém no ranking de XP deste servidor.' });
            }

            // Mapeia as posições do ranking, buscando os nomes dos usuários
            const rankString = await Promise.all(ranking.map(async (user, index) => {
                try {
                    const membro = await interaction.guild.members.fetch(user.usuario_id);
                    return `**${index + 1}.** ${membro.displayName} - Nível ${user.nivel} (${user.xp} XP)`;
                } catch {
                    return `**${index + 1}.** *Usuário Desconhecido* - Nível ${user.nivel} (${user.xp} XP)`;
                }
            }));

            const embedRanking = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle(`🏆 Ranking de XP - Top 10 de ${interaction.guild.name}`)
                .setDescription(rankString.join('\n'))
                .setTimestamp();

            // Prepara o conteúdo da mensagem (a menção) para ser enviado junto com o embed
            let conteudoMensagem = '';
            if (paraMencionar) {
                conteudoMensagem = `${paraMencionar}`;
            }

            return interaction.editReply({
                content: conteudoMensagem,
                embeds: [embedRanking]
            });

        } catch (error) {
            console.error('[RANK] Erro ao executar o comando:', error);
            return interaction.editReply({ content: 'Ocorreu um erro ao buscar as informações do ranking.', ephemeral: true });
        }
    },
};