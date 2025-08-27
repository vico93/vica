/*
** caminho: commands/config.js
** últimaMod: 2025-08-27 16:07
** autor: Vico
** colaboração: Roo Sonic
*/

/*
 * Sistema de configuração baseado em embed para o bot Vica
 * Interface organizada com dashboard principal e sub-menus categorizados
 */

const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField,
    MessageFlags,
    ComponentType,
    ChannelType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const database = require('../core/database');

// --- CONSTANTES E CONFIGURAÇÕES ---
const SESSION_TIMEOUT = 15 * 60 * 1000; // 15 minutos
const CATEGORIES = {
    CHATBOT: { id: 'chatbot', name: '🗣️ Gerenciamento do Chatbot', desc: 'Gerenciar blacklist do chatbot' },
    XP_SYSTEM: { id: 'xp_system', name: '💰 Configuração do Sistema XP', desc: 'Configurar XP e multiplicadores' },
    MESSAGES: { id: 'messages', name: '📢 Configurações de Mensagens e Canais', desc: 'Mensagens e canais do sistema' },
    MEMORIES: { id: 'memories', name: '🧠 Gerenciamento de Memórias', desc: 'Gerenciar memórias do servidor' },
    USER_CONTROLS: { id: 'user_controls', name: '👥 Controles Manuais de Usuário', desc: 'Controles manuais de usuário' }
};

// Sub-categorias para melhor organização
const MESSAGE_SUBCATEGORIES = {
    SYSTEM_CHANNEL: { id: 'system_channel', name: '📢 Canal do Sistema', desc: 'Configurar canal para mensagens automáticas' },
    ROLE_CONGRATS: { id: 'role_congrats', name: '🎉 Parabéns por Cargo', desc: 'Configurar mensagens de parabéns automáticas' }
    // JOIN_LEAVE: { id: 'join_leave', name: '🚪 Entrada/Saída', desc: 'Configurar mensagens de entrada e saída' } // Removido - funcionalidade não implementada
};

// Mapa de ações para cada categoria
const CATEGORY_ACTIONS = {
    [CATEGORIES.CHATBOT.id]: ['add_channel', 'remove_channel', 'list_channels', 'back'],
    [CATEGORIES.XP_SYSTEM.id]: ['add_channel', 'remove_channel', 'list_channels', 'set_multiplier', 'remove_multiplier', 'list_multipliers', 'back'],
    [CATEGORIES.MESSAGES.id]: ['select_subcategory', 'back'], // Agora usa sub-categorias
    [CATEGORIES.MEMORIES.id]: ['select_memory_type', 'back'],
    [CATEGORIES.USER_CONTROLS.id]: ['set_user_xp', 'reset_all_xp', 'back']
};

// Ações para cada sub-categoria de mensagens
const SUBCATEGORY_ACTIONS = {
    [MESSAGE_SUBCATEGORIES.SYSTEM_CHANNEL.id]: ['set_system_channel', 'clear_system_channel', 'back_to_messages'],
    [MESSAGE_SUBCATEGORIES.ROLE_CONGRATS.id]: ['set_role_upgrade', 'list_role_upgrades', 'back_to_messages']
    // [MESSAGE_SUBCATEGORIES.JOIN_LEAVE.id]: ['set_join_leave', 'delete_join_leave', 'list_join_leave', 'back_to_messages'] // Removido - funcionalidade não implementada
};

// --- UTILITÁRIOS ---

/**
 * Gera ID único para componentes baseado no usuário para isolamento
 */
function generateComponentId(userId, type, suffix = '') {
    return `${type}_${userId}${suffix ? '_' + suffix : ''}`;
}

/**
 * Cria embed principal do dashboard com status atual
 */
function createMainDashboardEmbed(guild) {
    const embed = new EmbedBuilder()
        .setTitle('⚙️ Painel de Configuração da Vica')
        .setDescription('Selecione uma categoria abaixo para gerenciar as configurações do bot.')
        .setColor('#0099FF')
        .setTimestamp();

    // Status do Chatbot
    const chatbotChannels = database.chatbotListarCanais(guild.id);
    embed.addFields({
        name: '🗣️ Chatbot Management',
        value: `Canais na blacklist: **${chatbotChannels.length}**`,
        inline: true
    });

    // Status do XP System
    const xpChannels = database.xpListarCanais(guild.id);
    const multipliers = database.listarMultiplicadoresRole(guild.id);
    embed.addFields({
        name: '💰 XP System',
        value: `Canais bloqueados: **${xpChannels.length}**\nMultiplicadores: **${multipliers.length}**`,
        inline: true
    });

    // Status das Mensagens
    const systemChannel = database.getSystemChannel(guild.id);
    const roleUpgrades = database.listRoleCongratsConfigs(guild.id);
    embed.addFields({
        name: '📢 Messages & Channels',
        value: `Canal sistema: ${systemChannel ? `<#${systemChannel}>` : '**Não definido**'}\nParabéns por cargo: **${roleUpgrades.length}**`,
        inline: true
    });

    // Status das Memórias
    const guildMemories = database.listarMemoriasGuild(guild.id);
    let userMemories = [];
    try {
        if (database.listarMemoriasUsuario) {
            userMemories = database.listarMemoriasUsuario(guild.id);
        }
    } catch (error) {
        console.log('[CONFIG] Função listarMemoriasUsuario não disponível');
    }

    embed.addFields({
        name: '🧠 Gerenciamento de Memórias',
        value: `Memórias do servidor: **${guildMemories.length}**\nMemórias de usuários: **${userMemories.length || 'N/A'}**`,
        inline: true
    });

    // Status dos Controles de Usuário
    const totalUsers = database.buscarRank(guild.id, 1000).length;
    embed.addFields({
        name: '👥 User Controls',
        value: `Total de usuários: **${totalUsers}**`,
        inline: true
    });

    return embed;
}

/**
 * Cria o menu de seleção de categoria
 */
function createCategorySelect(userId) {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(generateComponentId(userId, 'category_select'))
        .setPlaceholder('Escolha uma categoria para configurar...');

    Object.values(CATEGORIES).forEach(category => {
        selectMenu.addOptions({
            label: category.name,
            description: category.desc,
            value: category.id
        });
    });

    return new ActionRowBuilder().addComponents(selectMenu);
}

/**
 * Cria o menu de seleção de tipo de memória
 */
function createMemoryTypeSelect(userId) {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(generateComponentId(userId, 'memory_type_select'))
        .setPlaceholder('Escolha o tipo de memória para gerenciar...');

    selectMenu.addOptions({
        label: '🏠 Memórias do Servidor',
        description: 'Gerenciar memórias compartilhadas do servidor',
        value: 'guild_memories'
    });

    selectMenu.addOptions({
        label: '👤 Memórias de Usuários',
        description: 'Gerenciar memórias individuais de usuários',
        value: 'user_memories'
    });

    return new ActionRowBuilder().addComponents(selectMenu);
}

/**
 * Cria o menu de ações para um tipo específico de memória
 */
function createMemoryActionsSelect(userId, memoryType) {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(generateComponentId(userId, `memory_actions_select_${memoryType}`))
        .setPlaceholder('Escolha uma ação para executar...');

    const typeLabel = memoryType === 'guild_memories' ? 'do Servidor' : 'de Usuários';

    selectMenu.addOptions({
        label: `📋 Ver Lista de Memórias ${typeLabel}`,
        description: 'Listar todas as memórias',
        value: `list_${memoryType}`
    });

    selectMenu.addOptions({
        label: `➕ Adicionar Memória ${typeLabel}`,
        description: 'Adicionar uma nova memória',
        value: `add_${memoryType}`
    });

    selectMenu.addOptions({
        label: `🗑️ Remover Memória ${typeLabel}`,
        description: 'Remover uma memória existente',
        value: `delete_${memoryType}`
    });

    return new ActionRowBuilder().addComponents(selectMenu);
}

/**
 * Cria o menu de seleção de sub-categoria para mensagens
 */
function createMessageSubcategorySelect(userId) {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(generateComponentId(userId, 'message_subcategory_select'))
        .setPlaceholder('Escolha uma sub-categoria de mensagens...');

    Object.values(MESSAGE_SUBCATEGORIES).forEach(subcategory => {
        selectMenu.addOptions({
            label: subcategory.name,
            description: subcategory.desc,
            value: subcategory.id
        });
    });

    return new ActionRowBuilder().addComponents(selectMenu);
}

/**
 * Cria embed para sub-menu de categoria específica
 */
