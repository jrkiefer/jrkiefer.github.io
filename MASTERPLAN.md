# Dough Tracker v2 — Build Plan for Claude Code

This document governs the v2 rebuild of the Dough Tracker at jrkiefer.github.io.
It is written for Claude Code to execute phase by phase. The spec here is final —
every rule in it was decided with Jacob in July 2026. CLAUDE.md describes v1 and
its conventions; read it first for context, then follow this file.

## How to work this plan

1. Read CLAUDE.md before touching anything. It explains the v1 codebase, the
   Google Sheets backend, the deploy flow, and the testing setup — most of which
   carries forward.
2. `design/preview.jsx` is the approved reference build. It is a React preview
   Jacob signed off on: correct math, correct layout, correct design tokens,
   correct copy. Production is **vanilla JS ES modules with no build step**, so
   port the behavior and design from the preview — do not copy React patterns
   into the site. When this document and the preview disagree on a visual
   detail, the preview wins; when they disagree on math, this document wins
   (then flag the discrepancy to Jacob).
3. Work one phase per session. Every phase ends with `node --check` on touched
   files, `npm test` green, and a commit. Do not push unless told.
4. Update CLAUDE.md's file-structure and changelog sections at the end of every
   phase, same as v1's convention.
5. When the spec is silent, ask Jacob rather than inventing — especially
   anything touching the Dough Bible numbers, which must never be guessed or
   "corrected."

## What this app is

A mobile-first web tool for Hot Tomato Pizzeria's dough workflow, opened by QR
code on a kitchen phone. At 2 PM an employee enters sales numbers and counts the
walk-in dough; the app computes tonight's use, tomorrow's need, what to make,
and how many batches. At close (EON) they enter final sales and a closing count
and get an outlook against tomorrow. Everything captures instantly and syncs to
a Google Sheet in the background — there are no save buttons. Managers can log
batch temperatures and correct the actual make amount.

## Architecture

Same rails as v1: GitHub Pages static frontend, Google Apps Script backend,
Google Sheets storage. New frontend structure:

```
index.html                 markup only
css/styles.css             tokens + components (carried from v1, trimmed)
design/preview.jsx         approved reference build (not served, not shipped)
js/
  config.js                constants: both bibles, per-tray, colors, script URL
  calc.js                  pure math — no DOM, no fetch
  api.js                   Apps Script wrappers: post, get-by-date, history
  store.js                 record state, localStorage, sync queue, status
  ui/
    sales.js  counts.js  dayswork.js  bysize.js
    temps.js  history.js  make.js  outlook.js  bible.js
  main.js                  date + mode state, wiring, boot
apps-script/Code.gs        backend (manual deploy flow unchanged)
test/                      node:test with plain imports (vm harness retired)
```

Two structural rules that keep features cheap to add later:

- UI modules never import api.js and never touch storage. They receive the
  current record and a patch function; nothing else.
- store.js never touches the DOM. It exposes the record, patch, status, and a
  subscribe hook; main.js connects the two worlds.

## Data layer behavior

- Every input change patches the record and writes it to localStorage
  **synchronously** (`dough:<date>` with an `updatedAt` stamp). That write is
  the moment data is safe.
- A ~2.5 s trailing debounce then builds the sheet payloads and POSTs to Apps
  Script in the background. Flush any pending sync on `visibilitychange` and on
  the `online` event. On boot, retry any records flagged unsynced.
- Status states, shown as the masthead dot: New night · Loading · Saved on
  phone (amber, pulsing) · Synced (green) · Offline — will retry.
- **Per-field saved chips**: every input shows a small green "✓ saved" tag on
  its top-right corner when it holds a value and the global state is Synced.
  The chip disappears while the user is editing (state drops back to Saved on
  phone) and reappears when the sync lands. One shared signal drives all chips —
  no per-field bookkeeping.
- Changing the date auto-loads that record (merged GET), no Load button. If a
  local copy exists, the newer `updatedAt` wins.
- Validation is advisory only — warnings never block capture. The backend keeps
  its own rejection rules as the last line of defense.
- Reset is a two-tap button in the masthead that clears the open date's local
  record only.

## Sheet schema — keep, extend additively

All v1 tabs and headers stay byte-identical (historical rows keep working):
Dough Counts, Temperatures, Dough Bible, 2pm Make Amount, Final Dough Amount at
2pm, End of Night Count. Additions only:

- Dough Counts gains one appended column: `Bible` (`regular` / `peach`).
- New reference tab `Peach Bible`: Threshold, Indi, Small, Large, Sicilian.
- `seedSheets()` gains two idempotent steps: create the Peach Bible tab, append
  the Bible column header if missing.
- `2pm Make Amount` keeps its existing meaning — raw calculated balls-to-make
  per size, clamped at 0. The batch-extras tray plan is display-level only and
  is not written to the sheet; if the crew makes the extras, that reality lands
  through the Actual Make correction.

## Calc spec — final

