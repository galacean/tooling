export async function loadJSON(
  url: string,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<unknown> {
  const response = await fetcher(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${url}`);
  }

  return response.json() as Promise<unknown>;
}

export async function loadText(
  url: string,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<string> {
  const response = await fetcher(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${url}`);
  }

  return response.text();
}
