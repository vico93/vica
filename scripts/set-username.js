import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { loadConfig } from '../src/config.js';
import { OsmiumClient } from '../src/client/index.js';
import { Events } from '../src/gateway/events.js';
import { logger } from '../src/utils/logger.js';

async function main() {
  const rl = createInterface({ input, output });
  const username = (await rl.question('Novo username da Vica (ex.: vica): ')).trim();
  rl.close();

  if (!username) {
    logger.error('Username vazio. Abortando.');
    process.exit(1);
  }

  const config = loadConfig();
  const client = new OsmiumClient({
    endpoint: config.osmium?.endpoint,
    token: config.osmium?.token,
    clientId: config.osmium?.client_id
  });

  const timeout = setTimeout(() => {
    logger.error('Timeout ao conectar/autenticar. Abortando.');
    process.exit(1);
  }, 20000);

  client.connection.on('error', (err) => {
    clearTimeout(timeout);
    logger.error('Erro de conexão WebSocket:', err?.message || String(err));
    process.exit(1);
  });

  client.on(Events.READY, async () => {
    try {
      await client.editProfile({ username });
      clearTimeout(timeout);
      logger.info(`Username definido com sucesso: @${username}`);
      client.disconnect();
      process.exit(0);
    } catch (err) {
      clearTimeout(timeout);
      logger.error('Falha ao definir username:', err.message);
      process.exit(1);
    }
  });

  client.connect();
}

main().catch((err) => {
  logger.error('Erro fatal:', err.message);
  process.exit(1);
});
