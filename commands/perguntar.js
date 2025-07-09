// Arquivo: commands/perguntar.js

const { SlashCommandBuilder } = require('discord.js');
const oai = require('../core/oai_interface');
// --- CORREÇÃO AQUI: Adicionando os módulos 'fs' e 'path' ---
const fs = require('fs');
const path = require('path');
// ---------------------------------------------------------

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
    const fonte = interaction.options.getString('fonte');

    await interaction.deferReply();

    let pergunta;

    if (fonte === 'banco') {
      try {
        const filePath = path.join(__dirname, '..', 'data', 'perguntas.txt');
        // Usamos readFileSync aqui pois é uma operação simples e rápida no contexto de um comando.
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

    const respostaFinal = `${mencionar ? `${mencionar} ` : ''}${pergunta}`;
    await interaction.editReply(({
      content: respostaFinal,
      allowedMentions: mencao ? { parse: ['everyone', 'roles', 'users'] } : {}, // Habilita menções
    }));
  }
};