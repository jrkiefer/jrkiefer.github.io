# Dough Tracker — Project Context

## What this app is

Dough Tracker is a mobile-first web tool for Hot Tomato Pizzeria's dough workflow, opened by QR code on a kitchen phone. At 2 PM an employee enters sales numbers and counts the walk-in dough; the app computes tonight's use, tomorrow's need, what to make, and how many batches. At close (EON) they enter final sales and a closing count and get an outlook against tomorrow. Managers can log batch temperatures and correct the actual make amount.

**There are no save buttons.** Every input change is captured instantly to the phone (localStorage) and synced to a Google Sheet in the background. The masthead status dot tells the story: New night → Saved on phone (amber, pulsing) → Synced (green), with Offline — will retry when the network is down. Every filled input shows a small green "✓ saved" chip once the record is synced.

Static site served by GitHub Pages — **no build step**. The JS is vanilla ES modules (`<script type="module" src="js/main.js">`); `package.json` has `"type": "module"`.

This is **v2**, a from-scratch rebuild (July 2026) governed by MASTERPLAN.md and the approved reference build `design/preview.jsx`. The pre-rebuild v1 site is frozen at `/v1/` (and git tag `v1`) as a fallback during cutover — remove it after ~2 weeks of clean nights (masterplan phase 8).

## Current file structure

- `index.html` — static markup skeleton for both modes; repeated per-size blocks are built once at init by the UI modules
- `css/styles.css` — all CSS; Mise en Place is the only theme (tokens on `:root/[data-theme="mise"]`)
- `design/preview.jsx` — the approved React reference build (not served, not linted; the visual source of truth)
- `v1/` — byte-identical snapshot of the pre-rebuild live site (temporary fallback; still fully functional against the backend)
- `qr-code.png` — QR code image for scanning
- `MASTERPLAN.md` — the v2 build plan and decision log
- `package.json` / `package-lock.json` — test + lint scripts; eslint is the only devDependency; `"type": "module"`
- `eslint.config.mjs` — flat config: `js/**` + `test/**` are modules, `apps-script/` is script-goal, `v1/**` and `design/**` ignored
- `.github/workflows/ci.yml` — CI on every PR and push to main: `node --check` over `js/` and `v1/js/` (before `npm ci`, so syntax errors fail fast), then `npm ci`, `npm run lint`, `npm test`
- `js/`
  - `config.js` — constants only: `SCRIPT_URL`, `SHEET_URL`, `SIZES`, `BOIL`, `ALL`, `TRAYS_PER_BATCH`, `SIC_MIN`, `SIC_MIN_WAIVER`, `PEACH_MONTHS`, `MAX_BATCH_TEMPS`, `BIBLES` (both tables)
  - `calc.js` — pure math, no DOM/fetch/storage: `parseSales`, `money`, `fmt`, `fmtDate`, `countTotal`, `countBlank`, `blankRecord`/`blankCounts`, `autoBibleFor`, `bibleLookup`, `computePlan`, `effectiveMake`, `computeOutlook`
  - `api.js` — everything that knows the Apps Script wire format: `post` (text/plain + no-cors retry + keepalive), `getByDate`, `getHistory`, `buildPayloads`, `recordFromRow`, date helpers (`todayISO`, `isoToSheetDate`, `mdyToISO`, `sheetDateToLocal`, `toShorthand`)
  - `store.js` — record state, synchronous localStorage write-through, debounced background sync, status machine; **no DOM access**
  - `ui/` — one module per card; **UI modules never import api.js or store.js** — they get the record and a `patch` function via ctx (pure calc/config imports are fine)
    - `fields.js` (shared: `$`, `setText`, `bindInput`, `setInputValue`, `markHasValue`, `wireCollapse`)
    - `sales.js` `counts.js` `dayswork.js` `bysize.js` `outlook.js` `bible.js` `temps.js` `history.js` `make.js`
  - `main.js` — the only place store and UI meet: view derivation, mode tabs, two-tap reset, date input, unload/online flush wiring, boot
- `apps-script/`
  - `Code.gs` — version-controlled copy of the Google Apps Script backend; deploy by manually copying into the Apps Script editor
