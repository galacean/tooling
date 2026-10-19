import config from './config';

interface PackageMetadata {
  name?: string;
  private?: boolean;
  version?: string;
}

export function listablePackage(packageJson: PackageMetadata): boolean {
  if (packageJson.name !== undefined && config.ignore.includes(packageJson.name)) {
    return false;
  }

  return packageJson.private !== true
    && typeof packageJson.version === 'string'
    && packageJson.version.length > 0;
}
