import { engagementService } from '../features/engagement/perguntar.js';

export const perguntarCommand = {
  name: 'perguntar',
  aliases: ['pergunta', 'question', 'ask'],
  description: 'Gera uma pergunta de engajamento no canal',
  async execute(ctx, args) {
    const question = engagementService.getRandomQuestion();
    await ctx.reply(`💬 **Pergunta do momento:**\n${question}`);
  }
};
