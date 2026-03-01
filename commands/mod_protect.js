/*
** caminho: commands/mod_protect.js
** últimaMod: 2026-03-01 11:08
** autor: Vico
** colaboração: OpenCode (GPT-5.3-Codex)
*/

const {
    SlashCommandBuilder,
    PermissionsBitField,
    MessageFlags
} = require('discord.js');
const moderation = require('../core/moderation');

function formatMentions(items, formatter, emptyText) {
    if (!items || items.length === 0) {
        return emptyText;
    }

    const mentions = items.map(formatter).join(', ');
    if (mentions.length <= 900) {
        return mentions;
    }

    return `${items.slice(0, 20).map(formatter).join(', ')} ... (+${items.length - 20} restante(s))`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mod_protect')
        .setDescription('Gerencia lista de proteção da moderação automática')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers)
        .setDMPermission(false)
        .addSubcommand(subcommand =>
            subcommand
                .setName('show')
                .setDescription('Mostra usuários e cargos protegidos')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('add_user')
                .setDescription('Adiciona um usuário à lista de proteção')
                .addUserOption(option =>
                    option
                        .setName('usuario')
                        .setDescription('Usuário para proteger')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove_user')
                .setDescription('Remove um usuário da lista de proteção')
                .addUserOption(option =>
                    option
                        .setName('usuario')
                        .setDescription('Usuário para remover da proteção')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('add_role')
                .setDescription('Adiciona um cargo à lista de proteção')
                .addRoleOption(option =>
                    option
                        .setName('cargo')
                        .setDescription('Cargo para proteger')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove_role')
                .setDescription('Remove um cargo da lista de proteção')
                .addRoleOption(option =>
                    option
                        .setName('cargo')
                        .setDescription('Cargo para remover da proteção')
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.BanMembers)) {
            return interaction.reply({
                content: '❌ Você precisa da permissão **Banir Membros** para usar este comando.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        const guildId = interaction.guild.id;
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'show') {
            const entries = moderation.listProtectedEntries(guildId);
            const usersText = formatMentions(entries.users, id => `<@${id}>`, 'Nenhum usuário protegido.');
            const rolesText = formatMentions(entries.roles, id => `<@&${id}>`, 'Nenhum cargo protegido.');

            return interaction.reply({
                content:
                    `🛡️ Lista de proteção da moderação:\n` +
                    `**Usuários:** ${usersText}\n` +
                    `**Cargos:** ${rolesText}`,
                flags: [MessageFlags.Ephemeral]
            });
        }

        if (subcommand === 'add_user') {
            const user = interaction.options.getUser('usuario', true);
            const changes = moderation.addProtectedUser(guildId, user.id);

            return interaction.reply({
                content: changes > 0
                    ? `✅ ${user} adicionado(a) à lista de proteção.`
                    : `ℹ️ ${user} já estava na lista de proteção.`,
                flags: [MessageFlags.Ephemeral]
            });
        }

        if (subcommand === 'remove_user') {
            const user = interaction.options.getUser('usuario', true);
            const changes = moderation.removeProtectedUser(guildId, user.id);

            return interaction.reply({
                content: changes > 0
                    ? `✅ ${user} removido(a) da lista de proteção.`
                    : `ℹ️ ${user} não estava na lista de proteção.`,
                flags: [MessageFlags.Ephemeral]
            });
        }

        if (subcommand === 'add_role') {
            const role = interaction.options.getRole('cargo', true);
            const changes = moderation.addProtectedRole(guildId, role.id);

            return interaction.reply({
                content: changes > 0
                    ? `✅ ${role} adicionado à lista de proteção.`
                    : `ℹ️ ${role} já estava na lista de proteção.`,
                flags: [MessageFlags.Ephemeral]
            });
        }

        if (subcommand === 'remove_role') {
            const role = interaction.options.getRole('cargo', true);
            const changes = moderation.removeProtectedRole(guildId, role.id);

            return interaction.reply({
                content: changes > 0
                    ? `✅ ${role} removido da lista de proteção.`
                    : `ℹ️ ${role} não estava na lista de proteção.`,
                flags: [MessageFlags.Ephemeral]
            });
        }

        return interaction.reply({
            content: '❌ Subcomando inválido.',
            flags: [MessageFlags.Ephemeral]
        });
    }
};
