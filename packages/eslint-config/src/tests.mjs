export default {
  files: [
    '**/*.test.{ts,tsx}',
    '**/*.spec.{ts,tsx}',
    '**/tests/**/*.{ts,tsx}',
    '**/mocks/**/*.{ts,tsx}',
  ],
  rules: {
    'no-console': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-argument': 'off',
    '@typescript-eslint/restrict-plus-operands': 'off',
    '@typescript-eslint/restrict-template-expressions': 'off',
    '@typescript-eslint/strict-boolean-expressions': 'off',
  },
};
