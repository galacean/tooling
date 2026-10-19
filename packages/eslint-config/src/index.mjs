import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import promise from 'eslint-plugin-promise';
import tseslint from 'typescript-eslint';
import { globalIgnores } from 'eslint/config';
import { cwd } from 'node:process';

const BASE_IGNORES = [
  '**/{node_modules,dist,coverage}/**',
  '**/*.d.ts',
];

const TS_BASE_RULE_OVERRIDES = {
  'no-undef': 'off',
  'no-redeclare': 'off',
  'no-useless-assignment': 'off',
};

const TS_STYLE_RULES = {
  'arrow-parens': ['error', 'as-needed'],
  'array-bracket-spacing': ['error', 'never'],
  'brace-style': ['error', '1tbs', { allowSingleLine: true }],
  'comma-dangle': ['error', 'always-multiline'],
  curly: 'error',
  '@stylistic/quotes': ['error', 'single', { avoidEscape: true, allowTemplateLiterals: 'always' }],
  '@stylistic/member-delimiter-style': ['error', {
    multiline: { delimiter: 'semi', requireLast: true },
    singleline: { delimiter: 'semi', requireLast: false },
  }],
  'new-parens': 'error',
  'spaced-comment': 'error',
  'no-multi-spaces': ['error', { ignoreEOLComments: true }],
  'no-console': ['error', { allow: ['info', 'warn', 'error', 'debug', 'trace'] }],
  'no-inner-declarations': 'error',
  'no-multiple-empty-lines': ['error', { max: 1, maxEOF: 1 }],
  'no-trailing-spaces': 'error',
  'no-void': ['error', { allowAsStatement: true }],
  'padding-line-between-statements': [
    'error',
    { blankLine: 'always', prev: '*', next: ['return', 'break'] },
    { blankLine: 'never', prev: '*', next: ['case', 'default'] },
    { blankLine: 'always', prev: ['const', 'let', 'var'], next: '*' },
    { blankLine: 'any', prev: ['const', 'let', 'var'], next: ['const', 'let', 'var'] },
  ],
  'promise/always-return': 'off',
  'promise/catch-or-return': 'error',
  'prefer-rest-params': 'off',
  semi: ['error', 'always'],
  'space-in-parens': ['error', 'never'],
};

const TS_POLICY_RULES = {
  '@typescript-eslint/no-namespace': 'off',
  '@typescript-eslint/explicit-module-boundary-types': 'off',
  '@typescript-eslint/no-unused-vars': [
    'error',
    {
      vars: 'all',
      varsIgnorePattern: '^_',
      args: 'none',
      caughtErrors: 'all',
      caughtErrorsIgnorePattern: '^ignore',
    },
  ],
  '@typescript-eslint/ban-ts-comment': 'off',
  '@typescript-eslint/no-var-requires': 'off',
  '@typescript-eslint/no-non-null-assertion': 'off',
  '@typescript-eslint/no-empty-object-type': 'off',
  '@typescript-eslint/no-empty-function': 'off',
  '@typescript-eslint/no-unnecessary-type-arguments': 'error',
  '@typescript-eslint/no-unnecessary-type-assertion': 'error',
  '@typescript-eslint/no-unnecessary-type-constraint': 'error',
  '@typescript-eslint/no-redundant-type-constituents': 'warn',
  '@typescript-eslint/prefer-includes': 'error',
  '@typescript-eslint/prefer-reduce-type-parameter': 'error',
  '@typescript-eslint/prefer-ts-expect-error': 'error',
  '@typescript-eslint/return-await': 'error',
  '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true, ignoreIIFE: true }],
  '@typescript-eslint/require-await': 'off',
  '@typescript-eslint/unbound-method': 'off',
  '@typescript-eslint/no-misused-promises': 'error',
  '@typescript-eslint/prefer-regexp-exec': 'off',
  '@typescript-eslint/no-unsafe-enum-comparison': 'warn',
  '@typescript-eslint/no-base-to-string': 'off',
  '@typescript-eslint/no-duplicate-type-constituents': 'off',
  '@typescript-eslint/consistent-type-imports': [
    'error',
    { prefer: 'type-imports', disallowTypeAnnotations: false },
  ],
};

const configuration = tseslint.config([
  globalIgnores(BASE_IGNORES),
  js.configs.recommended,
  promise.configs['flat/recommended'],
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: true,
        tsconfigRootDir: cwd(),
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      '@stylistic': stylistic,
    },
    rules: {
      ...tseslint.plugin.configs.recommended.rules,
      ...tseslint.plugin.configs['recommended-requiring-type-checking'].rules,
      ...TS_BASE_RULE_OVERRIDES,
      ...TS_STYLE_RULES,
      ...TS_POLICY_RULES,
    },
  },
]);

export default configuration;