function createCategoryEmbed(categoryId, guild) {
    const category = Object.values(CATEGORIES).find(cat => cat.id === categoryId);
    if (!category) return null;

    const embed = new EmbedBuilder()
        .setTitle(`${category.name}`)
        .setDescription(`Gerencie as configurações de ${category.name.toLowerCase()}.`)
        .setColor('#0099FF')
        .setTimestamp();

    // Adicionar campos específicos baseados na categoria
    switch (categoryId) {
        case CATEGORIES.CHATBOT.id:
            const chatbotChannels = database.chatbotListarCanais(guild.id);
            embed.addFields({
                name: '📋 Status Atual',
                value: `Canais na blacklist: **${chatbotChannels.length}**`
            });
            if (chatbotChannels.length > 0) {
                embed.addFields({
                    name: '📝 Canais Bloqueados',
                    value: chatbotChannels.map(c => `- <#${c.canal_id}>`).join('\n') || 'Nenhum canal'
                });
            }
            break;

        case CATEGORIES.XP_SYSTEM.id:
            const xpChannels = database.xpListarCanais(guild.id);
            const multipliers = database.listarMultiplicadoresRole(guild.id);
            embed.addFields({
                name: '📋 Status Atual',
                value: `Canais bloqueados: **${xpChannels.length}**\nMultiplicadores: **${multipliers.length}**`
            });
            if (xpChannels.length > 0) {
                embed.addFields({
                    name: '🚫 Canais sem XP',
                    value: xpChannels.map(c => `- <#${c.canal_id}>`).join('\n') || 'Nenhum canal'
                });
            }
            if (multipliers.length > 0) {
                embed.addFields({
                    name: '✨ Multiplicadores',
                    value: multipliers.map(m => `- <@&${m.role_id}>: **${m.multiplier}x**`).join('\n') || 'Nenhum multiplicador'
                });
            }
            break;

        case CATEGORIES.MESSAGES.id:
            // Para mensagens, mostra visão geral das sub-categorias
            const systemChannel = database.getSystemChannel(guild.id);
            const roleUpgrades = database.listRoleCongratsConfigs(guild.id);
            embed.addFields({
                name: '📢 Canal do Sistema',
                value: systemChannel ? `<#${systemChannel}>` : '**Não definido**',
                inline: true
            });
            embed.addFields({
                name: '🎉 Parabéns por Cargo',
                value: `**${roleUpgrades.length}** configurações`,
                inline: true
            });
            // Entrada/Saída removido - funcionalidade não implementada
            embed.setDescription('Selecione uma sub-categoria abaixo para configurar mensagens específicas.');
            break;

        case CATEGORIES.MEMORIES.id:
            const guildMemories = database.listarMemoriasGuild(guild.id);
            let userMemories = [];
            try {
                // Try to get user memories if function exists
                if (database.listarMemoriasUsuario) {
                    userMemories = database.listarMemoriasUsuario(guild.id);
                }
            } catch (error) {
                console.log('[CONFIG] Função listarMemoriasUsuario não disponível');
            }

            embed.addFields({
                name: '📋 Status Atual',
                value: `Memórias do servidor: **${guildMemories.length}**\nMemórias de usuários: **${userMemories.length || 'N/A'}**`
            });

            if (guildMemories.length > 0) {
                embed.addFields({
                    name: '🏠 Memórias do Servidor',
                    value: guildMemories.slice(0, 3).map(m => `- ${m.titulo || m.conteudo?.substring(0, 30) + '...' || 'Sem título'}`).join('\n') + (guildMemories.length > 3 ? `\n... e mais ${guildMemories.length - 3}` : ''),
                    inline: true
                });
            }

            if (userMemories.length > 0) {
                embed.addFields({
                    name: '👤 Memórias de Usuários',
                    value: userMemories.slice(0, 3).map(m => `- ${m.titulo || m.conteudo?.substring(0, 30) + '...' || 'Sem título'}`).join('\n') + (userMemories.length > 3 ? `\n... e mais ${userMemories.length - 3}` : ''),
                    inline: true
                });
            }
            break;

        case CATEGORIES.USER_CONTROLS.id:
            const totalUsers = database.buscarRank(guild.id, 1000).length;
            embed.addFields({
                name: '📋 Status Atual',
                value: `Total de usuários no ranking: **${totalUsers}**`
            });
            break;
    }

    return embed;
}

/**
 * Cria embed para sub-categoria específica de mensagens
 */
function createSubcategoryEmbed(subcategoryId, guild) {
    const subcategory = Object.values(MESSAGE_SUBCATEGORIES).find(sub => sub.id === subcategoryId);
    if (!subcategory) return null;

    const embed = new EmbedBuilder()
        .setTitle(`${subcategory.name}`)
        .setDescription(`Gerencie as configurações de ${subcategory.name.toLowerCase()}.`)
        .setColor('#0099FF')
        .setTimestamp();

    // Adicionar campos específicos baseados na sub-categoria
    switch (subcategoryId) {
        case MESSAGE_SUBCATEGORIES.SYSTEM_CHANNEL.id:
            const systemChannel = database.getSystemChannel(guild.id);
            embed.addFields({
                name: '📋 Status Atual',
                value: `Canal sistema: ${systemChannel ? `<#${systemChannel}>` : '**Não definido**'}`
            });
            break;

        case MESSAGE_SUBCATEGORIES.ROLE_CONGRATS.id:
            const roleUpgrades = database.listRoleCongratsConfigs(guild.id);
            embed.addFields({
                name: '📋 Status Atual',
                value: `Parabéns por cargo: **${roleUpgrades.length}**`
            });
            break;

        // case MESSAGE_SUBCATEGORIES.JOIN_LEAVE.id: // Removido - funcionalidade não implementada
        //     embed.addFields({
        //         name: '📋 Status Atual',
        //         value: 'Funcionalidade em desenvolvimento'
        //     });
        //     break;
    }

    return embed;
}

/**
 * Cria componentes de ação para uma sub-categoria específica
 */
function createSubcategoryButtons(userId, subcategoryId) {
    const actions = SUBCATEGORY_ACTIONS[subcategoryId] || [];
    const buttons = [];

    actions.forEach(action => {
        let button;
        switch (action) {
            case 'back_to_messages':
                button = new ButtonBuilder()
                    .setCustomId(generateComponentId(userId, 'back_to_messages'))
                    .setLabel('⬅️ Voltar para Mensagens')
                    .setStyle(ButtonStyle.Secondary);
                break;
            case 'set_system_channel':
                button = new ButtonBuilder()
                    .setCustomId(generateComponentId(userId, 'set_system_channel'))
                    .setLabel('🔧 Definir Canal Sistema')
                    .setStyle(ButtonStyle.Success);
                break;
            case 'clear_system_channel':
                button = new ButtonBuilder()
                    .setCustomId(generateComponentId(userId, 'clear_system_channel'))
                    .setLabel('🗑️ Limpar Canal Sistema')
                    .setStyle(ButtonStyle.Danger);
                break;
            case 'set_role_upgrade':
                button = new ButtonBuilder()
                    .setCustomId(generateComponentId(userId, 'set_role_upgrade'))
                    .setLabel('🎉 Configurar Parabéns')
                    .setStyle(ButtonStyle.Success);
                break;
            case 'list_role_upgrades':
                button = new ButtonBuilder()
                    .setCustomId(generateComponentId(userId, 'list_role_upgrades'))
                    .setLabel('📋 Listar Parabéns')
                    .setStyle(ButtonStyle.Primary);
                break;
            // case 'set_join_leave': // Removido - funcionalidade não implementada
            //     button = new ButtonBuilder()
            //         .setCustomId(generateComponentId(userId, 'set_join_leave'))
            //         .setLabel('📝 Configurar Mensagens')
            //         .setStyle(ButtonStyle.Success);
            //     break;
            // case 'delete_join_leave': // Removido - funcionalidade não implementada
            //     button = new ButtonBuilder()
            //         .setCustomId(generateComponentId(userId, 'delete_join_leave'))
            //         .setLabel('❌ Remover Mensagens')
            //         .setStyle(ButtonStyle.Danger);
            //     break;
            // case 'list_join_leave': // Removido - funcionalidade não implementada
            //     button = new ButtonBuilder()
            //         .setCustomId(generateComponentId(userId, 'list_join_leave'))
            //         .setLabel('📋 Listar Mensagens')
            //         .setStyle(ButtonStyle.Primary);
            //     break;
        }

        if (button) buttons.push(button);
    });

    // Dividir botões em linhas de até 5 botões
    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    }

    return rows;
}

/**
 * Cria componentes de ação para uma categoria específica
 */
