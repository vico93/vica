/*
**  caminho: commands/rank.js
**  últimaMod: 02/05/2026 00:00
**  autor: Vico
**  colaboração: ChatGPT, Gemini, Kimi AI
*/

/*
  Comando /rank
  - Exibe TOP 10 de XP do servidor.
  - Membros nível 100+ vão para seção "🏁 ZERARAM 🏁" no topo.
  - TOP 4 dos ativos entram no "Pódio" com medalhas.
  - 5º ao 10º dos ativos ficam na seção "…também figuram…".
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

      // Separa em dois grupos
      const zeraram = ranking.filter(u => u.nivel >= 100);
      const ativos  = ranking.filter(u => u.nivel < 100);

      // Ícones para o pódio
      const medalhas = ['🥇', '🥈', '🥉', '🏅'];

      /* --------- Seção ZERARAM (nível 100+) --------- */
      let zeraramText = '';
      if (zeraram.length > 0) {
        const lines = zeraram.map(user =>
          `🎖️ <@${user.usuario_id}> ・ **∞ XP** ・ **Nível ⭐⭐**`
        );
        zeraramText = lines.join('\n');
      }

      /* --------- Pódio (TOP 4 ativos) --------- */
      let podiumText = '';
      if (ativos.length > 0) {
        const podiumLines = [];
        for (let i = 0; i < Math.min(4, ativos.length); i++) {
          const user = ativos[i];
          podiumLines.push(
            `${medalhas[i]} <@${user.usuario_id}> ・ **${user.xp} XP** ・ Nível **${user.nivel}**`
          );
        }
        podiumText = podiumLines.join('\n');
      }

      /* --------- "Também figuram" (5-10 ativos) --------- */
      let tambemText = '';
      if (ativos.length > 4) {
        const restLines = [];
        const icones = ['5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
        for (let i = 4; i < ativos.length; i++) {
          const user = ativos[i];
          restLines.push(
            `${icones[i - 4]} <@${user.usuario_id}> ・ **${user.xp} XP** ・ Nível **${user.nivel}**`
          );
        }
        tambemText = restLines.join('\n');
      }

      /* --------- Monta o embed --------- */
      const embed = new EmbedBuilder()
        .setColor(0x23650b); // verde escuro

      if (zeraramText) {
        // Se há zeradores, eles ficam no topo
        embed.setTitle('🏁 ZERARAM 🏁');
        embed.setDescription(zeraramText);

        if (podiumText) {
          embed.addFields({
            name: 'Pódio',
            value: podiumText
          });
        }
      } else {
        // Sem zeradores, mantém estrutura original
        embed.setTitle('Pódio');
        embed.setDescription(podiumText || 'Nenhum membro ativo no ranking.');
      }

      if (tambemText) {
        embed.addFields({
          name: '…também figuram…',
          value: tambemText
        });
      }

      embed.setAuthor({ name: `RANKING - ${interaction.guild.name}` });

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
