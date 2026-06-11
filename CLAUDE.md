# Dough Tracker — Project Context

## What this app is

Dough Tracker is a mobile-first web calculator used by a pizza shop. In the first workflow, an employee scans a QR code, enters current sales, today's and tomorrow's forecasted sales, and counts the current dough inventory across five dough sizes; the app calculates how many dough batches to make for tomorrow and saves the entry to a Google Sheet via a Google Apps Script web app. In the second workflow, later in the day, another employee loads that day's record and enters water and dough temperatures for each batch. A third workflow at close (the EON tab) captures end-of-night sales and counts and compares them to tomorrow's need.

Static site served by GitHub Pages — no build step. The JS is plain `<script>` tags sharing global scope; load order matters (see the dependency comment at the top of each file).

## Current file structure

- `index.html` — HTML markup only; theme/density baked in on the `<html>` element
- `README.md` — repo readme
- `qr-code.png` — QR code image for scanning
- `CLAUDE.md` — this file (project context)
- `package.json` / `package-lock.json` — test + lint scripts; only devDependencies (eslint). No build system.
- `eslint.config.mjs` — flat config; declares the cross-file globals shared via `<script>` tags
- `.github/workflows/ci.yml` — CI: `node --check`, eslint, `npm test` on every PR and push to main
- `css/`
  - `styles.css` — all CSS; Mise en Place is the only theme (the old Line Check theme rules were deleted — restore from git history if a toggle ever returns)
- `js/` — loaded in this order via `<script>` tags (no modules, shared global scope)
  - `config.js` — all constants: SCRIPT_URL, DOUGH_TABLE, PER_TRAY, etc.
  - `utils.js` — shared helpers: parseDollar, expandDollar, updateHint (inline $ expansion), sanitize, stripExtraDots, valClass, normalizeDate, parseMDY (M/D/YYYY → Date or null), sheetDateToLocal (sheet cell → M/D/YYYY), fetchSheetJSON (GET wrapper), wireSectionToggle (shared collapsible-section wiring), getField, toShorthand
  - `bible.js` — Dough Bible reference: builds the 27-row table once, highlights tonight/tomorrow active rows
  - `calculate.js` — `computeDough(inputs)` is the pure, unit-tested 9-step math core; `calculate()` reads the DOM, delegates to it, and renders (recipe chips, hero batches, unified set-out alert); `debouncedCalculate()`; calls `updateMakePlaceholders()` if defined
  - `save.js` — dollar field validation, save validation, postToSheet, auto-save plumbing, save click handler
  - `history.js` — loadHistory function, history toggle wire-up
  - `temps.js` — temperature tracking state, UI, active date load/sync/save handlers
  - `make.js` — manager-only "Actual Make" card: calc-value placeholders, save click handler (POST type 'make')
  - `tabs.js` — 2 PM / EON mode switcher (`getMode`, `setMode`); flips `<html data-mode>`, the `.mode-tab.active` class, and the save-button label; calls `updateSaveButtons()` on switch
  - `outlook.js` — EON Outlook card (Step 08): `renderEonOutlook(tomorrowForecast)` builds per-size have/need/diff rows + bottom summary; `hideEonOutlook()` for reset
  - `main.js` — masthead date, event wiring, initial calculate() call, reset handler (also resets the make card, flips back to the 2 PM tab, and hides the outlook)
- `apps-script/`
  - `Code.gs` — version-controlled copy of the Google Apps Script backend; deploy by manually copying into the Apps Script editor
