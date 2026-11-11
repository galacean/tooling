export interface ManualNavigationPage {
  slug: string;
  title: string;
  group: string;
  parent?: string;
}

export interface ManualNavigationNode extends ManualNavigationPage {
  children: ManualNavigationNode[];
}

export interface ManualNavigationGroup {
  title: string;
  key: string;
  pages: ManualNavigationNode[];
  groups: ManualNavigationGroup[];
}

export function groupManualPages(pages: ManualNavigationPage[]) {
  const groups = new Map<string, ManualNavigationPage[]>();

  for (const page of pages) {
    groups.set(page.group, [...(groups.get(page.group) ?? []), page]);
  }

  return [...groups].map(([title, items]) => ({ title, pages: items }));
}

function findCyclicSlugs(
  nodesBySlug: Map<string, ManualNavigationNode>,
  parentsBySlug: Map<string, string | undefined>,
): Set<string> {
  const cyclicSlugs = new Set<string>();
  const resolvedSlugs = new Set<string>();

  for (const slug of nodesBySlug.keys()) {
    if (resolvedSlugs.has(slug)) {
      continue;
    }

    const path: string[] = [];
    const pathIndexes = new Map<string, number>();
    let current: string | undefined = slug;

    while (
      current !== undefined &&
      nodesBySlug.has(current) &&
      !resolvedSlugs.has(current)
    ) {
      const cycleStart = pathIndexes.get(current);

      if (cycleStart !== undefined) {
        for (const cyclicSlug of path.slice(cycleStart)) {
          cyclicSlugs.add(cyclicSlug);
        }

        break;
      }

      pathIndexes.set(current, path.length);
      path.push(current);
      current = parentsBySlug.get(current);
    }

    for (const visitedSlug of path) {
      resolvedSlugs.add(visitedSlug);
    }
  }

  return cyclicSlugs;
}

export function buildManualNavigationGroups(pages: ManualNavigationPage[]) {
  const nodes: ManualNavigationNode[] = pages.map(page => ({
    ...page,
    children: [],
  }));
  const nodesBySlug = new Map(nodes.map(page => [page.slug, page]));
  const parentsBySlug = new Map(pages.map(page => [page.slug, page.parent]));
  const cyclicSlugs = findCyclicSlugs(nodesBySlug, parentsBySlug);
  const groups: ManualNavigationGroup[] = [];
  const groupsByPath = new Map<string, ManualNavigationGroup>();

  for (const node of nodes) {
    const parent =
      node.parent === undefined ? undefined : nodesBySlug.get(node.parent);

    if (parent !== undefined && !cyclicSlugs.has(node.slug)) {
      parent.children.push(node);
      continue;
    }
    const segments = node.group.split(/\s*\/\s*/u).filter(Boolean);
    let siblings = groups;
    const path: string[] = [];
    let group: ManualNavigationGroup | undefined;

    for (const segment of segments.length === 0 ? [''] : segments) {
      path.push(segment);
      const pathKey = JSON.stringify(path);

      group = groupsByPath.get(pathKey);

      if (group === undefined) {
        group = {
          title: segment,
          key: path.join(' / '),
          pages: [],
          groups: [],
        };
        groupsByPath.set(pathKey, group);
        siblings.push(group);
      }
      siblings = group.groups;
    }
    group?.pages.push(node);
  }

  return groups;
}

export function flattenManualGroups(
  groups: ManualNavigationGroup[],
): ManualNavigationGroup[] {
  return groups.flatMap(group => [
    group,
    ...flattenManualGroups(group.groups),
  ]);
}

function flattenManualPages(
  pages: ManualNavigationNode[],
): ManualNavigationNode[] {
  return pages.flatMap(page => [page, ...flattenManualPages(page.children)]);
}

export function getPagesInGroups(
  groups: ManualNavigationGroup[],
): ManualNavigationNode[] {
  return groups.flatMap(group => [
    ...flattenManualPages(group.pages),
    ...getPagesInGroups(group.groups),
  ]);
}
