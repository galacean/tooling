import { symbols } from 'ansi-colors';
import { prompt } from 'enquirer';
import { prefix, success } from './logger';

type PromptChoice = string | { name: string; choices: string[] };

let serialId = 0;

function nextId(): number {
  serialId += 1;

  return serialId;
}

function onCancel(): never {
  success('Cancelled.');
  process.exit(130);
}

export async function askCheckboxPlus(
  message: string,
  choices: PromptChoice[],
  format: (value: unknown) => string,
): Promise<string[]> {
  const name = `CheckboxPlus-${nextId()}`;
  const responses = await prompt({
    type: 'autocomplete',
    name,
    message,
    prefix,
    multiple: true,
    choices,
    format,
    limit: 10,
    onCancel,
    symbols: {
      indicator: symbols.radioOff,
      checked: symbols.radioOn,
    },
    indicator: (state: { symbols: Record<string, string> }, choice: { enabled: boolean }) =>
      choice.enabled
        ? state.symbols['checked'] ?? symbols.radioOn
        : state.symbols['indicator'] ?? symbols.radioOff,
  });
  const selectedChoices = responses[name];

  return Array.isArray(selectedChoices)
    ? selectedChoices.filter((choice): choice is string => typeof choice === 'string')
    : [];
}

export async function askQuestion(message: string): Promise<string> {
  const name = `Question-${nextId()}`;
  const responses = await prompt([{
    type: 'input',
    message,
    name,
    prefix,
    onCancel,
  }]);
  const answer = responses[name];

  return typeof answer === 'string' ? answer : '';
}
