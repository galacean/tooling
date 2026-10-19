import chalk from 'chalk';
import { askCheckboxPlus, askQuestion } from './cli-utilities';

export async function getReleasePackageNames(packageNames: string[]): Promise<string[]> {
  if (packageNames.length === 0) {
    return [];
  }

  if (packageNames.length === 1) {
    return packageNames;
  }

  const selectedPackages = await askCheckboxPlus(
    'Which packages would you like to include?',
    [{ name: 'all packages', choices: packageNames }],
    value => {
      if (Array.isArray(value)) {
        return value
          .filter((packageName): packageName is string =>
            typeof packageName === 'string' && packageName !== 'all packages',
          )
          .map(packageName => chalk.cyan(packageName))
          .join(', ');
      }

      return typeof value === 'string' ? value : String(value);
    },
  );

  return selectedPackages.filter(packageName => packageName !== 'all packages');
}

export async function getReleasePackageVersion(): Promise<string> {
  return askQuestion('Input new package version');
}
