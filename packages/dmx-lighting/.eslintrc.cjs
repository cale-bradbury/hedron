module.exports = {
  extends: '../../.eslintrc.cjs',
  settings: {
    'import/resolver': {
      typescript: {
        project: './tsconfig.json',
      },
    },
  },
  overrides: [
    {
      // Standalone node scripts run against the build output, not the aliased source.
      files: ['scripts/**'],
      rules: { 'no-restricted-imports': 'off' },
    },
  ],
}
