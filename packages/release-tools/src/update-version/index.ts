import fs from 'fs-extra';
import path from 'path';
import { getPackages } from '@manypkg/get-packages';
import { listablePackage } from './listable-package';
import { getReleasePackageNames, getReleasePackageVersion } from './create-changeset';
import { error } from './logger';

interface PackageMetadata {
  version?: string;
  [key: string]: unknown;
}

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.info('Usage: update-version [--dry-run] [repository-path]');

    return;
  }

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const targetRepository = args.find(arg => !arg.startsWith('-'))
    ?? process.env['TARGET_REPOSITORY']
    ?? process.cwd();
  const { packages } = await getPackages(targetRepository);
  const packageNames = packages
    .filter(item => listablePackage(item.packageJson))
    .map(item => item.packageJson.name);

  if (packageNames.length === 0) {
    throw new Error(`No versioned, non-private workspace packages found in ${targetRepository}.`);
  }

  if (dryRun) {
    console.info(`Packages available for version update in ${targetRepository}:`);
    packageNames.forEach(packageName => console.info(`- ${packageName}`));

    return;
  }

  const releasePackageNames = await getReleasePackageNames(packageNames);
  const releasePackages = packages.filter(item =>
    releasePackageNames.includes(item.packageJson.name),
  );
  const version = await getReleasePackageVersion();

  if (!version.trim()) {
    throw new Error('The new package version cannot be empty.');
  }

  try {
    await Promise.all(releasePackages.map(async item => {
      const packageJsonPath = path.join(item.dir, 'package.json');
      const packageJson = await fs.readJson(packageJsonPath) as PackageMetadata;

      packageJson.version = version;
      await fs.writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
    }));
  } catch (caughtError) {
    error(`Could not update package.json: ${String(caughtError)}`);
    throw caughtError;
  }
}

main().catch((caughtError: unknown) => {
  console.error(caughtError);
  process.exitCode = 1;
});
