/*
** caminho: commands/warn_config.js
** últimaMod: 2026-03-01 11:07
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
        .setName('warn_config')
        .setDescription('Configura o sistema de warns automáticos')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers)
        .setDMPermission(false)
        .addSubcommand(subcommand =>
            subcommand
                .setName('show')
                .setDescription('Mostra a configuração atual de warns')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('set_limit')
                .setDescription('Define o limite de warns para ação automática')
                .addIntegerOption(option =>
                    option
                        .setName('limite')
                        .setDescription('Quantidade de warns para acionar punição automática')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(20)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('set_action')
                .setDescription('Define qual ação automática será aplicada ao atingir o limite')
                .addStringOption(option =>
                    option
                        .setName('acao')
                        .setDescription('Ação automática')
                        .setRequired(true)
                        .addChoices(
                            { name: 'timeout', value: 'timeout' },
                            { name: 'kick', value: 'kick' },
                            { name: 'ban', value: 'ban' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('set_timeout')
                .setDescription('Define o tempo de timeout (em minutos) para ação automática de timeout')
                .addIntegerOption(option =>
                    option
                        .setName('minutos')
                        .setDescription('Duração do timeout automático em minutos')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(moderation.MAX_TIMEOUT_MINUTES)
                )
        ),

    async execute(interaction) {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.BanMembers)) {
            return interaction.reply({
                content: '❌ Você precisa da permissão **Banir Membros** para usar este comando.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'show') {
            const config = moderation.getWarnConfig(interaction.guild.id);

            return interaction.reply({
                content:
                    `⚙️ Configuração atual de warns:\n` +
                    `- Limite: **${config.warnLimit}**\n` +
                    `- Ação automática: **${config.action}**\n` +
                    `- Timeout automático: **${config.timeoutMinutes}** minuto(s)`,
                flags: [MessageFlags.Ephemeral]
            });
        }

        if (subcommand === 'set_limit') {
            const warnLimit = interaction.options.getInteger('limite', true);
            const config = moderation.setWarnLimit(interaction.guild.id, warnLimit);

            return interaction.reply({
                content: `✅ Limite de warns atualizado para **${config.warnLimit}**.`,
                flags: [MessageFlags.Ephemeral]
            });
        }

        if (subcommand === 'set_action') {
            const action = interaction.options.getString('acao', true);
            const config = moderation.setWarnAction(interaction.guild.id, action);

            return interaction.reply({
                content: `✅ Ação automática atualizada para **${config.action}**.`,
                flags: [MessageFlags.Ephemeral]
            });
        }

        if (subcommand === 'set_timeout') {
            const timeoutMinutes = interaction.options.getInteger('minutos', true);
            const config = moderation.setWarnTimeoutMinutes(interaction.guild.id, timeoutMinutes);

            return interaction.reply({
                content: `✅ Timeout automático atualizado para **${config.timeoutMinutes}** minuto(s).`,
                flags: [MessageFlags.Ephemeral]
            });
        }

        return interaction.reply({
            content: '❌ Subcomando inválido.',
            flags: [MessageFlags.Ephemeral]
        });
    }
};
