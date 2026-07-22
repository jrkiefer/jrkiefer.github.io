import js from '@eslint/js';

const browserGlobals = {
  window: 'readonly', document: 'readonly', fetch: 'readonly',
  console: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
  setInterval: 'readonly', AbortSignal: 'readonly',
  localStorage: 'readonly', navigator: 'readonly'
};

export default [
  // v1/ is the frozen pre-rebuild snapshot; design/ holds the approved
  // React reference build — neither is shipped code.
  { ignores: ['v1/**', 'design/**'] },
  js.configs.recommended,
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: browserGlobals
    }
  },
  {
    files: ['apps-script/**/*.gs', 'apps-script/**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'script',
      globals: {
        SpreadsheetApp: 'readonly', ContentService: 'readonly',
        LockService: 'readonly', Logger: 'readonly', console: 'readonly',
        Utilities: 'readonly'
      }
    },
    rules: {
      // Apps Script entry points (doGet/doPost/seedSheets) are "unused"
      // from the file's point of view — the platform calls them.
      'no-unused-vars': ['error', { vars: 'local', args: 'none', caughtErrors: 'none' }]
    }
  },
  {
    files: ['test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        console: 'readonly', process: 'readonly', setImmediate: 'readonly',
        AbortSignal: 'readonly', DOMException: 'readonly'
      }
    }
  }
];