- `test/` — Node's built-in `node:test`, plain ES-module imports (78 tests)
  - `helpers/load.js` — vm harness kept ONLY for Code.gs (not a module) and for vm-loading `v1/js/*` in parity tests
  - `calc.test.js`, `api.test.js`, `store.test.js`, `codegs.test.js`

## The UI contract (how the no-rerender frontend works)

- `main.js` builds one store, derives a `view = {record, date, status, bibleId, autoBible, plan, eff, mode}` per state change, and routes it to every UI module.
- Each UI module exposes `init(ctx)` (bind inputs once — char-filter, `.has-value` class, `ctx.patch`), `update(view)` (writes **derived/display nodes only — never input values**, so focus is never disturbed), and optional `hydrate(view)` (sets input values — called only on load/reset/date-change).
- The one exception: the outlook forecast mirror may write its own input, guarded by the manual-entry flag and `document.activeElement`.
- Saved chips are pure CSS off one shared signal: `html[data-status="synced"] .field.has-value .saved-chip`.
- Mode visibility is pure CSS off `<html data-mode="twopm"|"eon">` (`.hide-in-eon` / `.hide-in-twopm`). 2 PM and EON have **separate count state** (`counts.js` is instantiated once per mode); both stay hydrated so switching modes is one attribute flip. EON auto-selects on load when the date already has 2 PM data; manual taps always win until the next load. Reset always returns to 2 PM.

## The data layer

Record shape (one per date, all raw input strings):

```
{ bible: null|'regular'|'peach',            // null = follow the month default
  twopm: { counts: {indi|small|large|sic|boil: {trays, singles}},
           todayForecast, currentSales, tomorrowForecast },
  actualMake: {indi, small, large, sic, boil},
  temps: [{water, dough}, …],
  eon: { sales, counts: {…}, outlookForecast, outlookManual } }
```

