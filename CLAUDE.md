# Dough Tracker — Project Context

## What this app is

Dough Tracker is a mobile-first web calculator used by a pizza shop. In the first workflow, an employee scans a QR code, enters current sales, today's and tomorrow's forecasted sales, and counts the current dough inventory across five dough sizes; the app calculates how many dough batches to make for tomorrow and saves the entry to a Google Sheet via a Google Apps Script web app. In the second workflow, later in the day, another employee loads that day's record and enters water and dough temperatures for each batch. The app has been refactored from a single monolithic `index.html` into a multi-file structure with separate CSS and JS files.

## Current file structure

- `index.html` — HTML markup only; theme/density baked in on the `<html>` element (364 lines)
- `README.md` — repo readme
- `qr-code.png` — QR code image for scanning
- `CLAUDE.md` — this file (project context)
- `css/`
  - `styles.css` — all CSS; the Mise en Place theme is the only live look (Line Check rules retained as no-ops in case we re-introduce a toggle) (1293 lines)
- `js/` — loaded in this order via `<script>` tags (no modules, shared global scope)
  - `config.js` — all constants: SCRIPT_URL, DOUGH_TABLE, PER_TRAY, etc.
  - `utils.js` — utility functions: parseDollar, expandDollar, updateHint (inline $ expansion), sanitize, stripExtraDots, valClass (pos/neg)
  - `bible.js` — Dough Bible reference: builds the 27-row table once, highlights tonight/tomorrow active rows, wires header toggle
  - `calculate.js` — calculation + render pipeline: lookup, calculate, recipe chips, hero batches, unified set-out alert, debouncedCalculate; calls `updateMakePlaceholders()` if defined
  - `save.js` — dollar field validation, save validation, postToSheet, save click handler
  - `history.js` — loadHistory function, history toggle wire-up
  - `temps.js` — temperature tracking state, UI, active date load/sync/save handlers, collapsible-section toggle
  - `make.js` — manager-only "Actual Make" card: collapsible toggle, calc-value placeholders, save click handler (POST type 'make')
  - `main.js` — masthead date, event wiring, initial calculate() call, reset handler (also resets the make card)
- `apps-script/`
  - `Code.gs` — version-controlled copy of the Google Apps Script backend; deploy by manually copying into the Apps Script editor

## The five dough sizes

- **Individual (indi)** — 11 balls per tray. Standard lookup-based calculation.
- **Small** — 8 balls per tray. Standard lookup-based calculation.
- **Large** — 6 balls per tray. Standard lookup-based calculation.
- **Sicilian (sic)** — 3 balls per tray. Counted as a single number in the UI (not trays × extras). Has a hardcoded minimum of 2 balls inside `calculate()` — if the calculated "balls to make" is less than 2, it is forced to 2. Its night-side "Dough Left" is also clamped at 0 (same-day Sicilian can't be used, so a shortfall must not inflate tomorrow's make).
- **Boil** — 6 balls per tray. Fixed target of 36 balls. Does NOT use the Dough Bible lookup table; instead, the formula is simply `max(0, 36 - currentBoilCount)`.

## The Dough Bible lookup

`DOUGH_TABLE` is a 27-row array of objects. Each row has a `threshold` (dollar amount) and ball counts for `indi`, `small`, `large`, and `sic`. Thresholds range from $3,750 to $20,750.

The `lookup(dollarAmount)` function performs a linear scan and returns the first entry whose `threshold >= dollarAmount` — in other words, it rounds UP to the next threshold. If the input exceeds the last threshold ($20,750), it caps at the highest row and returns that row's values.

Boil dough does NOT use this table. Its target is always 36 regardless of forecast.

## The math

The 9-step calculation chain inside `calculate()`:

1. **Sales Left** = Today's Forecast − Current Sales
2. **Dough Use Tonight** = `lookup(Sales Left)` — ball counts needed for tonight's remaining sales
3. **Dough Left** = Current Count − Dough Use Tonight (per size; Sicilian is clamped at 0)
4. **Dough Needed Tomorrow** = `lookup(Tomorrow's Forecast)` — ball counts needed for tomorrow
5. **Balls to Make** = Needed − Left (per size; Sicilian is floored at 2)
6. **Trays Needed** = `ceil(Balls to Make / balls per tray)` per size (0 if Balls to Make ≤ 0)
7. **Boil Balls to Make** = `max(0, 36 − current boil count)`; Boil Trays = `ceil(Boil Balls to Make / 6)`
8. **Total Trays** = sum of all tray counts (Indi + Small + Large + Sicilian + Boil trays)
9. **Batches** = `ceil(Total Trays / 11)`

