/*
** caminho: commands/macro.js
** últimaMod: 2026-04-23 15:00
** autor: Vico
** colaboração: OpenCode
*/

/*
  Comando /macro para gerenciar macros do servidor.
  Macros são textos configuráveis prefixados com ! que podem conter alias dinâmicos.
*/

const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require('discord.js');
const database = require('../core/database');

function escapeCodeBlock(text) {
    return text.replace(/`/g, '\\`');
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('macro')
        .setDescription('Gerencia macros de texto do servidor')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .setDMPermission(false)

        /* create */
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Cria uma nova macro')
                .addStringOption(option =>
                    option.setName('nome')
                        .setDescription('Nome da macro (usado com !nome)')
                        .setRequired(true)
                        .setMaxLength(50))
                .addStringOption(option =>
                    option.setName('conteudo')
                        .setDescription('Conteúdo da macro. Alias: {mention}, {username}, {displayname}, {globalname}, {server}, {channel}')
                        .setRequired(true)
                        .setMaxLength(2000))
                .addBooleanOption(option =>
                    option.setName('moderador_only')
                        .setDescription('Se verdadeiro, apenas moderadores podem usar esta macro')
                        .setRequired(false)))

        /* edit */
        .addSubcommand(subcommand =>
            subcommand
                .setName('edit')
                .setDescription('Edita uma macro existente')
                .addStringOption(option =>
                    option.setName('nome')
                        .setDescription('Nome da macro a editar')
                        .setRequired(true)
                        .setMaxLength(50))
                .addStringOption(option =>
                    option.setName('conteudo')
                        .setDescription('Novo conteúdo da macro')
                        .setRequired(true)
                        .setMaxLength(2000))
                .addBooleanOption(option =>
                    option.setName('moderador_only')
                        .setDescription('Se verdadeiro, apenas moderadores podem usar esta macro')
                        .setRequired(false)))

        /* delete */
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Remove uma macro')
                .addStringOption(option =>
                    option.setName('nome')
                        .setDescription('Nome da macro a remover')
                        .setRequired(true)
                        .setMaxLength(50)))

        /* list */
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Lista todas as macros do servidor'))

        /* show */
        .addSubcommand(subcommand =>
            subcommand
                .setName('show')
                .setDescription('Mostra o conteúdo de uma macro')
                .addStringOption(option =>
                    option.setName('nome')
                        .setDescription('Nome da macro')
                        .setRequired(true)
                        .setMaxLength(50))),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const subcommand = interaction.options.getSubcommand();

        try {
            if (subcommand === 'create') {
                const name = interaction.options.getString('nome').toLowerCase().trim();
                const content = interaction.options.getString('conteudo');
                const moderatorOnly = interaction.options.getBoolean('moderador_only') ?? false;

                // Validação do nome: apenas letras, números, hífen e underscore
                if (!/^[a-z0-9_-]+$/.test(name)) {
                    return interaction.reply({
                        content: '❌ O nome da macro deve conter apenas letras minúsculas, números, hífen (-) e underscore (_).',
                        flags: [MessageFlags.Ephemeral]
                    });
                }

                const changes = database.createMacro(guildId, name, content, moderatorOnly, interaction.user.id);

                return interaction.reply({
                    content: changes > 0
                        ? `✅ Macro \`!${name}\` ${moderatorOnly ? '(moderadores apenas) ' : ''}criada com sucesso.`
                        : `ℹ️ Macro \`!${name}\` já existia e foi atualizada.`,
                    flags: [MessageFlags.Ephemeral]
                });
            }

            if (subcommand === 'edit') {
                const name = interaction.options.getString('nome').toLowerCase().trim();
                const content = interaction.options.getString('conteudo');
                const moderatorOnly = interaction.options.getBoolean('moderador_only');

                const existing = database.getMacro(guildId, name);
                if (!existing) {
                    return interaction.reply({
                        content: `❌ Macro \`!${name}\` não existe. Use \`/macro create\` para criá-la.`,
                        flags: [MessageFlags.Ephemeral]
                    });
                }

                const finalModeratorOnly = moderatorOnly !== null ? moderatorOnly : existing.moderatorOnly;
                const changes = database.createMacro(guildId, name, content, finalModeratorOnly, interaction.user.id);

                return interaction.reply({
                    content: `✅ Macro \`!${name}\` atualizada com sucesso.`,
                    flags: [MessageFlags.Ephemeral]
                });
            }

            if (subcommand === 'delete') {
                const name = interaction.options.getString('nome').toLowerCase().trim();
                const changes = database.deleteMacro(guildId, name);

                return interaction.reply({
                    content: changes > 0
                        ? `🗑️ Macro \`!${name}\` removida com sucesso.`
                        : `❌ Macro \`!${name}\` não encontrada.`,
                    flags: [MessageFlags.Ephemeral]
                });
            }

            if (subcommand === 'list') {
                const macros = database.listMacros(guildId);

                if (macros.length === 0) {
                    return interaction.reply({
                        content: '📭 Nenhuma macro configurada neste servidor.',
                        flags: [MessageFlags.Ephemeral]
                    });
                }

                const lines = macros.map(m => {
                    const modBadge = m.moderatorOnly ? ' 🔒' : '';
                    return `• \`!${m.name}\`${modBadge}`;
                });

                const content = `📋 **Macros deste servidor** (${macros.length}):\n${lines.join('\n')}`;

                return interaction.reply({
                    content: content.length > 2000 ? content.substring(0, 1997) + '...' : content,
                    flags: [MessageFlags.Ephemeral]
                });
            }

            if (subcommand === 'show') {
                const name = interaction.options.getString('nome').toLowerCase().trim();
                const macro = database.getMacro(guildId, name);

                if (!macro) {
                    return interaction.reply({
                        content: `❌ Macro \`!${name}\` não encontrada.`,
                        flags: [MessageFlags.Ephemeral]
                    });
                }

                const modBadge = macro.moderatorOnly ? ' 🔒 *Apenas moderadores*' : '';
                return interaction.reply({
                    content: `📋 Macro \`!${name}\`${modBadge}:\n\`\`\`${escapeCodeBlock(macro.content)}\`\`\``,
                    flags: [MessageFlags.Ephemeral]
                });
            }

            return interaction.reply({
                content: '❌ Subcomando inválido.',
                flags: [MessageFlags.Ephemeral]
            });

        } catch (error) {
            console.error('[MACRO][ERROR] Erro no comando macro:', error);
            return interaction.reply({
                content: '❌ Ocorreu um erro ao processar o comando.',
                flags: [MessageFlags.Ephemeral]
            });
        }
    }
};
