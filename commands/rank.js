/*
**  caminho: commands/rank.js
**  últimaMod: 16/07/2025 22:40
**  autor: Vico
**  colaboração: ChatGPT, Gemini, Kimi AI
*/

/*
  Comando /rank
  - Exibe TOP 10 de XP do servidor.
  - TOP 4 entram no “Pódio” com medalhas.
  - 5º ao 10º ficam na seção “…também figuram…”.
  - Nome do servidor vem no campo Author.
*/

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const database = require('../core/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Exibe o ranking de XP do servidor')
    .addMentionableOption(opt =>
      opt.setName('mencionar')
         .setDescription('Menciona um cargo ou @everyone junto com o ranking')
         .setRequired(false))
    .setDMPermission(false),

  async execute(interaction) {
    const mencionar = interaction.options.getMentionable('mencionar');

    await interaction.deferReply();

    try {
      // Busca até 10 registros
      const ranking = await database.buscarRank(interaction.guild.id, 10);

      if (ranking.length === 0) {
        return interaction.editReply({
          content: 'Ainda não há ninguém no ranking de XP deste servidor.'
        });
      }

      // Ícones para o pódio
      const medalhas = ['🥇', '🥈', '🥉', '🏅'];

      /* --------- Pódio (TOP 4) --------- */
      const podiumLines = [];
      for (let i = 0; i < Math.min(4, ranking.length); i++) {
        const user = ranking[i];
        const membro = await interaction.guild.members
          .fetch(user.usuario_id)
          .catch(() => null);
        const nome = membro?.displayName || 'Usuário Desconhecido';
        podiumLines.push(
          `${medalhas[i]} **${nome}** ・ **${user.xp} XP** ・ Nível **${user.nivel}**`
        );
      }
      const podiumText = podiumLines.join('\n');

      /* --------- “Também figuram” (5-10) --------- */
      let tambemText = '';
      if (ranking.length > 4) {
        const restLines = [];
        const icones = ['5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
        for (let i = 4; i < ranking.length; i++) {
          const user = ranking[i];
          const membro = await interaction.guild.members
            .fetch(user.usuario_id)
            .catch(() => null);
          const nome = membro?.displayName || 'Usuário Desconhecido';
          restLines.push(
            `${icones[i - 4]} **${nome}** ・ **${user.xp} XP** ・ Nível **${user.nivel}**`
          );
        }
        tambemText = restLines.join('\n');
      }

      /* --------- Monta o embed --------- */
      const embed = new EmbedBuilder()
        .setTitle('Pódio')
        .setDescription(podiumText)
        .setColor(0x23650b) // verde escuro
        .setAuthor({ name: `RANKING - ${interaction.guild.name}` });

      if (tambemText) {
        embed.addFields({
          name: '…também figuram…',
          value: tambemText
        });
      }
      await interaction.editReply({
        content: mencionar ? `${mencionar}` : '',
        embeds: [embed],
        allowedMentions: mencionar ? { parse: ['everyone', 'roles', 'users'] } : {}
     });
    } catch (err) {
      console.error('[VICA][RANK] Erro ao executar comando:', err);
      interaction.editReply({
        content: 'Ocorreu um erro ao buscar as informações do ranking.',
        ephemeral: true
      });
    }
  }
};