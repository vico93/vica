/*
** caminho: tools/get_current_time.js
** últimaMod: 2026-01-29
** autor: Vico
** colaboração: Roo
*/

/**
 * Handler para obter a data e hora atual
 */
async function execute(args) {
  try {
    const now = new Date();
    
    // Formata a data e hora no fuso horário de São Paulo
    const options = {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'long'
    };
    
    const formattedDate = now.toLocaleDateString('pt-BR', options);
    
    return {
      timestamp: now.getTime(),
      iso: now.toISOString(),
      formatted: formattedDate,
      timezone: 'America/Sao_Paulo'
    };
  } catch (error) {
    throw new Error(`Erro ao obter data e hora: ${error.message}`);
  }
}

module.exports = {
  execute
};