function createCategoryButtons(userId, categoryId) {
    const actions = CATEGORY_ACTIONS[categoryId] || [];

    // Tratamento especial para categoria de mensagens - usa sub-categorias
    if (categoryId === CATEGORIES.MESSAGES.id) {
        const components = [];

        actions.forEach(action => {
            switch (action) {
                case 'back':
                    const backButton = new ButtonBuilder()
                        .setCustomId(generateComponentId(userId, 'back_to_main'))
                        .setLabel('⬅️ Voltar')
                        .setStyle(ButtonStyle.Secondary);
                    components.push(new ActionRowBuilder().addComponents(backButton));
                    break;
                case 'select_subcategory':
                    components.push(createMessageSubcategorySelect(userId));
                    break;
            }
        });

        return components;
    }

    // Tratamento especial para categoria de memórias - retorna dropdowns
    if (categoryId === CATEGORIES.MEMORIES.id) {
        const components = [];

        actions.forEach(action => {
            switch (action) {
                case 'back':
                    const backButton = new ButtonBuilder()
                        .setCustomId(generateComponentId(userId, 'back_to_main'))
                        .setLabel('⬅️ Voltar')
                        .setStyle(ButtonStyle.Secondary);
                    components.push(new ActionRowBuilder().addComponents(backButton));
                    break;
                case 'select_memory_type':
                    components.push(createMemoryTypeSelect(userId));
                    break;
            }
        });

        return components;
    }

    // Para outras categorias, cria botões normalmente
    const buttons = [];

    actions.forEach(action => {
        let button;
        switch (action) {
            case 'back':
                button = new ButtonBuilder()
                    .setCustomId(generateComponentId(userId, 'back_to_main'))
                    .setLabel('⬅️ Voltar')
                    .setStyle(ButtonStyle.Secondary);
                break;
            case 'add_channel':
                button = new ButtonBuilder()
                    .setCustomId(generateComponentId(userId, `add_channel_${categoryId}`))
                    .setLabel('➕ Adicionar Canal')
                    .setStyle(ButtonStyle.Success);
                break;
            case 'remove_channel':
                button = new ButtonBuilder()
                    .setCustomId(generateComponentId(userId, `remove_channel_${categoryId}`))
                    .setLabel('➖ Remover Canal')
                    .setStyle(ButtonStyle.Danger);
                break;
            case 'list_channels':
                button = new ButtonBuilder()
                    .setCustomId(generateComponentId(userId, `list_channels_${categoryId}`))
                    .setLabel('📋 Listar Canais')
                    .setStyle(ButtonStyle.Primary);
                break;
            case 'set_multiplier':
                button = new ButtonBuilder()
                    .setCustomId(generateComponentId(userId, 'set_multiplier'))
                    .setLabel('✨ Definir Multiplicador')
                    .setStyle(ButtonStyle.Success);
                break;
            case 'remove_multiplier':
                button = new ButtonBuilder()
                    .setCustomId(generateComponentId(userId, 'remove_multiplier'))
                    .setLabel('❌ Remover Multiplicador')
                    .setStyle(ButtonStyle.Danger);
                break;
            case 'list_multipliers':
                button = new ButtonBuilder()
                    .setCustomId(generateComponentId(userId, 'list_multipliers'))
                    .setLabel('📋 Listar Multiplicadores')
                    .setStyle(ButtonStyle.Primary);
                break;
            case 'set_user_xp':
                button = new ButtonBuilder()
                    .setCustomId(generateComponentId(userId, 'set_user_xp'))
                    .setLabel('⚡ Definir XP')
                    .setStyle(ButtonStyle.Success);
                break;
            case 'reset_all_xp':
                button = new ButtonBuilder()
                    .setCustomId(generateComponentId(userId, 'reset_all_xp'))
                    .setLabel('💥 Resetar Todo XP')
                    .setStyle(ButtonStyle.Danger);
                break;
        }

        if (button) buttons.push(button);
    });

    // Dividir botões em linhas de até 5 botões
    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    }

    return rows;
}

// --- MANIPULADORES DE INTERAÇÕES ---

/**
 * Manipula seleção de categoria no menu dropdown
 */
async function handleCategorySelect(interaction) {
    const categoryId = interaction.values[0];

    // Check if this is actually a subcategory (in case routing is broken)
    const subcategory = Object.values(MESSAGE_SUBCATEGORIES).find(sub => sub.id === categoryId);
    if (subcategory) {
        // Treat as subcategory
        const embed = createSubcategoryEmbed(categoryId, interaction.guild);
        const buttons = createSubcategoryButtons(interaction.user.id, categoryId);

        if (!embed) {
            return interaction.reply({
                content: '❌ Sub-categoria não encontrada.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        await interaction.update({
            embeds: [embed],
            components: buttons
        });
        return;
    }

    // Normal category handling
    const embed = createCategoryEmbed(categoryId, interaction.guild);
    const buttons = createCategoryButtons(interaction.user.id, categoryId);

    if (!embed) {
        return interaction.reply({
            content: '❌ Categoria não encontrada.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    await interaction.update({
        embeds: [embed],
        components: buttons
    });
}

/**
 * Manipula seleção de sub-categoria de mensagens
 */
async function handleMessageSubcategorySelect(interaction) {
    const subcategoryId = interaction.values[0];
    const embed = createSubcategoryEmbed(subcategoryId, interaction.guild);
    const buttons = createSubcategoryButtons(interaction.user.id, subcategoryId);

    if (!embed) {
        return interaction.reply({
            content: '❌ Sub-categoria não encontrada.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    await interaction.update({
        embeds: [embed],
        components: buttons
    });
}

/**
 * Manipula clique em botões
 */
async function handleButtonClick(interaction) {
    const customId = interaction.customId;
    const userId = interaction.user.id;

    // Botão de voltar ao menu principal
    if (customId === generateComponentId(userId, 'back_to_main')) {
        const embed = createMainDashboardEmbed(interaction.guild);
        const selectMenu = createCategorySelect(userId);

        return interaction.update({
            embeds: [embed],
            components: [selectMenu]
        });
    }

    // Botão de voltar para categoria de mensagens
    if (customId === generateComponentId(userId, 'back_to_messages')) {
        const embed = createCategoryEmbed(CATEGORIES.MESSAGES.id, interaction.guild);
        const buttons = createCategoryButtons(userId, CATEGORIES.MESSAGES.id);

        return interaction.update({
            embeds: [embed],
            components: buttons
        });
    }

    // Botão de editar parabéns por cargo
    if (customId.includes('edit_role_upgrade_')) {
        return handleEditRoleUpgrade(interaction);
    }

    // Botão de excluir parabéns por cargo
    if (customId.includes('delete_role_upgrade_')) {
        return handleDeleteRoleUpgrade(interaction);
    }

    // Botão de confirmar exclusão de parabéns
    if (customId.includes('confirm_delete_role_')) {
        const roleId = customId.split('_').pop();
        const changes = database.clearRoleCongratsConfig(interaction.guild.id, roleId);
        const role = interaction.guild.roles.cache.get(roleId);

        if (changes > 0) {
            const embed = new EmbedBuilder()
                .setTitle('✅ Exclusão Concluída')
                .setDescription(`A configuração de parabéns para o cargo ${role ? role.toString() : `<@&${roleId}>`} foi excluída com sucesso.`)
                .setColor('#00AA00')
                .setTimestamp();

            const backButton = new ButtonBuilder()
                .setCustomId(generateComponentId(userId, 'back_to_messages'))
                .setLabel('⬅️ Voltar')
                .setStyle(ButtonStyle.Secondary);

            return interaction.update({
                embeds: [embed],
                components: [new ActionRowBuilder().addComponents(backButton)]
            });
        } else {
            return interaction.update({
                content: '⚠️ Não foi possível excluir a configuração.',
                embeds: [],
                components: []
            });
        }
    }

    // Botão de cancelar exclusão
    if (customId === generateComponentId(userId, 'cancel_delete_role')) {
        const embed = new EmbedBuilder()
            .setTitle('❌ Operação Cancelada')
            .setDescription('A exclusão da configuração foi cancelada.')
            .setColor('#666666')
            .setTimestamp();

        const backButton = new ButtonBuilder()
            .setCustomId(generateComponentId(userId, 'back_to_messages'))
            .setLabel('⬅️ Voltar')
            .setStyle(ButtonStyle.Secondary);

        return interaction.update({
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(backButton)]
        });
    }

    // Botão de voltar aos tipos de memória
    if (customId === generateComponentId(userId, 'back_to_memory_types')) {
        const embed = createCategoryEmbed(CATEGORIES.MEMORIES.id, interaction.guild);
        const memoryTypeSelect = createMemoryTypeSelect(userId);
        const backButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(generateComponentId(userId, 'back_to_main'))
                .setLabel('⬅️ Voltar')
                .setStyle(ButtonStyle.Secondary)
        );

        return interaction.update({
            embeds: [embed],
            components: [memoryTypeSelect, backButton]
        });
    }

    // Manipular ações específicas de cada categoria
    const categoryId = customId.split('_').pop(); // Extrair categoria do ID
    const action = customId.replace(`_${userId}_`, '').replace(`_${categoryId}`, '').replace(`${userId}_`, '');

    console.log('[CONFIG] Action extracted:', action);
    console.log('[CONFIG] CategoryId extracted:', categoryId);

    switch (action) {
        case 'add_channel':
            await handleAddChannel(interaction, categoryId);
            break;
        case 'remove_channel':
            await handleRemoveChannel(interaction, categoryId);
            break;
        case 'list_channels':
            await handleListChannels(interaction, categoryId);
            break;
        case 'set_multiplier':
            await handleSetMultiplier(interaction);
            break;
        case 'remove_multiplier':
            await handleRemoveMultiplier(interaction);
            break;
        case 'list_multipliers':
            await handleListMultipliers(interaction);
            break;
        case 'set_system_channel':
            console.log('[CONFIG] Chamando handleSetSystemChannel');
            await handleSetSystemChannel(interaction);
            break;
        case 'clear_system_channel':
            await handleClearSystemChannel(interaction);
            break;
        case 'set_role_upgrade':
            await handleSetRoleUpgrade(interaction);
            break;
        case 'delete_role_upgrade':
            await handleDeleteRoleUpgrade(interaction);
            break;
        case 'list_role_upgrades':
            await handleListRoleUpgrades(interaction);
            break;
        // case 'set_join_leave': // Removido - funcionalidade não implementada
        //     await handleSetJoinLeave(interaction);
        //     break;
        // case 'delete_join_leave': // Removido - funcionalidade não implementada
        //     await handleDeleteJoinLeave(interaction);
        //     break;
        // case 'list_join_leave': // Removido - funcionalidade não implementada
        //     await handleListJoinLeave(interaction);
        //     break;
        case 'set_user_xp':
            await handleSetUserXP(interaction);
            break;
        case 'reset_all_xp':
            await handleResetAllXP(interaction);
            break;
        default:
            await interaction.reply({
                content: '❌ Ação não reconhecida.',
                flags: [MessageFlags.Ephemeral]
            });
    }
}

/**
 * Manipula seleção de tipo de memória
 */
async function handleMemoryTypeSelect(interaction) {
    const memoryType = interaction.values[0];
    const userId = interaction.user.id;

    const embed = createCategoryEmbed(CATEGORIES.MEMORIES.id, interaction.guild);
    const actionsSelect = createMemoryActionsSelect(userId, memoryType);
    const backButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(generateComponentId(userId, 'back_to_memory_types'))
            .setLabel('⬅️ Voltar aos Tipos')
            .setStyle(ButtonStyle.Secondary)
    );

    await interaction.update({
        embeds: [embed],
        components: [actionsSelect, backButton]
    });
}