## Google Sheets integration

`SCRIPT_URL` points to a Google Apps Script web app that acts as the database API. The spreadsheet has **five tabs**, each owning one captured-data type. The `SHEETS` config object at the top of `Code.gs` is the single source of truth for tab names and headers — adding a new captured-data type later is a one-entry change there plus a new branch (or extension of `handleDoughPost`) in `doPost`.

- **Tab `Dough Counts`**: `Date | Today's Forecast | Current Sales | Sales Left | Tomorrow's Forecast | Indi Count | Small Count | Large Count | Sic Count | Boil Count | Batches`
- **Tab `Temperatures`**: `Date | Water 1 | Dough 1 | Water 2 | Dough 2 | … | Water 10 | Dough 10` (interleaved pairs)
- **Tab `Dough Bible`**: `Threshold | Indi | Small | Large | Sicilian` — 27 rows mirroring `DOUGH_TABLE` in `js/config.js`. **Reference only**; the JS owns the source of truth for calculations. `BIBLE_DATA` in `Code.gs` must be kept in sync with `DOUGH_TABLE` if either changes.
- **Tab `2pm Make Amount`**: `Date | Indi | Small | Large | Sicilian | Boil` — per-size **balls to make** as calculated by `calculate()` (post-clamp: Sicilian min 2, Boil = `max(0, 36 - count)`). Written automatically alongside every Dough Counts save.
- **Tab `Final Dough Amount at 2pm`**: `Date | Indi | Small | Large | Sicilian | Boil` — per-size `count + make`, i.e. how much dough is on hand once the morning batches are done. Also written automatically alongside every Dough Counts save.

- **Save (POST)**: `postToSheet()` sends a POST with a JSON body (`Content-Type: text/plain` to avoid CORS preflight). On CORS failure, retries with `mode: 'no-cors'`. The backend routes by `data.type`:
  - `"dough"` (default) writes to the Dough Counts tab AND, when `makes` / `finals` objects are present in the payload, also upserts the matching rows in the **2pm Make Amount** and **Final Dough Amount at 2pm** tabs (best-effort, not part of the response payload).
  - `"temps"` writes to the Temperatures tab.
  - `"make"` (manager actual-make correction) overwrites the **2pm Make Amount** row with the supplied per-size makes, then **recomputes** the **Final Dough Amount at 2pm** row using the existing Dough Counts row's counts. Requires a Dough Counts row to exist for the date — returns an error otherwise.
  
  Each tab keeps one row per day; a second save on the same day overwrites the existing row. The backend returns `{status: "ok", action, row, date}` on success, or `{status: "error", message}` on failure. Actions: `"created"`, `"updated"`, `"temps_saved"`, `"temps_noop"` (empty temps array), `"make_saved"`. Temps can be saved on a date with no prior dough save — the backend appends a new Temperatures row with just the date.
- **Backend source**: `Code.gs` is tracked in the repo under `apps-script/`. Deploy flow: edit the file via PR, merge, then manually copy into the Apps Script editor and deploy as a new version.
- **One-time setup**: `seedSheets()` (in `Code.gs`) is run once from the Apps Script editor. It creates any missing tabs, writes headers, and seeds the Dough Bible. Idempotent — safe to re-run.
- **History (GET)**: `loadHistory()` fetches `SCRIPT_URL` with no parameters, receives an array of the last 30 Dough Counts rows, takes the last 10, and displays them newest-first.
- **Load by date (GET)**: Fetches `SCRIPT_URL?date=<date>` and expects either `{status: "found", data: {...}}` or `{status: "not_found"}`. The backend looks up the date in **both** Dough Counts and Temperatures and returns a merged record so the frontend stays unaware of the split.

