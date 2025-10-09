/*
** caminho: commands/rank_reset.js
** últimaMod: 2025-10-09 17:24
** autor: Vico
** colaboração: Grok Code (Fast)
*/

/*
 * Comando para resetar todo o XP do servidor com confirmação interativa
 * Remove todos os pontos de XP e níveis de todos os usuários do servidor
 */

const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField,
    MessageFlags,
    ComponentType
} = require('discord.js');
const database = require('../core/database');

/**
 * Gera ID único para componentes baseado no usuário para isolamento
 */
function generateComponentId(userId, type, suffix = '') {
    return `${type}_${userId}${suffix ? '_' + suffix : ''}`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rank_reset')
        .setDescription('Reseta todo o ranking de XP do servidor (ação irreversível)')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .setDMPermission(false),

    async execute(interaction) {
        // Verificar permissões de administrador (nível mais alto)
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({
                content: '⛔ Este comando é restrito a administradores do servidor.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        // Criar confirmação com botões
        const confirmButton = new ButtonBuilder()
            .setCustomId(generateComponentId(interaction.user.id, 'confirm_reset_xp'))
            .setLabel('✅ Confirmar Reset')
            .setStyle(ButtonStyle.Danger);

        const cancelButton = new ButtonBuilder()
            .setCustomId(generateComponentId(interaction.user.id, 'cancel_reset_xp'))
            .setLabel('❌ Cancelar')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

        const reply = await interaction.reply({
            content: '⚠️ **ATENÇÃO: Esta ação é irreversível!**\n\nVocê está prestes a zerar o XP e nível de **TODOS** os usuários do servidor.\n\nTem certeza de que deseja continuar?',
            components: [row],
            flags: [MessageFlags.Ephemeral]
        });

        const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 30000 // 30 segundos para confirmar
        });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: '⛔ Apenas quem executou o comando pode interagir aqui.', ephemeral: true });
            }

            if (i.customId === generateComponentId(interaction.user.id, 'confirm_reset_xp')) {
                // Executar o reset
                const affectedUsers = database.resetarXP(interaction.guild.id);

                await i.update({
                    content: `💥 **Ranking de XP resetado com sucesso!**\n\n${affectedUsers} usuários foram afetados. Todos os XPs e níveis foram zerados.`,
                    components: []
                });
            } else if (i.customId === generateComponentId(interaction.user.id, 'cancel_reset_xp')) {
                // Cancelar
                await i.update({
                    content: '✅ Operação cancelada. Nenhum dado foi alterado.',
                    components: []
                });
            }
        });

        collector.on('end', collected => {
            if (collected.size === 0) {
                interaction.editReply({
                    content: '⏰ Tempo para confirmação expirou. Operação cancelada.',
                    components: []
                });
            }
        });
    }
};