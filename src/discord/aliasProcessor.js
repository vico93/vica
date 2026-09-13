/*
** caminho: core/aliasProcessor.js
** últimaMod: 2026-04-23 15:00
** autor: Vico
** colaboração: OpenCode
*/

/*
  Sistema de Alias para Macros e mensagens dinâmicas.
  Substitui placeholders em strings por dados do contexto Discord.
  
  Alias suportados:
    {mention}     -> <@userId>
    {username}    -> user.username
    {displayname} -> member.displayName
    {globalname}  -> user.globalName || user.username
    {server}      -> guild.name
    {channel}     -> <#channelId>
    {role}        -> role.name
    {role_mention}-> <@&roleId>
    {reason}      -> reason (quando fornecido no contexto)
*/

/**
 * Processa alias em uma string, substituindo placeholders por valores do contexto.
 * Aceita tanto GuildMember quanto User como 'member' no contexto.
 * @param {string} content - String contendo alias
 * @param {object} context - Objeto de contexto
 * @param {import('discord.js').GuildMember|import('discord.js').User|null} [context.member] - Membro ou User do Discord
 * @param {import('discord.js').Guild|null} [context.guild] - Servidor
 * @param {import('discord.js').Channel|null} [context.channel] - Canal
 * @param {import('discord.js').Role|null} [context.role] - Cargo
 * @param {string|null} [context.reason] - Razão (para kicks/bans)
 * @returns {string} String com alias processados
 */
function processAliases(content, context = {}) {
    if (typeof content !== 'string') return '';
    if (!content) return '';

    let result = content;
    const { member, guild, channel, role, reason } = context;

    // Normaliza member: pode ser GuildMember (tem .user) ou User (não tem .user)
    // Se for User, usamos ele próprio como user
    const user = member?.user || member;
    const memberId = member?.id || null;
    const displayName = member?.displayName || user?.username || user?.globalName || 'Fulano';
    const username = user?.username || 'Fulano';
    const globalName = user?.globalName || username;

    // {mention} -> <@userId>
    if (memberId) {
        result = result.replace(/\{mention\}/g, `<@${memberId}>`);
    }

    // {username} -> user.username
    result = result.replace(/\{username\}/g, username);

    // {displayname} -> member.displayName (ou fallback para username/globalName)
    result = result.replace(/\{displayname\}/g, displayName);

    // {globalname} -> user.globalName || user.username
    result = result.replace(/\{globalname\}/g, globalName);

    // {server} -> guild.name
    if (guild) {
        result = result.replace(/\{server\}/g, guild.name);
    }

    // {channel} -> <#channelId>
    if (channel?.id) {
        result = result.replace(/\{channel\}/g, `<#${channel.id}>`);
    }

    // {role} -> role.name
    if (role) {
        result = result.replace(/\{role\}/g, role.name);
    }

    // {role_mention} -> <@&roleId>
    if (role?.id) {
        result = result.replace(/\{role_mention\}/g, `<@&${role.id}>`);
    }

    // {reason} -> reason string
    if (reason !== undefined && reason !== null) {
        result = result.replace(/\{reason\}/g, String(reason));
    }

    return result;
}

module.exports = { processAliases };
