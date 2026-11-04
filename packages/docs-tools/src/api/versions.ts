import semver from 'semver';

const versionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?(?:\+([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?$/u;

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
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
