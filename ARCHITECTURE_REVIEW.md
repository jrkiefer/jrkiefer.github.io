# Dough Tracker — Architecture Review (July 2026)

A full review of the app at v2·20: what every part does, what's working, what's broken,
how the code could be organized better, and — after weighing eleven candidate architectures —
which direction is actually worth taking. Produced from a complete sweep of `js/`, `index.html`,
`css/styles.css`, `apps-script/Code.gs`, `test/`, CI, the docs, the git history, and the shop's
manual Excel workbook (`Hot_Tomato_Dough_Calculator.xlsx`).

**Verdict up front: the v2 architecture is fundamentally sound. Keep it.** The layered
vanilla-ES-module design, the local-first sync machinery, and the test discipline are all
assets that a rewrite, a framework, or a build step would liquidate for nothing the kitchen
would ever notice. The real wins are: four honesty defects in the sync/status path, guardrail
tests for the exact couplings that have already caused kitchen incidents, duplication removal
in `Code.gs`, and bringing the stale docs back in line with reality. A concrete 12-phase
roadmap for all of that is in §7.

---

## 1. Executive summary

| Question | Answer |
|---|---|
| Is the architecture right? | Yes — layered DAG (config → calc → api/store → main → ui) with the layering rules actually held (verified by grep: no fetch outside `api.js`, no DOM outside `ui/`+`main.js`, no `api`/`store` imports in `ui/`). |
| Should it move to a framework / build step / PWA / real backend? | No, no, not yet, and no. §6 scores each honestly. |
| What's actually wrong? | The status dot can lie in four edge cases (§4 ①–④); the ~130 HTML↔JS id touchpoints, the `?v=`↔`APP_VERSION` sync, and the `STATION_IDS` mirror have no automated guard (§4 ⑤–⑥); `Code.gs` repeats itself heavily (§5); `MASTERPLAN.md` and `design/preview.jsx` claim authority they no longer have (§4, §7 v2·24). |
| The one-sentence recommendation | Keep the vanilla no-build architecture and spend the entire budget on **truthfulness, guardrails, and duplication removal** — hybrid A + G-lite + F3 in §6's terms. |

The constraints that decide everything:

1. **This app runs on a flour-covered kitchen phone at 2 PM and midnight.** Reliability of data
   capture (the synchronous localStorage write-through) and honesty of the status dot beat every
   other quality attribute.
2. **No build step has demonstrably worked**: 20 releases, each debuggable by "what does the
   footer say" and view-source. The served code *is* the source code — that property is how the
   v2·17 stale-cache incident got diagnosed.
3. **The sync machinery has a real regression history** (v2·14→v2·18 was a four-release arc of
   race fixes: the `flushRun` poison, mid-fetch clobbers, ack-cache staleness). It is now
   battle-tested and pinned by 805 lines of mock-timer tests. Anything that rewrites or re-hosts
   it re-opens that arc.
4. **The maintenance model is Claude-session PRs with `CLAUDE.md` as the contract.** Architecture
   choices that invalidate `CLAUDE.md`'s accumulated knowledge cost this project its memory.

---

## 2. Breakdown of every part

### 2.1 The frontend (`js/` — 2,313 lines, 16 modules)

```
config.js  (leaf: constants only)
   ├──► calc.js   (pure math — no DOM/fetch/storage)
   ├──► api.js    (wire format + transport; imports calc)
   ├──► store.js  (state/persistence/sync; imports calc; api INJECTED, not imported)
   └──► ui/*.js   (render + capture; import config/calc/ui-fields only)
main.js ──► everything (the only place store and UI meet)
ui/fields.js (leaf: shared DOM helpers)
```

