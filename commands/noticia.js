/*
** caminho: commands/noticia.js
** últimaMod: 2025-10-04 01:15
** autor: Vico
** colaboração: Grok Code (Fast) e Claude
*/

/*
 * Comando para postar notícias em um canal designado
 * Permite aos membros compartilhar URLs que são automaticamente formatadas
 * com metadados OpenGraph e postadas via webhook
 */

const {
    SlashCommandBuilder,
    MessageFlags,
    ChannelType,
    WebhookClient
} = require('discord.js');
const database = require('../core/database');
const fetch = require('node-fetch');

/* ----------------------------------------------------------
//    Funções auxiliares
---------------------------------------------------------- */

/**
 * Valida se a string é uma URL válida
 */
function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
        return false;
    }
}

/**
 * Extrai metadados OpenGraph do HTML
 */
function extractOpenGraphData(html) {
    const ogTitleMatch = html.match(
        /<meta[^>]*(?:property=["']og:title["'][^>]*content=["']([^"']*)["']|content=["']([^"']*)["'][^>]*property=["']og:title["'])[^>]*>/i
    );
    const ogDescriptionMatch = html.match(
        /<meta[^>]*(?:property=["']og:description["'][^>]*content=["']([^"']*)["']|content=["']([^"']*)["'][^>]*property=["']og:description["'])[^>]*>/i
    );

    // Sanitiza e normaliza texto
    const sanitize = (text) => {
        if (!text) return null;
        return text
            .replace(/\s+/g, ' ')
            .trim();
    };

    return {
        title: sanitize(ogTitleMatch ? (ogTitleMatch[1] || ogTitleMatch[2]) : null),
        description: sanitize(ogDescriptionMatch ? (ogDescriptionMatch[1] || ogDescriptionMatch[2]) : null)
    };
}

/**
 * Busca metadados OpenGraph de uma URL
 */
async function fetchOpenGraphData(url) {
    try {
        console.log('[NOTICIA][INFO] Buscando metadados OpenGraph para:', url);

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; VicaBot/1.0)'
            },
            timeout: 10000
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const html = await response.text();
        const ogData = extractOpenGraphData(html);

        console.log('[NOTICIA][INFO] Metadados extraídos:', ogData);
        return ogData;

    } catch (error) {
        console.error('[NOTICIA][ERROR] Falha ao buscar metadados OpenGraph:', error.message);
        return { title: null, description: null };
    }
}

/* ----------------------------------------------------------
//    Comando principal
---------------------------------------------------------- */

module.exports = {
    data: new SlashCommandBuilder()
        .setName('noticia')
        .setDescription('Posta uma notícia no canal designado do servidor')
        .addStringOption(option =>
            option.setName('url')
                .setDescription('URL da notícia para compartilhar')
                .setRequired(true)
        ),

    async execute(interaction) {
        const url = interaction.options.getString('url');
        const guildId = interaction.guild.id;
        const member = interaction.member;

        try {
            // Validação da URL
            if (!isValidUrl(url)) {
                return interaction.reply({
                    content: '❌ Por favor, forneça uma URL válida (começando com http:// ou https://).',
                    flags: [MessageFlags.Ephemeral]
                });
            }

            // Verificar se há canal de notícias configurado
            const newsChannelId = database.getNewsChannel(guildId);
            if (!newsChannelId) {
                return interaction.reply({
                    content: '❌ Nenhum canal de notícias foi configurado para este servidor. Peça aos moderadores para configurar um canal usando o comando `/canal-noticia`.',
                    flags: [MessageFlags.Ephemeral]
                });
            }

            // Buscar o canal de notícias
            const newsChannel = interaction.guild.channels.cache.get(newsChannelId);
            if (!newsChannel) {
                console.error('[NOTICIA][ERROR] Canal de notícias não encontrado:', newsChannelId);
                return interaction.reply({
                    content: '❌ O canal de notícias configurado não foi encontrado. Peça aos moderadores para reconfigurar o canal.',
                    flags: [MessageFlags.Ephemeral]
                });
            }

            // Verificar se há webhook configurado
            const webhookData = database.getWebhook(guildId);
            if (!webhookData || !webhookData.id) {
                return interaction.reply({
                    content: '❌ Nenhum webhook foi configurado para o canal de notícias. Peça aos moderadores para reconfigurar usando `/canal-noticia`.',
                    flags: [MessageFlags.Ephemeral]
                });
            }

            // Buscar metadados OpenGraph
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

            const ogData = await fetchOpenGraphData(url);

            // Preparar conteúdo da mensagem
            const rawTitle = (ogData.title || `Notícia by ${member.displayName}`).replace(/\s+/g, ' ').trim();
            const title = rawTitle.length > 100 ? rawTitle.substring(0, 97) + '...' : rawTitle;
            const description = ogData.description ? `${ogData.description}\n\n➡️ ${url}` : `➡️ ${url}`;

            console.log('[NOTICIA][DEBUG] Título final:', title, '(', title.length, 'chars)');

            // Postar via webhook
            try {
                const webhookClient = new WebhookClient({
                    id: webhookData.id,
                    token: webhookData.token
                });

                let webhookMessage;

                // Para canais de FÓRUM: usar threadName
                if (newsChannel.type === ChannelType.GuildForum) {
                    console.log('[NOTICIA][INFO] Postando em canal de fórum via webhook');

                    webhookMessage = await webhookClient.send({
                        content: description,
                        username: member.displayName,
                        avatarURL: member.user.displayAvatarURL({ dynamic: true }),
                        threadName: title,  // Cria nova thread com este nome
                        wait: true
                    });

                    console.log('[NOTICIA][INFO] Thread criado via webhook:', webhookMessage.id);

                } else {
                    // Para canais de TEXTO: postar normalmente
                    console.log('[NOTICIA][INFO] Postando em canal de texto via webhook');

                    webhookMessage = await webhookClient.send({
                        content: `**${title}**\n\n${description}`,
                        username: member.displayName,
                        avatarURL: member.user.displayAvatarURL({ dynamic: true }),
                        wait: true
                    });

                    console.log('[NOTICIA][INFO] Mensagem postada via webhook:', webhookMessage.id);
                }

                // Postar menção ao autor (como o bot)
                if (newsChannel.type === ChannelType.GuildForum) {
                    // Para fóruns, buscar a thread criada pelo webhook
                    const threadId = webhookMessage.id; // O ID retornado é o ID da thread
                    try {
                        const thread = await interaction.guild.channels.fetch(threadId);
                        if (thread) {
                            await thread.send({
                                content: `Aí ${member}`
                            });
                        }
                    } catch (threadError) {
                        console.error('[NOTICIA][WARN] Não foi possível postar menção na thread:', threadError.message);
                    }
                } else {
                    // Para canais de texto, responder à mensagem
                    await newsChannel.send({
                        content: `Aí ${member}`,
                        reply: { messageReference: webhookMessage.id }
                    });
                }

                // Responder ao usuário
                await interaction.editReply({
                    content: `✅ Notícia postada com sucesso no ${newsChannel}!`
                });

            } catch (webhookError) {
                console.error('[NOTICIA][ERROR] Falha ao enviar via webhook:', webhookError);
                
                // Mensagem de erro mais específica
                let errorMsg = '❌ Erro ao postar notícia via webhook.';
                if (webhookError.code === 10015) {
                    errorMsg += ' O webhook não existe mais. Peça aos moderadores para reconfigurar o canal.';
                } else if (webhookError.message?.includes('thread_name')) {
                    errorMsg += ' Verifique se o webhook tem permissões para criar threads.';
                }

                return interaction.editReply({ content: errorMsg });
            }

        } catch (error) {
            console.error('[NOTICIA][ERROR] Erro geral no comando noticia:', error);
            const replyContent = '❌ Ocorreu um erro inesperado. Tente novamente mais tarde.';

            if (interaction.deferred) {
                return interaction.editReply(replyContent);
            } else {
                return interaction.reply({
                    content: replyContent,
                    flags: [MessageFlags.Ephemeral]
                });
            }
        }
    }
};