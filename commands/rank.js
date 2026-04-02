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

const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const database = require('../core/database');

function formatarNomeTopico(date = new Date()) {
  const dia = String(date.getDate()).padStart(2, '0');
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  return `Rank ${dia}/${mes}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Exibe o ranking de XP do servidor')
    .addMentionableOption(opt =>
      opt.setName('mencionar')
         .setDescription('Menciona um cargo ou @everyone junto com o ranking')
         .setRequired(false))
    .addBooleanOption(opt =>
      opt.setName('cria_topico')
         .setDescription('Cria um tópico na mensagem do ranking')
         .setRequired(false))
    .setDMPermission(false),

  async execute(interaction) {
    const mencionar = interaction.options.getMentionable('mencionar');
    const criaTopico = interaction.options.getBoolean('cria_topico') ?? false;

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
      const nivelDisplay = user.nivel >= 100 ? '**\\*\\***' : `**${user.nivel}**`;
      podiumLines.push(
          `${medalhas[i]} <@${user.usuario_id}> ・ **${user.xp} XP** ・ Nível ${nivelDisplay}`
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
        const nivelDisplay = user.nivel >= 100 ? '**\\*\\***' : `**${user.nivel}**`;
        restLines.push(
          `${icones[i - 4]} <@${user.usuario_id}> ・ **${user.xp} XP** ・ Nível ${nivelDisplay}`
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
      const reply = await interaction.editReply({
        content: mencionar ? `${mencionar}` : '',
        embeds: [embed],
        allowedMentions: mencionar ? { parse: ['everyone', 'roles', 'users'] } : {}
     });

      if (criaTopico) {
        const targetChannel = reply.channel;
        const canCreateThread =
          targetChannel &&
          typeof reply.startThread === 'function' &&
          (
            targetChannel.type === ChannelType.GuildText ||
            targetChannel.type === ChannelType.GuildAnnouncement
          );

        if (canCreateThread) {
          try {
            await reply.startThread({
              name: formatarNomeTopico(),
              autoArchiveDuration: 1440
            });
          } catch (threadError) {
            console.error('[VICA][RANK][WARN] Não foi possível criar tópico:', threadError);
          }
        } else {
          console.warn('[VICA][RANK][WARN] Canal não suporta criação de tópico para o ranking.');
        }
      }
    } catch (err) {
      console.error('[VICA][RANK] Erro ao executar comando:', err);
      interaction.editReply({
        content: 'Ocorreu um erro ao buscar as informações do ranking.',
        ephemeral: true
      });
    }
  }
};