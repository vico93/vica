/*
** caminho: events/guildMemberUpdate.js
** últimaMod: 13/08/2025 00:09
** autor: Vico
** colaboração: Roo
*/

/*
  Evento disparado quando um membro do servidor é atualizado (roles, nickname, etc).
  Responsabilidades:
  1. Detectar quando um usuário recebe um novo cargo;
  2. Verificar se o cargo corresponde ao configurado para parabéns;
  3. Gerar mensagem de parabéns via OpenAI usando o prompt configurado;
  4. Enviar no canal de sistema ou canal apropriado.
*/

const oai = require('../core/oai_interface');
const database = require('../core/database');

module.exports = {
  name: 'guildMemberUpdate',
  async execute(oldMember, newMember) {
    // Ignora bots
    if (newMember.user.bot) return;

    // Ignora se não há mudança nos cargos
    if (oldMember.roles.cache.size === newMember.roles.cache.size) {
      // Verifica se realmente não houve mudança nos cargos
      const oldRoleIds = new Set(oldMember.roles.cache.keys());
      const newRoleIds = new Set(newMember.roles.cache.keys());
      let hasRoleChange = false;
      
      for (const roleId of newRoleIds) {
        if (!oldRoleIds.has(roleId)) {
          hasRoleChange = true;
          break;
        }
      }
      
      if (!hasRoleChange) return;
    }

    const guildId = newMember.guild.id;
    
    // Busca configuração de parabéns por cargo
    const config = database.getRoleCongratsConfig(guildId);
    if (!config) return;

    // Detecta cargos adicionados
    const oldRoleIds = new Set(oldMember.roles.cache.keys());
    const newRoleIds = new Set(newMember.roles.cache.keys());
    const addedRoleIds = [...newRoleIds].filter(roleId => !oldRoleIds.has(roleId));

    // Verifica se o cargo configurado está entre os adicionados
    if (!addedRoleIds.includes(config.roleId)) return;

    try {
      // Determina o canal de destino
      let targetChannel = null;
      
      // 1. Tenta usar o canal de sistema configurado
      const systemChannelId = database.getSystemChannel(guildId);
      if (systemChannelId) {
        const foundChannel = newMember.guild.channels.cache.get(systemChannelId);
        if (foundChannel && foundChannel.isTextBased()) {
          const botMember = newMember.guild.members.me;
          if (botMember && foundChannel.permissionsFor(botMember).has(['ViewChannel', 'SendMessages'])) {
            targetChannel = foundChannel;
          }
        }
      }

      // 2. Fallback para o canal de sistema padrão do Discord
      if (!targetChannel && newMember.guild.systemChannel) {
        const botMember = newMember.guild.members.me;
        if (botMember && newMember.guild.systemChannel.permissionsFor(botMember).has(['ViewChannel', 'SendMessages'])) {
          targetChannel = newMember.guild.systemChannel;
        }
      }

      // 3. Fallback para o primeiro canal de texto acessível
      if (!targetChannel) {
        const botMember = newMember.guild.members.me;
        if (botMember) {
          targetChannel = newMember.guild.channels.cache.find(channel => 
            channel.isTextBased() && 
            channel.permissionsFor(botMember).has(['ViewChannel', 'SendMessages'])
          );
        }
      }

      if (!targetChannel) {
        console.warn(`[ROLE-CONGRATS] Não foi possível encontrar canal acessível no servidor ${guildId}`);
        return;
      }

      // Prepara o prompt substituindo {USER} pelo nome do usuário
      const promptText = config.prompt.replace(/{USER}/g, newMember.displayName);

      console.log(`[ROLE-CONGRATS] Gerando parabéns para ${newMember.user.tag} no servidor ${newMember.guild.name}`);

      // Gera resposta via OpenAI
      let congratsMessage;
      try {
        congratsMessage = await oai.gerarRespostaContextual(
          guildId,
          targetChannel.id,
          newMember.id,
          promptText,
          null,
          targetChannel,
          null
        );
      } catch (oaiError) {
        console.error('[ROLE-CONGRATS] Erro na API OpenAI, usando mensagem de fallback:', oaiError);
        // Fallback simples se a OpenAI falhar
        congratsMessage = `🎉 Parabéns, <@${newMember.id}>, pelo novo cargo!`;
      }

      // Envia a mensagem
      await targetChannel.send(congratsMessage);

    } catch (error) {
      console.error(`[ROLE-CONGRATS] Erro ao processar parabéns para ${newMember.user.tag}:`, error);
    }
  }
};