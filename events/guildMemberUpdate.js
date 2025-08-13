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

    // Log inicial de debug para confirmar disparo do evento
    try {
      console.log(`[ROLE-CONGRATS][DEBUG] guildMemberUpdate fired user=${newMember.id} guild=${newMember.guild?.id} oldRoles=${oldMember.roles.cache.size} newRoles=${newMember.roles.cache.size}`);
    } catch {}

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
    if (!config) {
      console.log(`[ROLE-CONGRATS][DEBUG] No role_congrats config for guild ${guildId}; skipping.`);
      return;
    }

    // Detecta cargos adicionados
    const oldRoleIds = new Set(oldMember.roles.cache.keys());
    const newRoleIds = new Set(newMember.roles.cache.keys());
    const addedRoleIds = [...newRoleIds].filter(roleId => !oldRoleIds.has(roleId));

    // Debug: lista de cargos adicionados e o cargo alvo
    try {
      console.log(`[ROLE-CONGRATS][DEBUG] Added roles: ${addedRoleIds.join(', ') || '(none)'} | target=${config.roleId}`);
    } catch {}

    // Verifica se o cargo configurado está entre os adicionados
    if (!addedRoleIds.includes(config.roleId)) {
      return;
    }

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

      // Prepara o prompt substituindo {USER} pelo nome do usuário com ID
      const userInfo = `${newMember.displayName}, ID ${newMember.id}`;
      const promptText = config.prompt.replace(/{USER}/g, userInfo);

      // Busca o nome do cargo para a memória
      const role = newMember.guild.roles.cache.get(config.roleId);
      const roleName = role ? role.name : 'cargo desconhecido';

      console.log(`[ROLE-CONGRATS] Gerando parabéns para ${newMember.user.tag} no servidor ${newMember.guild.name} (cargo: ${roleName})`);

      // Gera resposta via OpenAI usando a função dedicada
      let congratsMessage;
      try {
        congratsMessage = await oai.gerarParabensCargoViaAPI(
          guildId,
          newMember.id,
          promptText,
          roleName
        );
      } catch (oaiError) {
        console.error('[ROLE-CONGRATS] Erro na API OpenAI, usando mensagem de fallback:', oaiError);
        // Fallback simples se a OpenAI falhar
        congratsMessage = `🎉 Parabéns, <@${newMember.id}>, pelo novo cargo!`;
        
        // Mesmo com fallback, adiciona a memória do cargo
        try {
          const memoria = `Está no cargo ${roleName}`;
          database.adicionarMemoriaUsuario(guildId, newMember.id, memoria, {
            createdAt: Date.now()
          });
          console.log(`[ROLE-CONGRATS][MEM] Memória de fallback adicionada para usuário ${newMember.id}: ${memoria}`);
        } catch (memError) {
          console.error('[ROLE-CONGRATS][MEM] Erro ao salvar memória de fallback:', memError);
        }
      }

      // Envia a mensagem
      await targetChannel.send(congratsMessage);

    } catch (error) {
      console.error(`[ROLE-CONGRATS] Erro ao processar parabéns para ${newMember.user.tag}:`, error);
    }
  }
};