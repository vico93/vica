// Arquivo: commands/perguntar.js

const { SlashCommandBuilder } = require('discord.js');
const oai = require('../core/oai_interface');

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
    // --- MUDANÇA AQUI: de addUserOption para addMentionableOption ---
    .addMentionableOption(option =>
      option.setName('mencionar') // Nome do argumento alterado de "alvo" para "mencionar"
        .setDescription('Mencione um usuário, cargo ou @everyone para direcionar a pergunta.')
        .setRequired(false)),

  async execute(interaction) {
    // --- MUDANÇA AQUI: de getUser('alvo') para getMentionable('mencionar') ---
    const mencionar = interaction.options.getMentionable('mencionar');
    const fonte = interaction.options.getString('fonte');

    await interaction.deferReply();

    let pergunta;

    if (fonte === 'banco') {
      try {
        const filePath = path.join(__dirname, '..', 'data', 'perguntas.txt');
        const perguntas = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
        pergunta = perguntas[Math.floor(Math.random() * perguntas.length)];
      } catch (err) {
        console.error('Erro ao ler perguntas.txt:', err);
        return interaction.editReply('Desculpa, tive um bug aqui e não consegui pensar em nada... 😓');
      }
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

    // --- MUDANÇA AQUI: A forma de montar a resposta final ---
    // O objeto "mentionable" já é convertido para a menção correta automaticamente
    const respostaFinal = `${mencionar ? `${mencionar} ` : ''}${pergunta}`;
    await interaction.editReply(respostaFinal);
  }
};