| Module | Lines | Role |
|---|---|---|
| `js/config.js` | 93 | Constants only: version, URLs, sizes, thresholds, both bible tables. Zero logic. |
| `js/calc.js` | 290 | Pure math: `computePlan`, `computeOutlook`, `bibleLookup`, record shape (`blankRecord`). Unit-tested to death. |
| `js/api.js` | 347 | Everything that knows the Apps Script wire format: `post` (text/plain + no-cors retry + 15 s timeout), GETs, `buildPayloads` (the five POST types + their non-empty gates), hydration (`recordFromRow`), date helpers. |
| `js/store.js` | 453 | The sync machine, one 439-line closure: synchronous localStorage write-through, 2.5 s debounced flush, single-flight + rerun, per-type ack cache, five distinct race guards, reload/setDate merge rules, boot retry. Fully injectable (`{api, storage, now, debounceMs}`). |
| `js/main.js` | 265 | Glue: derives one `view = {record, plan, eff, bibleId, autoBible, mode, …}` per store event, routes it to every UI module, owns mode tabs, two-tap reset, one-tap Load, unload flushes, boot. |
| `js/ui/` (11 modules) | 865 | One module per card. Contract: `init(ctx)` binds inputs once, `update(view)` writes derived nodes only (never input values — focus is never disturbed), optional `hydrate(view)` sets inputs on load/reset/date-change. Two documented exceptions (outlook forecast mirror, station slot tap). |

### 2.2 The shell

- **`index.html` (353 lines)** — static skeleton, zero inline script/style, one module script tag.
  All repeated per-size blocks are built at init into empty containers — except the Boil row,
  which is hand-written (`index.html:236-247`). State lives on `<html>` as four data attributes;
  mode visibility and saved chips are **pure CSS** off `data-mode`/`data-status`. The id surface:
  80 ids in HTML, ~130 JS touchpoints (46 literal `$()` lookups + 43 template-composed + 21
  id-generating innerHTML templates). Zero dangling references today — but nothing guards that.
- **`css/styles.css` (1,007 lines)** — one file, 24 banner sections mirroring the HTML's step
  order, a single design-token block, per-size color via one `--c` custom property. A sweep of
  all 149 class names found **zero dead selectors** (the v2·9 cleanup stuck). The only dead
  weight: `[data-theme="mise"]` and `[data-density="compact"]` are single-valued hooks that read
  as multi-theme infrastructure but toggle nothing.

### 2.3 The backend (`apps-script/Code.gs` — 1,072 lines)

- `SHEETS` (12-tab config: names + headers) + mirrored `BIBLE_DATA`/`PEACH_BIBLE_DATA`/`STATION_IDS` (lines 1–139)
- Write path (243–531): `doPost` routes on `type` under `LockService`; five handlers (`dough`,
  `eon`, `make`, `temps`, `stations`), each an upsert-by-date (stations: date+slot)
- Read path (533–648): `doGet` 3-way route — `?stations=last`, `?date=` (merged dough+temps+eon+
  slot-prefixed stations row), bare (last 30 rows)
- Derived-tab machinery (655–1072): `seedSheets`, `rebuildDoughUse`, the Theil–Sen `fitLine`
  reference implementation, and the live-formula builders for Dough Use / New Bibles /
  Station Temps Latest — including single formula strings over 1,000 characters long
- Deploy: manual paste into the Apps Script editor (six redeploys across 20 releases)

### 2.4 Tests and CI (`test/` — 2,777 lines, 150 tests, ~450 ms, zero dependencies)

| Suite | Tests | Covers |
|---|---|---|
| `calc.test.js` (683 ln) | 46 | Both bibles' invariants, `computePlan` fixtures from real nights, every v2 rule, the slow-day matrix, **a v1-parity suite that vm-loads `v1/js/`** |
| `store.test.js` (805 ln) | 42 | The deepest suite: debounce, ordering, ack cache, offline, the merge matrix, reload/flush races, named regression tests for production bugs |
| `api.test.js` (495 ln) | 33 | Payload gating, hydration, transport fallbacks (mocked fetch) |
| `codegs.test.js` (753 ln) | 29 | Code.gs in a vm: validation, dual-bible sync, seedSheets idempotency, Dough Use structure, formula well-formedness |

CI (`.github/workflows/ci.yml`): `node --check` over `js/` + `v1/js/` (before `npm ci`, so syntax
errors fail fast even with the registry down) → `npm ci` → lint → test.

