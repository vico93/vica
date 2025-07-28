/*
** caminho: events/guildMemberRemove.js
** últimaMod: 28/07/2025 11:36
** autor: Vico
** colaboração: Gemini
*/

const database = require('../core/database');

module.exports = {
  name: 'guildMemberRemove',
  execute(member) {
    // Ignora eventos de servidores onde o bot pode não estar totalmente pronto
    if (!member.guild) return;

    try {
      const changes = database.removerUsuarioXP(member.guild.id, member.id);
      if (changes > 0) {
        console.log(`[RANK] Membro ${member.user.tag} (ID: ${member.id}) removido do ranking do servidor ${member.guild.name}.`);
      }
    } catch (err) {
      console.error(`[ERRO-DB] Falha ao tentar remover o membro ${member.id} do ranking:`, err);
    }
  },
};