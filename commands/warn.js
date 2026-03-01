/*
** caminho: commands/warn.js
** últimaMod: 2026-03-01 11:05
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
        .setName('warn')
        .setDescription('Aplica um aviso a um membro do servidor')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers)
        .setDMPermission(false)
        .addUserOption(option =>
            option
                .setName('usuario')
                .setDescription('Membro que receberá o aviso')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('motivo')
                .setDescription('Motivo do aviso')
                .setRequired(true)
        ),

    async execute(interaction) {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.BanMembers)) {
            return interaction.reply({
                content: '❌ Você precisa da permissão **Banir Membros** para usar este comando.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        const targetUser = interaction.options.getUser('usuario');
        const reason = interaction.options.getString('motivo', true);

        const targetMember = await moderation.fetchGuildMember(interaction.guild, targetUser.id);
        if (!targetMember) {
            return interaction.reply({
                content: '❌ Não consegui encontrar este usuário no servidor.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        const executorMember = await moderation.fetchGuildMember(interaction.guild, interaction.user.id);
        if (!executorMember) {
            return interaction.reply({
                content: '❌ Não consegui validar seu membro no servidor. Tente novamente.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        const result = await moderation.issueWarn({
            guild: interaction.guild,
            executorMember,
            targetMember,
            reason
        });

        if (!result.success) {
            return interaction.reply({
                content: `❌ ${result.error}`,
                flags: [MessageFlags.Ephemeral]
            });
        }

        let response = `✅ Warn aplicado em <@${targetMember.id}> com sucesso. Total atual: **${result.warnCount}/${result.warnLimit}**.`;

        if (result.thresholdReached) {
            if (result.autoActionResult?.success) {
                if (result.autoActionResult.action === 'timeout') {
                    response += `\n🚨 Limite atingido. Ação automática aplicada: **timeout** por **${result.autoActionResult.durationMinutes}** minuto(s).`;
                } else {
                    response += `\n🚨 Limite atingido. Ação automática aplicada: **${result.autoActionResult.action}**.`;
                }
            } else {
                response += `\n⚠️ Limite de warns atingido, mas a ação automática falhou: ${result.autoActionResult?.error || 'erro desconhecido'}.`;
            }
        }

        return interaction.reply({
            content: response,
            flags: [MessageFlags.Ephemeral]
        });
    }
};