Sheet column header strings (used as keys in the merged JSON response):
- `"Today's Forecast"`, `"Current Sales"`, `"Sales Left"`, `"Tomorrow's Forecast"`
- `"Indi Count"`, `"Small Count"`, `"Large Count"`, `"Sic Count"`, `"Boil Count"`
- `"Batches"`
- `"Water 1"` through `"Water 10"`, `"Dough 1"` through `"Dough 10"`

## Known quirks and gotchas

- **Sicilian minimum of 2**: Hardcoded inside `calculate()`. If the math says to make fewer than 2 Sicilian balls, it is forced to 2.
- **Boil display**: The UI shows "Make X trays and Y singles" (full trays plus remainder), but the batch math uses the rounded-up tray count (`ceil(boilMake / 6)`).
- **Dollar shorthand**: `expandDollar()` multiplies numbers under 100 by 1000, so `1.7` becomes `1700` and `10` becomes `10000`. Numbers ≥ 100 are taken literally.
- **Debounce**: Calculation is debounced at 100ms on input events via `debouncedCalculate()`.
- **Unified active date**: A single `#activeDate` date picker at the top of the page drives both the dough save and the temperature save. The Load button fetches saved data for the selected date and populates all fields (with a confirmation dialog if fields already have data). The save click handler reads from `#activeDate` (falling back to today if empty). Auto-sync of batch count only fires when the active date matches today.
- **Date handling**: Dates use local browser time (not UTC). `normalizeDate()` converts between `YYYY-MM-DD` and `M/D/YYYY` formats for matching.
- **Duplicate row prevention**: Lives in the Apps Script backend, not in the frontend. The frontend does not check whether a row already exists before saving.
- **Set-out logic**: When End of Night Count goes negative for Indi/Small/Large, the per-row `↓ Set out X trays` line appears AND the unified set-out alert banner above the breakdown lists every affected size (computed as `ceil(-doughLeft / perTray)`). Sicilian clamps (no set-out shown) because same-day Sicilian dough can't be used. Boil has no set-out.
- **Theme/density baked in**: `<html data-theme="mise" data-density="compact">` is the only live combination. The Tweaks panel was removed — staff don't need to choose. Line Check theme rules still exist in `styles.css` but never match. To bring back a toggle later, restore a slim controller and switch the `data-theme` attribute.
- **Temps section is collapsed by default**: `<section class="temp-sec">` starts without the `.open` class so its body is hidden via `.temp-sec:not(.open) .temp-body { display: none; }`. The header acts as a button (`#tempToggle`) that toggles `.open` on every tap. Closed every page load — only managers expand it.
- **Bible and History sections are collapsed by default**: same pattern as Temps. `.bible:not(.open) #bibleBody { display: none; }` hides the whole Bible body (active-row strip cards + 27-row table) until tap. `.history-sec:not(.open) .history-body { display: none; }` hides the recent-history list. Header text flips between *"Tap to expand"* and *"Tap to collapse"* with a ▾/▴ chevron.
- **Actual Make card (Step 07) is collapsed by default**: same pattern as Temps. The card contains 5 ball-count inputs (one per size). Pre-first-save, inputs are blank with the calculated balls-to-make shown as a placeholder hint. After every successful Save Count, `populateMakeInputs()` (in `js/make.js`, called from the success branch in `js/save.js`) fills the inputs with the current calculated values so the manager sees solid numbers and only edits sizes that came out different. Blank fields still fall back to the placeholder on save, so the pre-first-save corner case keeps working. The card has its own `Save Actual Make` button that POSTs `{type: 'make', date, makes}` — the backend overwrites the **2pm Make Amount** row and recomputes the **Final Dough Amount at 2pm** row using the existing Dough Counts row's counts. Requires a Dough Counts row to exist for the date. Reset clears the inputs back to blank with placeholders visible.
- **Make card uses a single ball-count input per size, not trays + extras**: The Dough Counts card uses trays + extras (`tcTrays-<size>` + `tcExtra-<size>`), but the Actual Make card uses a single `makeBalls-<size>` input. This is intentional — managers correcting an actual make think in terms of total balls, not "how many trays + leftovers." If the divergence ever feels confusing, the count card pattern can be ported over.

## Known issues (to be fixed in Phase 2)

