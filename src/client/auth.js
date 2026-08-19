import { logger } from '../utils/logger.js';

/**
 * Executa o handshake de inicialização e autenticação do bot no Osmium.
 * 
 * 1. Initialize -> Initialized
 * 2. Authorize(token) -> Authorization (com User e Session)
 * 
 * @param {import('./rpc.js').RpcClient} rpc
 * @param {string} token
 * @param {object} [clientInfo]
 * @param {number} [clientInfo.clientId=0]
 * @param {string} [clientInfo.deviceType="server"]
 * @param {string} [clientInfo.deviceVersion="node"]
 * @param {string} [clientInfo.appVersion="0.1.0"]
 * @returns {Promise<{ user: any, token: string, sessionId: bigint }>}
 */
export async function authenticate(rpc, token, clientInfo = {}) {
  logger.info('Iniciando handshake (core_initialize)...');

  const initResult = await rpc.request({
    case: 'coreInitialize',
    value: {
      clientId: clientInfo.clientId ?? 0,
      deviceType: clientInfo.deviceType ?? 'server',
      deviceVersion: clientInfo.deviceVersion ?? process.version,
      appVersion: clientInfo.appVersion ?? '0.1.0',
      noSubscribe: false
    }
  });

  if (initResult.case !== 'initialized') {
    throw new Error(`Resposta de inicialização inesperada: ${initResult.case}`);
  }

  logger.info('Handshake de inicialização concluído. Autenticando com token...');

  const authResult = await rpc.request({
    case: 'authAuthorize',
    value: {
      token
    }
  });

  if (authResult.case !== 'authorization') {
    throw new Error(`Resposta de autenticação inesperada: ${authResult.case}`);
  }

  const { user, token: sessionToken, sessionId } = authResult.value;
  logger.info(`Autenticado com sucesso como: ${user?.name || 'Bot'} (@${user?.username || 'sem_username'}, ID: ${user?.id})`);

  return {
    user,
    token: sessionToken,
    sessionId
  };
}