**The coverage holes** (see §4): `js/ui/` (865 ln) and `js/main.js` (265 ln) have **zero** tests
and there is no DOM harness at all; `Code.gs`'s actual entry points (`doPost`/`doGet`/
`getRecentDough`, including the LockService path) are never exercised — tests call the handlers
directly.

### 2.5 Everything else

- **`v1/` (3,483 lines, 13 files)** — frozen pre-rebuild fallback. Still load-bearing: CI
  syntax-checks it and the parity suite vm-loads it (see §4 ⑨).
- **`design/preview.jsx` (1,091 lines)** — the approved React reference. Faithful only through
  v2·7; it predates the stations mode, rounding pills, the Load button, the quick bible toggle,
  the footer version tag, and sic-in-balls (see §4 and v2·24).
- **`MASTERPLAN.md` / `README.md` / `CLAUDE.md`** — README is accurate; MASTERPLAN has drifted
  badly (it still claims the vm harness was retired, 9 ui modules, two modes, no Load button);
  CLAUDE.md (48.5 KB — the largest source file in the repo) is the real living document.
- **Git history** — 122 commits, and a genuinely disciplined 1:1 mapping of
  `feat: v2·N` commit ↔ changelog row ↔ numbered PR. One gap: **no git tags exist at all**,
  although the `v1` tag is documented in three places.

---

## 3. What's genuinely good (don't "improve" these away)

1. **The layering rules are real, not aspirational.** No `fetch` outside `api.js`; no DOM access
   in `calc`/`api`/`store`; no `api`/`store` imports in `ui/` (they get a `patch` function via
   ctx). Verified by grep across the tree.
2. **The store is injectable** (`createStore({api, storage, now, debounceMs})`) — which is why
   805 lines of deterministic mock-timer tests exist for the hardest code in the app.
3. **Single view derivation**: `computePlan`/`effectiveMake` run once per state change in
   `main.js` and ride on the view object. UI modules never recompute the plan.
4. **Pure-CSS chips and modes**: saved chips key off one `data-status` attribute; mode switching
   is one attribute flip. No render pass, nothing to get out of sync.
5. **Every odd-looking guard in `store.js` is a fixed incident with a named test** — the
   `flushRun` poison guard, the mid-fetch discard, the blank-yields-to-sheet rule. The comments
   say why, the changelog says when, the tests pin it.
6. **Test:code ratio above 1** (2,777 test lines vs 2,313 shipped), at zero dependencies and
   450 ms.
7. **Release discipline**: `?v=` cache-buster + `APP_VERSION` + JS-written footer tag as a
   stale-phone diagnostic; 1:1 commit/changelog/PR mapping.

These are the assets. §6's rejected architectures are rejected mostly because they spend them.

---## 4. Defects found

Each verified in source. ①–④ are code fixes; ⑤–⑨ are process/guardrail gaps; the rest are
cleanups. Roadmap phase in the last column.

