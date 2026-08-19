export const pingCommand = {
  name: 'ping',
  aliases: ['p', 'latencia', 'latency'],
  description: 'Verifica a latência do bot com o Osmium',
  async execute(ctx) {
    const start = Date.now();
    await ctx.reply('🏓 Pong!');
    const latency = Date.now() - start;
    if (typeof ctx.editLastReply === 'function') {
      await ctx.editLastReply(`🏓 Pong! (\`${latency}ms\`)`);
    }
  }
};
