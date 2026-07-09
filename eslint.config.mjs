import js from '@eslint/js';

const browserGlobals = {
  window: 'readonly', document: 'readonly', fetch: 'readonly',
  console: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly'
};

// Cross-file globals — the js/ files share one scope via <script> tags,
// so anything defined in one file and used in another must be listed here.
const appGlobals = {
  // config.js
  SCRIPT_URL: 'readonly', SHEET_URL: 'readonly', DOUGH_TABLE: 'readonly',
  PER_TRAY: 'readonly', TRAYS_PER_BATCH: 'readonly', TYPES: 'readonly',
  TYPE_LABELS: 'readonly', TYPE_COLORS: 'readonly', TYPE_SHORT: 'readonly',
  BOIL_TARGET: 'readonly', BOIL_PER_TRAY: 'readonly',
  // utils.js
  parseDollar: 'readonly', expandDollar: 'readonly', updateHint: 'readonly',
  formatDollar: 'readonly', valClass: 'readonly', sanitize: 'readonly',
  stripExtraDots: 'readonly', getTodayDate: 'readonly', normalizeDate: 'readonly',
  getField: 'readonly', toShorthand: 'readonly', parseMDY: 'readonly',
  sheetDateToLocal: 'readonly', fetchSheetJSON: 'readonly', wireSectionToggle: 'readonly',
  // bible.js / calculate.js
  updateBible: 'readonly', lookup: 'readonly', lookupIndex: 'readonly',
  getCountValue: 'readonly', getCount: 'readonly',
  getBoilCountValue: 'readonly', getBoilCount: 'readonly',
  computeDough: 'readonly', calculate: 'readonly', debouncedCalculate: 'readonly',
  // save.js (mutable state shared with main.js/temps.js)
  saveBtn: 'readonly', saveHint: 'readonly', isSaving: 'writable',
  autoSavedOnce: 'writable', updateSaveButtons: 'readonly', postToSheet: 'readonly',
  armAutoSaveTimer: 'readonly', disarmAutoSaveTimer: 'readonly',
  // history.js / temps.js / make.js / tabs.js / outlook.js
  loadHistory: 'readonly', tempBatchCount: 'writable',
  tempBatchManuallySet: 'writable', lastAutoBatches: 'writable',
  renderTempInputs: 'readonly', syncTempBatches: 'readonly', clearAllFields: 'readonly',
  updateMakePlaceholders: 'readonly', populateMakeInputs: 'readonly',
  getMode: 'readonly', setMode: 'readonly',
  renderEonOutlook: 'readonly', hideEonOutlook: 'readonly'
};

export default [
  // v1/ is the frozen pre-rebuild snapshot; design/ holds the approved
  // React reference build — neither is shipped code.
  { ignores: ['v1/**', 'design/**'] },
  js.configs.recommended,
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'script',
      globals: { ...browserGlobals, ...appGlobals }
    },
    rules: {
      // vars: 'local' is load-bearing — functions defined in one file are
      // called from another, which plain eslint:recommended would flag.
      'no-unused-vars': ['error', { vars: 'local', args: 'none', caughtErrors: 'none' }],
      // Defining a listed global in its home file is the intended pattern.
      'no-redeclare': ['error', { builtinGlobals: false }]
    }
  },
  {
    files: ['apps-script/**/*.gs', 'apps-script/**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'script',
      globals: {
        SpreadsheetApp: 'readonly', ContentService: 'readonly',
        Logger: 'readonly', console: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['error', { vars: 'local', args: 'none', caughtErrors: 'none' }]
    }
  },
  {
    files: ['test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly', module: 'writable', __dirname: 'readonly',
        console: 'readonly', process: 'readonly'
      }
    }
  }
];
