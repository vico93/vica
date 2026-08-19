export const perfilCommand = {
  name: 'perfil',
  aliases: ['level', 'xp', 'profile'],
  description: 'Exibe o perfil de XP e nível do usuário',
  async execute(ctx, args) {
    const targetUser = ctx.author || { id: '0', name: 'Usuário', username: 'usuario' };
    const communityId = ctx.communityId || 'global';

    let userXp = null;
    if (ctx.db) {
      try {
        userXp = ctx.db.prepare('SELECT * FROM xp WHERE user_id = ? AND community_id = ?').get(String(targetUser.id), String(communityId));
      } catch (_) {}
    }

    const totalXp = userXp?.xp_total ?? 0;
    const textXp = userXp?.xp_text ?? 0;
    const voiceXp = userXp?.xp_voice ?? 0;
    const level = Math.floor(totalXp / 1000);
    const xpCurrentLevel = totalXp % 1000;
    const xpNeeded = 1000 - xpCurrentLevel;

    const msg = [
      `📊 **Perfil de ${targetUser.name || targetUser.username}**`,
      `⭐ **Nível:** \`${level}\``,
      `✨ **XP Total:** \`${totalXp}\` (\`${xpCurrentLevel}/1000 XP\` para o próximo nível)`,
      `💬 **XP Texto:** \`${textXp}\` | 🎙️ **XP Voz:** \`${voiceXp}\``
    ].join('\n');

    await ctx.reply(msg);
  }
};
