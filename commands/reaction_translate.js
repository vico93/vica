/*
** caminho: commands/reaction_translate.js
** últimaMod: 2026-02-03
** autor: Vico
** colaboração: Gemini
*/

/*
  Comando para configurar o emoji de tradução.
  Permite definir qual emoji dispara a tradução automática.
  Acesso restrito a administradores (ManageGuild).
*/

const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionsBitField,
    MessageFlags
} = require('discord.js');
const database = require('../core/database');

/* --- CONSTANTES --- */
const EMOJI_REGEX = /^[0-9]+$/; // Para validar IDs numéricos

/* --- UTILITÁRIOS --- */

/**
 * Valida se um ID de emoji é válido e acessível no servidor
 */
function validateEmoji(emojiId, client, guild) {
    try {
        // Tentar resolver o emoji no servidor
        const emoji = guild.emojis.resolve(emojiId);
        if (emoji) return { valid: true, emoji };
        
        // Verificar se é um emoji padrão do Discord
        // Nota: client.emojis.resolve geralmente só resolve emojis de guilds que o bot está.
        // Para emojis Unicode, a validação é mais chata.
        // Se o usuário passar o caractere unicode diretamente, podemos aceitar.
        // Mas se passar ID, esperamos um ID numérico.
        
        return { valid: false, reason: 'Emoji não encontrado no servidor. Certifique-se de usar o ID do emoji.' };
    } catch (error) {
        console.error('[REACTION_TRANSLATE][ERROR] Erro ao validar emoji:', error.message);
        return { valid: false, reason: 'Erro interno ao validar emoji' };
    }
}

/* --- DEFINIÇÃO DO COMANDO --- */
module.exports = {
    data: new SlashCommandBuilder()
        .setName('reaction_translate')
        .setDescription('Configura o sistema de tradução por reação')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Define o emoji para tradução')
                .addStringOption(option =>
                    option
                        .setName('emoji')
                        .setDescription('ID do emoji ou caractere unicode')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Desativa a tradução por reação'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Mostra a configuração atual')),

    async execute(interaction) {
        const { client, guild } = interaction;
        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'set': {
                    let emojiInput = interaction.options.getString('emoji');
                    let emojiToSave = emojiInput;

                    // Tenta identificar se é um ID ou Unicode
                    // Se for apenas números, assumimos que é ID
                    if (EMOJI_REGEX.test(emojiInput)) {
                         const validation = validateEmoji(emojiInput, client, guild);
                         if (validation.valid) {
                             emojiToSave = validation.emoji.id; // Salva o ID
                         } else {
                             // Se não encontrou no servidor, avisa
                             return await interaction.reply({
                                 content: `❌ ${validation.reason}`,
                                 flags: [MessageFlags.Ephemeral]
                             });
                         }
                    } else {
                        // Assume que é unicode ou string customizada
                        // TODO: Melhorar validação de unicode se necessário
                        emojiToSave = emojiInput;
                    }

                    const changes = database.setTranslationEmoji(guild.id, emojiToSave);

                    await interaction.reply({
                        content: `✅ Sistema de tradução ativado! Reaja com ${emojiInput} (ID/Char: ​​` + '`' + `${emojiToSave}` + '`' + `) para traduzir mensagens.`, 
                        flags: [MessageFlags.Ephemeral]
                    });
                    break;
                }

                case 'disable': {
                    const changes = database.setTranslationEmoji(guild.id, null);
                    await interaction.reply({
                        content: '✅ Sistema de tradução desativado.',
                        flags: [MessageFlags.Ephemeral]
                    });
                    break;
                }

                case 'status': {
                    const currentEmoji = database.getTranslationEmoji(guild.id);
                    
                    const embed = new EmbedBuilder()
                        .setTitle('🌐 Configuração de Tradução')
                        .setColor('#0099ff')
                        .setTimestamp();

                    if (currentEmoji) {
                        let emojiDisplay = currentEmoji;
                        // Tenta resolver para mostrar bonitinho se for ID
                        if (EMOJI_REGEX.test(currentEmoji)) {
                            const resolved = guild.emojis.resolve(currentEmoji);
                            if (resolved) emojiDisplay = `<:${resolved.name}:${resolved.id}>`;
                        }

                        embed.setDescription(`O sistema está **ATIVO**.\nEmoji configurado: ${emojiDisplay} (​​` + '`' + `${currentEmoji}` + '`' + `)`);
                        embed.addFields({name: 'Como usar', value: `Reaja a qualquer mensagem com ${emojiDisplay} para traduzir.`});
                    } else {
                        embed.setDescription('O sistema está **DESATIVADO**.');
                    }

                    await interaction.reply({
                        embeds: [embed],
                        flags: [MessageFlags.Ephemeral]
                    });
                    break;
                }
            }
        } catch (error) {
            console.error('[REACTION_TRANSLATE][ERROR] Erro ao executar comando:', error.message);
            await interaction.reply({
                content: '❌ Ocorreu um erro interno.',
                flags: [MessageFlags.Ephemeral]
            });
        }
    }
};
