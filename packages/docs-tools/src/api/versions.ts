import semver from 'semver';

const versionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?(?:\+([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?$/u;

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

export interface APIVersionManifest {
  repository: string;
  versions: string[];
}

export const currentAPIVersion = 'current';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseVersion(version: string): ParsedVersion {
  const parsed = versionPattern.test(version) ? semver.parse(version) : null;

  if (parsed === null) {
    throw new Error(`Invalid API package version: ${version}`);
  }

  return {
    major: parsed.major,
    minor: parsed.minor,
    patch: parsed.patch,
    prerelease: parsed.prerelease.map(String),
  };
}

export function versionGroup(version: string): string {
  const parsed = parseVersion(version);

  return `${parsed.major}.${parsed.minor}`;
}

export function compareVersions(left: string, right: string): number {
  parseVersion(left);
  parseVersion(right);

  return semver.compare(left, right);
}

export function parseAPIVersionManifest(value: unknown): APIVersionManifest {
  if (!isRecord(value)) {
    throw new Error('API versions manifest must be an object');
  }
  const repository = value['repository'];
  const versions = value['versions'];

  if (typeof repository !== 'string') {
    throw new Error('API versions manifest repository must be a URL');
  }
  let repositoryURL: URL;

  try {
    repositoryURL = new URL(repository);
  } catch {
    throw new Error('API versions manifest repository must be a URL');
  }
  if (
    repositoryURL.protocol !== 'https:' ||
    repositoryURL.hostname.length === 0 ||
    repositoryURL.username.length > 0 ||
    repositoryURL.password.length > 0 ||
    repositoryURL.search.length > 0 ||
    repositoryURL.hash.length > 0
  ) {
    throw new Error('API versions manifest repository must be a safe HTTPS URL');
  }
  if (!Array.isArray(versions) || versions.length === 0) {
    throw new Error('API versions manifest versions must be a non-empty array');
  }
  const seen = new Set<string>();
  const parsedVersions: string[] = [];

  for (const version of versions) {
    if (typeof version !== 'string') {
      throw new Error('API versions manifest entries must be SemVer strings');
    }
    if (!/^[0-9A-Za-z][0-9A-Za-z.+-]*$/u.test(version)) {
      throw new Error(`Unsafe API Git tag name: ${version}`);
    }
    parseVersion(version);
    if (seen.has(version)) {
      throw new Error(`Duplicate API version: ${version}`);
    }
    seen.add(version);
    parsedVersions.push(version);
  }

  return { repository, versions: parsedVersions };
}