- ~~**Blind save**~~: ✅ Fixed — backend now returns `{status: "ok", action, row, date}` and frontend shows "Saved row N" or "Updated row N" for confirmed saves.
- ~~**No input validation on dollar fields**~~: ✅ Fixed — dollar fields now have inline error/warning messages with range validation and cross-field checks.
- ~~**Empty saves**~~: ✅ Fixed — backend `doPost` now rejects payloads with no date, no dough counts, and no forecast with `{status: "error", message: "..."}`. Frontend shows the error message on the save button.
- ~~**Backdrop-blur performance**~~: ✅ Fixed — removed decorative `backdrop-filter` from 6 rules; kept only on `.header` where visually load-bearing.
- ~~**Reset button incomplete cleanup**~~: ✅ Fixed — reset handler now fully restores temp save button (`disabled`, `textContent`, `classList`).

## Plan

### Phase 1 — Multi-file split (pure refactor, no behavior changes)

- Step 0 — Create CLAUDE.md from real index.html ✅ complete
- Step 1.1 — Create folder structure and empty files ✅ complete
- Step 1.2 — Extract CSS to css/styles.css ✅ complete
- Step 1.3 — Extract JS to js/app.js (single-file checkpoint) ✅ complete
- Step 1.4 — Split app.js → config.js ✅ complete
- Step 1.5 — Split app.js → utils.js ✅ complete
- Step 1.6 — Split app.js → calculate.js ✅ complete
- Step 1.7 — Split app.js → save.js ✅ complete
- Step 1.8 — Split app.js → history.js ✅ complete
- Step 1.9 — Split app.js → temps.js ✅ complete
- Step 1.10 — Create main.js, delete app.js ✅ complete

### Phase 2 — Known bug fixes

- Step 2.1 — Real save confirmation ✅ complete
- Step 2.2 — Dollar field input validation ✅ complete
- Step 2.3 — Empty save backend guard ✅ complete
- Step 2.4 — Fix reset handler for temp save button ✅ complete
- Step 2.5 — Remove decorative backdrop-blur for mobile performance ✅ complete
- Step 2.6a — Dough card layout and text changes ✅ complete
- Step 2.6b — Set-out logic for negative Left values ✅ complete

**Phase 2 complete.** All known Phase 2 fixes landed.

### Phase 3 — New feature work

- Step 3.1 — Unify date handling with top-level active date picker ✅ complete
- Step 3.1-cleanup — Code review fixes: always-confirm, kill tempStatus, fix clearAllFields flicker, date validation, visual distinction, trays+singles split, innerHTML fix, dependency comments, stale rules ✅ complete

### Phase 4 — Claude Design handoff implementation

- Step 4.1 — Adopt redesigned `index.html` + replace `css/styles.css` with the design's Mise en Place / Line Check theme system; rewire `utils.js`, `calculate.js`, `save.js`, `temps.js`, `main.js` to new IDs (`row-<size>-*`, `heroBatchNum`, `disp_<field>`, `msg_<field>`); add `js/bible.js` for the Dough Bible reference (active rows + collapsible full table); add `js/tweaks.js` for theme/density/bible-visibility with auto `prefers-color-scheme` default. New rendering: recipe chip list, unified set-out alert banner, hero recipe + batches block, masthead date. ✅ complete

### Phase 5 — Ports from abandoned branch `claude/update-dough-bible-2026-34P8C`

- Step A — parseDollar negative guard: `Math.abs` + strip `-` in `js/utils.js` ✅ complete
- Step B — stripExtraDots helper in `js/utils.js`; wired into dollar + temp input listeners in `js/main.js` ✅ complete
- Step C — Friendlier history load error: show "Couldn’t load history" message in `.catch` of `loadHistory()` ✅ complete
- Step D — Warn when saved/computed batch count > 10 in `activeHandleLoadedData` and `syncTempBatches` (capture rawBatches, branch status message) ✅ complete
- Step E — Cap Sicilian `doughLeft` at zero in `js/calculate.js` so a night-need shortfall doesn't inflate tomorrow's make ✅ complete

### Phase 6 — Multi-sheet Google Sheets storage

