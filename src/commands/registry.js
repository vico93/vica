import { logger } from '../utils/logger.js';

export class CommandRegistry {
  /**
   * @param {object} options
   * @param {string} [options.prefix='!']
   * @param {boolean} [options.autoDelete=false]
   */
  constructor(options = {}) {
    this.prefix = options.prefix ?? '!';
    this.autoDelete = options.autoDelete ?? false;
    this.commands = new Map();
    this.aliases = new Map();
  }

  /**
   * Define/atualiza o prefixo dos comandos.
   * @param {string} newPrefix
   */
  setPrefix(newPrefix) {
    this.prefix = newPrefix;
  }

  /**
   * Registra um comando.
   * @param {object} cmd
   * @param {string} cmd.name Nome principal do comando (sem prefixo)
   * @param {string[]} [cmd.aliases=[]] Aliases
   * @param {string} [cmd.description=''] Descrição
   * @param {Function} cmd.execute Função (ctx) => Promise<void>
   */
  register(cmd) {
    if (!cmd.name || typeof cmd.execute !== 'function') {
      throw new Error(`Comando inválido: deve ter 'name' e 'execute'`);
    }
    const name = cmd.name.toLowerCase();
    this.commands.set(name, cmd);

    if (Array.isArray(cmd.aliases)) {
      for (const alias of cmd.aliases) {
        this.aliases.set(alias.toLowerCase(), name);
      }
    }
    logger.debug(`Comando registrado: ${name}`);
  }

  /**
   * Faz o parse de uma mensagem de texto e retorna { command, name, args } se corresponder ao prefixo.
   * @param {string} text
   * @param {string} [customPrefix] Prefixo customizado (ex: vindo de settings da comunidade)
   * @returns {{ command: object, name: string, args: string[] } | null}
   */
  parse(text, customPrefix = this.prefix) {
    if (!text || typeof text !== 'string') return null;
    const trimmed = text.trim();
    if (!trimmed.startsWith(customPrefix)) return null;

    const withoutPrefix = trimmed.slice(customPrefix.length).trim();
    if (!withoutPrefix) return null;

    const parts = withoutPrefix.split(/\s+/);
    const trigger = parts[0].toLowerCase();
    const args = parts.slice(1);

    const targetName = this.aliases.get(trigger) || trigger;
    const command = this.commands.get(targetName);

    if (!command) return null;

    return {
      command,
      name: targetName,
      args
    };
  }

  /**
   * Trata uma mensagem e executa o comando correspondente se houver match.
   * @param {object} ctx Contexto da mensagem
   * @param {string} text Texto da mensagem
   * @param {string} [customPrefix]
   * @returns {Promise<boolean>} true se executou comando, false caso contrário
   */
  async handleMessage(ctx, text, customPrefix = this.prefix) {
    const parsed = this.parse(text, customPrefix);
    if (!parsed) return false;

    try {
      await parsed.command.execute(ctx, parsed.args);

      // Auto-delete opcional da mensagem de comando
      if (this.autoDelete && typeof ctx.deleteTriggerMessage === 'function') {
        try {
          await ctx.deleteTriggerMessage();
        } catch (delErr) {
          logger.debug('Falha ao auto-deletar mensagem de comando:', delErr.message);
        }
      }

      return true;
    } catch (err) {
      logger.error(`Erro ao executar comando ${parsed.name}:`, err.message);
      if (typeof ctx.reply === 'function') {
        try {
          await ctx.reply(`❌ Ocorreu um erro ao executar este comando: ${err.message}`);
        } catch (_) {}
      }
      return true;
    }
  }
}
