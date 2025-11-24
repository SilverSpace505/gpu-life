// eslint.config.js
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  // Files to ignore (e.g., build output, node_modules)
  {
    ignores: ['node_modules/', 'dist/', 'build/', 'vite.config.ts'],
  },

  // === Configuration for TypeScript/TSX Files ===
  {
    files: ['**/*.ts', '**/*.tsx'], // <-- IMPORTANT: Only apply these rules to TS/TSX
    extends: [
      eslint.configs.recommended, // Basic JavaScript recommended rules
      ...tseslint.configs.recommended, // TypeScript-specific recommended rules
      // Uncomment for stricter, type-aware rules (highly recommended for production)
      // ...tseslint.configs.strictTypeChecked,
      // ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        project: true, // Tells ESLint to use your tsconfig.json for type information
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // === Configuration for ESLint's own config file (JavaScript using ESM) ===
  // This is needed to correctly parse eslint.config.js itself without conflicts.
  {
    files: ['eslint.config.js'], // <-- Apply this specific configuration ONLY to eslint.config.js
    languageOptions: {
      sourceType: 'module', // Our config file is an ES Module
      parserOptions: {
        // Point to a dedicated tsconfig for config files to handle Node.js module resolution
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // === Prettier Integration (MUST BE LAST) ===
  // This disables ESLint's formatting rules that would conflict with Prettier.
  // It effectively applies to the files that ESLint is currently linting (our TS/TSX files).
  prettier
);