/*
** caminho: commands/noticia.js
** últimaMod: 2025-10-04 00:20
** autor: Vico
** colaboração: Grok Code (Fast)
*/

/*
 * Comando para postar notícias em um canal designado
 * Permite aos membros compartilhar URLs que são automaticamente formatadas
 * com metadados OpenGraph e postadas via webhook
 */

const {
    SlashCommandBuilder,
    MessageFlags,
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
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["'][^>]*>/i);
    const ogDescription = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["'][^>]*>/i);

    return {
        title: ogTitle ? ogTitle[1] : null,
        description: ogDescription ? ogDescription[1] : null
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
            timeout: 10000 // 10 segundos timeout
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
                    content: '❌ Nenhum canal de notícias foi configurado para este servidor. Peça aos moderadores para configurar um canal usando o comando `/config`.',
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

            // Buscar metadados OpenGraph
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

            const ogData = await fetchOpenGraphData(url);

            // Preparar conteúdo da mensagem
            const title = ogData.title || `Notícia by ${member.displayName}`;
            const description = ogData.description ? `${ogData.description}\n➡️ ${url}` : `➡️ ${url}`;

            // Verificar tipo do canal e postar adequadamente
            try {
                if (newsChannel.type === 15) { // Forum channel
                    console.log('[NOTICIA][INFO] Postando em canal de fórum');

                    // Criar thread no fórum
                    const thread = await newsChannel.threads.create({
                        name: title,
                        message: {
                            content: description
                        }
                    });

                    console.log('[NOTICIA][INFO] Thread criado com sucesso:', thread.id);

                } else { // Text channel - usar webhook
                    console.log('[NOTICIA][INFO] Postando em canal de texto via webhook');

                    // Criar webhook
                    const webhookName = member.displayName;
                    const webhookAvatar = member.user.displayAvatarURL({ dynamic: true });

                    const webhook = await newsChannel.createWebhook({
                        name: webhookName,
                        avatar: webhookAvatar
                    });

                    // Enviar mensagem via webhook
                    await webhook.send({
                        content: description,
                        username: webhookName,
                        avatarURL: webhookAvatar
                    });

                    // Deletar webhook após uso
                    await webhook.delete();
                }

                // Responder ao usuário
                await interaction.editReply({
                    content: `✅ Notícia postada com sucesso no ${newsChannel}!`
                });

            } catch (postError) {
                console.error('[NOTICIA][ERROR] Falha ao postar notícia:', postError.message);
                return interaction.editReply({
                    content: '❌ Ocorreu um erro ao postar a notícia. Verifique as permissões do bot no canal de notícias.'
                });
            }

        } catch (error) {
            console.error('[NOTICIA][ERROR] Erro geral no comando noticia:', error);
            const replyContent = interaction.deferred
                ? '❌ Ocorreu um erro inesperado. Tente novamente mais tarde.'
                : { content: '❌ Ocorreu um erro inesperado. Tente novamente mais tarde.', flags: [MessageFlags.Ephemeral] };

            if (interaction.deferred) {
                return interaction.editReply(replyContent);
            } else {
                return interaction.reply(replyContent);
            }
        }
    }
};