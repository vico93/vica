export const rankCommand = {
  name: 'rank',
  aliases: ['top', 'ranking', 'leaderboard'],
  description: 'Exibe o ranking de XP do servidor',
  async execute(ctx, args) {
    const communityId = ctx.communityId || 'global';
    let rows = [];

    if (ctx.db) {
      try {
        rows = ctx.db.prepare(`
          SELECT u.name, u.username, x.user_id, x.xp_total, x.xp_text, x.xp_voice
          FROM xp x
          LEFT JOIN users u ON u.id = x.user_id AND u.community_id = x.community_id
          WHERE x.community_id = ?
          ORDER BY x.xp_total DESC
          LIMIT 10
        `).all(String(communityId));
      } catch (_) {}
    }

    if (!rows || rows.length === 0) {
      await ctx.reply('🏆 **Ranking de XP:**\nNinguém acumulou XP ainda neste servidor!');
      return;
    }

    const lines = rows.map((r, index) => {
      const position = index + 1;
      const medal = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : `\`#${position}\``;
      const name = r.name || r.username || `User ${r.user_id}`;
      const level = Math.floor((r.xp_total || 0) / 1000);
      return `${medal} **${name}** — Nível \`${level}\` (\`${r.xp_total || 0} XP\`)`;
    });

    await ctx.reply(`🏆 **Top 10 — Ranking de XP:**\n\n${lines.join('\n')}`);
  }
};
