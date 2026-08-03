import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

/**
 * Type-aware rules are scoped to TypeScript sources. Pulling tool config files into a
 * synthetic default project types `import.meta` as an error and buys nothing: the rules
 * worth having here are about the render path, and the render path is all TypeScript.
 */
export default defineConfig([
  globalIgnores(['**/dist/**', '**/node_modules/**', 'spike/**', 'reference/**']),
  js.configs.recommended,
  {
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportDefaultDeclaration',
          message: 'Named exports only. A default export has no stable name to import.',
        },
      ],
      // A render that reads the clock or the entropy pool is not reproducible, and a
      // wrong-but-plausible asset is the failure this project exists to prevent.
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: 'The render path must be deterministic.' },
        {
          object: 'Math',
          property: 'random',
          message: 'The render path must be deterministic.',
        },
      ],
    },
  },
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // A frame index in a message is the whole point of the failure table's
      // "name the offending frame" requirement.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
  {
    // ESLint, turbo, and prettier all resolve their config through a default export. The
    // named-exports rule is about a package's public API, not tool config.
    files: ['**/*.config.js', '**/*.config.ts', 'eslint.config.js'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['**/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-type-assertion': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
]);
