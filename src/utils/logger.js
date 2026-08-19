const LOG_LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

class Logger {
  constructor(level = 'info') {
    this.levelName = level.toLowerCase();
    this.level = LOG_LEVELS[this.levelName] ?? LOG_LEVELS.info;
  }

  setLevel(level) {
    this.levelName = level.toLowerCase();
    this.level = LOG_LEVELS[this.levelName] ?? LOG_LEVELS.info;
  }

  _format(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.length > 0 ? ' ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ') : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${formattedArgs}`;
  }

  debug(message, ...args) {
    if (this.level <= LOG_LEVELS.debug) {
      console.log(this._format('debug', message, ...args));
    }
  }

  info(message, ...args) {
    if (this.level <= LOG_LEVELS.info) {
      console.log(this._format('info', message, ...args));
    }
  }

  warn(message, ...args) {
    if (this.level <= LOG_LEVELS.warn) {
      console.warn(this._format('warn', message, ...args));
    }
  }

  error(message, ...args) {
    if (this.level <= LOG_LEVELS.error) {
      console.error(this._format('error', message, ...args));
    }
  }
}

export const logger = new Logger(process.env.LOG_LEVEL || 'info');
export { Logger };
