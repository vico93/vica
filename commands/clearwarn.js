/*
** caminho: commands/clearwarn.js
** últimaMod: 2026-03-01 11:06
** autor: Vico
** colaboração: OpenCode (GPT-5.3-Codex)
*/

const {
    SlashCommandBuilder,
    PermissionsBitField,
    MessageFlags
} = require('discord.js');
const moderation = require('../core/moderation');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clearwarn')
        .setDescription('Limpa os warns de um membro')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers)
        .setDMPermission(false)
        .addUserOption(option =>
            option
                .setName('usuario')
                .setDescription('Membro que terá os warns limpos')
                .setRequired(true)
        ),

    async execute(interaction) {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.BanMembers)) {
            return interaction.reply({
                content: '❌ Você precisa da permissão **Banir Membros** para usar este comando.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        const targetUser = interaction.options.getUser('usuario', true);
        const result = moderation.clearWarnCount(interaction.guild.id, targetUser.id);

        return interaction.reply({
            content: `✅ Warns de <@${targetUser.id}> limpos com sucesso. Antes: **${result.previousCount}** | Agora: **0**.`,
            flags: [MessageFlags.Ephemeral]
        });
    }
};
