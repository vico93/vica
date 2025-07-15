// commands/perguntar.js  (performance-refactored)

const { SlashCommandBuilder } = require('discord.js');
const oai         = require('../core/oai_interface');
const { perguntas } = require('../core/static_data');   // pre-loaded list

module.exports = {
  data: new SlashCommandBuilder()
    .setName('perguntar')
    .setDescription('Faz uma pergunta para alguém usando IA ou banco de perguntas')
    .addStringOption(option =>
      option.setName('fonte')
        .setDescription('De onde vem a pergunta (ia ou banco)')
        .setRequired(true)
        .addChoices(
          { name: 'IA', value: 'ia' },
          { name: 'Banco de Perguntas', value: 'banco' }
        ))
    .addMentionableOption(option =>
      option.setName('mencionar')
        .setDescription('Mencione um usuário, cargo ou @everyone para direcionar a pergunta.')
        .setRequired(false)),

  async execute(interaction) {
    const mencionar = interaction.options.getMentionable('mencionar');
    const fonte     = interaction.options.getString('fonte');

    await interaction.deferReply();

    let pergunta;

    if (fonte === 'banco') {
      // perguntas já está em memória – nenhum I/O síncrono aqui
      pergunta = perguntas[Math.floor(Math.random() * perguntas.length)];
    } else if (fonte === 'ia') {
      try {
        pergunta = await oai.gerarPerguntaViaAPI();
      } catch (err) {
        console.error('Erro ao gerar pergunta via IA:', err);
        return interaction.editReply('Desculpa, tive um bug aqui e não consegui pensar em nada... 😓');
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