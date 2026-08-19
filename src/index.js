import { loadConfig } from './config.js';
import { initDatabase } from './db/index.js';
import { logger } from './utils/logger.js';
import { OsmiumClient } from './client/index.js';
import { Events } from './gateway/events.js';
import { CommandRegistry } from './commands/registry.js';
import { pingCommand } from './commands/ping.js';
import { perfilCommand } from './commands/perfil.js';
import { rankCommand } from './commands/rank.js';
import { perguntarCommand } from './commands/perguntar.js';
import { adminCommand } from './commands/admin.js';

async function main() {
  logger.info('Iniciando Vica...');

  // 1. Carrega configurações
  const config = loadConfig();
  if (config.logging?.level) {
    logger.setLevel(config.logging.level);
  }

  // 2. Inicializa Banco de Dados
  const db = initDatabase(config.database?.path || './data/vica.db');

  // 3. Registra Comandos
  const registry = new CommandRegistry({
    prefix: config.osmium?.prefix || '!',
    autoDelete: config.osmium?.auto_delete_commands || false
  });

  registry.register(pingCommand);
  registry.register(perfilCommand);
  registry.register(rankCommand);
  registry.register(perguntarCommand);
  registry.register(adminCommand);

  // 4. Cria Cliente Osmium
  const client = new OsmiumClient({
    endpoint: config.osmium?.endpoint || 'wss://ws-0.osmium.chat',
    token: config.osmium?.token,
    clientId: config.osmium?.client_id,
    appVersion: '0.1.0'
  });

  client.on(Events.READY, (user) => {
    logger.info(`Bot conectado e pronto! Identidade: ${user?.name} (@${user?.username})`);
  });

  client.on(Events.MESSAGE_CREATED, async (data) => {
    try {
      const message = data.message;
      const author = data.author;
      if (!message || !message.message) return;

      // Ignora mensagens do próprio bot
      if (client.user && author?.id && String(author.id) === String(client.user.id)) {
        return;
      }

      const text = message.message;
      const chatRef = message.chatRef;
      const messageId = message.messageId;

      // Extrai communityId se a mensagem for de um canal
      let communityId = null;
      if (chatRef?.ref?.case === 'channel') {
        communityId = chatRef.ref.value?.communityId;
      }

      // Contexto para execução do comando
      const ctx = {
        client,
        db,
        registry,
        author,
        message,
        chatRef,
        communityId,
        isAdmin: true, // TODO: verificar permissões com base no cargo no futuro
        async reply(replyText) {
          return client.sendMessage(chatRef, replyText, {
            replyToMessageId: messageId
          });
        },
        async deleteTriggerMessage() {
          return client.deleteMessage(chatRef, [messageId]);
        }
      };

      await registry.handleMessage(ctx, text);
    } catch (err) {
      logger.error('Erro no processamento da mensagem:', err.message);
    }
  });

  client.connect();

  // Tratamento de finalização graciosa
  const shutdown = () => {
    logger.info('Encerrando bot...');
    client.disconnect();
    db.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error('Erro fatal na inicialização:', err);
  process.exit(1);
});
