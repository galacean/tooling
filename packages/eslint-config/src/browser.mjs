import compat from 'eslint-plugin-compat';

const configuration = compat.configs['flat/recommended'];

export default [
  {
    ...configuration,
    files: ['**/*.{ts,tsx}'],
    settings: {
      ...configuration.settings,
      polyfills: ['fetch', 'Promise', 'URL'],
    },
  },
];