/**
 * Manipula seleção de ação de memória
 */
async function handleMemoryActionsSelect(interaction) {
    const action = interaction.values[0];
    const userId = interaction.user.id;

    switch (action) {
        case 'list_guild_memories':
            await handleListGuildMemories(interaction);
            break;
        case 'add_guild_memories':
            await handleAddGuildMemory(interaction);
            break;
        case 'delete_guild_memories':
            await handleDeleteGuildMemory(interaction);
            break;
        case 'list_user_memories':
            await handleListUserMemories(interaction);
            break;
        case 'add_user_memories':
            await handleAddUserMemory(interaction);
            break;
        case 'delete_user_memories':
            await handleDeleteUserMemory(interaction);
            break;
        default:
            await interaction.reply({
                content: '❌ Ação de memória não reconhecida.',
                flags: [MessageFlags.Ephemeral]
            });
    }
}

// --- HANDLERS PARA AÇÕES ESPECÍFICAS ---

/**
 * Manipula adição de canal à blacklist
 */
async function handleAddChannel(interaction, categoryId) {
    const channels = interaction.guild.channels.cache
        .filter(c => c.type === ChannelType.GuildText)
        .map(c => ({
            label: c.name,
            value: c.id,
            description: `ID: ${c.id}`
        }));

    if (channels.length === 0) {
        return interaction.reply({
            content: '❌ Nenhum canal de texto encontrado no servidor.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(generateComponentId(interaction.user.id, `add_channel_select_${categoryId}`))
        .setPlaceholder('Selecione um canal para adicionar')
        .addOptions(channels.slice(0, 25));

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const reply = await interaction.reply({
        content: `Selecione o canal para adicionar à blacklist de ${categoryId === CATEGORIES.CHATBOT.id ? 'chatbot' : 'XP'}:`,
        components: [row],
        flags: [MessageFlags.Ephemeral]
    });

    const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 60000
    });

    collector.on('collect', i => {
        if (i.user.id !== interaction.user.id) {
            return i.reply({ content: '⛔ Apenas quem executou o comando pode interagir aqui.', ephemeral: true });
        }

        const channelId = i.values[0];
        let changes = 0;

        if (categoryId === CATEGORIES.CHATBOT.id) {
            changes = database.chatbotAdicionarCanal(interaction.guild.id, channelId);
        } else if (categoryId === CATEGORIES.XP_SYSTEM.id) {
            changes = database.xpAdicionarCanal(interaction.guild.id, channelId);
        }

        const channel = interaction.guild.channels.cache.get(channelId);
        const type = categoryId === CATEGORIES.CHATBOT.id ? 'chatbot' : 'XP';

        if (changes > 0) {
            i.update({
                content: `✅ O canal ${channel} foi adicionado à blacklist de **${type}**.`,
                components: []
            });
        } else {
            i.update({
                content: `⚠️ O canal ${channel} já estava na blacklist de **${type}**.`,
                components: []
            });
        }
    });

    collector.on('end', collected => {
        if (collected.size === 0) {
            interaction.editReply({ content: '⏰ O tempo para selecionar um canal expirou.', components: [] });
        }
    });
}

/**
 * Manipula remoção de canal da blacklist
 */
async function handleRemoveChannel(interaction, categoryId) {
    let channels = [];

    if (categoryId === CATEGORIES.CHATBOT.id) {
        channels = database.chatbotListarCanais(interaction.guild.id);
    } else if (categoryId === CATEGORIES.XP_SYSTEM.id) {
        channels = database.xpListarCanais(interaction.guild.id);
    }

    if (channels.length === 0) {
        return interaction.reply({
            content: `ℹ️ Nenhum canal encontrado na blacklist de ${categoryId === CATEGORIES.CHATBOT.id ? 'chatbot' : 'XP'}.`,
            flags: [MessageFlags.Ephemeral]
        });
    }

    const options = channels.map(c => {
        const channel = interaction.guild.channels.cache.get(c.canal_id);
        return {
            label: channel ? channel.name : `ID: ${c.canal_id}`,
            value: c.canal_id,
            description: channel ? `ID: ${c.canal_id}` : 'Canal não encontrado'
        };
    });

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(generateComponentId(interaction.user.id, `remove_channel_select_${categoryId}`))
        .setPlaceholder('Selecione um canal para remover')
        .addOptions(options.slice(0, 25));

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const reply = await interaction.reply({
        content: `Selecione o canal para remover da blacklist de ${categoryId === CATEGORIES.CHATBOT.id ? 'chatbot' : 'XP'}:`,
        components: [row],
        flags: [MessageFlags.Ephemeral]
    });

    const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 60000
    });

    collector.on('collect', i => {
        if (i.user.id !== interaction.user.id) {
            return i.reply({ content: '⛔ Apenas quem executou o comando pode interagir aqui.', ephemeral: true });
        }

        const channelId = i.values[0];
        let changes = 0;

        if (categoryId === CATEGORIES.CHATBOT.id) {
            changes = database.chatbotRemoverCanal(interaction.guild.id, channelId);
        } else if (categoryId === CATEGORIES.XP_SYSTEM.id) {
            changes = database.xpRemoverCanal(interaction.guild.id, channelId);
        }

        const channel = interaction.guild.channels.cache.get(channelId);
        const type = categoryId === CATEGORIES.CHATBOT.id ? 'chatbot' : 'XP';

        if (changes > 0) {
            i.update({
                content: `👍 O canal ${channel || `ID: ${channelId}`} foi removido da blacklist de **${type}**.`,
                components: []
            });
        } else {
            i.update({
                content: `⚠️ O canal ${channel || `ID: ${channelId}`} não estava na blacklist de **${type}**.`,
                components: []
            });
        }
    });

    collector.on('end', collected => {
        if (collected.size === 0) {
            interaction.editReply({ content: '⏰ O tempo para selecionar um canal expirou.', components: [] });
        }
    });
}

