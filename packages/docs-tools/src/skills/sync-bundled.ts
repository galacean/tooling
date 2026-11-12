import { fileURLToPath } from 'node:url';
import packageJSON from '../../package.json' with { type: 'json' };
import { syncManagedSkill } from './sync';

const bundledSkillNames = [
  'api-documentation-translation',
  'manual-documentation-translation',
];

export async function syncBundledSkills({
  repositoryRoot,
  check = false,
}: {
  repositoryRoot: string;
  check?: boolean;
}): Promise<
  { skillName: string; changed: boolean; targetDirectory: string }[]
> {
  const results: {
    skillName: string;
    changed: boolean;
    targetDirectory: string;
  }[] = [];

  for (const skillName of bundledSkillNames) {
    const sourceDirectory = fileURLToPath(
      new URL(`../../skills/${skillName}/`, import.meta.url),
    );
    const result = await syncManagedSkill({
      repositoryRoot,
      sourceDirectory,
      packageVersion: packageJSON.version,
      skillName,
      check,
    });

    results.push({ skillName, ...result });
  }

  return results;
}