Sizes and trays: Indi 11/tray · Small 8/tray · Large 6/tray · Sicilian 3/tray ·
Boil 6/tray. Batch = 11 trays. Kitchen colors (canonical, from v1 CSS): Indi
green #2f6b3a, Small red #b3321b, Large blue #1b6fa8, Sicilian pink #c94a7a,
Boil purple #7a3b8e.

1. **Sales Left** = Today's Forecast − Current Sales.
2. **Use Tonight** = lookup(Sales Left) on the active bible. If Sales Left ≤ 0,
   use is zero for every size (zero-day rule — never rounds up to the first row).
3. **Left** = Count − Use, per size. Sicilian's Left clamps at 0 (same-day
   Sicilian can't be used; a shortfall must not inflate tomorrow's make).
4. **Need Tomorrow** = lookup(Tomorrow's Forecast). Lookup rounds UP to the next
   threshold, caps at the top row, floors at the bottom row.
5. **Make** = Need − Left, per size, floored at 0. Sicilian floors at 2 — unless
   the current Sicilian count is 10 or more, in which case no minimum.
6. **Trays** = ceil(Make ÷ per-tray) per size. A Sicilian make of 1, 2, or 3
   occupies exactly 1 tray.
7. **Boil makes whole trays only**: Boil Trays = ceil(max(0, 36 − boil count) ÷ 6),
   Boil Make = Boil Trays × 6 balls. Example: 33 on hand, target 36 → 1 tray of
   6, ending at 39. Boil ignores the bible entirely. A blank boil count means
   "not counted" — excluded from batch math with a visible note.
8. **Total Trays** = all five tray counts (Sicilian and Boil included).
   **Batches** = ceil(Total ÷ 11).
9. **Extras** = Batches × 11 − Total Trays. If 1–4: all to Large. If 5 or more:
   1 to Small, the rest to Large. Indi and Sicilian never receive extras.

Cross-cutting rules:

- **Dollar shorthand** in every money field: values under 100 multiply by 1000
  (10 → 10,000 · 6.7 → 6,700 · 21.5 → 21,500); 100 and up are literal. Decimal
  keyboard (digits + one dot). Each field echoes the expanded amount inline.
- **Blank pizza counts read as 0** for computation; boil blank means not counted.
- **Set-out**: when Left goes negative for Indi/Small/Large, show "set out
  ceil(−Left ÷ per-tray) trays" per size in a single alert card. Sicilian never
  triggers set-out (its clamp), Boil has none.
- **Bibles**: `regular` = Dough Bible 2026 (27 rows, $3,750–$20,750). `peach` =
  Peach Dough Bible 2024 (30 rows, $3,000–$17,500). Peach is the auto-default
  July 1 – August 31; a manual toggle overrides; the choice is stamped on the
  night's record. Both tables live in config.js with mirrors in Code.gs and a
  sync test covering both. **Hard gate: Jacob verifies both tables against the
  physical binder before phase 6 ships** — the Peach $17,000 row was
  photographed under glare.
- **Actual Make** is one balls input per size (managers think in total balls,
  not trays). Calculated make shows as the placeholder; an entered value wins
  everywhere downstream.
- **EON Outlook**: rows show EON count vs tomorrow's need. The primary diff is
  **the leftover after tomorrow in trays, rounded to the nearest tray**
  (sign and red/green color come from the ball diff; exact ball diff shows small
  underneath). Summary line speaks trays first: "Tomorrow we will potentially go
  into same-day dough by ~N trays (M balls)" / "Dough is good ✓ — ~N trays
  leftover (M balls)"; a shortage that rounds to zero trays reads "less than a
  tray." No warning banner — going into same-day dough is normal. The outlook
  forecast pre-fills from the 2 PM save; any manual keystroke flips a
  manual-entry flag that wins from then on, with a source caption (From 2 PM
  save / Manual entry / No 2 PM save — enter manually).

## UI spec

The preview is the visual source of truth; this is the checklist.

- **Masthead**: status dot + label left, two-tap Reset right; "Dough *Tracker*"
  wordmark (Fraunces, italic accent word in burnt red); subline shows the
  active bible (with "· auto" when following the month default) ● Pizzeria Ops.
- **00 Active Date**: date input, defaults today, auto-loads.
- **Mode tabs**: 2 PM / EON. Auto-select EON when the date already has 2 PM
  data; manual taps always win. Separate count state per mode.
- **01 Sales & Forecast** (2 PM): today's forecast, current sales, computed
  Sales Left with the matched bible row noted ("→ $5,000 row · Peach '24", or
  "past forecast — zero use tonight"), tomorrow's forecast. In EON mode this
  step is a single Final Sales field with a ± vs forecast line.
- **02 Current Dough Counts**: two-column cards, colored left border + faint
  tint per size, TRAYS + SINGLES inputs with a live "= N balls" (Sicilian is a
  single BALLS input labeled "min 2 balls"; Boil is full-width labeled
  "target 36 · 6 / tray").
- **03 The Day's Work**: a small TRAYS eyebrow above the chip row; chips show
  final trays per size including extras (zero chips dimmed); hero batches
  number in Fraunces burnt red; under it "N trays (M planned · extras: +1 SM,
  +4 LG)" and a "boil not counted" note when applicable. Set-out alert card
  below when triggered.
