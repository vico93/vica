const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const oai = require('../core/oai_interface');
const config = require('../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('perguntar')
    .setDescription('Faz uma pergunta para alguém usando IA ou banco de perguntas')
    .addUserOption(option =>
      option.setName('alvo')
        .setDescription('Pessoa para quem é a pergunta')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('fonte')
        .setDescription('De onde vem a pergunta (ia ou banco)')
        .setRequired(true)
        .addChoices(
          { name: 'IA', value: 'ia' },
          { name: 'Banco de Perguntas', value: 'banco' }
        )),

  async execute(interaction) {
    const alvo = interaction.options.getUser('alvo');
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
        return interaction.editReply('Erro ao acessar o banco de perguntas.');
      }
    } else if (fonte === 'ia') {
      try {
        pergunta = await oai.gerarPerguntaViaAPI();
      } catch (err) {
        console.error('Erro ao gerar pergunta via IA:', err);
        return interaction.editReply('Erro ao gerar pergunta pela IA.');
      }
    } else {
      return interaction.editReply('Fonte inválida.');
    }

    const respostaFinal = `${alvo ? `<@${alvo.id}>` : ''} ${pergunta}`;
    await interaction.editReply(respostaFinal);
  }
};
