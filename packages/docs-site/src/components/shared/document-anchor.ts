/** Anchor names come from document content and may also occur elsewhere on the host page. */
export function findDocumentAnchor(root: HTMLElement | null, id: string): HTMLElement | null {
  if (root === null || id === '') {
    return null;
  }
  for (const element of root.querySelectorAll<HTMLElement>('[id]')) {
    if (element.id === id) {
      return element;
    }
  }

  return null;
}
