import { z } from 'zod';

export default {
  name: 'get_time',
  description: 'Retorna a data e hora atuais em um fuso horário (padrão America/Sao_Paulo).',
  inputSchema: z.object({
    timezone: z.string().optional().describe('Fuso horário IANA (ex.: "America/Sao_Paulo")')
  }),
  async execute({ timezone }) {
    const tz = timezone || 'America/Sao_Paulo';
    try {
      return {
        timezone: tz,
        iso: new Date().toISOString(),
        local: new Date().toLocaleString('pt-BR', { timeZone: tz })
      };
    } catch {
      return { timezone: tz, local: new Date().toLocaleString('pt-BR') };
    }
  }
};
