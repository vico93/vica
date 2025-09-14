/*
** caminho: events/guildMemberUpdate.js
** últimaMod: 2025-09-13 23:52
** autor: Vico
** colaboração: Roo, Roo Sonic (xai/grok-code-fast-1)
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
    const oldRoleIds = new Set(oldMember.roles.cache.keys());
    const newRoleIds = new Set(newMember.roles.cache.keys());
    if (oldRoleIds.size === newRoleIds.size && [...oldRoleIds].every(id => newRoleIds.has(id))) {
      return;
    }

    const guildId = newMember.guild.id;
    
    // Busca configurações de parabéns por cargo (agora pode haver várias)
    const configs = database.listRoleCongratsConfigs(guildId);
    if (!configs || configs.length === 0) {
      console.log(`[ROLE-CONGRATS][DEBUG] No role_congrats config for guild ${guildId}; skipping.`);
      return;
    }

    // Detecta cargos adicionados
    const addedRoleIds = [...newRoleIds].filter(roleId => !oldRoleIds.has(roleId));


    // Debug: lista de cargos adicionados
    try {
      console.log(`[ROLE-CONGRATS][DEBUG] Added roles: ${addedRoleIds.join(', ') || '(none)'} | configured_count=${configs.length}`);
    } catch {}

    // Filtra configurações cujo roleId aparece entre os cargos adicionados
    const matchedConfigs = configs.filter(c => addedRoleIds.includes(c.roleId));
    if (matchedConfigs.length === 0) return; // nada a fazer

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
          promptsToSend.set(replacedPrompt, { roleName, replacedPrompt });
        }
      }

      for (const { roleName, promptText } of promptsToSend.values()) {
        console.log(`[ROLE-CONGRATS] Gerando parabéns para ${newMember.user.tag} no servidor ${newMember.guild.name} (cargo: ${roleName})`);
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