- Step 6.1 — Backend split into `Dough Counts` / `Temperatures` / `Dough Bible` tabs via `SHEETS` config + idempotent `seedSheets()`; merged `doGet?date=` response keeps the frontend unchanged ✅ complete
- Step 6.2 — `js/save.js` sends explicit `type: 'dough'` on the POST payload ✅ complete

**Deployment for Phase 6** (one-time, manual): clear the existing single-sheet data, paste the new `apps-script/Code.gs` into the Apps Script editor, run `seedSheets()` once, then deploy a new version.

### Phase 7 — UI simplification

- Step 7.1 — Bake in Mise en Place + Compact as the only look (`<html data-theme="mise" data-density="compact">`); delete Tweaks panel, gear button, `js/tweaks.js`, and tweaks CSS ✅ complete
- Step 7.2 — Collapse Batch Temperatures by default: section header toggles `.open` on the section, body hidden until expanded; reduces distraction for non-manager employees ✅ complete
- Step 7.3 — Bump body font 15px → 16px and line-height 1.4 → 1.45 for legibility ✅ complete

### Phase 8 — Make + 2pm tabs, collapse Bible & History

- Step 8.1 — Backend: `SHEETS` extended with `make` (tab `2pm Make Amount`) and `final` (tab `Final Dough Amount at 2pm`); `handleDoughPost` upserts both via new `upsertSizeRow(sheetKey, date, sizes)` helper; `seedSheets()` creates the new tabs idempotently ✅ complete
- Step 8.2 — Frontend: `js/save.js` reads per-size `make` from the breakdown DOM (`row-<size>-make`) via new `readMakeNum()` helper and sends `makes` + `finals` (count + make per size) on every dough save ✅ complete
- Step 8.3 — Bible fully collapsible: `.bible:not(.open) #bibleBody` hides the entire body (strip cards + table); toggle text now matches Temps style ✅ complete
- Step 8.4 — History collapsible: section restructured to a button-toggle header + `.history-body` wrapper; CSS + IIFE in `js/history.js` mirror the Temps pattern ✅ complete

**Deployment for Phase 8** (manual): paste the new `apps-script/Code.gs` into the Apps Script editor, run `seedSheets()` once to create the two new tabs (idempotent), then deploy a new version.

### Phase 9 — Actual Make correction card

- Step 9.1 — Backend: new `handleMakePost(data)` route; reads the existing Dough Counts row for the date, overwrites the **2pm Make Amount** row with the supplied makes, and recomputes the **Final Dough Amount at 2pm** row using `count + make` per size. Errors out if no Dough Counts row exists for the date. ✅ complete
- Step 9.2 — Frontend: new `js/make.js` and a Step 07 collapsed-by-default card at the bottom of the page. Five ball-count inputs (one per size) start blank with the calculated value as placeholder; blank fields fall back to placeholder on save. Separate `Save Actual Make` button POSTs `{type: 'make', date, makes}`. ✅ complete
- Step 9.3 — `calculate()` calls `updateMakePlaceholders()` so the calc-value hints stay current; `postToSheet` recognises the new `make_saved` action; `main.js` reset handler clears the make card too. ✅ complete

**Deployment for Phase 9** (manual): paste the new `apps-script/Code.gs` into the Apps Script editor (no `seedSheets()` re-run needed — the two tabs the make handler writes to already exist from Phase 8), then deploy a new version.

### Phase 10 — Auto-fill the Actual Make card on Save Count

- Step 10.1 — `populateMakeInputs()` in `js/make.js` writes calculated balls-to-make into the make-card inputs (sibling to `updateMakePlaceholders()` but `.value` instead of `.placeholder`); save success branch in `js/save.js` calls it on `created`/`updated` actions only. Step-07 inputs now show solid numbers after every Save Count, so the card reads as "ready to correct" instead of "empty." ✅ complete

**Deployment for Phase 10**: frontend-only — no Apps Script changes.

## Rules for future prompts

1. Every prompt must read this file first for project context.
2. At the end of every step, update the "Current file structure" and "Plan" sections to reflect the new state.
3. Every step ends with a git commit. Do not push unless explicitly told to.
4. Run `node --check` on all modified JS files before committing.
5. JS files share global scope via `<script>` tags — load order matters. See dependency comments at the top of each file.
