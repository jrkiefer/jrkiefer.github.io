# Dough Tracker — Project Context

## What this app is

Dough Tracker is a mobile-first web calculator used by a pizza shop. In the first workflow, an employee scans a QR code, enters current sales, today's and tomorrow's forecasted sales, and counts the current dough inventory across five dough sizes; the app calculates how many dough batches to make for tomorrow and saves the entry to a Google Sheet via a Google Apps Script web app. In the second workflow, later in the day, another employee loads that day's record and enters water and dough temperatures for each batch. The entire app is currently one single `index.html` file with inline `<style>` and `<script>`, about 1,500 lines.

## Current file structure

- `index.html` — the entire application (HTML, CSS, JS all inline)
- `README.md` — repo readme
- `qr-code.png` — QR code image for scanning
- `CLAUDE.md` — this file (project context for the refactor)
- `css/`
  - `styles.css` — all CSS extracted from index.html
- `js/`
  - `app.js` — save, history, temps, and wiring code (pending Steps 1.7–1.10)
  - `config.js` — all constants (SCRIPT_URL, DOUGH_TABLE, PER_TRAY, etc.)
  - `utils.js` — utility functions (parseDollar, expandDollar, sanitize, etc.)
  - `calculate.js` — calculation pipeline (lookup, calculate, debouncedCalculate, etc.)
  - `save.js` — placeholder (populated in Step 1.7)
  - `history.js` — placeholder (populated in Step 1.8)
  - `temps.js` — placeholder (populated in Step 1.9)
  - `main.js` — placeholder (populated in Step 1.10)

## The five dough sizes

- **Individual (indi)** — 11 balls per tray. Standard lookup-based calculation.
- **Small** — 8 balls per tray. Standard lookup-based calculation.
- **Large** — 6 balls per tray. Standard lookup-based calculation.
- **Sicilian (sic)** — 3 balls per tray. Counted as a single number in the UI (not trays × extras). Has a hardcoded minimum of 2 balls inside `calculate()` — if the calculated "balls to make" is less than 2, it is forced to 2.
- **Boil** — 6 balls per tray. Fixed target of 36 balls. Does NOT use the Dough Bible lookup table; instead, the formula is simply `max(0, 36 - currentBoilCount)`.

## The Dough Bible lookup

`DOUGH_TABLE` is a 27-row array of objects. Each row has a `threshold` (dollar amount) and ball counts for `indi`, `small`, `large`, and `sic`. Thresholds range from $3,750 to $20,750.

The `lookup(dollarAmount)` function performs a linear scan and returns the first entry whose `threshold >= dollarAmount` — in other words, it rounds UP to the next threshold. If the input exceeds the last threshold ($20,750), it caps at the highest row and returns that row's values.

Boil dough does NOT use this table. Its target is always 36 regardless of forecast.

## The math

The 9-step calculation chain inside `calculate()`:

1. **Sales Left** = Today's Forecast − Current Sales
2. **Dough Use Tonight** = `lookup(Sales Left)` — ball counts needed for tonight's remaining sales
3. **Dough Left** = Current Count − Dough Use Tonight (per size)
4. **Dough Needed Tomorrow** = `lookup(Tomorrow's Forecast)` — ball counts needed for tomorrow
5. **Balls to Make** = Needed − Left (per size; Sicilian is floored at 2)
6. **Trays Needed** = `ceil(Balls to Make / balls per tray)` per size (0 if Balls to Make ≤ 0)
7. **Boil Balls to Make** = `max(0, 36 − current boil count)`; Boil Trays = `ceil(Boil Balls to Make / 6)`
8. **Total Trays** = sum of all tray counts (Indi + Small + Large + Sicilian + Boil trays)
9. **Batches** = `ceil(Total Trays / 11)`

## Google Sheets integration

`SCRIPT_URL` points to a Google Apps Script web app that acts as the database API.

