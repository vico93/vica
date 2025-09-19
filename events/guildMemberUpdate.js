/*
** caminho: events/guildMemberUpdate.js
** últimaMod: 2025-09-18
** autor: Vico
** colaboração: Roo Sonic (xai/grok-code-fast-1) e Claude
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

    // Obtém IDs dos cargos antes e depois
    const oldRoleIds = oldMember.roles.cache.map(r => r.id);
    const newRoleIds = newMember.roles.cache.map(r => r.id);
    
    // Cria Sets para comparação eficiente
    const oldRoleSet = new Set(oldRoleIds);
    const newRoleSet = new Set(newRoleIds);
    
    // Detecta cargos adicionados
    const addedRoleIds = newRoleIds.filter(roleId => !oldRoleSet.has(roleId));
    
    // Detecta cargos removidos (para debug, se necessário)
    const removedRoleIds = oldRoleIds.filter(roleId => !newRoleSet.has(roleId));
    
    // Se não houve mudança nos cargos, retorna imediatamente
    if (addedRoleIds.length === 0 && removedRoleIds.length === 0) {
      return;
    }

    // Log de debug para confirmar que houve mudança real nos cargos
    console.log(`[ROLE-CONGRATS][DEBUG] Mudança de cargos detectada para ${newMember.user.tag}:`);
    if (addedRoleIds.length > 0) {
      console.log(`  - Cargos adicionados: ${addedRoleIds.join(', ')}`);
    }
    if (removedRoleIds.length > 0) {
      console.log(`  - Cargos removidos: ${removedRoleIds.join(', ')}`);
    }

    // Se não há cargos adicionados, não precisa processar parabéns
    if (addedRoleIds.length === 0) {
      return;
    }

    const guildId = newMember.guild.id;
    
    // Busca configurações de parabéns por cargo (agora pode haver várias)
    const configs = database.listRoleCongratsConfigs(guildId);
    if (!configs || configs.length === 0) {
      console.log(`[ROLE-CONGRATS][DEBUG] No role_congrats config for guild ${guildId}; skipping.`);
      return;
    }

    // Debug: lista de cargos adicionados e configurações
    console.log(`[ROLE-CONGRATS][DEBUG] Added roles: ${addedRoleIds.join(', ')} | configured_count=${configs.length}`);

    // Filtra configurações cujo roleId aparece entre os cargos adicionados
    const matchedConfigs = configs.filter(c => addedRoleIds.includes(c.roleId));
    if (matchedConfigs.length === 0) {
      console.log(`[ROLE-CONGRATS][DEBUG] Nenhum cargo adicionado corresponde às configurações de parabéns.`);
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

      // Para evitar mensagens duplicadas quando múltiplos cargos configurados compartilham o mesmo prompt,
      // agrupe os prompts por texto e envie apenas uma mensagem por prompt.
      const userInfo = `${newMember.displayName}, ID ${newMember.id}`;
      const promptsToSend = new Map(); // replacedPrompt -> { roleName, replacedPrompt }

      for (const cfg of matchedConfigs) {
        const role = newMember.guild.roles.cache.get(cfg.roleId);
        const roleName = role ? role.name : 'cargo desconhecido';
        const roleMention = role ? `<@&${role.id}>` : '@cargo-desconhecido';
        const promptText = String(cfg.prompt || '');
        const replacedPrompt = promptText
          .replace(/{USER}/g, userInfo)
          .replace(/{ROLE}/g, roleName)
          .replace(/{@ROLE}/g, roleMention);
        // Only keep first replacedPrompt for this prompt
        if (!promptsToSend.has(replacedPrompt)) {
          promptsToSend.set(replacedPrompt, { roleName, replacedPrompt: promptText });
        }
      }

      for (const { roleName, replacedPrompt } of promptsToSend.values()) {
        console.log(`[ROLE-CONGRATS] Gerando parabéns para ${newMember.user.tag} no servidor ${newMember.guild.name} (cargo: ${roleName})`);
        let congratsMessage;
        try {
          congratsMessage = await oai.gerarParabensCargoViaAPI(
            guildId,
            newMember.id,
            replacedPrompt,
            roleName
          );
        } catch (oaiError) {
          console.error('[ROLE-CONGRATS] Erro na API OpenAI, usando mensagem de fallback:', oaiError);
          congratsMessage = `🎉 Parabéns, <@${newMember.id}>, pelo novo cargo!`;
          // Ainda tenta salvar memória
          try {
            const memoria = `Está no cargo ${roleName}`;
            database.adicionarMemoriaUsuario(guildId, newMember.id, memoria, { createdAt: Date.now() });
            console.log(`[ROLE-CONGRATS][MEM] Memória de fallback adicionada para usuário ${newMember.id}: ${memoria}`);
          } catch (memError) {
            console.error('[ROLE-CONGRATS][MEM] Erro ao salvar memória de fallback:', memError);
          }
        }
        await targetChannel.send(congratsMessage);
      }

    } catch (error) {
      console.error(`[ROLE-CONGRATS] Erro ao processar parabéns para ${newMember.user.tag}:`, error);
    }
  }
};