export type CommandLogLevel = 'INFO' | 'SUCCESS' | 'WARN';

const reset = '\u001b[0m';
const styles = {
  dim: '\u001b[2m',
  command: '\u001b[1;36m',
  INFO: '\u001b[34m',
  SUCCESS: '\u001b[32m',
  WARN: '\u001b[1;33m',
};

function supportsColor(stream: NodeJS.WriteStream): boolean {
  const noColor = process.env['NO_COLOR'];

  if (noColor !== undefined && noColor !== '') {
    return false;
  }
  const forceColor = process.env['FORCE_COLOR'];

  if (forceColor === '0') {
    return false;
  }

  return forceColor !== undefined || stream.isTTY === true;
}

export function createCommandLogger(command: string) {
  function write(level: CommandLogLevel, message: string): void {
    const stream = level === 'WARN' ? process.stderr : process.stdout;
    const formatted = supportsColor(stream)
      ? `${styles.dim}[docs-tools]${reset} ${styles.command}[${command}]${reset} ${styles[level]}[${level}]${reset} ${message}`
      : `[docs-tools][${command}][${level}] ${message}`;

    if (level === 'WARN') {
      console.warn(formatted);
    } else {
      console.info(formatted);
    }
  }

  return {
    info: (message: string) => write('INFO', message),
    success: (message: string) => write('SUCCESS', message),
    warn: (message: string) => write('WARN', message),
  };
}
