/*
** caminho: commands/translate.js
** últimaMod: 2026-02-03
** autor: Vico
** colaboração: Gemini
*/

/*
 * Comando /translate para traduzir conversas recentes
 * Baseado no comando /comment, mas focado em tradução
 * Usa o sistema de tradução definido em oai_interface.js
 */

const {
  SlashCommandBuilder,
  MessageFlags
} = require('discord.js');
const database = require('../core/database');
const oaiInterface = require('../core/oai_interface');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('translate')
    .setDescription('Traduz um bloco de mensagens recentes do canal')
    .addIntegerOption(option =>
      option.setName('count')
        .setDescription('Quantidade de mensagens a traduzir (1 a 20)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(20)),

  async execute(interaction) {
    console.log('[TRANSLATE][START] Comando iniciado');

    // Acknowledge the interaction immediately
    await interaction.deferReply();
    
    const count = interaction.options.getInteger('count');
    const channel = interaction.channel;
    const guild = interaction.guild;

    console.log(`[TRANSLATE][PARAMS] count=${count}, channel=${channel?.id}, guild=${guild?.id}`);

    try {
      /* --- BUSCAR HISTÓRICO DE MENSAGENS --- */
      // limit = count, offset = 0 (pegar as últimas X mensagens)
      const messageHistory = database.buscarHistoricoCanalRange(guild.id, channel.id, count, 0);

      if (messageHistory.length === 0) {
        return interaction.editReply({
          content: '❌ Não há mensagens suficientes no histórico deste canal.'
        });
      }

      /* --- BUSCAR CONTEÚDO DAS MENSAGENS --- */
      const messages = [];
      
      // Ordenar do mais antigo para o mais recente para a tradução fazer sentido
      // buscarHistoricoCanalRange retorna do mais recente para o mais antigo (reverse() no DB layer)
      // Mas para o contexto de tradução, queremos ler de cima para baixo.
      // A função do DB já faz .reverse() no retorno, então index 0 é a mais antiga retornada pelo range?
      // Vamos verificar database.js: 
      // stmts.channelMsgHistoryRange.all(...) -> timestamp DESC
      // .reverse() -> timestamp ASC (mais antiga primeiro)
      // Então messageHistory[0] é a mais antiga do bloco. 
      
      for (const record of messageHistory) {
        try {
          const message = await channel.messages.fetch(record.message_id);
          // Incluir mensagens de bots se não for o próprio comando ou mensagens de sistema
          // Mas geralmente queremos traduzir o que usuários falaram.
          // Vamos incluir tudo que tiver conteúdo de texto.
          
          if (message.content) {
            const nickname = message.member?.displayName || message.author.displayName || message.author.username;
            messages.push({
              nickname,
              content: message.content
            });
          }
        } catch (error) {
          // Mensagem deletada ou inacessível
        }
      }

      if (messages.length === 0) {
        return interaction.editReply({
          content: '❌ Nenhuma mensagem válida com texto encontrada para traduzir.'
        });
      }

      /* --- FORMATAR CONVERSA PARA TRADUÇÃO --- */
      let textToTranslate = '';
      
      for (const msg of messages) {
        textToTranslate += `<${msg.nickname}>: ${msg.content}\n`;
      }

      /* --- VERIFICAR LIMITE DE CARACTERES --- */
      const maxChars = 2000; // Limite seguro para output do Discord (embora possamos dividir)
      // O input pode ser maior que o output se for reduzido, mas tradução costuma manter tamanho.
      
      if (textToTranslate.length > 4000) { // Limite arbitrário para input da API
         return interaction.editReply({
          content: `❌ O bloco de mensagens é muito longo (${textToTranslate.length} caracteres). Tente um número menor de mensagens.`
        });
      }

      /* --- GERAR TRADUÇÃO VIA API --- */
      const translation = await oaiInterface.gerarTraducao(textToTranslate);

      /* --- RESPONDER NO CANAL --- */
      const header = `🔄 **Tradução das últimas ${messages.length} mensagens:**\n\n`;
      const fullResponse = header + translation;

      // Dividir se necessário (limite de 2000 chars do Discord)
      if (fullResponse.length > 2000) {
        const chunks = [];
        let currentChunk = '';
        
        // Simples divisão por linhas para não quebrar markdown
        const lines = fullResponse.split('\n');
        
        for (const line of lines) {
          if ((currentChunk + line + '\n').length > 2000) {
            chunks.push(currentChunk);
            currentChunk = line + '\n';
          } else {
            currentChunk += line + '\n';
          }
        }
        if (currentChunk) chunks.push(currentChunk);

        await interaction.editReply(chunks[0]);
        for (let i = 1; i < chunks.length; i++) {
          await channel.send(chunks[i]);
        }
      } else {
        await interaction.editReply(fullResponse);
      }

    } catch (error) {
      console.error('[TRANSLATE][ERROR] Erro ao executar comando:', error);
      await interaction.editReply({
        content: '❌ Ocorreu um erro ao gerar a tradução.'
      });
    }
  },
};
