import chalk from 'chalk';
import configConventional from '@commitlint/config-conventional';
import { JSDOM } from 'jsdom';

interface PullRequestDetails {
  author: string;
  descriptions: string[];
  title: string;
}

interface PullRequest extends PullRequestDetails {
  pr: string;
  url: string;
}

const commitTypes = configConventional.rules['type-enum'][2];

export function printPR(pullRequests: PullRequest[]): void {
  pullRequests.forEach(pullRequest => {
    const { pr, url, author, title, descriptions } = pullRequest;
    const isConventionalTitle = commitTypes.some(type =>
      new RegExp(`^${type}(?:\\(\\S+\\))?:\\s.+`, 'i').test(title),
    );

    if (!isConventionalTitle || title.includes('docs: ')) {
      return;
    }

    const titleText = title.charAt(0).toLocaleUpperCase() + title.slice(1);

    console.info(`- ${titleText}. [#${pr}](${url}) @${author}`);

    if (descriptions.length > 0) {
      console.info(descriptions.map(description => `  - ${description}`).join('\n'));
    }
  });
}

export function queryWithJSDOM(html: string): PullRequestDetails {
  const dom = new JSDOM(html);
  const { document } = dom.window;
  const titleElement = document.querySelector('[data-component="PH_Title"] .markdown-title');
  const authorElement = document.querySelector('.pull-discussion-timeline>.js-discussion .TimelineItem .author');

  if (!titleElement || !authorElement) {
    throw new Error('Could not find the pull request title or author in the GitHub page.');
  }

  const descriptions = [...document.querySelectorAll('.comment-body>ul:first-child li')]
    .map(element => element.textContent?.trim() ?? '');

  return {
    title: titleElement.textContent?.trim() ?? '',
    author: authorElement.textContent?.trim() ?? '',
    descriptions,
  };
}

export function parseGitHubRepository(value: string): string {
  const repository = value.trim()
    .replace(/^(?:https?:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)/i, '')
    .replace(/\.git$/i, '');

  if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) {
    throw new Error(`Expected a GitHub repository in owner/repository format, received: ${value}`);
  }

  return repository;
}

export async function fetchPullRequest(
  pullRequestNumber: string,
  repository: string,
): Promise<{ response: Response; html: string }> {
  const timeout = 30000;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(
        `https://github.com/${repository}/pull/${pullRequestNumber}`,
        { signal: controller.signal },
      );

      if (!response.ok) {
        throw new Error(`GitHub returned ${response.status} for pull request #${pullRequestNumber}.`);
      }

      return { response, html: await response.text() };
    } catch (error) {
      if (attempt === 3) {
        throw error;
      }

      console.info(chalk.red(`Fetch error: ${String(error)}`));
      console.info(chalk.red(`Retrying (attempt ${attempt + 1}/3)...`));
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(`Failed to fetch pull request #${pullRequestNumber}.`);
}
