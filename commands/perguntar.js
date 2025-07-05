// Arquivo: commands/perguntar.js

const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs').promises; // <-- MUDANÇA: Usando a versão de Promises do FS
const path = require('path');
const oai = require('../core/oai_interface');
// config.json não é usado aqui, podemos remover se quiser
// const config = require('../config.json');

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
    .addUserOption(option =>
      option.setName('alvo')
        .setDescription('Pessoa para quem é a pergunta')
        .setRequired(false)),

  async execute(interaction) {
    // --- LOGS DE DEPURAÇÃO ---
    console.log(`[DEBUG] Comando /perguntar recebido. Fonte: ${interaction.options.getString('fonte')}`);
    // ---

    const alvo = interaction.options.getUser('alvo');
    const fonte = interaction.options.getString('fonte');

    await interaction.deferReply();
    console.log('[DEBUG] Interação deferida com sucesso.'); // Log para confirmar o defer

    let pergunta;

    if (fonte === 'banco') {
      try {
        // --- LÓGICA ATUALIZADA E COM LOGS ---
        const filePath = path.join(__dirname, '..', 'data', 'perguntas.txt');
        console.log(`[DEBUG] Tentando ler o arquivo em: ${filePath}`);

        const data = await fs.readFile(filePath, 'utf-8');
        console.log('[DEBUG] Arquivo lido com sucesso.');

        const perguntas = data.split('\n').filter(Boolean); // Filtra linhas vazias
        console.log(`[DEBUG] Encontradas ${perguntas.length} perguntas.`);

        if (perguntas.length === 0) {
          console.error('[ERRO] O arquivo perguntas.txt está vazio ou não contém perguntas válidas.');
          return interaction.editReply('O banco de perguntas está vazio! Não consegui encontrar nada para perguntar.');
        }

        pergunta = perguntas[Math.floor(Math.random() * perguntas.length)];
        console.log(`[DEBUG] Pergunta selecionada: "${pergunta}"`);
        // --- FIM DA LÓGICA ATUALIZADA ---

      } catch (err) {
        console.error('[ERRO] Falha ao processar o banco de perguntas:', err);
        return interaction.editReply('Ocorreu um erro ao tentar acessar o banco de perguntas. Verifique se o arquivo `data/perguntas.txt` existe.');
      }
    } else if (fonte === 'ia') {
      try {
        console.log(`[DEBUG] Chamando a API para gerar uma pergunta...`);
        pergunta = await oai.gerarPerguntaViaAPI();
      } catch (err) {
        console.error('Erro ao gerar pergunta via IA:', err);
        return interaction.editReply('Erro ao gerar pergunta pela IA.');
      }
    } else {
      return interaction.editReply('Fonte inválida.');
    }

    const respostaFinal = `${alvo ? `<@${alvo.id}>` : ''} ${pergunta}`;
    console.log(`[DEBUG] Preparando para enviar resposta final: "${respostaFinal}"`);
    await interaction.editReply(respostaFinal);
    console.log('[DEBUG] Resposta final enviada com sucesso.');
  }
};