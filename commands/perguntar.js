/*
**  caminho: commands/perguntar.js
**  últimaMod: 07/10/2025 22:02
**  autor: Vico
**  colaboração: ChatGPT, Gemini, Kimi AI, xai/grok-code-fast-1
*/

/*
  Comando /perguntar:
  - Gera uma pergunta divertida via IA ou do banco local.
  - Permite mencionar alguém para direcionar a pergunta.
  - Agora respeita blacklist do chatbot (alternativa b).
*/

const { SlashCommandBuilder, MessageFlags, ChannelType } = require('discord.js');
const oai         = require('../core/oai_interface');
const database    = require('../core/database');
const { perguntas } = require('../core/static_data'); // já em memória

function formatarNomeTopico(date = new Date()) {
  const dia = String(date.getDate()).padStart(2, '0');
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  return `Pergunta ${dia}/${mes}`;
}

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
         .setRequired(false))
    .addBooleanOption(opt =>
      opt.setName('cria_topico')
         .setDescription('Cria um tópico na mensagem da pergunta')
         .setRequired(false)),

  async execute(interaction) {
    const mencionar = interaction.options.getMentionable('mencionar');
    const fonte     = interaction.options.getString('fonte');
    const criaTopico = interaction.options.getBoolean('cria_topico') ?? false;
    const canalId   = interaction.channel.id;
    const guildId   = interaction.guild.id;

    // Respeita blacklist de chatbot (alternativa b)
    if (database.chatbotCanalNaBlacklist(guildId, canalId)) {
      return interaction.reply({
        content: '❌ Este canal está na blacklist do chatbot. Use o comando em outro canal.',
        ephemeral: true
      });
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    let pergunta;

    if (fonte === 'banco') {
      // array já carregado na memória
      pergunta = perguntas[Math.floor(Math.random() * perguntas.length)];
    } else if (fonte === 'ia') {
      try {
        pergunta = await oai.gerarPerguntaViaAPI();
      } catch (err) {
        console.error('[VICA][PERGUNTAR] Erro IA:', err);
        return interaction.editReply({ content: 'Desculpa, tive um bug e não consegui pensar em nada... 😓', flags: [MessageFlags.Ephemeral] });
      }
    } else {
      return interaction.editReply({ content: 'Fonte inválida.', flags: [MessageFlags.Ephemeral] });
    }

    await interaction.editReply({ content: 'Pergunta gerada com sucesso.', flags: [MessageFlags.Ephemeral] });
    const reply = await interaction.channel.send({
      content: `${mencionar ? `${mencionar} ` : ''}**${pergunta}**${criaTopico ? '\n*Respondam no tópico abaixo! :point_down::blush:*' : ''}`,
      allowedMentions: mencionar ? { parse: ['everyone', 'roles', 'users'] } : {}
    });

    if (criaTopico) {
      const targetChannel = reply.channel;
      const canCreateThread =
        targetChannel &&
        typeof reply.startThread === 'function' &&
        (
          targetChannel.type === ChannelType.GuildText ||
          targetChannel.type === ChannelType.GuildAnnouncement
        );

      if (canCreateThread) {
        try {
          await reply.startThread({
            name: formatarNomeTopico(),
            autoArchiveDuration: 1440
          });
        } catch (threadError) {
          console.error('[VICA][PERGUNTAR][WARN] Não foi possível criar tópico:', threadError);
        }
      } else {
        console.warn('[VICA][PERGUNTAR][WARN] Canal não suporta criação de tópico para a pergunta.');
      }
    }
  }
};