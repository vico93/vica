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
    {reason}      -> reason (quando fornecido no contexto)
*/

/**
 * Processa alias em uma string, substituindo placeholders por valores do contexto.
 * @param {string} content - String contendo alias
 * @param {object} context - Objeto de contexto
 * @param {import('discord.js').GuildMember|null} [context.member] - Membro do Discord
 * @param {import('discord.js').Guild|null} [context.guild] - Servidor
 * @param {import('discord.js').Channel|null} [context.channel] - Canal
 * @param {string|null} [context.reason] - Razão (para kicks/bans)
 * @returns {string} String com alias processados
 */
function processAliases(content, context = {}) {
    if (typeof content !== 'string') return '';
    if (!content) return '';

    let result = content;
    const { member, guild, channel, reason } = context;

    // {mention} -> <@userId>
    if (member) {
        result = result.replace(/\{mention\}/g, `<@${member.id}>`);
    }

    // {username} -> user.username
    if (member?.user) {
        result = result.replace(/\{username\}/g, member.user.username);
    }

    // {displayname} -> member.displayName
    if (member) {
        result = result.replace(/\{displayname\}/g, member.displayName);
    }

    // {globalname} -> user.globalName || user.username
    if (member?.user) {
        const globalName = member.user.globalName || member.user.username;
        result = result.replace(/\{globalname\}/g, globalName);
    }

    // {server} -> guild.name
    if (guild) {
        result = result.replace(/\{server\}/g, guild.name);
    }

    // {channel} -> <#channelId>
    if (channel?.id) {
        result = result.replace(/\{channel\}/g, `<#${channel.id}>`);
    }

    // {reason} -> reason string
    if (reason !== undefined && reason !== null) {
        result = result.replace(/\{reason\}/g, String(reason));
    }

    return result;
}

module.exports = { processAliases };
