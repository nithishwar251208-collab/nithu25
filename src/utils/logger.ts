export interface LogContext {
  requestId?: string;
  userId?: string;
  endpoint?: string;
  method?: string;
  status?: number;
  durationMs?: number;
  [key: string]: any;
}

class Logger {
  private format(level: string, message: string, context?: LogContext) {
    const logObject = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
    };
    return JSON.stringify(logObject);
  }

  info(message: string, context?: LogContext) {
    console.log(this.format('INFO', message, context));
  }

  warn(message: string, context?: LogContext) {
    console.warn(this.format('WARN', message, context));
  }

  error(message: string, error?: any, context?: LogContext) {
    const errorDetails = error instanceof Error 
      ? { errorMessage: error.message, stack: error.stack }
      : { rawError: error };

    console.error(this.format('ERROR', message, { ...context, ...errorDetails }));
  }

  debug(message: string, context?: LogContext) {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(this.format('DEBUG', message, context));
    }
  }
}

export const logger = new Logger();