/**
 * Manipula listagem de canais na blacklist
 */
async function handleListChannels(interaction, categoryId) {
    let channels = [];
    let title = '';

    switch (categoryId) {
        case CATEGORIES.CHATBOT.id:
            channels = database.chatbotListarCanais(interaction.guild.id);
            title = '🚫 Canais na Blacklist do Chatbot';
            break;
        case CATEGORIES.XP_SYSTEM.id:
            channels = database.xpListarCanais(interaction.guild.id);
            title = '🚫 Canais sem XP';
            break;
        default:
            return interaction.reply({
                content: '❌ Categoria não suportada para listagem de canais.',
                flags: [MessageFlags.Ephemeral]
            });
    }

    if (channels.length === 0) {
        return interaction.reply({
            content: `ℹ️ Nenhum canal encontrado na blacklist para ${categoryId}.`,
            flags: [MessageFlags.Ephemeral]
        });
    }

    const lista = channels.map(c => `- <#${c.canal_id}>`).join('\n');

    await interaction.reply({
        content: `**${title}:**\n${lista}`,
        flags: [MessageFlags.Ephemeral]
    });
}

/**
 * Manipula definição de multiplicador de XP
 */
async function handleSetMultiplier(interaction) {
    const roles = interaction.guild.roles.cache
        .filter(r => r.id !== interaction.guild.id) // Exclui @everyone
        .map(r => ({
            label: r.name,
            value: r.id,
            description: `ID: ${r.id}`
        }));

    if (roles.length === 0) {
        return interaction.reply({
            content: '❌ Nenhum cargo encontrado no servidor.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(generateComponentId(interaction.user.id, 'set_multiplier_role_select'))
        .setPlaceholder('Selecione um cargo para definir multiplicador')
        .addOptions(roles.slice(0, 25));

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const reply = await interaction.reply({
        content: 'Selecione o cargo para definir o multiplicador de XP:',
        components: [row],
        flags: [MessageFlags.Ephemeral]
    });

    const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 60000
    });

    collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) {
            return i.reply({ content: '⛔ Apenas quem executou o comando pode interagir aqui.', ephemeral: true });
        }

        const roleId = i.values[0];
        const role = interaction.guild.roles.cache.get(roleId);

        // Criar modal para input do multiplicador
        const modal = new ModalBuilder()
            .setCustomId(generateComponentId(interaction.user.id, `set_multiplier_modal_${roleId}`))
            .setTitle(`Definir Multiplicador para ${role.name}`);

        const multiplierInput = new TextInputBuilder()
            .setCustomId('multiplier_value')
            .setLabel('Multiplicador de XP (ex: 1.5 para 50% bônus)')
            .setPlaceholder('Digite um número maior que 0 (ex: 1.5)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(10);

        const firstActionRow = new ActionRowBuilder().addComponents(multiplierInput);
        modal.addComponents(firstActionRow);

        await i.showModal(modal);
    });

    collector.on('end', collected => {
        if (collected.size === 0) {
            interaction.editReply({ content: '⏰ O tempo para selecionar um cargo expirou.', components: [] });
        }
    });
}

/**
 * Manipula remoção de multiplicador de XP
 */
async function handleRemoveMultiplier(interaction) {
    await interaction.reply({
        content: 'Funcionalidade de remover multiplicador - Implementação pendente',
        flags: [MessageFlags.Ephemeral]
    });
}

/**
 * Manipula listagem de multiplicadores de XP
 */