| # | Defect | Where | Severity | Fix (phase) |
|---|---|---|---|---|
| ① | **The no-cors fallback can report failure as success.** Any throw from the primary POST — including the 15 s `AbortError` timeout and CORS/deployment errors — triggers a no-cors retry whose opaque response is unconditionally returned as `{ok:true}`. A server 4xx/5xx/`{status:'error'}` on that retry path is invisible. Worst case a flush hangs ~30 s per payload × 5 serial payloads. | `js/api.js:92-99` | **High** — false "Synced" | v2·21 |
| ② | **Backend-rejected saves display "Synced."** A `{status:'error'}` rejection is ack-cached with only a `console.warn`; flush then sets status `synced`. Semi-deliberate ("terminal for this payload version") but with zero user-visible signal — this is the exact mechanism behind the documented v2·20 hazard where an old backend rejects stations POSTs while chips read ✓ saved. | `js/store.js:126-131` → `:189-195` | **High** — false "Synced" | v2·22 |
| ③ | **A localStorage quota failure still claims "Saved on phone."** `persist()` swallows the throw with a warn, but `patch` unconditionally sets status `local`. | `js/store.js:58-64`, `:102` | Medium | v2·22 |
| ④ | **`getHistory` never checks `r.ok`** (unlike `getByDate`/`getStationsLast`) — an Apps Script HTML error page flows into `r.json()`/`cacheHistory`. | `js/api.js:114-117` | Medium | v2·21 |
| ⑤ | **`STATION_IDS` (Code.gs) ↔ `STATIONS` (config.js) has no sync test** — the bibles get one, the stations mirror doesn't. A divergence silently writes temps into the wrong sheet columns. | `Code.gs:70` vs `js/config.js` | Medium | v2·23 |
| ⑥ | **No CI guard that `?v=` matches `APP_VERSION`** — three hand-synced literals (`index.html:12,13`, `js/config.js:5`), and this exact desync class caused the v2·17 kitchen incident. | `index.html` / `js/config.js` | Medium | v2·23 |
| ⑦ | **JSON key-order is load-bearing.** `isBlank` and reload's no-change check compare records via `JSON.stringify`, so `stations` must stay the *last* record key and `readLocal` must append it last on upgrade. Correctness by key order, held together by comments and tests. | `js/calc.js:61-63`, `js/store.js:30,75,359` | Medium | v2·31 |
| ⑧ | **The documented `v1` git tag does not exist.** `git tag -l` is empty; README, CLAUDE.md, and MASTERPLAN all reference it as the rollback point. | repo | Low (until you need the rollback) | v2·23 |
| ⑨ | **Deleting `/v1/` today breaks CI and `npm test`.** The parity suite vm-loads `v1/js/*` and CI `node --check`s it; neither doc mentions retiring those first. The masterplan-phase-8 two-week window closed ~July 23. | `test/calc.test.js`, `ci.yml` | Medium (a planned step is a trap) | v2·29→30 |
| ⑩ | **`buildPayloads` re-runs `computePlan`/`effectiveMake`** that `main.js` already computed for the same record — plus assorted dead surface: `reload`'s non-force branch has no UI caller (kept deliberately as a tested store API — decide, don't drift), `view.mode`/`date`/`status` are spread onto the view but read by no module, and `config.js`'s `color:` fields are dead (CSS owns the real values). | `js/api.js:132-264` etc. | Low | v2·25/27 |

Also worth knowing (not defects, but sharp edges): the ~130-touchpoint id coupling fails
*silently at runtime* on any rename (half the lookups are string-composed and un-greppable);
`js/ui/` + `js/main.js` = 1,130 lines with zero test execution; the two date parsers use
different anchors (`T12:00:00` in `calc.js:29` vs `T00:00:00` in `api.js:46`).

---

## 5. Organization & duplication improvements

None of these change behavior; all shrink the surface a future session can get wrong.

**`apps-script/Code.gs`** (the biggest offender):
- The find-row → `setValues`-or-`appendRow` upsert triad is hand-written **5×** (one per handler).
  One shared `upsertRow()` helper.
- The `{indi, small, large, sic, boil}` mapping literal appears **6×**. One `SIZE_KEYS` list.
- Column-letter constants (`EON_COUNT_COLS`, `DC_COUNT_COLS`, `SIZE_COLS`, `DU_*_COLS`,
  `colLetters`) silently duplicate positions already in `SHEETS.*.headers` — a header reorder
  corrupts every generated formula with no guard. Derive letters from `headers.indexOf()`.
- Sheet names are hardcoded inside formula strings (`Dough Counts` ×23, `End of Night Count`
  ×13, …), bypassing `SHEETS`. Interpolate `SHEETS[key].name` instead.
- Validation preambles duplicated between dough/eon handlers; `seedSheets` is a per-key `if`
  chain that must be edited in step with `SHEETS`.

