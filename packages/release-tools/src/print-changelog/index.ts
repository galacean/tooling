import chalk from 'chalk';
import { Select } from 'enquirer';
import simpleGit from 'simple-git';
import {
  fetchPullRequest,
  parseGitHubRepository,
  printPR,
  queryWithJSDOM,
} from './utils';

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.info('Usage: print-changelog [repository-path]');

    return;
  }

  const args = process.argv.slice(2);
  const targetRepository = args.find(arg => !arg.startsWith('-'))
    ?? process.env['TARGET_REPOSITORY']
    ?? process.cwd();
  const git = simpleGit(targetRepository);
  const tags = await git.tags();
  const prompt = new Select({
    name: 'fromVersion',
    message: 'Please choose tag to compare with the target branch:',
    choices: tags.all
      .filter(tag => !tag.includes('experimental'))
      .filter(tag => !tag.includes('alpha'))
      .filter(tag => !tag.includes('resource'))
      .reverse()
      .slice(0, 50),
  });
  const fromVersion = await prompt.run();
  const targetBranch = process.env['CHANGELOG_BASE_BRANCH'] ?? 'main';
  const logs = await git.log({ from: fromVersion, to: targetBranch });
  let repository = process.env['GITHUB_REPOSITORY'];

  if (repository === undefined || repository.length === 0) {
    const origin = await git.remote(['get-url', 'origin']);

    if (origin === undefined || origin.length === 0) {
      throw new Error('Set GITHUB_REPOSITORY or configure an origin remote for the target repository.');
    }

    repository = origin;
  }

  repository = parseGitHubRepository(repository);
  const pullRequests = [];

  for (const [index, commit] of logs.all.entries()) {
    const text = `${commit.message} ${commit.body}`;
    const pullRequestNumbers = [...text.matchAll(/#(\d+)/g)]
      .map(match => match[1])
      .filter((number): number is string => number !== undefined);

    console.info(
      `[${index + 1}/${logs.all.length}]`,
      commit.hash.slice(0, 6),
      '-',
      pullRequestNumbers.length ? pullRequestNumbers.map(number => `#${number}`).join(',') : '?',
    );

    for (const pullRequestNumber of pullRequestNumbers) {
      const { response, html } = await fetchPullRequest(pullRequestNumber, repository);
      const details = queryWithJSDOM(html);

      pullRequests.push({ ...details, pr: pullRequestNumber, url: response.url });
    }
  }

  console.info('\n', chalk.green('Done. Here is the log:'), '\n');
  printPR(pullRequests.reverse());
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
