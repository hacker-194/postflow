type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: number;
  level: LogLevel;
  context: string;
  message: string;
  data?: unknown;
}

class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 1000;
  private minLevel: LogLevel = 'info';

  private levelValue(level: LogLevel): number {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    return levels[level];
  }

  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelValue(level) >= this.levelValue(this.minLevel);
  }

  private log(level: LogLevel, context: string, message: string, data?: unknown): void {
    if (!this.shouldLog(level)) return;
    const entry: LogEntry = { timestamp: Date.now(), level, context, message, data };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) this.logs.shift();

    const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${context}]`;
    switch (level) {
      case 'debug':
        console.debug(prefix, message, data ?? '');
        break;
      case 'info':
        console.info(prefix, message, data ?? '');
        break;
      case 'warn':
        console.warn(prefix, message, data ?? '');
        break;
      case 'error':
        console.error(prefix, message, data ?? '');
        break;
    }
  }

  debug(context: string, message: string, data?: unknown): void {
    this.log('debug', context, message, data);
  }
  info(context: string, message: string, data?: unknown): void {
    this.log('info', context, message, data);
  }
  warn(context: string, message: string, data?: unknown): void {
    this.log('warn', context, message, data);
  }
  error(context: string, message: string, data?: unknown): void {
    this.log('error', context, message, data);
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }
  clearLogs(): void {
    this.logs = [];
  }
}

export const logger = new Logger();

if (typeof window !== 'undefined') {
  (window as Window & Record<string, unknown>).__FGP_LOGGER__ = logger;
}
