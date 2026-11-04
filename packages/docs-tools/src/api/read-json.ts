import { readFile } from 'node:fs/promises';
import { parseTree } from 'jsonc-parser';
import type { Node } from 'jsonc-parser';

function parseJSONValue(text: string): unknown {
  return JSON.parse(text) as unknown;
}

export function parseJSON<T = unknown>(
  text: string,
  filename = 'content.json',
): T {
  const parsed = parseJSONValue(text);
  const root = parseTree(text);

  function visit(node: Node): void {
    if (node.type === 'object') {
      const keys = new Set<string>();

      for (const property of node.children ?? []) {
        const key = property.children?.[0]?.value as unknown;

        if (typeof key !== 'string') {
          throw new Error(`Invalid JSON object key in ${filename}`);
        }
        if (keys.has(key)) {
          throw new Error(`Duplicate JSON key in ${filename}: ${key}`);
        }
        keys.add(key);
        const value = property.children?.[1];

        if (value !== undefined) {
          visit(value);
        }
      }
    } else {
      node.children?.forEach(visit);
    }
  }

  if (root !== undefined) {
    visit(root);
  }

  return parsed as T;
}

export async function readJSON<T = unknown>(filename: string): Promise<T> {
  return parseJSON<T>(await readFile(filename, 'utf8'), filename);
}
