const prefix = '🦋 ';

function format(message: string, customPrefix?: string): string {
  const fullPrefix = prefix + (customPrefix !== undefined && customPrefix.length > 0 ? ` ${customPrefix}` : '');

  return `${fullPrefix}${message.replace(/\n/g, `\n${fullPrefix} `)}`;
}

export function error(message: string): void {
  console.error(format(message, 'error'));
}

export function info(message: string): void {
  console.info(format(message, 'info'));
}

export function log(message: string): void {
  console.info(format(message));
}

export function success(message: string): void {
  console.info(format(message, 'success'));
}

export function warn(message: string): void {
  console.warn(format(message, 'warn'));
}

export { prefix };