- Every `patch` JSON-clones the record, stamps `updatedAt`, and writes `localStorage["dough:<YYYY-MM-DD>"] = {v:2, record, updatedAt, syncedAt}` **synchronously** — that write is the moment data is safe. A 2.5 s trailing debounce then flushes to the backend.
- `flush` is single-flight with a rerun flag. It builds up to four payloads per record via `api.buildPayloads` and sends them **in order dough → make → temps → eon** (the make correction needs the dough row to exist server-side; it's skipped if dough fails). A per-type serialized-payload ack cache stops unchanged payloads from re-posting. A backend `{status:'error'}` rejection is terminal for that payload version (warned, retried only after the record changes); a network failure sets status `offline` and the payload retries on the next flush/`online` event.
- Payloads are **gated on the deployed backend's non-empty rules** so a background sync can never trip "Empty save rejected": dough needs a count or forecast > 0; eon needs sales or a count > 0; temps needs a value; make needs an entered actualMake field.
- Unload safety: `visibilitychange`(hidden) and `pagehide` fire a keepalive fetch flush (fire-and-forget, never marked synced); a boot-time `retryUnsynced()` re-sends any date whose local copy has `syncedAt < updatedAt`. Server upserts make duplicate sends harmless.
- Changing the date auto-loads (no Load button): local entry with unsynced edits wins wholesale; otherwise the server's merged GET wins, with `actualMake` and the outlook fields carried over from a fully-synced local copy (the sheet never stores them); otherwise blank. Network failure falls back to the local copy with status `offline`.
- **Reset is two-tap** (armed 2.5 s) and blanks only the open date's record, stamping `updatedAt` with `syncedAt: 0` so local-wins blocks the server copy from resurrecting the cleared data. Sheet rows are NOT deleted — there's no backend API for that.
- Validation is advisory only (range notes under the money fields); nothing blocks capture. The backend keeps its own rejection rules as the last line of defense.

## The five dough sizes

- **Individual (indi)** — 11/tray, green. **Small** — 8/tray, red. **Large** — 6/tray, blue. Standard lookup-based calculation.
- **Sicilian (sic)** — 3/tray, pink. Counted loose (single balls input). Minimum make of 2 — **waived when 10+ are on hand**. Its 2 PM "left" clamps at 0 (same-day Sicilian can't be used, so a shortfall must not inflate tomorrow's make) and it never triggers set-out. In the EON outlook it's treated like every other size (EON-made Sicilian IS usable tomorrow).
- **Boil** — 6/tray, purple, fixed target 36, ignores the bibles. **Makes whole trays only**: trays = ceil(max(0, 36 − count) / 6), make = trays × 6 (33 on hand → 1 tray of 6, ending at 39). A **blank** boil count means "not counted": excluded from batch math with a visible note, and saved as an empty sheet cell (not 0).

## The Dough Bibles

Two lookup tables live in `BIBLES` (js/config.js), row format `[threshold, indi, small, large, sic]`:

- **regular** — Dough Bible 2026: 27 rows, $3,750–$20,750 (identical to v1's table).
- **peach** — Peach Dough Bible 2024: 30 rows, $3,000–$17,500. **Auto-default July 1 – August 31** (by active date). A manual pill toggle in the Bible card overrides and stamps the choice on the night's record (`record.bible`; null = follow the month).

Both tables were verified against the physical binder (July 2026). `bibleLookup` rounds UP to the next threshold, caps at the top row, floors at the bottom row for positive amounts — and returns zeros (tier 0) for 0/negative amounts. **`BIBLE_DATA` and `PEACH_BIBLE_DATA` in Code.gs mirror these tables and a test enforces both syncs** — editing one side without the other fails `npm test`.

## The math (`computePlan` in js/calc.js — pure, unit-tested)

1. **Sales Left** = Today's Forecast − Current Sales.
2. **Use Tonight** = lookup(Sales Left) on the active bible. If Sales Left ≤ 0 (closed day or forecast already hit), use is zero for every size — never rounds up to the first row.
3. **Left** = Count − Use per size (blank pizza counts read as 0). Sicilian's Left clamps at 0.
4. **Need Tomorrow** = lookup(Tomorrow's Forecast).
5. **Make** = Need − Left, floored at 0. Sicilian floors at 2 unless 10+ on hand.
6. **Trays** = ceil(Make ÷ per-tray) per size.
7. **Boil**: whole trays only (see above); skipped entirely on a closed tomorrow.
8. **Total Trays** = all five tray counts. **Batches** = ceil(Total ÷ 11) (0 when nothing to make).
9. **Extras** = Batches × 11 − Total: 1–4 → all Large; 5+ → 1 Small, rest Large; never Indi/Sicilian. Extras are **display-level only** (`finalTrays`, the chips and trays column) — the saved makes stay the raw calculated balls.

Cross-cutting rules:

- **Closed tomorrow**: an explicit `0` in Tomorrow's Forecast means **zero need for every size including boil** — no makes, no Sicilian minimum, no boil top-up, batches 0. (Tonight's use and set-out still compute.) A **blank** tomorrow forecast means the plan is simply not ready.
- **Ready gate**: the plan (`ready`, batches, makes, finalTrays) requires all three money fields entered. Counts alone still save; makes/finals just don't ride along until the plan is ready.
- **Set-out**: negative Left for Indi/Small/Large → "set out ceil(−Left ÷ per-tray) trays" in one alert card. Never Sicilian (its clamp), never Boil.
- **Dollar shorthand** everywhere money is typed: under 100 reads as thousands (10 → 10,000 · 6.7 → 6,700); 100+ literal. Decimal keyboard, one dot. Every money field echoes the expanded amount.
- **Actual Make** (Step 07): one balls input per size; calculated make is the placeholder; an entered value wins everywhere downstream (`effectiveMake`) and auto-POSTs a `type:'make'` correction.
- **EON Outlook** (Step 08): EON counts vs tomorrow's need. Primary diff is **trays rounded to the nearest tray** (sign/color from the ball diff, exact balls underneath); summary speaks trays first, "less than a tray" when a shortage rounds to 0; **no warning banner** — same-day dough is normal. The forecast pre-fills from the 2 PM save; any keystroke flips a manual flag that wins until Reset; a source caption shows From 2 PM save / Manual entry / No 2 PM save — enter manually.

## Google Sheets integration

`SCRIPT_URL` points to a Google Apps Script web app. The spreadsheet has **seven tabs**; `SHEETS` in `Code.gs` is the single source of truth for names + headers:

- **Dough Counts**: `Date | Today's Forecast | Current Sales | Sales Left | Tomorrow's Forecast | Indi Count | Small Count | Large Count | Sic Count | Boil Count | Batches | Bible` (Bible column appended in v2: `regular`/`peach`, blank from old frontends)
- **Temperatures**: `Date | Water 1 | Dough 1 | … | Water 10 | Dough 10`
- **Dough Bible** and **Peach Bible** (v2): `Threshold | Indi | Small | Large | Sicilian` — reference only; the JS owns the calculation source of truth
- **2pm Make Amount**: `Date | Indi | Small | Large | Sicilian | Boil` — raw calculated balls-to-make, clamped ≥ 0 (extras never save; a real extras make lands via the Actual Make correction). Written alongside every dough save when the plan is ready.
- **Final Dough Amount at 2pm**: same columns — count + make per size. Also written alongside dough saves; recomputed by make corrections.
- **End of Night Count**: `Date | EON Sales | EON Indi Count | … | EON Boil Count` — EON-prefixed so the merged GET carries both records without collision.

Wire format (all POSTs `Content-Type: text/plain` to dodge the CORS preflight; opaque responses count as landed; one no-cors retry on network throw):

- `type:'dough'` — v1 fields + `bible`; `makes`/`finals` ride along when the plan is ready. Blank boil count travels as `''` (empty cell, not 0).
- `type:'make'` — `{date, makes}` from `effectiveMake`; backend requires an existing Dough Counts row and recomputes finals from that row's counts.
- `type:'temps'` — `{date, temps: [{water, dough}…]}`, positional, trailing blanks trimmed.
- `type:'eon'` — sales + per-size counts; blank counts travel as `''` ("not counted" ≠ counted zero). The response echoes `tomorrowForecast` (v2 reads the local record instead — echo kept for `/v1/` compat).
- Backend rejections: missing date, empty save, negative values (`salesLeft` exempt). Each tab keeps one row per date; saves upsert.
- **GET** `?date=M/D/YYYY` → `{status:'found', data}` (merged dough+temps+eon row) or `{status:'not_found'}`; bare GET → array of the last ≤30 Dough Counts rows, newest first (History card, behind an explicit load button).
- **Deploy flow**: edit `Code.gs` via PR, merge, paste into the Apps Script editor, deploy a new version; run `seedSheets()` when tabs/columns changed (idempotent — creates missing tabs, seeds both bibles, appends the Bible header to a pre-v2 Dough Counts tab).
- **Compat matrix**: v2 frontend + old deployed backend works (bible field ignored, not persisted); `/v1/` frontend + new backend works (Bible cell left blank).

## Testing & CI

- `npm test` — 78 tests, zero dependencies, Node's built-in `node:test`, plain ES-module imports.
- `npm run lint` — eslint (flat config). `node --check` on all JS before every commit (Code.gs needs a `.js`-extension copy — see the CI workflow).
- `test/calc.test.js` — lookup/table invariants for both bibles, computePlan fixtures (including real sheet-export nights), every v2 rule (waiver, whole-tray boil, extras splits, closed-tomorrow), outlook rounding, and a **v1-parity suite** that vm-loads `v1/js/` computeDough and asserts identical plans on identical inputs (boil balls aside — whole-tray by design).
- `test/api.test.js` — payload building/gating, hydration mapping, transport fallbacks (mocked global fetch).
- `test/store.test.js` — the sync state machine with mocked fetch/storage and `node:test` mock timers: debounce, ordering, ack cache, offline recovery, mid-flight edits, merge matrix, reset semantics, boot retry.
- `test/codegs.test.js` — Code.gs in a vm context: validation branches, **dual bible sync**, Bible column, seedSheets idempotency.

## Known quirks and gotchas

- **From zero day (closed today)**: enter an explicit 0 in Today's Forecast; Sales Left ≤ 0 → zero use tonight, make equals tomorrow's row exactly, no set-out.
- **Closed tomorrow**: explicit 0 in Tomorrow's Forecast → zero need including boil (see The math). Decided with Jacob, July 2026 — supersedes the preview, which still topped boil up.
- **Blank vs zero**: blank 2 PM pizza counts compute as 0 and hydrate back as blanks; blank boil and blank EON counts mean "not counted" and round-trip as empty sheet cells. Legacy v1 EON rows wrote 0 for untouched fields — those hydrate as counted zeros (documented artifact).
- **Explicit money zeros round-trip**: a saved 0 forecast hydrates back as '0', not blank.
- **toShorthand wart** (inherited from v1): dollar values ≥ $100,000 would display-shorthand ambiguously; the shop's range ($1k–$22k) never gets near it.
- **Reset can't delete sheet rows** — it blanks the phone's record and blocks server resurrection via local-wins. Fixing a wrong save = re-enter and let the upsert overwrite.
- **Last-writer-wins across phones**: two devices editing the same date converge on whoever synced last; unsynced local edits always beat a server load on that device.
- **Duplicate-row prevention lives in the backend** (upsert by date), not the frontend.
- **History EON sales** come from the local cache only ("—" otherwise) — the bare history GET carries Dough Counts rows only.
- **Zoom is locked** (`user-scalable=no`) — deliberate for floury hands on a kitchen phone.
- **Theme/density baked in**: `<html data-theme="mise" data-density="compact">` — the CSS keys off these; don't remove them.
- **Temps, Bible, History, and Make are collapsed by default** — shared `wireCollapse` pattern, "Tap to expand ▾"/"Tap to collapse ▴".
- **`/v1/` is frozen** — never edit it; it exists so the QR keeps working through cutover. Remove in phase 8.

## Changelog

| Phase | Summary | Backend redeploy? |
|---|---|---|
| v1 (1–14) | See the git history and tag `v1` — the pre-rebuild app and its cleanup arc | — |
| v2·0 | Tag `v1`, snapshot the live site at `/v1/`, add `design/preview.jsx` | — |
| v2·1 | Pure `js/calc.js` + dual bibles as ES modules; plain-import tests + v1 parity suite; ESM flip (`"type": "module"`, eslint rewrite) | — |
| v2·2 | Local-first data layer: `js/api.js` (wire format, payload gating, hydration) + `js/store.js` (write-through, debounced single-flight sync, boot retry, reset semantics) | — |
| v2·3 | New UI shell: index.html skeleton, v2 styles, 2 PM flow (sales/counts/dayswork/bysize), saved chips, no save buttons | — |
| v2·4 | EON flow: outlook with tray-first diffs and manual-forecast-wins | — |
| v2·5 | Collapsibles: dual bible card, temps, history, actual make; two-tap reset | — |
| v2·6 | Backend: Bible column + Peach Bible tab + seedSheets migration steps; dual sync test | **Yes + `seedSheets()`** |
| v2·7 | Cutover: v2 at root, `/v1/` fallback, CLAUDE.md rewritten | — |
| v2·8 | (pending, after ~2 weeks of clean nights) polish from real use; remove `/v1/` | — |

## Rules for future prompts

1. Every prompt must read this file first for project context.
2. At the end of every step, update the "Current file structure" and "Changelog" sections to reflect the new state.
3. Every step ends with a git commit. Run `node --check` on all modified JS and `npm test` before committing.
4. UI modules never import api.js/store.js; store.js never touches the DOM; calc.js stays pure. New UI must follow the init/update/hydrate contract (update never writes input values).
5. `BIBLES` (js/config.js) and `BIBLE_DATA`/`PEACH_BIBLE_DATA` (apps-script/Code.gs) must change together in the same PR — `npm test` enforces the sync. Never guess or "correct" bible numbers — they come from the physical binder via Jacob.
6. `apps-script/Code.gs` changes require a manual redeploy: paste into the Apps Script editor and deploy a new version (run `seedSheets()` when tabs or columns changed). Keep changes additive — historical rows must keep working, and `/v1/` must stay compatible until it's removed.
7. Never edit `/v1/` or `design/preview.jsx` — both are frozen references.
