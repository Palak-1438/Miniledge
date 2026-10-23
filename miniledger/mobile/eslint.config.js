const expo = require('eslint-config-expo/flat');

module.exports = [
  ...expo,
  { ignores: ['dist/**', 'node_modules/**', '.expo/**'] },
  {
    rules: {
      // Required for the typed-navigation global augmentation in src/types/navigation.ts
      '@typescript-eslint/no-namespace': 'off',
    },
  },
];
