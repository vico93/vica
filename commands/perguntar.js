/*
**  caminho: commands/perguntar.js
**  últimaMod: 16/07/2025 22:25
**  autor: Vico
**  colaboração: ChatGPT, Gemini, Kimi AI
*/

/*
  Comando /perguntar:
  - Gera uma pergunta divertida via IA ou do banco local.
  - Permite mencionar alguém para direcionar a pergunta.
  - Agora respeita blacklist do chatbot (alternativa b).
*/

const { SlashCommandBuilder } = require('discord.js');
const oai         = require('../core/oai_interface');
const database    = require('../core/database');
const { perguntas } = require('../core/static_data'); // já em memória

module.exports = {
  data: new SlashCommandBuilder()
    .setName('perguntar')
    .setDescription('Faz uma pergunta para alguém usando IA ou banco de perguntas')
    .addStringOption(opt =>
      opt.setName('fonte')
         .setDescription('De onde vem a pergunta (ia ou banco)')
         .setRequired(true)
         .addChoices(
           { name: 'IA', value: 'ia' },
           { name: 'Banco de Perguntas', value: 'banco' }
         ))
    .addMentionableOption(opt =>
      opt.setName('mencionar')
         .setDescription('Mencione um usuário, cargo ou @everyone para direcionar a pergunta')
         .setRequired(false)),

  async execute(interaction) {
    const mencionar = interaction.options.getMentionable('mencionar');
    const fonte     = interaction.options.getString('fonte');
    const canalId   = interaction.channel.id;
    const guildId   = interaction.guild.id;

    // Respeita blacklist de chatbot (alternativa b)
    if (database.chatbotCanalNaBlacklist(guildId, canalId)) {
      return interaction.reply({
        content: '❌ Este canal está na blacklist do chatbot. Use o comando em outro canal.',
        ephemeral: true
      });
    }

    await interaction.deferReply();

    let pergunta;

    if (fonte === 'banco') {
      // array já carregado na memória
      pergunta = perguntas[Math.floor(Math.random() * perguntas.length)];
    } else if (fonte === 'ia') {
      try {
        pergunta = await oai.gerarPerguntaViaAPI();
      } catch (err) {
        console.error('[VICA][PERGUNTAR] Erro IA:', err);
        return interaction.editReply('Desculpa, tive um bug e não consegui pensar em nada... 😓');
      }
    } else {
      return interaction.editReply('Fonte inválida.');
    }

    const respostaFinal = `${mencionar ? `${mencionar} ` : ''}${pergunta}`;
    await interaction.editReply({
      content: respostaFinal,
      allowedMentions: mencionar ? { parse: ['everyone', 'roles', 'users'] } : {}
    });
  }
};