- `test/` — zero-dependency unit tests (Node's built-in `node:test`); see Testing & CI below
  - `helpers/load.js` — vm-based harness that loads the global-scope scripts
  - `utils.test.js`, `lookup.test.js`, `compute.test.js`, `codegs.test.js`

## The five dough sizes

- **Individual (indi)** — 11 balls per tray. Standard lookup-based calculation.
- **Small** — 8 balls per tray. Standard lookup-based calculation.
- **Large** — 6 balls per tray. Standard lookup-based calculation.
- **Sicilian (sic)** — 3 balls per tray. Counted as a single number in the UI (not trays × extras). Has a hardcoded minimum of 2 balls inside `computeDough()` — if the calculated "balls to make" is less than 2, it is forced to 2. Its night-side "Dough Left" is also clamped at 0 (same-day Sicilian can't be used, so a shortfall must not inflate tomorrow's make).
- **Boil** — 6 balls per tray. Fixed target of 36 balls. Does NOT use the Dough Bible lookup table; instead, the formula is simply `max(0, 36 - currentBoilCount)`.

## The Dough Bible lookup

`DOUGH_TABLE` is a 27-row array of objects. Each row has a `threshold` (dollar amount) and ball counts for `indi`, `small`, `large`, and `sic`. Thresholds range from $3,750 to $20,750.

The `lookup(dollarAmount)` function performs a linear scan and returns the first entry whose `threshold >= dollarAmount` — in other words, it rounds UP to the next threshold. If the input exceeds the last threshold ($20,750), it caps at the highest row and returns that row's values. Zero or negative inputs floor at the first row — so even an untouched form shows a non-zero recipe.

Boil dough does NOT use this table. Its target is always 36 regardless of forecast.

**`BIBLE_DATA` in `Code.gs` mirrors `DOUGH_TABLE` and a test enforces the sync** — editing one without the other fails `npm test` (and CI).

## The math

The 9-step calculation chain inside `computeDough()` (pure, unit-tested in `test/compute.test.js`):

1. **Sales Left** = Today's Forecast − Current Sales
2. **Dough Use Tonight** = `lookup(Sales Left)` — ball counts needed for tonight's remaining sales
3. **Dough Left** = Current Count − Dough Use Tonight (per size; Sicilian is clamped at 0)
4. **Dough Needed Tomorrow** = `lookup(Tomorrow's Forecast)` — ball counts needed for tomorrow
5. **Balls to Make** = Needed − Left (per size; Sicilian is floored at 2)
6. **Trays Needed** = `ceil(Balls to Make / balls per tray)` per size (0 if Balls to Make ≤ 0)
7. **Boil Balls to Make** = `max(0, 36 − current boil count)`; Boil Trays = `ceil(Boil Balls to Make / 6)`
8. **Total Trays** = sum of all tray counts (Indi + Small + Large + Sicilian + Boil trays)
9. **Batches** = `ceil(Total Trays / 11)`

Note: because of the Sicilian minimum of 2 (≥ 1 tray), batches can never compute to 0.

## Google Sheets integration

`SCRIPT_URL` points to a Google Apps Script web app that acts as the database API. The spreadsheet has **six tabs**, each owning one captured-data type. The `SHEETS` config object at the top of `Code.gs` is the single source of truth for tab names and headers — adding a new captured-data type later is a one-entry change there plus a new branch (or extension of `handleDoughPost`) in `doPost`.

- **Tab `Dough Counts`**: `Date | Today's Forecast | Current Sales | Sales Left | Tomorrow's Forecast | Indi Count | Small Count | Large Count | Sic Count | Boil Count | Batches`
- **Tab `Temperatures`**: `Date | Water 1 | Dough 1 | Water 2 | Dough 2 | … | Water 10 | Dough 10` (interleaved pairs)
- **Tab `Dough Bible`**: `Threshold | Indi | Small | Large | Sicilian` — 27 rows mirroring `DOUGH_TABLE` in `js/config.js`. **Reference only**; the JS owns the source of truth for calculations.
- **Tab `2pm Make Amount`**: `Date | Indi | Small | Large | Sicilian | Boil` — per-size **balls to make** as calculated (post-clamp: Sicilian min 2, Boil = `max(0, 36 - count)`, and **negative makes save as 0** — a surplus shows as a negative make in the UI breakdown, but dough is never made in negative amounts). Written automatically alongside every Dough Counts save.
- **Tab `Final Dough Amount at 2pm`**: `Date | Indi | Small | Large | Sicilian | Boil` — per-size `count + make` (using the 0-clamped make), i.e. how much dough is on hand once the morning batches are done. Also written automatically alongside every Dough Counts save.
- **Tab `End of Night Count`**: `Date | EON Sales | EON Indi Count | EON Small Count | EON Large Count | EON Sic Count | EON Boil Count` — captured at close from the **EON tab**. Independent of the morning Dough Counts row; one row per date, columns are EON-prefixed so the merged GET response can carry both 2 PM and EON values for the same date without collision.

- **Save (POST)**: `postToSheet()` sends a POST with a JSON body (`Content-Type: text/plain` to avoid CORS preflight). On CORS failure, retries with `mode: 'no-cors'`. The backend routes by `data.type`:
  - `"dough"` (default) writes to the Dough Counts tab AND, when `makes` / `finals` objects are present in the payload, also upserts the matching rows in the **2pm Make Amount** and **Final Dough Amount at 2pm** tabs (best-effort, not part of the response payload).
  - `"temps"` writes to the Temperatures tab.
  - `"make"` (manager actual-make correction) overwrites the **2pm Make Amount** row with the supplied per-size makes, then **recomputes** the **Final Dough Amount at 2pm** row using the existing Dough Counts row's counts. Requires a Dough Counts row to exist for the date — returns an error otherwise.
  - `"eon"` writes the End of Night save (one EON sales total + per-size counts) to the **End of Night Count** tab. Independent of the morning Dough Counts row — no prerequisite save needed.

  The backend rejects empty saves AND **negative counts/forecasts/sales/makes** with `{status: "error", message: "..."}` (derived `salesLeft` is exempt — it's legitimately negative when sales exceed forecast). Each tab keeps one row per day; a second save on the same day overwrites the existing row. The backend returns `{status: "ok", action, row, date}` on success. Actions: `"created"`, `"updated"`, `"temps_saved"`, `"temps_noop"` (empty temps array), `"make_saved"`, `"eon_created"`, `"eon_updated"`. Temps can be saved on a date with no prior dough save — the backend appends a new Temperatures row with just the date.
- **Backend source**: `Code.gs` is tracked in the repo under `apps-script/`. Deploy flow: edit the file via PR, merge, then manually copy into the Apps Script editor and deploy as a new version.
- **One-time setup**: `seedSheets()` (in `Code.gs`) is run once from the Apps Script editor. It creates any missing tabs, writes headers, and seeds the Dough Bible. Idempotent — safe to re-run.
- **History (GET)**: `loadHistory()` fetches `SCRIPT_URL` with no parameters, receives an array of the last 30 Dough Counts rows, takes the last 10, and displays them newest-first.
- **Load by date (GET)**: Fetches `SCRIPT_URL?date=<date>` and expects either `{status: "found", data: {...}}` or `{status: "not_found"}`. The backend looks up the date in **Dough Counts**, **Temperatures**, **and End of Night Count**, and returns a single merged record. The frontend reads the active tab's keys (e.g. `"Today's Forecast"` in 2 PM mode, `"EON Sales"` in EON mode) to populate only the visible fields.

Sheet column header strings (used as keys in the merged JSON response):
- `"Today's Forecast"`, `"Current Sales"`, `"Sales Left"`, `"Tomorrow's Forecast"`
- `"Indi Count"`, `"Small Count"`, `"Large Count"`, `"Sic Count"`, `"Boil Count"`
- `"Batches"`
- `"Water 1"` through `"Water 10"`, `"Dough 1"` through `"Dough 10"`
- `"EON Sales"`, `"EON Indi Count"`, `"EON Small Count"`, `"EON Large Count"`, `"EON Sic Count"`, `"EON Boil Count"`

## Testing & CI

- **Run tests**: `npm test` — zero dependencies, uses Node's built-in `node:test` runner. 35 tests in `test/`.
- **Run lint**: `npm install` once (eslint is the only devDependency), then `npm run lint`.
- **Syntax check**: `node --check js/*.js` (project rule before every commit). `Code.gs` needs a `.js`-extension copy first — see the CI workflow for the pattern.
- **Harness** (`test/helpers/load.js`): the js/ files are global-scope scripts with no exports, so tests load their source into a shared `vm` context sequentially — exactly mimicking the browser's `<script>` tags. `config.js`, `utils.js`, and `calculate.js` have zero top-level DOM access, so no `document` stub is needed. Top-level `const` declarations land in the context's lexical scope (not as properties of the context object), so refs are extracted by evaluating an object literal inside the context (`getRefs`). vm-created objects have foreign prototypes — wrap them with `plain()` before `deepEqual`.
- **Code.gs is tested too**: loaded into its own vm context with only `ContentService` stubbed; covers the validation branches and the **`BIBLE_DATA` ↔ `DOUGH_TABLE` sync** (row-for-row deep-equal across both files).
- **CI** (`.github/workflows/ci.yml`): on every PR and push to main — `node --check` over all JS (before `npm ci`, so syntax errors fail fast even if the registry is down), then `npm ci`, `npm run lint`, `npm test`.
- **ESLint** (`eslint.config.mjs`): flat config; all cross-file globals are declared per file group. `no-unused-vars` runs with `vars: 'local'` (functions defined in one file are called from another) and `no-redeclare` with `builtinGlobals: false` (defining a declared global in its home file is the intended pattern). When you add a new cross-file function or constant, add it to `appGlobals` in the config.

## Known quirks and gotchas

- **Negative make clamp**: the By Size breakdown can display a *negative* make (it means surplus — you already have more than tomorrow needs), but saves clamp it to 0 in three places: `readMakeNum()` in `save.js` (dough-save payload, which also feeds the finals), the Make card placeholder/prefill reads in `make.js`, and `upsertSizeRow()` in `Code.gs` (so rows from older deployed frontends can't write negatives either).
- **Sicilian minimum of 2**: Hardcoded inside `computeDough()`. If the math says to make fewer than 2 Sicilian balls, it is forced to 2.
- **Boil display**: The UI shows "Make X trays and Y singles" (full trays plus remainder), but the batch math uses the rounded-up tray count (`ceil(boilMake / 6)`).
- **Dollar shorthand**: `expandDollar()` multiplies numbers under 100 by 1000, so `1.7` becomes `1700` and `10` becomes `10000`. Numbers ≥ 100 are taken literally.
- **Debounce**: Calculation is debounced at 100ms on input events via `debouncedCalculate()`.
- **Unified active date**: A single `#activeDate` date picker at the top of the page drives both the dough save and the temperature save. The Load button fetches saved data for the selected date and populates all fields (with a confirmation dialog if fields already have data). The save click handler reads from `#activeDate` (falling back to today if empty). Auto-sync of batch count only fires when the active date matches today.
- **Date handling**: Dates use local browser time (not UTC). `normalizeDate()` converts between `YYYY-MM-DD` and `M/D/YYYY` formats for matching; `parseMDY()` turns `M/D/YYYY` into a Date (or `null` for garbage — the manual save shows "Invalid date", the auto-save bails silently).
- **Duplicate row prevention**: Lives in the Apps Script backend, not in the frontend. The frontend does not check whether a row already exists before saving.
- **Set-out logic**: When End of Night Count goes negative for Indi/Small/Large, the per-row `↓ Set out X trays` line appears AND the unified set-out alert banner above the breakdown lists every affected size (computed as `ceil(-doughLeft / perTray)`). Sicilian clamps (no set-out shown) because same-day Sicilian dough can't be used. Boil has no set-out.
- **Theme/density baked in**: `<html data-theme="mise" data-density="compact">` is the only live combination, and the CSS keys off those attributes — don't remove them. The old Line Check theme rules were deleted; restore from git history if a theme toggle ever returns.
- **Temps, Bible, History, and Make sections are collapsed by default**: each uses the same pattern — the section starts without `.open`, its body is hidden via `:not(.open)` CSS, and the header acts as a toggle button wired through the shared `wireSectionToggle()` helper in `utils.js`. Header text flips between *"Tap to expand"* and *"Tap to collapse"* with a ▾/▴ chevron.
- **2 PM / EON mode tabs**: a tab strip sits between Step 01 and Step 02. The active mode is held on `<html data-mode="twopm"|"eon">` so visibility is purely CSS-driven (`[data-mode="eon"] .hide-in-eon { display: none; }` and the mirror `[data-mode="twopm"] .hide-in-twopm { display: none; }`, plus `.sales-twopm` / `.sales-eon` swap rules inside Step 01). 2 PM mode is the existing morning workflow. EON mode keeps Step 00 (Active Date), Step 01 (morphed to a single `eonSales` input), Step 02 (Dough Counts), Step 05 (Temps), and Step 06 (History) visible; **Steps 03 (Recipe), 04 (By Size), and 07 (Make) hide**, and the set-out alert hides too. The save button text flips between "Compute / Save" (2 PM) and "Compare to Tomorrow" (EON); `updateSaveButtons()` reads `getMode()` and applies the right validation rules per mode (2 PM: full dollar-field validation; EON: just "any count or sales entered"). The Load button is mode-aware via `fillFieldsFromData(row)` reading EON-prefixed keys (`"EON Sales"`, `"EON Indi Count"`, …) when in EON mode. Reset always flips back to 2 PM. Count fields (`tcTrays-*`, `tcExtra-*`, `countSic`, `tcTrays-boil` etc.) are **shared** across modes — the mode only changes where the values save and which sales fields show.
- **2 PM auto-save** (safety net so people don't walk away without saving): in 2 PM mode only, the dough save fires automatically once `currentSales` + `todayForecast` + `tomorrowForecast` are all positive (after `expandDollar`) AND Indi + Small + Large counts are all > 0 AND the save button isn't disabled by validation errors. **Sicilian and Boil counts are intentionally NOT required** — staff routinely leave them at 0. Timer windows: **15 s of idle for the first auto-save, 30 s for every subsequent auto-save** (`autoSavedOnce` flag). Every relevant input event clears the pending timer via `armAutoSaveTimer()` and re-arms with the appropriate window — so active typing pushes the save out. `disarmAutoSaveTimer()` is called from: tapping `Compute / Save` manually (which also flips `autoSavedOnce = true`), switching to the EON tab (`setMode('eon')`), and Reset (which also resets `autoSavedOnce = false`). Load-button programmatic field fills don't arm the timer because `.value = ...` doesn't fire `input` events. Auto-save success shows `Auto-saved ✓` in the button (green `.success` flash, same revert timing as manual save) via the optional `successOverride` 6th parameter on `postToSheet`. Auto-save uses the same `buildDoughPayload(date)` helper as the click handler — they're guaranteed to produce identical rows. EON saves do **not** auto-fire.
- **EON Outlook (Step 08) renders after Compare to Tomorrow**: the EON save button is "Compare to Tomorrow" in EON mode — tap = save + outlook. `handleEonPost` in `apps-script/Code.gs` looks up the matching Dough Counts row and echoes back its `Tomorrow's Forecast` value (or `null` if no 2 PM save exists). `renderEonOutlook(forecast)` in `js/outlook.js` pre-fills the `#outlookForecast` input (or leaves it empty when backend returned null), sets a "source" caption underneath, then delegates the actual render to `renderOutlookRows()` which reads the input live, runs `lookup(forecast)` (Boil need is always 36, not from the table), and renders per-size rows + a bottom summary. Three summary states: "Dough is good ✓ — N leftover balls" (all `have ≥ need`), "Tomorrow we will potentially go into same-day dough by …" (any `have < need`), or "Enter tomorrow's forecast above to see the outlook" (input empty). The outlook card uses the `.hide-in-twopm` class so it only shows in EON mode; switching back to 2 PM hides it via CSS and switching back to EON re-shows the previously-rendered comparison (DOM state persists). Reset hides the outlook + clears its content. **Sicilian is treated identically to the other four sizes here** — EON-made Sicilian *is* usable tomorrow (different from the 2 PM same-night clamp, which is unrelated).
- **Outlook forecast is editable; manual entry wins**: the `#outlookForecast` input inside the Step 08 card lets the user override the saved 2 PM forecast (e.g., to ask "what if tomorrow is busier than projected?") or enter one from scratch when no 2 PM save exists. Any keystroke flips a `data-manual="true"` flag on the input. Once flipped, subsequent Compare to Tomorrow taps still save the EON count but **do not overwrite** the manual value. The source caption (`#outlookForecastSource`) flips between "From 2 PM save", "Manual entry", and "No 2 PM save — enter manually" so the user always knows where the displayed forecast came from. Live editing re-renders the rows + summary debounced ~150 ms. Reset is the only way to drop the manual flag and return to backend-driven behavior.
- **Actual Make card (Step 07) is collapsed by default**: the card contains 5 ball-count inputs (one per size). Pre-first-save, inputs are blank with the calculated balls-to-make shown as a placeholder hint. After every successful Save Count, `populateMakeInputs()` (in `js/make.js`, called from the success branch in `js/save.js`) fills the inputs with the current calculated values so the manager sees solid numbers and only edits sizes that came out different. Blank fields still fall back to the placeholder on save, so the pre-first-save corner case keeps working. The card has its own `Save Actual Make` button that POSTs `{type: 'make', date, makes}` — the backend overwrites the **2pm Make Amount** row and recomputes the **Final Dough Amount at 2pm** row using the existing Dough Counts row's counts. Requires a Dough Counts row to exist for the date. Reset clears the inputs back to blank with placeholders visible.
- **Make card uses a single ball-count input per size, not trays + extras**: The Dough Counts card uses trays + extras (`tcTrays-<size>` + `tcExtra-<size>`), but the Actual Make card uses a single `makeBalls-<size>` input. This is intentional — managers correcting an actual make think in terms of total balls, not "how many trays + leftovers."

## Changelog (all phases complete)

| Phase | Summary | Backend redeploy? |
|---|---|---|
| 1 | Split the monolithic `index.html` into `css/styles.css` + per-concern `js/` files | — |
| 2 | Bug fixes: real save confirmation, dollar-field validation, empty-save backend guard, reset cleanup, backdrop-blur removal, set-out logic | Yes |
| 3 | Unified `#activeDate` picker driving dough + temp saves; code-review cleanup | — |
| 4 | Design handoff: new HTML/CSS theme system, `bible.js`, new render pipeline (recipe chips, hero batches, masthead) | — |
| 5 | Ports from abandoned branch: parseDollar negative guard, stripExtraDots, friendlier history error, >10 batch warning, Sicilian doughLeft clamp | — |
| 6 | Backend split into Dough Counts / Temperatures / Dough Bible tabs (`SHEETS` config, `seedSheets()`, merged GET) | Yes + `seedSheets()` |
| 7 | UI simplification: Mise/compact baked in, tweaks panel deleted, Temps collapsed by default, font bump | — |
| 8 | `2pm Make Amount` + `Final Dough Amount at 2pm` tabs (auto-written on dough save); Bible + History collapsible | Yes + `seedSheets()` |
| 9 | Actual Make correction card (POST type `make`; recomputes finals) | Yes |
| 10 | Auto-fill the Make card inputs after every successful Save Count | — |
| 11 | 2 PM / EON tabs + `End of Night Count` tab (POST type `eon`, merged GET) | Yes + `seedSheets()` |
| 12 | EON Outlook card: per-size have/need/diff vs tomorrow's forecast, editable forecast input | Yes |
| 13 | 2 PM auto-save (15 s/30 s idle windows) + "Compute / Save" rename + bigger save button | — |
| 14 | Cleanup & robustness pass: null-guarded DOM lookups, `parseMDY` date validation, shared `wireSectionToggle`/`sheetDateToLocal`/`fetchSheetJSON` helpers, backend negative-value rejection, negative-make save clamp, dead CSS deleted (Line Check theme, confirm dialog, breakdown-head), pure `computeDough()` extraction, **test suite + ESLint + GitHub Actions CI**, this file condensed | Yes (negative-value guard + make clamp) |

## Rules for future prompts

1. Every prompt must read this file first for project context.
2. At the end of every step, update the "Current file structure" and "Changelog" sections to reflect the new state.
3. Every step ends with a git commit. Do not push unless explicitly told to.
4. Run `node --check` on all modified JS files and `npm test` before committing.
5. JS files share global scope via `<script>` tags — load order matters. See dependency comments at the top of each file. New cross-file functions/constants must also be added to `appGlobals` in `eslint.config.mjs`.
6. `DOUGH_TABLE` (js/config.js) and `BIBLE_DATA` (apps-script/Code.gs) must change together in the same PR — `npm test` enforces the sync.
7. `apps-script/Code.gs` changes require a manual redeploy: paste into the Apps Script editor and deploy a new version (run `seedSheets()` only when adding tabs).
