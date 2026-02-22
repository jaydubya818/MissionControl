/**
 * Structured Logging Utility
 * 
 * Provides JSON-formatted logs with consistent fields:
 * - timestamp: ISO 8601 timestamp
 * - run_id: Workflow run identifier
 * - task_id: Task identifier
 * - agent_id: Agent identifier
 * - step_id: Workflow step identifier
 * - status: Log level/status
 * - error_code: Error classification (optional)
 * - message: Human-readable message
 * - metadata: Additional context
 */

export interface LogEntry {
  timestamp: string;
  run_id?: string;
  task_id?: string;
  agent_id?: string;
  step_id?: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  status?: string;
  error_code?: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface LoggerConfig {
  defaultAgentId?: string;
  defaultRunId?: string;
  enableConsole?: boolean;
  enableFile?: boolean;
  logFilePath?: string;
}

class StructuredLogger {
  private config: LoggerConfig;

  constructor(config: LoggerConfig = {}) {
    this.config = {
      enableConsole: true,
      enableFile: false,
      ...config,
    };
  }

  /**
   * Create a log entry with all required fields
   */
  private createEntry(
    level: LogEntry['level'],
    message: string,
    context: Partial<LogEntry> = {}
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      agent_id: context.agent_id || this.config.defaultAgentId,
      run_id: context.run_id || this.config.defaultRunId,
      task_id: context.task_id,
      step_id: context.step_id,
      status: context.status,
      error_code: context.error_code,
      metadata: context.metadata,
    };
  }

  /**
   * Output log entry as JSON
   */
  private output(entry: LogEntry): void {
    const json = JSON.stringify(entry);
    
    if (this.config.enableConsole) {
      // Color-code by level for console
      const colors: Record<string, string> = {
        DEBUG: '\x1b[36m', // Cyan
        INFO: '\x1b[32m',  // Green
        WARN: '\x1b[33m',  // Yellow
        ERROR: '\x1b[31m', // Red
        FATAL: '\x1b[35m', // Magenta
      };
      const reset = '\x1b[0m';
      
      console.log(`${colors[entry.level] || ''}[${entry.level}]${reset} ${entry.message}`);
      
      // Output full JSON to stderr for structured capture
      console.error(json);
    }

    // File output would go here if enabled
  }

  debug(message: string, context?: Partial<LogEntry>): void {
    this.output(this.createEntry('DEBUG', message, context));
  }

  info(message: string, context?: Partial<LogEntry>): void {
    this.output(this.createEntry('INFO', message, context));
  }

  warn(message: string, context?: Partial<LogEntry>): void {
    this.output(this.createEntry('WARN', message, context));
  }

  error(message: string, error?: Error, context?: Partial<LogEntry>): void {
    const errorContext: Partial<LogEntry> = {
      ...context,
      error_code: error?.name || context?.error_code,
      metadata: {
        ...context?.metadata,
        errorStack: error?.stack,
        errorMessage: error?.message,
      },
    };
    this.output(this.createEntry('ERROR', message, errorContext));
  }

  fatal(message: string, error?: Error, context?: Partial<LogEntry>): void {
    const errorContext: Partial<LogEntry> = {
      ...context,
      error_code: error?.name || context?.error_code || 'FATAL_ERROR',
      metadata: {
        ...context?.metadata,
        errorStack: error?.stack,
        errorMessage: error?.message,
      },
    };
    this.output(this.createEntry('FATAL', message, errorContext));
  }

  /**
   * Create a child logger with bound context
   */
  child(context: Partial<LogEntry>): StructuredLogger {
    return new StructuredLogger({
      ...this.config,
      defaultAgentId: context.agent_id || this.config.defaultAgentId,
      defaultRunId: context.run_id || this.config.defaultRunId,
    });
  }
}

// Global logger instance
export const logger = new StructuredLogger();

// Export for creating configured instances
export { StructuredLogger };
