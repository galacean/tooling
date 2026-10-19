import 'enquirer';

declare module 'enquirer' {
  interface PromptChoiceGroup {
    name: string;
    choices: string[];
  }

  interface PromptOptions {
    type: string;
    name: string;
    message?: string;
    prefix?: string;
    multiple?: boolean;
    choices?: Array<string | PromptChoiceGroup>;
    format?: (value: unknown) => string;
    limit?: number;
    onCancel?: () => void;
    symbols?: Record<string, string>;
    indicator?: (
      state: { symbols: Record<string, string> },
      choice: { enabled: boolean },
    ) => string;
  }

  export class Select {
    constructor(options: {
      name: string;
      message: string;
      choices: string[];
    });

    run(): Promise<string>;
  }

  export function prompt(
    options: PromptOptions | PromptOptions[],
  ): Promise<Record<string, unknown>>;
}
