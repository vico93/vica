/*
** caminho: commands/rank_setxp.js
** últimaMod: 2025-10-09 17:23
** autor: Vico
** colaboração: xai/grok-code-fast-1
*/

/*
 * Comando para definir o XP de um usuário específico
 * Permite administradores definir diretamente o XP de um membro, recalculando o nível automaticamente
 */

const {
    SlashCommandBuilder,
    PermissionsBitField,
    MessageFlags
} = require('discord.js');
const database = require('../core/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rank_setxp')
        .setDescription('Define o XP de um membro específico')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .setDMPermission(false)
        .addUserOption(option =>
            option
                .setName('member')
                .setDescription('Membro para definir o XP')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('xp')
                .setDescription('Quantidade de XP a definir (deve ser >= 0)')
                .setRequired(true)
                .setMinValue(0)
        ),

    async execute(interaction) {
        const member = interaction.options.getUser('member');
        const xp = interaction.options.getInteger('xp');

        // Validação adicional (embora o minValue já impeça valores negativos)
        if (xp < 0) {
            return interaction.reply({
                content: '❌ O XP deve ser um valor positivo (>= 0).',
                flags: [MessageFlags.Ephemeral]
            });
        }

        try {
            // Define o XP no banco de dados
            database.definirXP(interaction.guild.id, member.id, xp);

            // Calcula o nível baseado no XP
            const level = Math.floor(xp / 1000);

            // Resposta de sucesso
            await interaction.reply({
                content: `✅ O XP de ${member} foi definido para **${xp}** (Nível ${level}).`,
                flags: [MessageFlags.Ephemeral]
            });

        } catch (error) {
            console.error('[RANK_SETXP][ERROR] Erro ao definir XP:', error);
            await interaction.reply({
                content: '❌ Ocorreu um erro ao definir o XP do usuário.',
                flags: [MessageFlags.Ephemeral]
            });
        }
    }
};