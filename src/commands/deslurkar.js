/*
** caminho: commands/deslurkar.js
** autor: Vico
** colaboração: Gemini
*/

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, ComponentType } = require('discord.js');
const database = require('../core/database');

function generateComponentId(userId, type) {
    return `${type}_${userId}`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('deslurkar')
        .setDescription('Kicka membros inativos sem cargo há mais de 1 semana.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .setDMPermission(false),

    async execute(interaction) {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({
                content: '⛔ Este comando é restrito a administradores do servidor.',
                ephemeral: true
            });
        }

        const confirmButton = new ButtonBuilder()
            .setCustomId(generateComponentId(interaction.user.id, 'confirm_deslurk'))
            .setLabel('✅ Confirmar Kick')
            .setStyle(ButtonStyle.Danger);

        const cancelButton = new ButtonBuilder()
            .setCustomId(generateComponentId(interaction.user.id, 'cancel_deslurk'))
            .setLabel('❌ Cancelar')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

        const reply = await interaction.reply({
            content: '⚠️ **ATENÇÃO: Esta ação é massiva e pode ser destrutiva!**\n\nVocê está prestes a kickar todos os membros **sem cargo** que não enviam uma mensagem há 7 dias ou mais.\n\nTem certeza de que deseja continuar?',
            components: [row],
            ephemeral: true
        });

        const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 30000 // 30 segundos
        });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: '⛔ Apenas quem executou o comando pode interagir aqui.', ephemeral: true });
            }

            if (i.customId === generateComponentId(interaction.user.id, 'confirm_deslurk')) {
                await i.update({ content: '⌛ Processando... Isso pode levar alguns minutos.', components: [] });

                try {
                    const guild = interaction.guild;
                    const allMembers = await guild.members.fetch();
                    const usersData = database.buscarTodosUsuariosXP(guild.id);
                    const usersXPMap = new Map(usersData.map(u => [u.usuario_id, u]));
                    
                    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
                    let kickedCount = 0;

                    const membersToKick = [];

                    for (const member of allMembers.values()) {
                        if (member.user.bot) continue;
                        if (member.roles.cache.size > 1) continue; // Ignora membros com cargos (além do @everyone)

                        const userData = usersXPMap.get(member.id);

                        if (!userData || userData.ultima_mensagem_timestamp < oneWeekAgo) {
                            membersToKick.push(member);
                        }
                    }

                    for (const member of membersToKick) {
                        try {
                            await member.kick('Lurker!');
                            kickedCount++;
                        } catch (err) {
                            console.error(`Falha ao kickar ${member.user.tag} (${member.id}):`, err.message);
                        }
                    }

                    await i.editReply({
                        content: `✅ Operação concluída! ${kickedCount} membros foram kickados por inatividade.`, 
                        components: []
                    });

                } catch (err) {
                    console.error('[DESLURKAR][ERROR]', err);
                    await i.editReply({
                        content: `❌ Erro ao executar o comando: ${err.message}`,
                        components: []
                    });
                }
            } else if (i.customId === generateComponentId(interaction.user.id, 'cancel_deslurk')) {
                await i.update({
                    content: '✅ Operação cancelada. Nenhum membro foi kickado.',
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