- **04 By Size**: full-math table with HAVE / USE / LEFT / NEED / MAKE / TRAYS
  columns, the handwritten-style "E−D!!!" annotation, negative LEFT in red,
  trays column tinted per size showing **the final number only — no +n badges**.
  Boil row beneath with HAVE / TARGET / MAKE and "nT · whole trays only".
  Footer caps note: make in balls · trays includes batch extras · SIC min 2
  unless 10+ on hand.
- **Collapsibles** (both modes, "Tap to expand ▾" pattern): Dough **Bible**
  (dashed card; regular/peach toggle with auto tag; scrollable table with
  tonight/tomorrow row highlights; pending-binder-verification note until the
  gate clears), **05 Batch Temperatures** (water °F + dough °F pair per batch,
  rows = max(batches, 3) capped at 10), **06 Recent History** (recent nights,
  EON sales + batches, tap to open that date), **07 Actual Make Amount**.
- **08 EON Outlook** as specced above, EON mode only.

Design tokens come from v1's css/styles.css (Mise en Place) and match the
preview: bg #f3ece0 with soft radial grain, paper #fbf7ee, ink #1f1b15, rules
#d9cfb9, accent #b3321b, warn #b87e1a, good #2f6b3a, neg #a3341f. Fonts:
Fraunces (display), Inter Tight (body), JetBrains Mono (numbers and caps
labels), Permanent Marker for the E−D!!! annotation only. Tabular numerals
everywhere numbers align. Radius 10/6, inputs ~44 px tall, 460 px max width,
big touch targets — this is used with floury hands.

## Phases

| Phase | Scope | Done when | Redeploy? |
|---|---|---|---|
| 0 | Tag main as `v1`; copy the live site into `/v1/` so the QR keeps working during the rebuild; add `design/preview.jsx`. | v1 reachable at /v1/, main free to change | — |
| 1 | `js/calc.js` as an ES module: port v1's computeDough + lookup exactly, then extend per the calc spec (bible param, Peach table, extras rule, Sicilian waiver, boil whole-tray). Port compute/lookup tests to plain imports; add parity tests old-vs-new on identical inputs, then tests for every new rule including the 33→39 boil example and the 1–4 / 5+ extras split. | All tests green including parity | — |
| 2 | `js/store.js` + `js/api.js`: record shape, synchronous localStorage write-through, debounce + flush + retry queue, status states. Tests with mocked fetch/storage covering offline, tab-close flush, and newer-updatedAt merge. | Sync survives simulated failures in tests | — |
| 3 | New `index.html` + ui modules for the 2 PM flow (sales, counts, dayswork, bysize) on the new store; styles.css carried and trimmed; per-field saved chips; dollar echoes. | A full 2 PM night works against the real backend from a phone; chips behave | — |
| 4 | EON flow: separate count state, outlook module with tray-first diffs and manual-forecast-wins, mode auto-select. | EON save + outlook verified against the preview | — |
| 5 | Collapsibles: bible (dual + toggle + auto month), temps pairs, history, actual make. Two-tap reset. | Feature parity with v1 everywhere it had features | — |
| 6 | Backend additive changes: accept `bible` in the dough payload, write the new column, Peach Bible tab in SHEETS + seedSheets, extend the bible-sync test to both tables. | **Jacob has verified both tables against the binder**; seedSheets run; saves round-trip with the bible stamp | **Yes** |
| 7 | Cutover: v2 at root, QR unchanged, /v1/ stays up two weeks. Rewrite CLAUDE.md to describe v2. | Crew runs a full real night with no paper fallback | — |
| 8 | Polish from real use: offline states in the wild, >10-batch sanity note, empty states, remove /v1/. | — | — |

## Decision log (resolved with Jacob, July 2026)

1. Extras: 1–4 trays all to Large; 5+ → 1 Small, rest Large; never Indi/Sicilian.
2. EON shortfall: marked and displayed, no warning banner — same-day dough is
   normal, not an alarm.
3. Peach bible auto-default July 1 – August 31 exactly.
4. Bible tables verified against the physical binder before phase 6 — hard gate.
5. Sicilian minimum 2, waived when 10+ on hand.
6. Boil makes whole trays only (33 on hand → 1 tray of 6 → ends at 39).
7. EON outlook diffs display in trays rounded to the nearest tray, ball diff
   secondary; summary in trays with balls in parentheses.
8. By Size trays column shows final numbers with no +n badges; the extras
   breakdown lives in the Day's Work line; a TRAYS label sits above the chips.
9. Every input gets a small green "✓ saved" chip once its value has synced,
   driven by one shared status signal.
10. Sales shorthand: under 100 reads as thousands; 100+ literal; decimal
    keyboard; inline expanded-amount echo on every money field.
