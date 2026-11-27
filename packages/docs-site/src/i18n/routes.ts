export function normalizeBase(value: string): string {
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/u.test(value)) {
    throw new Error(`SITE_BASE_PATH must start and end with /: ${value}`);
  }

  return value;
}

export function withBase(route: string, base: string): string {
  return `${normalizeBase(base)}${route.replace(/^\//u, '')}`;
}