async function handleListMultipliers(interaction) {
    const multipliers = database.listarMultiplicadoresRole(interaction.guild.id);

    if (multipliers.length === 0) {
        return interaction.reply({
            content: 'ℹ️ Nenhum multiplicador de XP configurado.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    const lista = multipliers.map(m => `- <@&${m.role_id}>: **${m.multiplier}x**`).join('\n');

    await interaction.reply({
        content: `**✨ Multiplicadores de XP por cargo:**\n${lista}`,
        flags: [MessageFlags.Ephemeral]
    });
}

/**
 * Manipula definição de canal do sistema
 */
/**
 * Manipula definição de canal do sistema
 */
async function handleSetSystemChannel(interaction) {
    console.log('[CONFIG] Iniciando handleSetSystemChannel para usuário:', interaction.user.tag);

    const channels = interaction.guild.channels.cache
        .filter(c => c.type === ChannelType.GuildText)
        .map(c => ({
            label: c.name,
            value: c.id,
            description: `ID: ${c.id}`
        }));

    if (channels.length === 0) {
        return interaction.reply({
            content: '❌ Nenhum canal de texto encontrado no servidor.',
            flags: [MessageFlags.Ephemeral],
        });
    }

    const customId = generateComponentId(interaction.user.id, 'set_system_channel_select');
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder('Selecione um canal para mensagens do sistema')
        .addOptions(channels.slice(0, 25));

    const row = new ActionRowBuilder().addComponents(selectMenu);

    // Usamos 'update' aqui porque estamos respondendo a um clique de botão
    await interaction.update({
        content: 'Selecione o canal onde as mensagens de sistema (como level up) serão enviadas:',
        components: [row],
    });

    try {
        // Criamos um filtro para garantir que apenas o usuário original possa interagir
        const filter = (i) => i.customId === customId && i.user.id === interaction.user.id;

        // Aguardamos pela interação no menu dropdown por 60 segundos
        const selectInteraction = await interaction.channel.awaitMessageComponent({
            filter,
            componentType: ComponentType.StringSelect,
            time: 60000
        });

        const channelId = selectInteraction.values[0];
        const channel = interaction.guild.channels.cache.get(channelId);

        if (!channel) {
            return selectInteraction.update({
                content: '❌ O canal selecionado não existe mais ou não está disponível.',
                components: []
            });
        }

        database.setSystemChannel(interaction.guild.id, channelId);

        // Sucesso! Atualizamos a mensagem final
        await selectInteraction.update({
            content: `✅ Beleza! De agora em diante, enviarei mensagens de sistema no canal ${channel}.`,
            components: []
        });

    } catch (error) {
        // Se o erro for um 'InteractionCollectorError', significa que o tempo esgotou
        if (error.name === 'InteractionCollectorError') {
            await interaction.editReply({
                content: '⏰ O tempo para selecionar um canal expirou. A operação foi cancelada.',
                components: []
            });
        } else {
            // Outros erros inesperados
            console.error('[CONFIG][ERROR] Erro ao aguardar componente do canal de sistema:', error);
            await interaction.editReply({
                content: '❌ Ocorreu um erro inesperado. Tente novamente.',
                components: []
            });
        }
    }
}

/**
 * Manipula limpeza do canal do sistema
 */
async function handleClearSystemChannel(interaction) {
    const changes = database.setSystemChannel(interaction.guild.id, null);

    if (changes > 0) {
        await interaction.reply({
            content: '✅ Canal de sistema limpo com sucesso! As mensagens voltarão aos canais originais.',
            flags: [MessageFlags.Ephemeral]
        });
    } else {
        await interaction.reply({
            content: 'ℹ️ Nenhum canal de sistema estava configurado.',
            flags: [MessageFlags.Ephemeral]
        });
    }
}

/**
 * Manipula submissões de modais
 */
async function handleModalSubmit(interaction) {
    const customId = interaction.customId;
    const userId = interaction.user.id;

    if (customId.includes('set_multiplier_modal_')) {
        // Manipular modal de multiplicador
        const roleId = customId.split('_').pop();
        const multiplierValue = interaction.fields.getTextInputValue('multiplier_value');

        const multiplier = parseFloat(multiplierValue);
        if (isNaN(multiplier) || multiplier <= 0) {
            return interaction.reply({
                content: '❌ O multiplicador deve ser um número maior que zero.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        const changes = database.definirMultiplicadorRole(interaction.guild.id, roleId, multiplier);
        const role = interaction.guild.roles.cache.get(roleId);

        if (changes > 0) {
            await interaction.reply({
                content: `✅ O cargo ${role} agora tem um multiplicador de XP de **${multiplier}x**.`,
                flags: [MessageFlags.Ephemeral]
            });
        } else {
            await interaction.reply({
                content: `⚠️ O multiplicador do cargo ${role} foi atualizado para **${multiplier}x**.`,
                flags: [MessageFlags.Ephemeral]
            });
        }

    } else if (customId.includes('set_role_upgrade_modal_')) {
        // Manipular modal de parabéns por cargo
        const roleId = customId.split('_').pop();
        const prompt = interaction.fields.getTextInputValue('role_upgrade_prompt');

        if (!prompt || !prompt.trim()) {
            return interaction.reply({
                content: '❌ O prompt não pode estar vazio.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        const trimmed = prompt.trim();
        if (trimmed.length < 5) {
            return interaction.reply({
                content: '❌ O prompt é muito curto — escreva pelo menos 5 caracteres.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        // Detect if we're updating an existing entry for this role
        const existing = database.listRoleCongratsConfigs(interaction.guild.id).find(c => c.roleId === roleId);
        const wasUpdate = !!existing;

        database.setRoleCongratsConfig(interaction.guild.id, roleId, trimmed);
        const role = interaction.guild.roles.cache.get(roleId);

        const total = database.listRoleCongratsConfigs(interaction.guild.id).length;

        await interaction.reply({
            content: `✅ Configuração ${wasUpdate ? 'atualizada' : 'salva'}! Quando alguém receber o cargo ${role}, enviarei uma mensagem de parabéns usando o prompt informado. Use \`{USER}\` no prompt para mencionar o nome do usuário.\n\nℹ️ Agora existem **${total}** configurações de parabéns por cargo neste servidor.`,
            flags: [MessageFlags.Ephemeral]
        });

    } else if (customId.includes('edit_role_upgrade_modal_')) {
        // Manipular modal de edição de parabéns por cargo
        const roleId = customId.split('_').pop();
        const prompt = interaction.fields.getTextInputValue('edit_role_upgrade_prompt');

        if (!prompt || !prompt.trim()) {
            return interaction.reply({
                content: '❌ O prompt não pode estar vazio.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        const trimmed = prompt.trim();
        if (trimmed.length < 5) {
            return interaction.reply({
                content: '❌ O prompt é muito curto — escreva pelo menos 5 caracteres.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        database.setRoleCongratsConfig(interaction.guild.id, roleId, trimmed);
        const role = interaction.guild.roles.cache.get(roleId);

        const embed = new EmbedBuilder()
            .setTitle('✅ Configuração Editada')
            .setDescription(`A configuração de parabéns para o cargo ${role ? role.toString() : `<@&${roleId}>`} foi atualizada com sucesso!`)
            .setColor('#00AA00')
            .addFields({
                name: '📝 Novo Prompt',
                value: trimmed.length > 500 ? trimmed.slice(0, 497) + '...' : trimmed
            })
            .setTimestamp();

        const backButton = new ButtonBuilder()
            .setCustomId(generateComponentId(interaction.user.id, 'back_to_messages'))
            .setLabel('⬅️ Voltar')
            .setStyle(ButtonStyle.Secondary);

        await interaction.reply({
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(backButton)],
            flags: [MessageFlags.Ephemeral]
        });

    } else if (customId.includes('set_user_memory_modal_')) {
        // Manipular modal de memória de usuário
        const userIdToAdd = customId.split('_').pop();
        const memory = interaction.fields.getTextInputValue('user_memory');

        if (!memory || !memory.trim()) {
            return interaction.reply({
                content: '❌ A memória não pode estar vazia.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        const result = database.adicionarMemoriaUsuario(
            interaction.guild.id,
            userIdToAdd,
            memory.trim(),
            { sourceMessageId: interaction.id, createdAt: Date.now() }
        );

        const user = await interaction.guild.members.fetch(userIdToAdd);

        if (result.duplicate) {
            await interaction.reply({
                content: `ℹ️ Esta memória já existia para ${user} e não foi duplicada.`,
                flags: [MessageFlags.Ephemeral]
            });
        } else {
            await interaction.reply({
                content: `✅ Memória adicionada para ${user}.`,
                flags: [MessageFlags.Ephemeral]
            });
        }

    } else if (customId.includes('add_guild_memory_modal')) {
        // Manipular modal de memória da guild
        const memory = interaction.fields.getTextInputValue('guild_memory');

        if (!memory || !memory.trim()) {
            return interaction.reply({
                content: '❌ A memória não pode estar vazia.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        database.adicionarMemoriaGuild(interaction.guild.id, memory.trim());

        await interaction.reply({
            content: '✅ Memória do servidor salva com sucesso!',
            flags: [MessageFlags.Ephemeral]
        });

    } else if (customId.includes('set_user_xp_modal_')) {
        // Manipular modal de definição de XP
        const userIdToSet = customId.split('_').pop();
        const xpValue = interaction.fields.getTextInputValue('user_xp_value');

        const xp = parseInt(xpValue);
        if (isNaN(xp) || xp < 0) {
            return interaction.reply({
                content: '❌ O valor de XP deve ser um número inteiro maior ou igual a zero.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        const level = Math.floor(xp / 1000);
        database.definirXP(interaction.guild.id, userIdToSet, xp);
        const user = await interaction.guild.members.fetch(userIdToSet);

        await interaction.reply({
            content: `✅ O XP de ${user} foi definido para **${xp}** (Nível ${level}).`,
            flags: [MessageFlags.Ephemeral]
        });
    }
}

/**
 * Manipula configuração de parabéns por cargo
 */
async function handleSetRoleUpgrade(interaction) {
    const roles = interaction.guild.roles.cache
        .filter(r => r.id !== interaction.guild.id) // Exclui @everyone
        .map(r => ({
            label: r.name,
            value: r.id,
            description: `ID: ${r.id}`
        }));

    if (roles.length === 0) {
        return interaction.reply({
            content: '❌ Nenhum cargo encontrado no servidor.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(generateComponentId(interaction.user.id, 'set_role_upgrade_select'))
        .setPlaceholder('Selecione um cargo para parabéns')
        .addOptions(roles.slice(0, 25));

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const reply = await interaction.reply({
        content: 'Selecione o cargo que ativará os parabéns automáticos:',
        components: [row],
        flags: [MessageFlags.Ephemeral]
    });

    const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 60000
    });

    collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) {
            return i.reply({ content: '⛔ Apenas quem executou o comando pode interagir aqui.', ephemeral: true });
        }

        const roleId = i.values[0];
        const role = interaction.guild.roles.cache.get(roleId);

        // Criar modal para input do prompt
        const modal = new ModalBuilder()
            .setCustomId(generateComponentId(interaction.user.id, `set_role_upgrade_modal_${roleId}`))
            .setTitle(`Configurar Parabéns para ${role.name}`);

        const promptInput = new TextInputBuilder()
            .setCustomId('role_upgrade_prompt')
            .setLabel('Prompt para a IA (use {USER} para o nome do usuário)')
            .setPlaceholder('Ex: Parabéns {USER} por alcançar o cargo de {ROLE}!')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMinLength(5)
            .setMaxLength(500);

        const firstActionRow = new ActionRowBuilder().addComponents(promptInput);
        modal.addComponents(firstActionRow);

        await i.showModal(modal);
    });

    collector.on('end', collected => {
        if (collected.size === 0) {
            interaction.editReply({ content: '⏰ O tempo para selecionar um cargo expirou.', components: [] });
        }
    });
}

/**
 * Manipula remoção de parabéns por cargo
 */
async function handleDeleteRoleUpgrade(interaction) {
    const roleId = interaction.customId.split('_').pop();

    const role = interaction.guild.roles.cache.get(roleId);
    const roleName = role ? role.name : 'Cargo não encontrado';

    // Criar confirmação
    const confirmButton = new ButtonBuilder()
        .setCustomId(generateComponentId(interaction.user.id, `confirm_delete_role_${roleId}`))
        .setLabel('✅ Confirmar Exclusão')
        .setStyle(ButtonStyle.Danger);

    const cancelButton = new ButtonBuilder()
        .setCustomId(generateComponentId(interaction.user.id, 'cancel_delete_role'))
        .setLabel('❌ Cancelar')
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

    const embed = new EmbedBuilder()
        .setTitle('🗑️ Confirmar Exclusão')
        .setDescription(`Tem certeza de que deseja excluir a configuração de parabéns para o cargo **${roleName}**?\n\nEsta ação não pode ser desfeita.`)
        .setColor('#FF4444')
        .setTimestamp();

    await interaction.reply({
        embeds: [embed],
        components: [row],
        flags: [MessageFlags.Ephemeral]
    });
}

/**
 * Manipula edição de parabéns por cargo
 */
async function handleEditRoleUpgrade(interaction) {
    const roleId = interaction.customId.split('_').pop();
    const configs = database.listRoleCongratsConfigs(interaction.guild.id);
    const config = configs.find(c => c.roleId === roleId);

    if (!config) {
        return interaction.reply({
            content: '❌ Configuração não encontrada.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    const role = interaction.guild.roles.cache.get(roleId);

    // Criar modal para editar o prompt
    const modal = new ModalBuilder()
        .setCustomId(generateComponentId(interaction.user.id, `edit_role_upgrade_modal_${roleId}`))
        .setTitle(`Editar Parabéns para ${role?.name || 'Cargo'}`);

    const promptInput = new TextInputBuilder()
        .setCustomId('edit_role_upgrade_prompt')
        .setLabel('Prompt para a IA (use {USER} para o nome do usuário)')
        .setPlaceholder('Ex: Parabéns {USER} por alcançar o cargo de {ROLE}!')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMinLength(5)
        .setMaxLength(500)
        .setValue(config.prompt);

    const firstActionRow = new ActionRowBuilder().addComponents(promptInput);
    modal.addComponents(firstActionRow);

    await interaction.showModal(modal);
}

/**
 * Manipula listagem de parabéns por cargo com embeds e botões de ação
 */
async function handleListRoleUpgrades(interaction) {
    const configs = database.listRoleCongratsConfigs(interaction.guild.id);

    if (!configs || configs.length === 0) {
        const embed = new EmbedBuilder()
            .setTitle('🎉 Parabéns por Cargo')
            .setDescription('Nenhuma configuração de parabéns por cargo encontrada.\n\nUse o botão abaixo para criar a primeira configuração.')
            .setColor('#FFA500')
            .setTimestamp();

        const addButton = new ButtonBuilder()
            .setCustomId(generateComponentId(interaction.user.id, 'set_role_upgrade'))
            .setLabel('➕ Criar Primeiro Parabéns')
            .setStyle(ButtonStyle.Success);

        const backButton = new ButtonBuilder()
            .setCustomId(generateComponentId(interaction.user.id, 'back_to_messages'))
            .setLabel('⬅️ Voltar')
            .setStyle(ButtonStyle.Secondary);

        return interaction.reply({
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(addButton, backButton)],
            flags: [MessageFlags.Ephemeral]
        });
    }

    // Criar embeds para cada configuração (até 10 por página para não exceder limites)
    const embeds = [];
    const actionRows = [];

    configs.slice(0, 10).forEach((config, index) => {
        const role = interaction.guild.roles.cache.get(config.roleId);
        const roleName = role ? role.name : 'Cargo não encontrado';
        const roleMention = role ? role.toString() : `<@&${config.roleId}>`;

        const embed = new EmbedBuilder()
            .setTitle(`🎉 Parabéns para ${roleName}`)
            .setDescription(config.prompt.length > 1024 ? config.prompt.slice(0, 1021) + '...' : config.prompt)
            .setColor(role ? role.color || '#0099FF' : '#0099FF')
            .addFields({
                name: '📋 Detalhes',
                value: `**Cargo:** ${roleMention}\n**ID do Cargo:** \`${config.roleId}\`\n**Comprimento:** ${config.prompt.length} caracteres`,
                inline: false
            })
            .setTimestamp();

        embeds.push(embed);

        // Botões de ação para cada configuração
        const editButton = new ButtonBuilder()
            .setCustomId(generateComponentId(interaction.user.id, `edit_role_upgrade_${config.roleId}`))
            .setLabel('✏️ Editar')
            .setStyle(ButtonStyle.Primary);

        const deleteButton = new ButtonBuilder()
            .setCustomId(generateComponentId(interaction.user.id, `delete_role_upgrade_${config.roleId}`))
            .setLabel('🗑️ Excluir')
            .setStyle(ButtonStyle.Danger);

        actionRows.push(new ActionRowBuilder().addComponents(editButton, deleteButton));
    });

    // Botão para adicionar novo
    const addButton = new ButtonBuilder()
        .setCustomId(generateComponentId(interaction.user.id, 'set_role_upgrade'))
        .setLabel('➕ Novo Parabéns')
        .setStyle(ButtonStyle.Success);

    const backButton = new ButtonBuilder()
        .setCustomId(generateComponentId(interaction.user.id, 'back_to_messages'))
        .setLabel('⬅️ Voltar')
        .setStyle(ButtonStyle.Secondary);

    actionRows.push(new ActionRowBuilder().addComponents(addButton, backButton));

    await interaction.reply({
        embeds: embeds,
        components: actionRows,
        flags: [MessageFlags.Ephemeral]
    });
}

/**
 * Manipula configuração de mensagens de entrada/saída
 */
async function handleSetJoinLeave(interaction) {
    await interaction.reply({
        content: 'Funcionalidade de configurar mensagens - Implementação pendente',
        flags: [MessageFlags.Ephemeral]
    });
}

/**
 * Manipula remoção de mensagens de entrada/saída
 */
async function handleDeleteJoinLeave(interaction) {
    await interaction.reply({
        content: 'Funcionalidade de remover mensagens - Implementação pendente',
        flags: [MessageFlags.Ephemeral]
    });
}

/**
 * Manipula listagem de mensagens de entrada/saída
 */
async function handleListJoinLeave(interaction) {
    const typeNames = {
        'welcome': 'Welcome',
        'leave': 'Leave',
        'leave_kick': 'Leave (Kick)',
        'leave_ban': 'Leave (Ban)'
    };

    const messages = [];
    for (const [key, name] of Object.entries(typeNames)) {
        const msg = database.getMessageByType(interaction.guild.id, key);
        if (msg && msg.message) {
            const status = msg.isPrompt ? '🤖 Prompt' : '📝 Fixa';
            const preview = msg.message.length > 50 ? msg.message.slice(0, 47) + '...' : msg.message;
            messages.push(`**${name}:** ${status} - ${preview}`);
        } else {
            messages.push(`**${name}:** ❌ Não configurada`);
        }
    }

    if (messages.length === 0) {
        return interaction.reply({
            content: 'ℹ️ Nenhuma mensagem configurada.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    await interaction.reply({
        content: `**📋 Configurações de Mensagens:**\n${messages.join('\n')}`,
        flags: [MessageFlags.Ephemeral]
    });
}

/**
 * Manipula listagem de memórias de usuário
 */
async function handleListUserMemories(interaction) {
    await interaction.reply({
        content: 'Funcionalidade de listar memórias de usuário - Implementação pendente',
        flags: [MessageFlags.Ephemeral]
    });
}

/**
 * Manipula adição de memória de usuário
 */
async function handleAddUserMemory(interaction) {
    const users = interaction.guild.members.cache
        .filter(m => !m.user.bot)
        .map(m => ({
            label: m.displayName,
            value: m.id,
            description: `ID: ${m.id}`
        }));

    if (users.length === 0) {
        return interaction.reply({
            content: '❌ Nenhum usuário encontrado no servidor.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(generateComponentId(interaction.user.id, 'add_user_memory_select'))
        .setPlaceholder('Selecione um usuário para adicionar memória')
        .addOptions(users.slice(0, 25));

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const reply = await interaction.reply({
        content: 'Selecione o usuário para adicionar uma memória:',
        components: [row],
        flags: [MessageFlags.Ephemeral]
    });

    const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 60000
    });

    collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) {
            return i.reply({ content: '⛔ Apenas quem executou o comando pode interagir aqui.', ephemeral: true });
        }

        const userId = i.values[0];
        const user = await interaction.guild.members.fetch(userId);

        // Criar modal para input da memória
        const modal = new ModalBuilder()
            .setCustomId(generateComponentId(interaction.user.id, `set_user_memory_modal_${userId}`))
            .setTitle(`Adicionar Memória para ${user.displayName}`);

        const memoryInput = new TextInputBuilder()
            .setCustomId('user_memory')
            .setLabel('Memória a ser adicionada')
            .setPlaceholder('Digite a informação que o bot deve lembrar sobre este usuário')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(500);

        const firstActionRow = new ActionRowBuilder().addComponents(memoryInput);
        modal.addComponents(firstActionRow);

        await i.showModal(modal);
    });

    collector.on('end', collected => {
        if (collected.size === 0) {
            interaction.editReply({ content: '⏰ O tempo para selecionar um usuário expirou.', components: [] });
        }
    });
}

/**
 * Manipula listagem de memórias da guild
 */
async function handleListGuildMemories(interaction) {
    const memories = database.listarMemoriasGuild(interaction.guild.id);

    if (!memories || memories.length === 0) {
        return interaction.reply({
            content: 'ℹ️ O servidor ainda não possui memórias salvas.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    const lista = memories.map((m, i) => `${i + 1}. \`${m.fact.slice(0, 150)}\``).join('\n');

    await interaction.reply({
        content: `**🧠 Memórias do Servidor:**\n${lista}`,
        flags: [MessageFlags.Ephemeral]
    });
}

/**
 * Manipula adição de memória da guild
 */
async function handleAddGuildMemory(interaction) {
    // Criar modal para input da memória da guild
    const modal = new ModalBuilder()
        .setCustomId(generateComponentId(interaction.user.id, 'add_guild_memory_modal'))
        .setTitle('Adicionar Memória do Servidor');

    const memoryInput = new TextInputBuilder()
        .setCustomId('guild_memory')
        .setLabel('Memória a ser adicionada')
        .setPlaceholder('Digite uma informação importante sobre o servidor que o bot deve lembrar')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(1000);

    const firstActionRow = new ActionRowBuilder().addComponents(memoryInput);
    modal.addComponents(firstActionRow);

    await interaction.showModal(modal);
}

/**
 * Manipula remoção de memória da guild
 */
async function handleDeleteGuildMemory(interaction) {
    const memories = database.listarMemoriasGuild(interaction.guild.id);

    if (!memories || memories.length === 0) {
        return interaction.reply({
            content: 'ℹ️ Não há memórias para remover.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    const options = memories.map(m => ({
        label: m.fact.slice(0, 100),
        value: m.id.toString(),
        description: `ID: ${m.id}`
    }));

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(generateComponentId(interaction.user.id, 'delete_guild_memory_select'))
        .setPlaceholder('Selecione uma memória para apagar')
        .addOptions(options.slice(0, 25));

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const reply = await interaction.reply({
        content: 'Selecione a memória do servidor que você deseja apagar:',
        components: [row],
        flags: [MessageFlags.Ephemeral]
    });

    const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 60000
    });

    collector.on('collect', i => {
        if (i.user.id !== interaction.user.id) {
            return i.reply({ content: '⛔ Apenas quem executou o comando pode interagir aqui.', ephemeral: true });
        }

        const memoryId = parseInt(i.values[0], 10);
        const changes = database.removerMemoriaGuild(interaction.guild.id, memoryId);

        if (changes > 0) {
            i.update({ content: '✅ Memória removida com sucesso!', components: [] });
        } else {
            i.update({ content: '⚠️ A memória não foi encontrada ou já havia sido removida.', components: [] });
        }
    });

    collector.on('end', collected => {
        if (collected.size === 0) {
            interaction.editReply({ content: '⏰ O tempo para selecionar uma memória expirou.', components: [] });
        }
    });
}

/**
 * Manipula definição de XP de usuário
 */
async function handleSetUserXP(interaction) {
    const users = interaction.guild.members.cache
        .filter(m => !m.user.bot)
        .map(m => ({
            label: m.displayName,
            value: m.id,
            description: `ID: ${m.id}`
        }));

    if (users.length === 0) {
        return interaction.reply({
            content: '❌ Nenhum usuário encontrado no servidor.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(generateComponentId(interaction.user.id, 'set_user_xp_select'))
        .setPlaceholder('Selecione um usuário para definir XP')
        .addOptions(users.slice(0, 25));

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const reply = await interaction.reply({
        content: 'Selecione o usuário para definir o XP:',
        components: [row],
        flags: [MessageFlags.Ephemeral]
    });

    const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 60000
    });

    collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) {
            return i.reply({ content: '⛔ Apenas quem executou o comando pode interagir aqui.', ephemeral: true });
        }

        const userId = i.values[0];
        const user = await interaction.guild.members.fetch(userId);

        // Criar modal para input do XP
        const modal = new ModalBuilder()
            .setCustomId(generateComponentId(interaction.user.id, `set_user_xp_modal_${userId}`))
            .setTitle(`Definir XP para ${user.displayName}`);

        const xpInput = new TextInputBuilder()
            .setCustomId('user_xp_value')
            .setLabel('Valor de XP (número inteiro)')
            .setPlaceholder('Digite o valor total de XP (ex: 5000)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(10);

        const firstActionRow = new ActionRowBuilder().addComponents(xpInput);
        modal.addComponents(firstActionRow);

        await i.showModal(modal);
    });

    collector.on('end', collected => {
        if (collected.size === 0) {
            interaction.editReply({ content: '⏰ O tempo para selecionar um usuário expirou.', components: [] });
        }
    });
}

/**
 * Manipula reset de todo XP do servidor
 */
async function handleResetAllXP(interaction) {
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

// --- COMANDO PRINCIPAL ---

module.exports = {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('Painel de configuração do bot Vica com interface baseada em embed.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .setDMPermission(false),

    async execute(interaction) {
        // Verificar permissões de administrador
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({
                content: '⛔ Este comando é restrito a administradores do servidor.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        try {
            console.log(`[CONFIG] Usuário ${interaction.user.tag} acessou o painel de configuração`);

            // Criar dashboard principal
            const embed = createMainDashboardEmbed(interaction.guild);
            const selectMenu = createCategorySelect(interaction.user.id);

            const reply = await interaction.reply({
                embeds: [embed],
                components: [selectMenu]
            });

            // Configurar coletor de interações com timeout
            const collector = reply.createMessageComponentCollector({
                time: SESSION_TIMEOUT
            });

            collector.on('collect', async i => {
                console.log('[CONFIG] Main collector recebeu interação');
                console.log('[CONFIG] Tipo de interação:', i.constructor.name);
                console.log('[CONFIG] CustomId:', i.customId);
                console.log('[CONFIG] Usuário:', i.user.tag);

                if (i.user.id !== interaction.user.id) {
                    console.log('[CONFIG] Usuário incorreto tentou interagir');
                    return i.reply({
                        content: '⛔ Apenas quem executou o comando pode interagir aqui.',
                        ephemeral: true
                    });
                }

                try {
                    if (i.isStringSelectMenu()) {
                        console.log('[CONFIG] Processando StringSelectMenu');
                        const customId = i.customId;
                        console.log('[CONFIG] CustomId analisado:', customId);

                        if (customId.includes('category_select')) {
                            console.log('[CONFIG] Chamando handleCategorySelect');
                            await handleCategorySelect(i);
                        } else if (customId.includes('memory_type_select')) {
                            console.log('[CONFIG] Chamando handleMemoryTypeSelect');
                            await handleMemoryTypeSelect(i);
                        } else if (customId.includes('memory_actions_select')) {
                            console.log('[CONFIG] Chamando handleMemoryActionsSelect');
                            await handleMemoryActionsSelect(i);
                        } else if (customId.includes('message_subcategory_select')) {
                            console.log('[CONFIG] Chamando handleMessageSubcategorySelect');
                            await handleMessageSubcategorySelect(i);
                        } else if (customId.includes('set_system_channel_select')) {
                            console.log('[CONFIG] Detectado set_system_channel_select - esta interação deve ser tratada pelo collector interno');
                            // Esta interação deve ser tratada pelo collector interno do handleSetSystemChannel
                            // Não fazer nada aqui para evitar conflito
                        } else {
                            console.log('[CONFIG] CustomId não reconhecido, chamando handleCategorySelect por padrão');
                            await handleCategorySelect(i);
                        }
                    } else if (i.isButton()) {
                        console.log('[CONFIG] Processando Button');
                        await handleButtonClick(i);
                    } else if (i.isModalSubmit()) {
                        console.log('[CONFIG] Processando ModalSubmit');
                        await handleModalSubmit(i);
                    } else {
                        console.log('[CONFIG] Tipo de interação não reconhecido:', i.constructor.name);
                    }
                } catch (error) {
                    console.error('[CONFIG][ERROR] Erro ao processar interação:', error);
                    console.error('[CONFIG][ERROR] Stack trace:', error.stack);
                    await i.reply({
                        content: '❌ Ocorreu um erro ao processar sua solicitação.',
                        flags: [MessageFlags.Ephemeral]
                    });
                }
            });

            collector.on('end', collected => {
                console.log(`[CONFIG] Sessão expirada para ${interaction.user.tag} após ${collected.size} interações`);
            });

        } catch (error) {
            console.error('[CONFIG][ERROR] Erro na execução do comando:', error);
            await interaction.reply({
                content: '❌ Ocorreu um erro ao carregar o painel de configuração.',
                flags: [MessageFlags.Ephemeral]
            });
        }
    }
};