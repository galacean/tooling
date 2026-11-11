import type { ManualHeading } from '../../manual';

export interface ManualTocNode extends ManualHeading {
  key: string;
  children: ManualTocNode[];
}

export function buildManualTocTree(
  headings: ManualHeading[],
  keyPrefix: string,
): ManualTocNode[] {
  const roots: ManualTocNode[] = [];
  const parents: ManualTocNode[] = [];

  headings.forEach((heading, index) => {
    const node: ManualTocNode = {
      ...heading,
      key: `${keyPrefix}:${index}`,
      children: [],
    };

    while (
      parents.length > 0 &&
      parents[parents.length - 1]!.level >= node.level
    ) {
      parents.pop();
    }
    const parent = parents[parents.length - 1];

    if (parent === undefined) {
      roots.push(node);
    } else {
      parent.children.push(node);
    }
    parents.push(node);
  });

  return roots;
}

export function flattenManualTocNodes(items: ManualTocNode[]): ManualTocNode[] {
  return items.flatMap(item => [
    item,
    ...flattenManualTocNodes(item.children),
  ]);
}