- **Save (POST)**: `postToSheet()` sends a POST with a JSON body (`Content-Type: text/plain` to avoid CORS preflight). On CORS failure, retries with `mode: 'no-cors'`. One row per day in the sheet; a second save on the same day overwrites the existing row.
- **History (GET)**: `loadHistory()` fetches `SCRIPT_URL` with no parameters, receives an array of all rows, takes the last 10, and displays them newest-first.
- **Load by date (GET)**: Fetches `SCRIPT_URL?date=<date>` and expects either `{status: "found", data: {...}}` or `{status: "not_found"}`. Falls back to fetching all rows and searching client-side if the endpoint returns an array instead.

Sheet column names use spaces and title case:
- `"Today's Forecast"`, `"Current Sales"`, `"Tomorrow's Forecast"`
- `"Indi Count"`, `"Small Count"`, `"Large Count"`, `"Sic Count"`, `"Boil Count"`
- `"Batches"`
- `"Water 1"` through `"Water 10"`, `"Dough 1"` through `"Dough 10"`

## Known quirks and gotchas

- **Sicilian minimum of 2**: Hardcoded inside `calculate()`. If the math says to make fewer than 2 Sicilian balls, it is forced to 2.
- **Boil display**: The UI shows "Make X trays and Y singles" (full trays plus remainder), but the batch math uses the rounded-up tray count (`ceil(boilMake / 6)`).
- **Dollar shorthand**: `expandDollar()` multiplies numbers under 100 by 1000, so `1.7` becomes `1700` and `10` becomes `10000`. Numbers ≥ 100 are taken literally.
- **Debounce**: Calculation is debounced at 100ms on input events via `debouncedCalculate()`.
- **Date handling**: Dates use local browser time (not UTC). `normalizeDate()` converts between `YYYY-MM-DD` and `M/D/YYYY` formats for matching.
- **Duplicate row prevention**: Lives in the Apps Script backend, not in the frontend. The frontend does not check whether a row already exists before saving.

## Known issues (to be fixed in Phase 2)

- **Blind save**: `postToSheet()` shows "Sent! (verify in sheet)" on opaque fetch responses — no real confirmation the row landed.
- **No input validation on dollar fields**: Users can submit nonsensical values.
- **Empty saves**: Empty or partial entries can create garbage rows in the sheet.
- **Backdrop-blur performance**: `backdrop-filter: blur(12px)` on multiple elements may slow older phones.
- **Reset button incomplete cleanup**: The reset handler does not fully clear the temperature save button's `disabled`, `textContent`, or `classList` (error/success) state — only `_isSaving` is reset.

## Refactor plan

### Phase 1 — Multi-file split (pure refactor, no behavior changes)

- Step 0 — Create CLAUDE.md from real index.html ✅ complete
- Step 1.1 — Create folder structure and empty files ✅ complete
- Step 1.2 — Extract CSS to css/styles.css ✅ complete
- Step 1.3 — Extract JS to js/app.js (single-file checkpoint) ✅ complete
- Step 1.4 — Split app.js → config.js ✅ complete
- Step 1.5 — Split app.js → utils.js ✅ complete
- Step 1.6 — Split app.js → calculate.js ✅ complete
- Step 1.7 — Split app.js → save.js ⬅ NEXT
- Step 1.8 — Split app.js → history.js
- Step 1.9 — Split app.js → temps.js
- Step 1.10 — Create main.js, delete app.js

### Phase 2 — Known bug fixes (6 steps)

Pending. Held until Phase 1 is tested in production.

### Phase 3 — New feature work

Reserved for future feature additions after Phase 2 is complete.

## Rules for future prompts

1. Every future refactor prompt must read this file first for project context.
2. At the end of every step, update the "Current file structure" section and the "Refactor plan" section to reflect the new state.
3. Phase 1 is a pure refactor — no behavior changes, no style changes, no logic changes. If a bug is noticed during Phase 1, leave it alone; it will be fixed in Phase 2.
4. Every step ends with a git commit on the `refactor/multi-file-split` branch. Do not push unless explicitly told to.
5. Every step must verify that `index.html`'s rendered behavior is unchanged before committing.
