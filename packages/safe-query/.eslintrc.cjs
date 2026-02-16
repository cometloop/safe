/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  extends: ['@core/eslint-config/index.js'],
  ignorePatterns: ['dist/'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
  },
}
