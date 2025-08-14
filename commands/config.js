// Arquivo: commands/config.js

const { SlashCommandBuilder, PermissionsBitField, MessageFlags, ChannelType } = require('discord.js');
const database = require('../core/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('Configurações avançadas da Vica.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .setDMPermission(false)
        // Grupo de comandos para a blacklist do CHATBOT
        .addSubcommandGroup(group => group
            .setName('blacklist_chatbot')
            .setDescription('Gerencia os canais onde a Vica não pode interagir.')
            .addSubcommand(sub => sub.setName('add').setDescription('Adiciona um canal à blacklist do chatbot.').addChannelOption(opt => opt.setName('canal').setDescription('O canal a ser adicionado.').setRequired(true)))
            .addSubcommand(sub => sub.setName('remove').setDescription('Remove um canal da blacklist do chatbot.').addChannelOption(opt => opt.setName('canal').setDescription('O canal a ser removido.').setRequired(true)))
            .addSubcommand(sub => sub.setName('list').setDescription('Lista os canais na blacklist do chatbot.')))
        // Grupo de comandos para a blacklist de XP
        .addSubcommandGroup(group => group
            .setName('blacklist_xp')
            .setDescription('Gerencia os canais onde não se ganha XP.')
            .addSubcommand(sub => sub.setName('add').setDescription('Adiciona um canal à blacklist de XP.').addChannelOption(opt => opt.setName('canal').setDescription('O canal a ser adicionado.').setRequired(true)))
            .addSubcommand(sub => sub.setName('remove').setDescription('Remove um canal da blacklist de XP.').addChannelOption(opt => opt.setName('canal').setDescription('O canal a ser removido.').setRequired(true)))
            .addSubcommand(sub => sub.setName('list').setDescription('Lista os canais na blacklist de XP.')))
        // Grupo de comandos para os multiplicadores de XP
        .addSubcommandGroup(group => group
            .setName('xp_multipliers')
            .setDescription('Gerencia os multiplicadores de XP por cargo.')
            .addSubcommand(sub => sub.setName('set').setDescription('Define um multiplicador de XP para um cargo.').addRoleOption(opt => opt.setName('cargo').setDescription('O cargo que receberá o bônus.').setRequired(true)).addNumberOption(opt => opt.setName('multiplicador').setDescription('Ex: 1.5 para 50% de bônus.').setRequired(true)))
            .addSubcommand(sub => sub.setName('remove').setDescription('Remove o multiplicador de XP de um cargo.').addRoleOption(opt => opt.setName('cargo').setDescription('O cargo a ser removido.').setRequired(true)))
            .addSubcommand(sub => sub.setName('list').setDescription('Lista todos os multiplicadores de XP configurados.')))
        // Grupo de comandos para gerenciamento de XP
        .addSubcommandGroup(group => group
            .setName('xp_management')
            .setDescription('Gerenciamento manual de XP de usuários.')
            .addSubcommand(sub => sub
                .setName('set')
                .setDescription('Define o valor exato de XP para um usuário.')
                .addUserOption(opt => opt.setName('usuario').setDescription('O usuário a ser modificado.').setRequired(true))
                .addIntegerOption(opt => opt.setName('valor').setDescription('O novo valor total de XP.').setRequired(true).setMinValue(0)))
            .addSubcommand(sub => sub
                .setName('reset_all')
                .setDescription('⚠️ ATENÇÃO: Zera o XP e o nível de TODOS os membros do servidor.')))
        // --- NOVO GRUPO DE COMANDOS PARA GERENCIAR CANAIS ---
        .addSubcommandGroup(group => group
            .setName('canais')
            .setDescription('Gerencia os canais padrão do bot.')
            .addSubcommand(sub => sub
                .setName('set_sistema')
                .setDescription('Define o canal para onde as mensagens de sistema (ex: level up) serão enviadas.')
                .addChannelOption(opt => opt.setName('canal').setDescription('O canal de texto desejado.').setRequired(true).addChannelTypes(ChannelType.GuildText)))
            .addSubcommand(sub => sub
                .setName('clear_sistema')
                .setDescription('Limpa o canal de sistema (mensagens voltarão a ser enviadas no canal de origem).')))
        // Grupo de comandos para parabéns por cargo
        .addSubcommandGroup(group => group
            .setName('role_congrats')
            .setDescription('Gerencia parabéns automáticos quando usuários recebem cargos específicos.')
            .addSubcommand(sub => sub
                .setName('set')
                .setDescription('Configura parabéns automáticos para um cargo específico.')
                .addRoleOption(opt => opt.setName('cargo').setDescription('O cargo que ativará os parabéns.').setRequired(true))
                .addStringOption(opt => opt.setName('prompt').setDescription('Prompt para a IA (use {USER} para o nome do usuário).').setRequired(true).setMaxLength(500)))
            .addSubcommand(sub => sub
                .setName('clear')
                .setDescription('Remove a configuração de parabéns por cargo.'))
            .addSubcommand(sub => sub
                .setName('show')
                .setDescription('Mostra a configuração atual de parabéns por cargo.')))
        // Subcomando raiz para inspeção de memórias
        .addSubcommand(sub => sub
            .setName('list_memories')
            .setDescription('Lista as memórias salvas de um usuário.')
            .addUserOption(opt => opt
                .setName('usuario')
                .setDescription('O usuário alvo.')
                .setRequired(true)
            ))
        // Subcomando raiz para adicionar memória
        .addSubcommand(sub => sub
            .setName('add_memories')
            .setDescription('Adiciona uma memória de longo prazo para um usuário.')
            .addUserOption(opt => opt
                .setName('usuario')
                .setDescription('O usuário alvo.')
                .setRequired(true)
            )
            .addStringOption(opt => opt
                .setName('memoria')
                .setDescription('O conteúdo da memória a ser salva.')
                .setRequired(true)
                .setMaxLength(500)
            )),


    async execute(interaction) {
        const group = interaction.options.getSubcommandGroup(false);
        const subcommand = interaction.options.getSubcommand(false);

        // Defesa extra: garantir que apenas administradores executem /config
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: '⛔ Este comando é restrito a administradores do servidor.', flags: [MessageFlags.Ephemeral] });
        }

        try {
            // Lógica para o grupo "blacklist_chatbot"
            if (group === 'blacklist_chatbot') {
                const canal = interaction.options.getChannel('canal');
                if (subcommand === 'add') {
                    database.chatbotAdicionarCanal(interaction.guild.id, canal.id);
                    return interaction.reply({ content: `✅ O canal ${canal} foi adicionado à blacklist do **chatbot**.`, flags: [MessageFlags.Ephemeral] });
                }
                if (subcommand === 'remove') {
                    database.chatbotRemoverCanal(interaction.guild.id, canal.id);
                    return interaction.reply({ content: `👍 O canal ${canal} foi removido da blacklist do **chatbot**.`, flags: [MessageFlags.Ephemeral] });
                }
                if (subcommand === 'list') {
                    const canais = database.chatbotListarCanais(interaction.guild.id);
                    if (canais.length === 0) return interaction.reply({ content: 'ℹ️ Não há canais na blacklist do chatbot.', flags: [MessageFlags.Ephemeral] });
                    const lista = canais.map(c => `- <#${c.canal_id}>`).join('\n');
                    return interaction.reply({ content: `**🚫 Canais na blacklist do chatbot:**\n${lista}`, flags: [MessageFlags.Ephemeral] });
                }
            }

            // Lógica para o grupo "blacklist_xp"
            if (group === 'blacklist_xp') {
                const canal = interaction.options.getChannel('canal');
                if (subcommand === 'add') {
                    database.xpAdicionarCanal(interaction.guild.id, canal.id);
                    return interaction.reply({ content: `✅ O canal ${canal} foi adicionado à blacklist de **XP**.`, flags: [MessageFlags.Ephemeral] });
                }
                if (subcommand === 'remove') {
                    database.xpRemoverCanal(interaction.guild.id, canal.id);
                    return interaction.reply({ content: `👍 O canal ${canal} foi removido da blacklist de **XP**.`, flags: [MessageFlags.Ephemeral] });
                }
                if (subcommand === 'list') {
                    const canais = database.xpListarCanais(interaction.guild.id);
                    if (canais.length === 0) return interaction.reply({ content: 'ℹ️ Não há canais na blacklist de XP.', flags: [MessageFlags.Ephemeral] });
                    const lista = canais.map(c => `- <#${c.canal_id}>`).join('\n');
                    return interaction.reply({ content: `**🚫 Canais onde não se ganha XP:**\n${lista}`, flags: [MessageFlags.Ephemeral] });
                }
            }

            // Lógica para o grupo "xp_multipliers"
            if (group === 'xp_multipliers') {
                const cargo = interaction.options.getRole('cargo');
                if (subcommand === 'set') {
                    const multiplicador = interaction.options.getNumber('multiplicador');
                    if (multiplicador <= 0) return interaction.reply({ content: '❌ O multiplicador deve ser um número maior que zero.', flags: [MessageFlags.Ephemeral] });
                    database.definirMultiplicadorRole(interaction.guild.id, cargo.id, multiplicador);
                    return interaction.reply({ content: `✅ O cargo ${cargo} agora tem um multiplicador de XP de **${multiplicador}x**.`, flags: [MessageFlags.Ephemeral] });
                }
                if (subcommand === 'remove') {
                    database.removerMultiplicadorRole(interaction.guild.id, cargo.id);
                    return interaction.reply({ content: `👍 O multiplicador de XP do cargo ${cargo} foi removido.`, flags: [MessageFlags.Ephemeral] });
                }
                if (subcommand === 'list') {
                    const multiplicadores = database.listarMultiplicadoresRole(interaction.guild.id);
                    if (multiplicadores.length === 0) return interaction.reply({ content: 'ℹ️ Não há multiplicadores de XP configurados para cargos.', flags: [MessageFlags.Ephemeral] });
                    const lista = multiplicadores.map(m => `- <@&${m.role_id}>: **${m.multiplier}x**`).join('\n');
                    return interaction.reply({ content: `**✨ Multiplicadores de XP por cargo:**\n${lista}`, flags: [MessageFlags.Ephemeral] });
                }
            }

            // Lógica para gerenciamento de XP
            if (group === 'xp_management') {
                if (subcommand === 'set') {
                    const usuario = interaction.options.getUser('usuario');
                    const valor = interaction.options.getInteger('valor');
                    const nivel = Math.floor(valor / 1000);

                    database.definirXP(interaction.guild.id, usuario.id, valor);

                    return interaction.reply({ content: `✅ O XP de ${usuario} foi definido para **${valor}** (Nível ${nivel}).`, flags: [MessageFlags.Ephemeral] });
                }
                if (subcommand === 'reset_all') {
                    const membrosResetados = database.resetarXP(interaction.guild.id);
                    return interaction.reply({ content: `💥 **O ranking de XP do servidor foi completamente resetado!** ${membrosResetados} membros foram afetados.`, flags: [MessageFlags.Ephemeral] });
                }
            }
// --- NOVA LÓGICA PARA GERENCIAR CANAIS DO SISTEMA ---
if (group === 'canais') {
    if (subcommand === 'set_sistema') {
        const canal = interaction.options.getChannel('canal');
        database.setSystemChannel(interaction.guild.id, canal.id);
        return interaction.reply({ content: `✅ Beleza! De agora em diante, enviarei mensagens de sistema (como level up) no canal ${canal}.`, flags: [MessageFlags.Ephemeral] });
    }
    if (subcommand === 'clear_sistema') {
        // Passando null para limpar a configuração
        database.setSystemChannel(interaction.guild.id, null);
        return interaction.reply({ content: `👍 Canal de sistema limpo. As mensagens de sistema voltarão a ser enviadas nos canais onde acontecem.`, flags: [MessageFlags.Ephemeral] });
    }
}

// --- SUBCOMANDO RAIZ: list_memories ---
if (!group && subcommand === 'list_memories') {
    const usuario = interaction.options.getUser('usuario');
    const mems = database.listarMemoriasUsuario(interaction.guild.id, usuario.id, 50, 0);
    if (!mems || mems.length === 0) {
        // Preferir apelido (displayName) quando possível
        const member = interaction.guild?.members?.cache?.get(usuario.id) || null;
        const apelido = member?.displayName || usuario.username;
        return interaction.reply({ content: `ℹ️ Usuário **${apelido}** ainda não tem memórias de longo prazo salvas!`, flags: [MessageFlags.Ephemeral] });
    }
    const lista = mems.map(m => `- ${m.fact}`).join('\n');
    return interaction.reply({ content: `🧠 Memórias de ${usuario}:\n${lista}`, flags: [MessageFlags.Ephemeral] });
}

// --- SUBCOMANDO RAIZ: add_memories ---
if (!group && subcommand === 'add_memories') {
    const usuario = interaction.options.getUser('usuario');
    const memoria = interaction.options.getString('memoria');
    if (!memoria || !memoria.trim()) {
        return interaction.reply({ content: '❌ A memória não pode estar vazia.', flags: [MessageFlags.Ephemeral] });
    }
    const r = database.adicionarMemoriaUsuario(
        interaction.guild.id,
        usuario.id,
        memoria.trim(),
        { sourceMessageId: interaction.id, createdAt: Date.now() }
    );
    if (r.duplicate) {
        return interaction.reply({ content: `ℹ️ Esta memória já existia para ${usuario} e não foi duplicada.`, flags: [MessageFlags.Ephemeral] });
    }
    return interaction.reply({ content: `✅ Memória adicionada para ${usuario}.`, flags: [MessageFlags.Ephemeral] });
}

// --- LÓGICA PARA ROLE CONGRATS ---
if (group === 'role_congrats') {
    if (subcommand === 'set') {
        const cargo = interaction.options.getRole('cargo');
        const prompt = interaction.options.getString('prompt');
        
        if (!prompt || !prompt.trim()) {
            return interaction.reply({ content: '❌ O prompt não pode estar vazio.', flags: [MessageFlags.Ephemeral] });
        }
        const trimmed = prompt.trim();
        if (trimmed.length < 5) return interaction.reply({ content: '❌ O prompt é muito curto — escreva pelo menos 5 caracteres.', flags: [MessageFlags.Ephemeral] });
        if (trimmed.length > 500) return interaction.reply({ content: '❌ O prompt é muito longo — máximo de 500 caracteres.', flags: [MessageFlags.Ephemeral] });

        // Detect if we're updating an existing entry for this role
        const existing = database.listRoleCongratsConfigs(interaction.guild.id).find(c => c.roleId === cargo.id);
        const wasUpdate = !!existing;

        database.setRoleCongratsConfig(interaction.guild.id, cargo.id, trimmed);

        const total = database.listRoleCongratsConfigs(interaction.guild.id).length;

        return interaction.reply({
            content: `✅ Configuração ${wasUpdate ? 'atualizada' : 'salva'}! Quando alguém receber o cargo ${cargo}, enviarei uma mensagem de parabéns usando o prompt informado. Use \`{USER}\` no prompt para mencionar o nome do usuário.\n\nℹ️ Agora existem **${total}** configurações de parabéns por cargo neste servidor.`,
            flags: [MessageFlags.Ephemeral]
        });
    }
    
    if (subcommand === 'clear') {
        // Allow optional role argument to clear only one; if none provided, clear all
        const roleToClear = interaction.options.getRole('cargo');
        if (roleToClear) {
            database.clearRoleCongratsConfig(interaction.guild.id, roleToClear.id);
            return interaction.reply({ content: `👍 Configuração de parabéns para o cargo ${roleToClear} foi removida.`, flags: [MessageFlags.Ephemeral] });
        }
        database.clearRoleCongratsConfig(interaction.guild.id);
        return interaction.reply({ content: `👍 Todas as configurações de parabéns por cargo foram limpas.`, flags: [MessageFlags.Ephemeral] });
    }
    
    if (subcommand === 'show') {
        const configs = database.listRoleCongratsConfigs(interaction.guild.id);
        if (!configs || configs.length === 0) {
            return interaction.reply({ content: 'ℹ️ Não há configuração de parabéns por cargo definida para este servidor.', flags: [MessageFlags.Ephemeral] });
        }

        const lines = configs.map(c => {
            const role = interaction.guild.roles.cache.get(c.roleId);
            const roleMention = role ? role.toString() : `<@&${c.roleId}> (cargo não encontrado)`;
            const prompt = c.prompt.length > 300 ? c.prompt.slice(0, 297) + '...' : c.prompt;
            return `**${roleMention}** — ${prompt}`;
        });

        return interaction.reply({ content: `**🎉 Configurações de parabéns por cargo:**\n${lines.join('\n')}`, flags: [MessageFlags.Ephemeral] });
    }
}

} catch (err) {
            console.error(`[CONFIG] Erro no comando /config:`, err);
            return interaction.reply({ content: '❌ Ocorreu um erro ao executar esta configuração.', flags: [MessageFlags.Ephemeral] });
        }
    }
};