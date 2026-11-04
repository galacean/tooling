export function indexReflections<T extends object>(
  project: T,
): Map<number, object> {
  const reflections = new Map<number, object>();

  function visit(value: unknown): void {
    if (value === null || typeof value !== 'object') {
      return;
    }
    if (
      'id' in value &&
      typeof value.id === 'number' &&
      'variant' in value &&
      typeof value.variant === 'string'
    ) {
      reflections.set(value.id, value);
    }
    Object.values(value).forEach(visit);
  }

  visit(project);

  return reflections;
}