**`js/`**:
- 29 per-size loops are fine (that's the domain), but three *hardcoded size lists* should derive
  from config: `blankRecord().actualMake` (`calc.js:69`), `blankStations()` vs `STATION_SLOTS`
  (`calc.js:56-58`), and `COUNT_KEY`/`EON_KEY` (`api.js:289-293`).
- `buildPayloads` (133 lines) = five independent builders + five different send-gates in one
  function. Split into per-type builders behind the same public API.
- The async load-button lifecycle (disable → "Loading…" → render → error note → re-enable) is
  hand-rolled twice (`ui/history.js:24-61` ≈ `ui/stations.js:85-107`); the pluralize ternary
  appears 7×; `.classList.toggle('hidden')` 21× with no helper. All belong in `ui/fields.js`
  next to `roundPills`/`wireCollapse`, which already got this treatment.
- Magic numbers outside `config.js`: `FETCH_TIMEOUT_MS`, `KEY_PREFIX`, the debounce 2500, the
  schema-version literal `2` (×3), main.js's four timing constants.
- Record-shape mutation living in UI patch callbacks (`temps.js:29`, `stations.js:77`) belongs
  in the store's upgrade path.

**Shell**:
- The Boil row is the one hand-written per-size block in `index.html` (236–247) — generate it
  like the others, or leave it with a comment saying why not.
- Three near-identical label+field row primitives in CSS (`.temp-row`/`.station-row`/`.make-row`)
  could be one `.label-row` with a `--label-w` token. The dead `[data-theme]`/`[data-density]`
  hooks should either gain a comment ("single-valued on purpose") or go.

---

## 6. Architectures explored

Eleven candidates, scored 1–5 on the criteria that matter *for this app*:
**Rel** = kitchen reliability impact · **Risk** = migration safety (5 = safest) ·
**Test** = testability gain · **Ergo** = maintainer/Claude-session ergonomics ·
**Simple** = preserves the no-build/GitHub-Pages simplicity.

| Candidate | Rel | Risk | Test | Ergo | Simple | Total | Verdict |
|---|---|---|---|---|---|---|---|
| **A. Status quo + targeted hardening** | 5 | 5 | 4 | 5 | 5 | **24** | **Adopt (backbone)** |
| **F3. Declarative `Code.gs` internals** | 4 | 4 | 5 | 5 | 5 | **23** | **Adopt** |
| **G-lite. Id guardrails, no registry** | 4 | 5 | 4 | 5 | 5 | **23** | **Adopt** |
| F1. Keep manual backend deploy | 4 | 5 | 3 | 4 | 5 | 21 | Keep |
| G-full. Generated-UI registry | 4 | 3 | 4 | 3 | 5 | 19 | Reject |
| F2. clasp auto-deploy in CI | 3 | 3 | 3 | 3 | 4 | 16 | Reject |
| E. PWA / service worker | 3 | 3 | 2 | 3 | 4 | 15 | **Defer** |
| B. Light build step (Vite/esbuild) | 3 | 3 | 2 | 3 | 1 | 12 | Reject |
| C. Framework view layer (Preact/lit/Svelte) | 2 | 2 | 4 | 2 | 2 | 12 | Reject |
| F4. Replace Apps Script with a real backend | 2 | 1 | 4 | 1 | 2 | 10 | Reject |
| D. Full rewrite from `preview.jsx` | 1 | 1 | 3 | 1 | 1 | 7 | Reject |

**A — Status quo + targeted hardening (adopt).** Fix defects ①–④; add zero-dependency guardrail
tests (version-sync, id-coverage, `STATION_IDS` sync); make CLAUDE.md rule 4 machine-checked via
eslint `no-restricted-imports`; one jsdom smoke test for the 1,130 untested UI lines. Every
convention in CLAUDE.md stays true; every phase is the size of an existing v2·N release.

**B — Build step (reject).** Its *entire* real payoff here is automatic cache-busting — worth a
20-line CI test, not a toolchain. Costs: served code stops being source (degrading the
"what does the footer say" diagnostic that solved v2·17), deploys gain a new silent failure mode
(a red Action = site not updating), and CLAUDE.md's no-build premise goes false everywhere at
once. Revisit only if the app triples in size or TypeScript-proper becomes genuinely wanted.

**C — Framework view layer (reject).** The strangest-looking rule in this codebase — *update()
never writes input values* — is the solution to focus/cursor preservation on a mobile keyboard
while background loads land. VDOM re-rendering re-opens exactly that problem (controlled inputs
vs mid-typing re-render) in the most reliability-critical spot, plus it would re-derive the
pure-CSS mode/chip systems, rewrite 865 ui lines nobody is complaining about, and add the first
runtime dependency.

**D — Full rewrite from `preview.jsx` (reject without reservation).** The preview is a stale
v2·7 snapshot missing an entire mode and roughly a third of the controls; rebuilding from it
re-litigates decisions Jacob already made and discards the 150 tests plus the v2·14–18
race-hardening arc.

**E — PWA/service worker (defer, don't reject).** Data is already offline-safe; the only gap is
*shell availability* on a cold load with no network — a failure the shop has never reported.
The shop's *observed* failure mode is the opposite: **stale** cached code (v2·17). A service
worker is a second, stickier cache layer whose failure looks exactly like v2·17 but survives
until someone clears site data. Adopt only if "the app wouldn't load at all" is ever actually
reported. (Background Sync API: no — the store's debounce + boot retry already is the retry
machine, tested and cross-browser.)

**F — Backend options.** *F1 keep manual paste*: six redeploys in 20 releases, documented, and
the vm-harness tests give unusual pre-deploy confidence — fine. *F2 clasp in CI*: rejected —
long-lived Google OAuth credentials in repo secrets for a personal account, and auto-deploy on
merge **removes** the human backend-before-frontend sequencing that v2·20's compat matrix
depends on. (Jacob using clasp locally as a better paste: harmless, optional.) *F3 declarative
internals*: adopt — `SHEETS` is already the header spec; finish the thought (§5) under the
existing 753-line test harness. Same wire format, same sheets, same behavior. *F4 real backend*:
rejected — the Google Sheet is not a database behind an API, it is a **product surface** Jacob
uses (Dough Use, New Bible fits, sparklines, red-flag conditional formats, manual backfill).
Any replacement adds hosting/auth/ops for a pizzeria and still ends up writing to Sheets.

**G — Data-driven UI registry.** Full version (generate all card markup from a central spec):
rejected — it trades a visible, greppable coupling for an indirect one and makes view-source
debugging worse, when its main benefit is achievable statically. **G-lite (adopt)**: a
zero-dependency id-coverage test (every id referenced in JS exists in the HTML, no duplicate
ids), a strict `$` that throws with the missing id's name at init, and per-module element maps
resolved once. ~All the safety at ~none of the indirection.

**Why the winner wins:** the hardest problems this app ever had — focus-preserving hydration,
mode flips without re-render, the flush/reload race matrix — are *already solved*, and every
rewrite-shaped option un-solves them. The problems it actually has (dishonest status edges,
unguarded couplings, backend duplication, stale docs) are not framework problems, and every one
is addressed below at a fraction of the risk. The deciding argument is maintainer-shaped: this
repo's operational memory lives in CLAUDE.md and the test suite; A + G-lite + F3 compound that
asset, every rewrite liquidates it.

---

## 7. Recommended roadmap

Twelve one-PR phases, each sized like an existing v2·N release, each ending green on
`node --check` + `npm test` with the CLAUDE.md file-structure/changelog updates (rules 2–3).
Ordered by kitchen-facing risk reduction; later phases are progressively more optional.

| Phase | What | Kind | Redeploy? |
|---|---|---|---|
| **v2·21 Transport truth** | `api.post`: an `AbortError` (timeout) returns `{ok:false, network:true}` directly instead of taking the no-cors fallback; only genuine network/CORS throws retry no-cors (with its own timeout). Add `getHistory`'s missing `r.ok` check. Erring toward "not landed" is strictly safe — unacked payloads re-send and the server upserts. Tests: abort ⇒ no second fetch; TypeError ⇒ exactly one no-cors retry; history 500 ⇒ throw. | Pure win | No |
| **v2·22 Status truth** | `postPayloads` returns rejection info; a rejected pass still stamps `syncedAt` (retry-forever is worse) but sets a new status `rejected` and notifies so main.js can flash the message (reuse the `loadmiss` note pattern); saved chips stay keyed to `data-status="synced"` so they correctly don't show. `persist()` returns success; a quota failure sets an honest "in memory only" status instead of `local`. | Pure win (exact UX wording = Jacob's call) | No |
| **v2·23 CI guardrails + the missing tag** | New `test/release.test.js`: ①`?v=` values in `index.html` equal each other and match `APP_VERSION` (v2·20 → 2.20); ② id-coverage — all ids referenced across `js/` (literals + the documented composed prefixes) exist in `index.html`, and the HTML has no duplicate ids — pure string parsing, no DOM. In `codegs.test.js`: `STATION_IDS` ≡ `STATIONS.map(s => s.id)` and Station Temps headers ≡ station labels. Chore for Jacob: create + push the missing `v1` tag onto the last pre-v2·0 commit. | Pure win | No |
| **v2·24 Documentation truth** | Prepend a "HISTORICAL — superseded by CLAUDE.md, do not execute" banner to `MASTERPLAN.md` (don't edit the body). Demote `design/preview.jsx` in CLAUDE.md from "visual source of truth" to "frozen v2·7-era snapshot — CLAUDE.md wins on conflicts." Record the Boli/boil naming fact (§9) and that `boil` is the frozen wire/record/sheet identifier. | Pure win | No |
| **v2·25 UI dedupe + strict lookups (G-lite)** | `fields.js`: `$` throws naming the missing id; shared load-button-lifecycle helper (dedupes history/stations); `plural()` helper (7 call sites). Delete the dead `color:` fields from `config.js` with a pointer to the CSS tokens. Derive the three hardcoded size lists from config. | Pure win | No |
| **v2·26 First DOM smoke test** | `jsdom` as a devDependency (shipped site stays dependency-free) + one `test/dom.test.js`: boot `main.js` against the real `index.html` with mocked fetch/storage; assert boot completes, typing flips status and updates a derived node, tab click flips `data-mode`, hydrate never steals focus. First-ever execution of the 1,130 untested UI lines; pins the init/update/hydrate contract itself. | Judgment call (breaks zero-devDep purity; recommended) | No |
| **v2·27 `buildPayloads` split** | Five per-type builders + a composing wrapper (public API unchanged); `computePlan` runs once per build. Add direct tests for the subtle gates (blank-boil `''`, make's ready-plan guard, stations' lone-`-`). | Pure win | No |
| **v2·28 `Code.gs` declarative internals (F3)** | `SIZE_KEYS` replaces the 6 mapping literals; shared `upsertRow()` replaces the 5 hand-written triads; gates driven by field lists; column letters + formula sheet-names derived from `SHEETS`. Behavior-identical under the existing 753-line harness + a new "formulas reference only `SHEETS` names" assertion. Split into two PRs if large; deploy as **one** redeploy, promptly (merged-but-undeployed backend refactors create repo↔deployment drift). | Pure win (deploy timing = judgment) | **Yes** (no seedSheets) |
| **v2·29 `/v1/` retirement, step 1** | Run the parity suite once more and freeze the v1-computed plans as inline fixtures; gate the vm-load path and CI's `v1/js` loop behind directory existence. The parity guarantee becomes "v2 still matches these pinned v1 outputs." | Pure win | No |
| **v2·30 `/v1/` retirement, step 2** | With the `v1` tag in place and Jacob's explicit go: delete `v1/`, drop its `ci.yml`/eslint references, purge the compat caveats from CLAUDE.md. Recovery is `git checkout v1`. | Needs Jacob's go | No |
| **v2·31 Retire the key-order landmine** | Replace the two raw `JSON.stringify` comparisons (`isBlank`, reload's no-change check) with a ~15-line sorted-key stable stringify. The "stations must stay the last key" contract dissolves; future record fields won't need the append-last dance. Repoint (don't delete) the key-order tests at the new invariant. Also *decide* `reload`'s dead non-force branch — default keep (it's the guarded path any future auto-refresh needs). | Judgment call (recommended) | No |
| **v2·32 Optional: JSDoc types** | `typescript` as devDep, `tsc --noEmit --checkJs` over `js/` only, typedefs for Record/View/Plan/Payloads. Catches exactly the stations-shaped bugs of v2·20 pre-merge. Take it only after v2·21–27 land; skip without guilt. | Optional | No |

Explicitly deferred: service worker (E — revisit on an observed cold-load failure); local clasp
tip for Jacob (a README footnote at most).

---

## 8. What NOT to do

1. **No frontend framework** — view-layer or full rewrite. Re-opens solved focus/mode problems,
   discards the store's only consumer contract, adds the first runtime dependency or build step,
   and invalidates the CLAUDE.md knowledge that makes session-based maintenance work.
2. **Keep Google Apps Script.** The Sheet is a product surface, not a database behind an API.
3. **No build step for cache busting.** It's a 20-line CI test (v2·23), not a toolchain; served
   code = source is a live diagnostic asset.
4. **Never rename `boil` → `boli` in identifiers, record keys, wire fields, or sheet headers** —
   it's load-bearing across localStorage, the POST format, `SHEETS`, Dough Use formulas, and
   history. If the shop spelling matters, change the display label in `config.js` only (§9).
5. **No hard TypeScript conversion.** `--checkJs` over JSDoc (v2·32) buys most of the safety
   with none of the pipeline.
6. **Don't split `styles.css` or add a CSS pipeline.** The chips and mode system are pure-CSS
   features of that one tokened file.
7. **Don't "clean up" `flush`/`reload`/`setDate` opportunistically.** Every odd guard is a fixed
   incident with a pinning test. Only the two scoped phases (v2·22, v2·31) touch them.
8. **Don't delete `/v1/` in one step.** Tag → freeze parity fixtures + gate CI → delete, in that
   order (v2·23 → 29 → 30).
9. **No Google credentials in CI.** Auto-deploy also removes the human backend-before-frontend
   sequencing v2·20's compat matrix depends on.
10. **No service worker yet.** It amplifies the staleness failure class the shop has actually
    experienced to insure against one it hasn't.
11. **Standing rules 5 and 7 stay absolute** — bible numbers come from the binder via Jacob;
    `/v1/` and `design/preview.jsx` bytes are never edited (this review changes how they're
    *described*, and v1's bytes only leave when v2·30 deletes the directory whole).

---

## 9. The uploaded workbook vs the app

`Hot_Tomato_Dough_Calculator.xlsx` is the shop's manual Excel companion (5 sheets: a single-day
calculator with yellow input cells, an employee guide, an auto-switching "Bible In Use" mirror
driven by `MONTH()`, and both bible tables). Findings:

- **The bible tables match `js/config.js` exactly** — regular: 27 rows, $3,750–$20,750; peach:
  30 rows, $3,000–$17,500. No discrepancies to chase.
- **The shop calls the fifth size "Boli," not "Boil."** The workbook and its guide are
  unambiguous ("The goal is to have 36 bolis for the day"). The app's `boil` is a longstanding
  misnomer. Recommendation: if Jacob wants the shop spelling, change *only* the display label
  (`BOIL.label`/chip in `js/config.js`) — one line, zero migration. Never touch the identifier
  (rule 4 in §8).
- **The workbook is v1-era math**: always rounds up, no Sicilian minimum/waiver, no slow-day
  rounding, no extras/cut split, EON doesn't clamp sic. The app is strictly ahead — nothing to
  back-port *from* it except…
- **One feature worth stealing: "FINAL SALES vs Today's Forecast."** At close, the workbook
  shows the delta between actual final sales and the day's forecast ("helps sharpen tomorrow's
  forecast"). The app already captures both numbers (`eon.sales`, `twopm.todayForecast`) and
  displays neither against the other. A one-line derived row on the EON outlook card — a good
  candidate for a future phase if Jacob wants it.
- Minor: the workbook's "Bible In Use" sheet has a copy-paste wart in its last three rows
  (regular-bible references pinned to the top tier as an implicit cap) — worth fixing there if
  the workbook stays in use as a backup.
