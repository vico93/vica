export const adminCommand = {
  name: 'admin',
  aliases: ['config', 'set'],
  description: 'Gerencia configurações da comunidade (prefixo, emoji de reação da IA)',
  async execute(ctx, args) {
    // Verificação simples de permissão de admin (proprietário ou flag is_admin)
    if (!ctx.isAdmin) {
      await ctx.reply('⛔ Apenas administradores podem executar este comando.');
      return;
    }

    const sub = (args[0] || '').toLowerCase();
    const value = args[1];
    const communityId = String(ctx.communityId || 'global');

    if (sub === 'prefix' || sub === 'prefixo') {
      if (!value) {
        await ctx.reply('⚠️ Uso correto: `!admin prefix <novo_prefixo>`');
        return;
      }
      if (ctx.db) {
        ctx.db.prepare(`
          INSERT INTO settings (community_id, key, value, updated_at)
          VALUES (?, 'prefix', ?, CURRENT_TIMESTAMP)
          ON CONFLICT(community_id, key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        `).run(communityId, value);
      }
      if (ctx.registry) {
        ctx.registry.setPrefix(value);
      }
      await ctx.reply(`✅ Prefixo atualizado para: \`${value}\``);
      return;
    }

    if (sub === 'emoji' || sub === 'reaction_emoji') {
      const loweredValue = (value || '').toLowerCase();
      if (loweredValue === 'detect' || loweredValue === 'debug') {
        if (!ctx.aiTriggers?.armEmojiCapture) {
          await ctx.reply('⚠️ Captura de emoji não disponível no momento.');
          return;
        }
        ctx.aiTriggers.armEmojiCapture(communityId);
        await ctx.reply('🔍 Reaja com o emoji desejado em qualquer mensagem — vou mostrar o valor exato para configurar.');
        return;
      }

      const emojiVal = value || '';
      if (ctx.db) {
        ctx.db.prepare(`
          INSERT INTO settings (community_id, key, value, updated_at)
          VALUES (?, 'reaction_emoji', ?, CURRENT_TIMESTAMP)
          ON CONFLICT(community_id, key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        `).run(communityId, emojiVal);
      }
      if (emojiVal) {
        await ctx.reply(`✅ Emoji de reação da IA configurado para: \`${emojiVal}\``);
      } else {
        await ctx.reply(`✅ Trigger por reação da IA foi **desativado**.`);
      }
      return;
    }

    await ctx.reply([
      '⚙️ **Painel de Administração:**',
      '• `!admin prefix <novo_prefixo>` — Altera o prefixo de comandos',
      '• `!admin emoji <emoji>` — Define o emoji de reação para acionar a IA (emoji Unicode; vazio = desativar)',
      '• `!admin emoji detect` — Descobre o valor exato de um emoji (reaja com ele)'
    ].join('\n'));
  }
};
