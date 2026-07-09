import { createContext, useContext, useEffect, useRef, useState } from "react";

/* ============================================================
   DOUGH TRACKER — v2 preview
   Design system carried from the live repo (Mise en Place).
   All five resolved decisions are in (MASTERPLAN.md §8):
     1. Extras: 1–4 → all Large · 5+ → 1 Small, rest Large
     2. EON shortfall: marked, no warning banner
     3. Peach auto-default July 1 – Aug 31
     4. Bible tables pending binder verification
     5. Sicilian min 2 unless 10+ on hand
   Module map mirrors production: CONFIG → config.js,
   storage → store.js/api.js, calc → calc.js, UI → js/ui/*.
   Storage is in-memory here (no localStorage in preview);
   the two-stage status (Saved on phone → Synced) is simulated.
   ============================================================ */

/* ============================================================
   CONFIG (→ js/config.js)
   ============================================================ */

const SIZES = [
  { id: "indi", label: "Individual", chip: "INDI", perTray: 11, color: "#2f6b3a" },
  { id: "small", label: "Small", chip: "SM", perTray: 8, color: "#b3321b" },
  { id: "large", label: "Large", chip: "LG", perTray: 6, color: "#1b6fa8" },
  { id: "sic", label: "Sicilian", chip: "SIC", perTray: 3, color: "#c94a7a", looseOnly: true, note: "min 2 balls" },
];
const BOIL = { id: "boil", label: "Boil Dough", chip: "BOIL", perTray: 6, target: 36, color: "#7a3b8e" };
const ALL = [...SIZES, BOIL];

const TRAYS_PER_BATCH = 11;
const SIC_MIN = 2;
const SIC_MIN_WAIVER = 10; // 10+ Sicilians on hand → no minimum
const PEACH_MONTHS = [7, 8];
const MAX_BATCH_TEMPS = 10;

const BIBLES = {
  regular: {
    label: "Dough Bible 2026",
    short: "Bible '26",
    rows: [
      [3750, 11, 52, 44, 2], [4000, 12, 58, 50, 2], [4400, 13, 63, 56, 2],
      [4800, 14, 69, 62, 2], [5200, 15, 74, 65, 2], [5700, 17, 81, 72, 2],
      [6300, 18, 88, 79, 2], [6800, 20, 94, 87, 3], [7200, 21, 101, 94, 3],
      [7800, 22, 108, 99, 3], [8300, 24, 115, 106, 3], [9100, 26, 125, 117, 3],
      [10000, 28, 136, 126, 4], [10700, 30, 146, 137, 4], [11500, 32, 156, 148, 4],
      [12250, 34, 166, 159, 4], [13000, 37, 177, 166, 5], [13900, 39, 187, 177, 5],
      [14750, 41, 197, 188, 5], [15500, 43, 206, 195, 5], [16250, 44, 214, 205, 6],
      [17000, 44, 225, 216, 6], [17750, 44, 235, 225, 6], [18500, 44, 246, 237, 6],
      [19250, 44, 255, 247, 6], [20000, 44, 266, 256, 7], [20750, 44, 276, 267, 7],
    ],
  },
  peach: {
    label: "Peach Bible 2024",
    short: "Peach '24",
    rows: [
      [3000, 20, 56, 51, 2], [3500, 20, 66, 61, 2], [4000, 21, 75, 66, 3],
      [4500, 21, 85, 70, 3], [5000, 22, 96, 74, 3], [5500, 22, 106, 82, 3],
      [6000, 24, 115, 91, 3], [6500, 25, 124, 97, 3], [7000, 26, 132, 103, 3],
      [7500, 27, 141, 109, 3], [8000, 28, 151, 114, 4], [8500, 28, 160, 120, 4],
      [9000, 29, 170, 127, 4], [9500, 29, 179, 133, 4], [10000, 30, 188, 137, 4],
      [10500, 30, 197, 140, 4], [11000, 31, 204, 145, 5], [11500, 31, 211, 150, 5],
      [12000, 32, 218, 155, 5], [12500, 32, 226, 159, 6], [13000, 33, 234, 162, 6],
      [13500, 33, 243, 164, 6], [14000, 34, 253, 166, 6], [14500, 34, 262, 168, 6],
      [15000, 35, 271, 169, 6], [15500, 35, 281, 171, 6], [16000, 36, 290, 173, 6],
      [16500, 36, 300, 175, 6], [17000, 37, 309, 177, 6], [17500, 37, 318, 179, 6],
    ],
  },
};

/* ============================================================
   THEME — Mise en Place (tokens from css/styles.css)
   ============================================================ */

const C = {
  bg: "#f3ece0",
  grain: "#efe6d4",
  paper: "#fbf7ee",
  ink: "#1f1b15",
  inkSoft: "#4a4336",
  mute: "#7a705f",
  rule: "#d9cfb9",
  ruleSoft: "#e6ddc9",
  accent: "#b3321b",
  accentSoft: "#f4d6cc",
  warn: "#b87e1a",
  good: "#2f6b3a",
  neg: "#a3341f",
  input: "#f1eadb",
  pen: "#2b44b8",
};
const tint = (hex, a = 0.06) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const F = {
  display: "'Fraunces', Georgia, serif",
  body: "'Inter Tight', 'Inter', system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
  marker: "'Permanent Marker', cursive",
};

const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,400;1,9..144,500;1,9..144,700&family=Inter+Tight:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&family=Permanent+Marker&display=swap');
* { box-sizing: border-box; margin: 0; padding: 0; }
input::placeholder { color: #b0a68f; font-weight: 500; }
input:focus { border-color: ${C.inkSoft} !important; box-shadow: 0 0 0 3px rgba(31,27,21,0.10); outline: none; }
button { cursor: pointer; }
button:focus-visible { outline: 2px solid ${C.ink}; outline-offset: 2px; }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
.pulse { animation: pulse 1s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .pulse { animation: none; } }
input[type="date"] { -webkit-appearance: none; appearance: none; }
`;

/* ============================================================
   STORAGE (→ js/store.js + js/api.js)
   In production every change writes localStorage synchronously,
   then a debounced background sync POSTs to Apps Script.
   Here: in-memory db + simulated two-stage status.
   ============================================================ */

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clone = (o) => JSON.parse(JSON.stringify(o));
const db = {};

const storage = {
  async load(date) { await wait(200); return db[date] ? clone(db[date]) : null; },
  async sync(date, record) { await wait(500); db[date] = clone(record); },
  async list() { await wait(120); return Object.keys(db).sort().reverse(); },
};

const blankCounts = () => Object.fromEntries(ALL.map((s) => [s.id, { trays: "", singles: "" }]));

const blankRecord = () => ({
  bible: null, // null = follow the month default
  twopm: { counts: blankCounts(), todayForecast: "", currentSales: "", tomorrowForecast: "" },
  actualMake: { indi: "", small: "", large: "", sic: "", boil: "" }, // balls (managers think in balls)
  temps: [],
  eon: { sales: "", counts: blankCounts(), outlookForecast: "", outlookManual: false },
});

function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const today = () => dateStr(new Date());
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return dateStr(d); };

// Seed yesterday so past-night loading is testable.
db[yesterday()] = {
  bible: null,
  twopm: {
    counts: {
      indi: { trays: "2", singles: "4" },
      small: { trays: "9", singles: "3" },
      large: { trays: "8", singles: "2" },
      sic: { trays: "", singles: "2" },
      boil: { trays: "3", singles: "2" },
    },
    todayForecast: "5",
    currentSales: "2.3",
    tomorrowForecast: "5.5",
  },
  actualMake: { indi: "", small: "104", large: "", sic: "", boil: "" },
  temps: [{ water: "58", dough: "78" }, { water: "56", dough: "80" }],
  eon: {
    sales: "5240",
    counts: {
      indi: { trays: "3", singles: "8" },
      small: { trays: "12", singles: "4" },
      large: { trays: "13", singles: "1" },
      sic: { trays: "", singles: "3" },
      boil: { trays: "4", singles: "0" },
    },
    outlookForecast: "",
    outlookManual: false,
  },
};

/* ============================================================
   CALC (→ js/calc.js) — pure functions
   ============================================================ */

function parseSales(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n < 100 ? n * 1000 : n); // shorthand: <100 reads as thousands
}
const money = (n) => (n == null ? "—" : `$${n.toLocaleString()}`);
const intOf = (v) => { const n = Number(v); return v !== "" && Number.isFinite(n) ? n : 0; };
const numOrNull = (v) => { const n = Number(v); return v !== "" && Number.isFinite(n) ? n : null; };

function countTotal(c, size) {
  const t = size.looseOnly ? 0 : intOf(c.trays);
  return t * size.perTray + intOf(c.singles);
}
const countBlank = (c) => c.trays === "" && c.singles === "";

// Round UP to next tier; caps at top row; ≤ 0 handled by caller (zero-day rule)
function bibleLookup(bibleId, sales) {
  if (sales == null) return null;
  if (sales <= 0) return { tier: 0, indi: 0, small: 0, large: 0, sic: 0 };
  const rows = BIBLES[bibleId].rows;
  const row = rows.find((r) => r[0] >= sales) || rows[rows.length - 1];
  return { tier: row[0], indi: row[1], small: row[2], large: row[3], sic: row[4] };
}

function computePlan(record, bibleId) {
  const tp = record.twopm;
  const tf = parseSales(tp.todayForecast);
  const cs = parseSales(tp.currentSales);
  const salesLeft = tf != null && cs != null ? tf - cs : null;

  const use = bibleLookup(bibleId, salesLeft);
  const need = bibleLookup(bibleId, parseSales(tp.tomorrowForecast));

  const rows = {};
  const setout = [];
  let pizzaTrays = 0;
  const ready = !!(use && need);

  for (const s of SIZES) {
    const have = countTotal(tp.counts[s.id], s);
    const useN = use ? use[s.id] : null;
    const leftRaw = useN != null ? have - useN : null;
    // Sicilian dough-left clamps at 0 — same-day Sicilian can't be used
    const left = s.id === "sic" && leftRaw != null ? Math.max(0, leftRaw) : leftRaw;
    const needN = need ? need[s.id] : null;
    let make = left != null && needN != null ? Math.max(0, needN - left) : null;
    // Sicilian min 2, waived at 10+ on hand
    if (s.id === "sic" && make != null && have < SIC_MIN_WAIVER) make = Math.max(make, SIC_MIN);
    const trays = make != null ? Math.ceil(make / s.perTray) : null;
    if (trays != null) pizzaTrays += trays;
    if (s.id !== "sic" && left != null && left < 0) {
      setout.push({ id: s.id, label: s.label, trays: Math.ceil(-left / s.perTray) });
    }
    rows[s.id] = { have, use: useN, left, need: needN, make, trays };
  }

  const bc = tp.counts.boil;
  const boilHave = countBlank(bc) ? null : countTotal(bc, BOIL);
  // Boil makes whole trays only: 33 on hand, target 36 → 1 tray of 6 (make = 6)
  const boilShort = boilHave != null ? Math.max(0, BOIL.target - boilHave) : null;
  const boilTrays = boilShort != null ? Math.ceil(boilShort / BOIL.perTray) : 0;
  const boilMake = boilShort != null ? boilTrays * BOIL.perTray : null;

  let totalTrays = null, batches = null, extra = 0, finalTrays = null, extraNote = "";
  if (ready) {
    totalTrays = pizzaTrays + boilTrays;
    batches = Math.ceil(totalTrays / TRAYS_PER_BATCH);
    extra = totalTrays > 0 ? batches * TRAYS_PER_BATCH - totalTrays : 0;
    finalTrays = {};
    for (const s of SIZES) finalTrays[s.id] = rows[s.id].trays;
    // Resolved rule: 1–4 extras → all Large · 5+ → 1 Small, rest Large
    if (extra >= 5) {
      finalTrays.small += 1;
      finalTrays.large += extra - 1;
      extraNote = `+1 SM, +${extra - 1} LG`;
    } else if (extra > 0) {
      finalTrays.large += extra;
      extraNote = `+${extra} LG`;
    }
  }

  return { salesLeft, use, need, rows, setout, pizzaTrays, boilHave, boilMake, boilTrays, totalTrays, batches, extra, extraNote, finalTrays, ready };
}

// Actual Make (balls) wins when entered; raw calculated make otherwise
function effectiveMake(record, plan) {
  const out = {};
  for (const s of SIZES) {
    const a = numOrNull(record.actualMake[s.id]);
    out[s.id] = { balls: a ?? plan.rows[s.id].make, source: a != null ? "recount" : "calc" };
  }
  const ab = numOrNull(record.actualMake.boil);
  out.boil = { balls: ab ?? plan.boilMake, source: ab != null ? "recount" : "calc" };
  return out;
}

// EON outlook: EON counts vs tomorrow's need on the given forecast
function computeOutlook(record, bibleId, forecast) {
  const need = bibleLookup(bibleId, forecast);
  const rows = {};
  let anyCount = false, surplus = 0, shortfall = 0, surplusTrays = 0, shortTrays = 0;
  const add = (id, have, needN, perTray) => {
    const diff = have != null && needN != null ? have - needN : null;
    // left after tomorrow's sales, in trays, rounded to the NEAREST tray
    const tDiff = diff != null ? Math.sign(diff) * Math.round(Math.abs(diff) / perTray) : null;
    if (diff != null) {
      if (diff >= 0) { surplus += diff; surplusTrays += tDiff; }
      else { shortfall += -diff; shortTrays += -tDiff; }
    }
    rows[id] = { have, need: needN, diff, tDiff };
  };
  for (const s of SIZES) {
    const blank = countBlank(record.eon.counts[s.id]);
    const have = blank ? null : countTotal(record.eon.counts[s.id], s);
    if (have != null) anyCount = true;
    add(s.id, have, need && need.tier > 0 ? need[s.id] : null, s.perTray);
  }
  const bBlank = countBlank(record.eon.counts.boil);
  const bHave = bBlank ? null : countTotal(record.eon.counts.boil, BOIL);
  if (bHave != null) anyCount = true;
  add("boil", bHave, BOIL.target, BOIL.perTray);
  return { rows, anyCount, surplus, shortfall, surplusTrays, shortTrays, hasNeed: !!(need && need.tier > 0) };
}

const fmt = (n) => (n == null ? "—" : String(n));
const fmtDate = (d) =>
  new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

/* ============================================================
   UI PRIMITIVES
   ============================================================ */

const Eyebrow = ({ children, color = C.mute, size = 10, style }) => (
  <span style={{ fontFamily: F.body, fontWeight: 700, fontSize: size, letterSpacing: "0.18em", textTransform: "uppercase", color, ...style }}>
    {children}
  </span>
);
const MonoCaps = ({ children, size = 10, color = C.mute, style }) => (
  <span style={{ fontFamily: F.mono, fontSize: size, fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", color, ...style }}>
    {children}
  </span>
);
const Mono = ({ children, size = 14, weight = 500, color = C.ink, style }) => (
  <span style={{ fontFamily: F.mono, fontSize: size, fontWeight: weight, color, fontVariantNumeric: "tabular-nums", ...style }}>{children}</span>
);
const Display = ({ children, size = 22, weight = 700, color = C.ink, italic, style }) => (
  <span style={{ fontFamily: F.display, fontSize: size, fontWeight: weight, color, fontStyle: italic ? "italic" : "normal", ...style }}>
    {children}
  </span>
);

function StepHead({ num, title, sub, as = "div", onClick, expanded }) {
  const Tag = as;
  return (
    <Tag
      onClick={onClick}
      aria-expanded={onClick ? expanded : undefined}
      className="flex w-full items-baseline gap-2 px-1"
      style={onClick ? { background: "none", border: "none", textAlign: "left" } : undefined}
    >
      <span className="rounded" style={{ fontFamily: F.mono, fontWeight: 700, fontSize: 11, color: C.ink, border: `1.5px solid ${C.ink}`, padding: "2px 6px", lineHeight: 1 }}>
        {num}
      </span>
      <Display size={21} weight={700}>{title}</Display>
      {sub && <span className="ml-auto shrink-0 text-right"><MonoCaps size={9}>{sub}</MonoCaps></span>}
    </Tag>
  );
}

function Card({ children, accent, tintBg, className = "", style }) {
  return (
    <div
      className={`rounded-[10px] ${className}`}
      style={{
        background: tintBg ?? C.paper,
        border: `1px solid ${C.rule}`,
        borderLeft: accent ? `5px solid ${accent}` : `1px solid ${C.rule}`,
        boxShadow: "0 1px 0 rgba(31,27,21,0.04), 0 8px 20px -14px rgba(31,27,21,0.2)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

const SavedCtx = createContext(false);

function Field({ value, onChange, placeholder = "0", ariaLabel, decimal, suffix, width }) {
  const saved = useContext(SavedCtx) && value !== "";
  const filter = (v) => {
    v = v.replace(decimal ? /[^\d.]/g : /[^\d]/g, "");
    if (decimal) {
      const p = v.split(".");
      if (p.length > 2) v = p[0] + "." + p.slice(1).join("");
    }
    return v;
  };
  return (
    <div className="relative" style={{ width: width ?? "100%" }}>
      <input
        value={value}
        aria-label={ariaLabel}
        inputMode={decimal ? "decimal" : "numeric"}
        placeholder={placeholder}
        onChange={(e) => onChange(filter(e.target.value))}
        className="w-full"
        style={{
          height: 44, fontFamily: F.mono, fontWeight: 500, fontSize: 16, color: C.ink,
          background: C.input, border: `1px solid ${C.rule}`, borderRadius: 6,
          padding: "0 10px", paddingRight: suffix ? 30 : 10, fontVariantNumeric: "tabular-nums",
        }}
      />
      {suffix && (
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2"><Mono size={11} color={C.mute}>{suffix}</Mono></span>
      )}
      {saved && (
        <span
          className="absolute"
          style={{
            top: -7, right: 6, background: C.paper, border: `1px solid ${C.good}`,
            borderRadius: 99, padding: "0 5px", lineHeight: "13px",
            fontFamily: F.mono, fontSize: 8, fontWeight: 700, letterSpacing: "0.08em",
            textTransform: "uppercase", color: C.good, pointerEvents: "none",
          }}
        >
          ✓ saved
        </span>
      )}
    </div>
  );
}

const Dot = ({ color, size = 8 }) => (
  <span style={{ width: size, height: size, borderRadius: 99, background: color, display: "inline-block", flexShrink: 0 }} />
);

/* ============================================================
   UI SECTIONS (→ js/ui/*)
   ============================================================ */

function SalesRow({ label, value, onChange, ariaLabel }) {
  const parsed = parseSales(value);
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div>
        <Eyebrow color={C.inkSoft}>{label}</Eyebrow>
        <div style={{ minHeight: 15 }}>
          <Mono size={11} color={C.mute}>{value !== "" ? `= ${money(parsed)}` : "\u00A0"}</Mono>
        </div>
      </div>
      <Field value={value} onChange={onChange} decimal placeholder="0" width={118} ariaLabel={ariaLabel} />
    </div>
  );
}

function SalesSection({ tp, set, plan, bibleId }) {
  return (
    <section className="flex flex-col gap-2">
      <StepHead num="01" title="Sales & Forecast" sub="10 = $10,000 · 6.7 = $6,700" />
      <Card className="px-3 py-1">
        <SalesRow label="Today's forecast" value={tp.todayForecast} onChange={(v) => set("todayForecast", v)} ariaLabel="Today's forecast" />
        <div style={{ borderTop: `1px dashed ${C.rule}` }} />
        <SalesRow label="Current sales" value={tp.currentSales} onChange={(v) => set("currentSales", v)} ariaLabel="Current sales" />
        <div className="my-1 flex items-center justify-between rounded-md px-2.5 py-2" style={{ background: tint(C.ink, 0.05) }}>
          <Eyebrow color={C.inkSoft}>Sales left tonight</Eyebrow>
          <div className="text-right">
            <Mono size={16} weight={700}>{money(plan.salesLeft)}</Mono>
            {plan.use && plan.use.tier > 0 && (
              <div><Mono size={10} color={C.mute}>→ {money(plan.use.tier)} row · {BIBLES[bibleId].short}</Mono></div>
            )}
            {plan.use && plan.use.tier === 0 && (
              <div><Mono size={10} color={C.good}>past forecast — zero use tonight</Mono></div>
            )}
          </div>
        </div>
        <div style={{ borderTop: `1px dashed ${C.rule}` }} />
        <SalesRow label="Tomorrow's forecast" value={tp.tomorrowForecast} onChange={(v) => set("tomorrowForecast", v)} ariaLabel="Tomorrow's forecast" />
      </Card>
    </section>
  );
}

function CountCard({ size, value, onChange, prefix }) {
  const total = countTotal(value, size);
  const isBoil = size.id === "boil";
  const note = isBoil ? `target ${BOIL.target} · ${size.perTray} / tray`
    : size.looseOnly ? size.note : `${size.perTray} / tray`;
  return (
    <Card accent={size.color} tintBg={tint(size.color, 0.05)} className="p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span style={{ fontFamily: F.body, fontWeight: 800, fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: size.color }}>
          {size.label}
        </span>
        <Mono size={11} color={C.mute}>{note}</Mono>
      </div>
      <div className="mt-2 flex gap-2">
        {!size.looseOnly && (
          <div className="flex-1">
            <MonoCaps size={9}>Trays</MonoCaps>
            <div className="mt-1"><Field value={value.trays} onChange={(v) => onChange("trays", v)} ariaLabel={`${prefix} ${size.label} trays`} /></div>
          </div>
        )}
        <div className="flex-1">
          <MonoCaps size={9}>{size.looseOnly ? "Balls" : "Singles"}</MonoCaps>
          <div className="mt-1"><Field value={value.singles} onChange={(v) => onChange("singles", v)} ariaLabel={`${prefix} ${size.label} singles`} /></div>
        </div>
      </div>
      {!size.looseOnly && (
        <div className="mt-1.5 text-right">
          <Mono size={11} color={C.mute}>= </Mono>
          <Mono size={14} weight={700}>{total}</Mono>
          <Mono size={11} color={C.mute}> balls</Mono>
        </div>
      )}
    </Card>
  );
}

function CountsSection({ num, counts, onChange, prefix }) {
  return (
    <section className="flex flex-col gap-2">
      <StepHead num={num} title="Current Dough Counts" sub="Trays + singles" />
      <div className="grid grid-cols-2 gap-2.5">
        {SIZES.map((s) => (
          <CountCard key={s.id} size={s} value={counts[s.id]} onChange={(f, v) => onChange(s.id, f, v)} prefix={prefix} />
        ))}
        <div className="col-span-2">
          <CountCard size={BOIL} value={counts.boil} onChange={(f, v) => onChange("boil", f, v)} prefix={prefix} />
        </div>
      </div>
    </section>
  );
}

function DaysWork({ plan }) {
  const chips = [
    ...SIZES.map((s) => ({ ...s, val: plan.finalTrays ? plan.finalTrays[s.id] : null })),
    { ...BOIL, val: plan.ready && plan.boilMake != null ? plan.boilTrays : null },
  ];
  const totalPrep = plan.ready ? plan.batches * TRAYS_PER_BATCH : null;
  return (
    <section className="flex flex-col gap-2">
      <StepHead num="03" title="The Day's Work" sub="Trays to make" />
      <Card className="p-4">
        <div className="mb-2"><Eyebrow>Trays</Eyebrow></div>
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <span key={c.id} className="flex items-center gap-1.5 rounded-full px-3 py-1.5"
              style={{ background: C.bg, border: `1px solid ${C.rule}`, opacity: c.val === 0 ? 0.45 : 1 }}>
              <Dot color={c.color} />
              <MonoCaps size={10} color={C.inkSoft}>{c.chip}</MonoCaps>
              <span style={{ fontFamily: F.body, fontWeight: 800, fontSize: 15, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{fmt(c.val)}</span>
            </span>
          ))}
        </div>
        <div className="my-3" style={{ borderTop: `1px dashed ${C.rule}` }} />
        {plan.ready ? (
          <div className="flex items-center gap-4">
            <span style={{ fontFamily: F.display, fontWeight: 700, fontSize: 88, lineHeight: 0.85, color: C.accent }}>{plan.batches}</span>
            <div>
              <Eyebrow>Batches</Eyebrow>
              <div><Display size={20} weight={700}>{plan.batches} {plan.batches === 1 ? "batch" : "batches"} to make</Display></div>
              <Mono size={12} color={C.mute}>
                {totalPrep} trays{plan.extra > 0 ? ` (${plan.totalTrays} planned · extras: ${plan.extraNote})` : ""}
              </Mono>
              {plan.boilMake == null && (
                <div><Mono size={11} color={C.warn}>boil not counted — left out of batch math</Mono></div>
              )}
            </div>
          </div>
        ) : (
          <Mono size={12} color={C.mute}>Set sales and both forecasts to get the batch count.</Mono>
        )}
      </Card>
      {plan.setout.length > 0 && (
        <Card tintBg={C.accentSoft} style={{ border: `1px solid ${C.accent}` }} className="px-3 py-2.5">
          <Eyebrow color={C.accent}>Set out now — tonight dips into same-day dough</Eyebrow>
          <div className="mt-1 flex flex-wrap gap-x-4">
            {plan.setout.map((it) => (
              <span key={it.id}>
                <Mono size={13} weight={700} color={C.accent}>{it.label}: {it.trays} {it.trays === 1 ? "tray" : "trays"}</Mono>
              </span>
            ))}
          </div>
        </Card>
      )}
    </section>
  );
}

const planGrid = {
  display: "grid",
  gridTemplateColumns: "54px repeat(5, minmax(0,1fr)) 54px",
  columnGap: 4,
  alignItems: "center",
};
const PlanCell = ({ v, color = C.ink, weight = 500 }) => (
  <div className="text-right"><Mono size={13} weight={weight} color={v == null ? C.mute : color}>{fmt(v)}</Mono></div>
);

function BySize({ plan }) {
  return (
    <section className="flex flex-col gap-2">
      <StepHead num="04" title="By Size" sub="Tonight → EON → tomorrow" />
      <Card className="px-3 py-2">
        <div className="relative">
          <span className="absolute" style={{ fontFamily: F.marker, color: C.pen, fontSize: 13, right: 0, top: -6, transform: "rotate(-4deg)", opacity: 0.9 }}>
            E−D!!!
          </span>
          <div style={planGrid} className="pb-1 pt-2">
            {["", "have", "use", "left", "need", "make", "trays"].map((h, i) => (
              <div key={i} className={i === 0 ? "" : "text-right"}><Eyebrow size={8}>{h}</Eyebrow></div>
            ))}
          </div>
          {SIZES.map((s) => {
            const r = plan.rows[s.id];
            const finalT = plan.finalTrays ? plan.finalTrays[s.id] : r.trays;
            return (
              <div key={s.id} style={{ ...planGrid, borderTop: `1px dashed ${C.rule}` }} className="py-2">
                <div className="flex items-center gap-1.5">
                  <Dot color={s.color} size={7} />
                  <MonoCaps size={10} color={s.color} style={{ fontWeight: 700 }}>{s.chip}</MonoCaps>
                </div>
                <PlanCell v={r.have} />
                <PlanCell v={r.use} color={C.mute} />
                <PlanCell v={r.left} color={r.left != null && r.left < 0 ? C.neg : C.ink} weight={r.left != null && r.left < 0 ? 700 : 500} />
                <PlanCell v={r.need} color={C.mute} />
                <PlanCell v={r.make} weight={700} />
                <div className="rounded-md px-1 py-1 text-center" style={{ background: tint(s.color, 0.1) }}>
                  <span style={{ fontFamily: F.display, fontWeight: 700, fontSize: 17, color: s.color }}>{fmt(finalT)}</span>
                </div>
              </div>
            );
          })}
          <div className="mt-1 flex items-center gap-2 rounded-md px-2 py-2.5" style={{ background: tint(BOIL.color, 0.07) }}>
            <div className="flex w-14 shrink-0 items-center gap-1.5">
              <Dot color={BOIL.color} size={7} />
              <MonoCaps size={10} color={BOIL.color} style={{ fontWeight: 700 }}>BOIL</MonoCaps>
            </div>
            <div className="flex gap-3">
              {[["have", plan.boilHave], ["target", BOIL.target], ["make", plan.boilMake]].map(([k, v]) => (
                <div key={k} style={{ minWidth: 38 }}>
                  <Eyebrow size={8}>{k}</Eyebrow>
                  <div><Mono size={13}>{fmt(v)}</Mono></div>
                </div>
              ))}
            </div>
            <div className="ml-auto text-right">
              <span style={{ fontFamily: F.display, fontWeight: 700, fontSize: 19, color: BOIL.color }}>
                {plan.boilMake == null ? "—" : `${plan.boilTrays}T`}
              </span>
              <div><Mono size={10} color={C.mute}>whole trays only</Mono></div>
            </div>
          </div>
          <div className="pb-1 pt-2">
            {plan.ready ? (
              <MonoCaps size={8}>Make in balls · trays includes batch extras · SIC min {SIC_MIN} unless {SIC_MIN_WAIVER}+ on hand</MonoCaps>
            ) : (
              <Mono size={12} color={C.mute}>Fill in the counts, sales, and both forecasts to get tonight's make.</Mono>
            )}
          </div>
        </div>
      </Card>
    </section>
  );
}

/* ---------------- collapsibles ---------------- */

function Collapse({ num, title, sub, dashed, children, renderTitle }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-[10px]" style={{ background: C.paper, border: dashed ? `1.5px dashed ${C.rule}` : `1px solid ${C.rule}` }}>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-3"
        style={{ background: "none", border: "none", textAlign: "left" }}
      >
        {num && (
          <span className="rounded" style={{ fontFamily: F.mono, fontWeight: 700, fontSize: 11, border: `1.5px solid ${C.ink}`, padding: "2px 6px", color: C.ink }}>
            {num}
          </span>
        )}
        {renderTitle ? renderTitle() : <Display size={19} weight={700}>{title}</Display>}
        <span className="ml-auto shrink-0"><MonoCaps size={9}>{open ? "Tap to collapse ▴" : "Tap to expand ▾"}</MonoCaps></span>
      </button>
      {open && (
        <div className="px-3 pb-3" style={{ borderTop: `1px solid ${C.ruleSoft}` }}>
          {sub && <div className="pt-2"><Mono size={11} color={C.mute}>{sub}</Mono></div>}
          <div className="pt-2">{children}</div>
        </div>
      )}
    </div>
  );
}

function BibleTab({ record, patch, bibleId, plan, autoBible }) {
  const rows = BIBLES[bibleId].rows;
  return (
    <Collapse
      dashed
      renderTitle={() => (
        <span>
          <Display size={19} weight={700}>Dough </Display>
          <Display size={19} weight={500} italic color={C.accent}>Bible</Display>
        </span>
      )}
    >
      <div className="flex items-center gap-1.5 pb-2">
        {["regular", "peach"].map((id) => (
          <button key={id} onClick={() => patch((r) => (r.bible = id))} className="rounded-full px-3 py-1.5"
            style={{
              fontFamily: F.mono, fontWeight: 700, fontSize: 11, letterSpacing: "0.05em",
              border: `1.5px solid ${C.ink}`, background: bibleId === id ? C.ink : "transparent",
              color: bibleId === id ? C.paper : C.ink,
            }}>
            {BIBLES[id].short}
          </button>
        ))}
        {record.bible == null && <MonoCaps size={9} color={C.accent}>auto · Jul 1 – Aug 31 = Peach</MonoCaps>}
      </div>
      <div className="overflow-auto rounded-md" style={{ maxHeight: 300, border: `1px solid ${C.rule}` }}>
        <div className="grid" style={{ gridTemplateColumns: "1.4fr repeat(4, 1fr)", position: "sticky", top: 0, background: C.input }}>
          {["Sales", "Indi", "Sm", "Lg", "Sic"].map((h) => (
            <div key={h} className="px-2 py-1.5"><Eyebrow size={8}>{h}</Eyebrow></div>
          ))}
        </div>
        {rows.map((r) => {
          const isNeed = plan.need && plan.need.tier === r[0];
          const isUse = plan.use && plan.use.tier === r[0];
          return (
            <div key={r[0]} className="grid"
              style={{
                gridTemplateColumns: "1.4fr repeat(4, 1fr)", borderTop: `1px solid ${C.ruleSoft}`,
                background: isNeed ? tint(C.accent, 0.1) : isUse ? tint(C.ink, 0.05) : "transparent",
              }}>
              <div className="px-2 py-1">
                <Mono size={12}>{`$${r[0].toLocaleString()}`}</Mono>
                {isNeed && <Mono size={9} color={C.accent} weight={700}> ←TMRW</Mono>}
                {isUse && !isNeed && <Mono size={9} color={C.mute} weight={700}> ←TONIGHT</Mono>}
              </div>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="px-2 py-1"><Mono size={12}>{r[i]}</Mono></div>
              ))}
            </div>
          );
        })}
      </div>
      <div className="pt-2"><MonoCaps size={8} color={C.warn}>Pending binder verification — masterplan §8.4</MonoCaps></div>
    </Collapse>
  );
}

function TempsTab({ record, patch, plan }) {
  const slots = Math.min(MAX_BATCH_TEMPS, Math.max(plan.batches ?? 0, record.temps.length, 3));
  return (
    <Collapse num="05" title="Batch Temperatures" sub="Water temp in, dough temp out of the mixer — per batch.">
      <div className="flex flex-col gap-2">
        {Array.from({ length: slots }).map((_, i) => {
          const t = record.temps[i] ?? { water: "", dough: "" };
          const setT = (k, v) =>
            patch((r) => {
              while (r.temps.length <= i) r.temps.push({ water: "", dough: "" });
              r.temps[i][k] = v;
            });
          return (
            <div key={i} className="flex items-center gap-2">
              <span className="w-16 shrink-0"><Eyebrow color={C.inkSoft}>Batch {i + 1}</Eyebrow></span>
              <div className="flex-1">
                <Field value={t.water} onChange={(v) => setT("water", v)} decimal suffix="°F" placeholder="water" ariaLabel={`Batch ${i + 1} water temp`} />
              </div>
              <div className="flex-1">
                <Field value={t.dough} onChange={(v) => setT("dough", v)} decimal suffix="°F" placeholder="dough" ariaLabel={`Batch ${i + 1} dough temp`} />
              </div>
            </div>
          );
        })}
      </div>
    </Collapse>
  );
}

function HistoryTab({ currentDate, onOpen }) {
  const [entries, setEntries] = useState(null);
  const refresh = () =>
    storage.list().then((dates) =>
      Promise.all(dates.map((d) => storage.load(d).then((rec) => ({ date: d, rec })))).then(setEntries)
    );
  return (
    <Collapse num="06" title="Recent History">
      {entries == null ? (
        <button onClick={refresh} className="rounded-full px-3 py-1.5"
          style={{ fontFamily: F.mono, fontWeight: 700, fontSize: 11, border: `1.5px solid ${C.ink}`, background: "transparent", color: C.ink }}>
          LOAD HISTORY
        </button>
      ) : entries.length === 0 ? (
        <Mono size={12} color={C.mute}>No saved nights yet.</Mono>
      ) : (
        <div className="flex flex-col">
          {entries.map(({ date, rec }) => {
            const bid = rec.bible ?? (PEACH_MONTHS.includes(parseInt(date.slice(5, 7), 10)) ? "peach" : "regular");
            const p = computePlan(rec, bid);
            const es = parseSales(rec.eon.sales);
            return (
              <button key={date} onClick={() => onOpen(date)} className="flex items-center justify-between gap-2 py-2.5"
                style={{ background: "none", border: "none", borderBottom: `1px dashed ${C.rule}`, textAlign: "left" }}>
                <span>
                  <Display size={15} weight={700}>{fmtDate(date)}</Display>
                  {date === currentDate && <MonoCaps size={8} color={C.accent} style={{ marginLeft: 8 }}>open</MonoCaps>}
                </span>
                <Mono size={12} color={C.mute}>
                  {es != null ? money(es) : "—"} · {p.batches != null ? `${p.batches} batches` : "no plan"}
                </Mono>
              </button>
            );
          })}
        </div>
      )}
    </Collapse>
  );
}

function MakeTab({ record, patch, plan, eff }) {
  return (
    <Collapse num="07" title="Actual Make Amount" sub="Balls per size — only if the real make differed. Calculated make is the default.">
      <div className="flex flex-col">
        {ALL.map((s, i) => {
          const e = eff[s.id];
          const calcBalls = s.id === "boil" ? plan.boilMake : plan.rows[s.id].make;
          return (
            <div key={s.id} className="flex items-center gap-2 py-2.5"
              style={{ borderBottom: i < ALL.length - 1 ? `1px dashed ${C.rule}` : "none" }}>
              <div className="flex w-20 shrink-0 items-center gap-1.5">
                <Dot color={s.color} size={7} />
                <MonoCaps size={10} color={s.color} style={{ fontWeight: 700 }}>{s.chip}</MonoCaps>
              </div>
              <Field value={record.actualMake[s.id]} onChange={(v) => patch((r) => (r.actualMake[s.id] = v))}
                width={90} placeholder={calcBalls != null ? String(calcBalls) : "—"} ariaLabel={`${s.label} actual balls made`} />
              <Mono size={11} color={C.mute}>balls</Mono>
              <div className="ml-auto text-right">
                <Mono size={13} weight={700} color={e.balls == null ? C.mute : C.ink}>{e.balls == null ? "—" : e.balls}</Mono>
                <div><MonoCaps size={8} color={e.source === "recount" ? C.accent : C.mute}>{e.balls == null ? "" : e.source}</MonoCaps></div>
              </div>
            </div>
          );
        })}
      </div>
    </Collapse>
  );
}

/* ---------------- EON ---------------- */

function EonSection({ record, patch, plan, bibleId }) {
  const es = parseSales(record.eon.sales);
  const tf = parseSales(record.twopm.todayForecast);
  const delta = es != null && tf != null ? es - tf : null;

  // Outlook forecast: manual entry wins; otherwise 2 PM save
  const twopmForecast = record.twopm.tomorrowForecast;
  const rawForecast = record.eon.outlookManual ? record.eon.outlookForecast : (record.eon.outlookForecast || twopmForecast);
  const forecast = parseSales(rawForecast);
  const source = record.eon.outlookManual ? "Manual entry" : twopmForecast !== "" ? "From 2 PM save" : "No 2 PM save — enter manually";
  const ol = computeOutlook(record, bibleId, forecast);

  return (
    <>
      <section className="flex flex-col gap-2">
        <StepHead num="01" title="End of Night Sales" sub="Dollars" />
        <Card className="px-3 py-1">
          <SalesRow label="Final sales" value={record.eon.sales} onChange={(v) => patch((r) => (r.eon.sales = v))} ariaLabel="End of night sales" />
          {delta != null && (
            <div className="pb-2 text-right">
              <Mono size={12} color={delta >= 0 ? C.good : C.neg}>{delta >= 0 ? "+" : "−"}${Math.abs(delta).toLocaleString()} vs forecast</Mono>
            </div>
          )}
        </Card>
      </section>

      <CountsSection num="02" counts={record.eon.counts} onChange={(id, f, v) => patch((r) => (r.eon.counts[id][f] = v))} prefix="EON" />

      <section className="flex flex-col gap-2">
        <StepHead num="08" title="EON Outlook" sub="Have vs tomorrow's need" />
        <Card className="px-3 py-2">
          <div className="flex items-center justify-between gap-3 py-1">
            <div>
              <Eyebrow color={C.inkSoft}>Tomorrow's forecast</Eyebrow>
              <div><Mono size={10} color={C.mute}>{source}{forecast != null ? ` · = ${money(forecast)}` : ""}</Mono></div>
            </div>
            <Field
              value={record.eon.outlookManual ? record.eon.outlookForecast : (record.eon.outlookForecast || twopmForecast)}
              onChange={(v) => patch((r) => { r.eon.outlookForecast = v; r.eon.outlookManual = true; })}
              decimal width={118} placeholder="0" ariaLabel="Outlook forecast"
            />
          </div>
          <div style={{ borderTop: `1px dashed ${C.rule}` }} />
          {!ol.hasNeed ? (
            <div className="py-2"><Mono size={12} color={C.mute}>Enter tomorrow's forecast above to see the outlook.</Mono></div>
          ) : (
            <>
              {ALL.map((s, i) => {
                const r = ol.rows[s.id];
                return (
                  <div key={s.id} className="flex items-center gap-2 py-2"
                    style={{ borderBottom: i < ALL.length - 1 ? `1px dashed ${C.ruleSoft}` : "none" }}>
                    <div className="flex w-16 shrink-0 items-center gap-1.5">
                      <Dot color={s.color} size={7} />
                      <MonoCaps size={10} color={s.color} style={{ fontWeight: 700 }}>{s.chip}</MonoCaps>
                    </div>
                    <Mono size={13}>{fmt(r.have)}</Mono>
                    <Mono size={11} color={C.mute}>vs {fmt(r.need)}</Mono>
                    <div className="ml-auto text-right">
                      <Mono size={15} weight={700} color={r.diff == null ? C.mute : r.diff < 0 ? C.neg : C.good}>
                        {r.diff == null ? "—" : `${r.tDiff > 0 ? "+" : r.tDiff < 0 ? "−" : ""}${Math.abs(r.tDiff)} tr`}
                      </Mono>
                      {r.diff != null && (
                        <div><Mono size={10} color={C.mute}>{r.diff > 0 ? `+${r.diff}` : r.diff} balls</Mono></div>
                      )}
                    </div>
                  </div>
                );
              })}
              {ol.anyCount && (
                <div className="py-2" style={{ borderTop: `1px solid ${C.ruleSoft}` }}>
                  <Mono size={12} color={ol.shortfall > 0 ? C.inkSoft : C.good}>
                    {ol.shortfall > 0
                      ? `Tomorrow we will potentially go into same-day dough by ${ol.shortTrays >= 1 ? `~${ol.shortTrays} ${ol.shortTrays === 1 ? "tray" : "trays"}` : "less than a tray"} (${ol.shortfall} balls).`
                      : `Dough is good ✓ — ~${ol.surplusTrays} ${ol.surplusTrays === 1 ? "tray" : "trays"} leftover (${ol.surplus} balls).`}
                  </Mono>
                </div>
              )}
            </>
          )}
        </Card>
      </section>
    </>
  );
}

/* ============================================================
   APP (→ js/main.js)
   ============================================================ */

export default function DoughTracker() {
  const [date, setDate] = useState(today());
  const [record, setRecord] = useState(blankRecord);
  const [mode, setMode] = useState("twopm");
  const [status, setStatus] = useState("new"); // loading | local | synced | new
  const [resetArmed, setResetArmed] = useState(false);
  const skipSave = useRef(true);
  const seq = useRef(0);

  const autoBible = PEACH_MONTHS.includes(parseInt(date.slice(5, 7), 10)) ? "peach" : "regular";
  const bibleId = record.bible ?? autoBible;

  /* auto-load on date change — no Load button */
  useEffect(() => {
    let live = true;
    const mySeq = ++seq.current;
    setStatus("loading");
    storage.load(date).then((rec) => {
      if (!live || mySeq !== seq.current) return;
      const r = rec ?? blankRecord();
      skipSave.current = true;
      setRecord(r);
      const has2pm = r.twopm.tomorrowForecast !== "" || ALL.some((s) => !countBlank(r.twopm.counts[s.id]));
      setMode(has2pm ? "eon" : "twopm");
      setStatus(rec ? "synced" : "new");
    });
    return () => { live = false; };
  }, [date]);

  /* capture instantly, sync in the background — no save buttons */
  useEffect(() => {
    if (skipSave.current) { skipSave.current = false; return; }
    const mySeq = ++seq.current;
    setStatus("local"); // production: localStorage write happened synchronously
    storage.sync(date, record).then(() => {
      if (mySeq === seq.current) setStatus("synced");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record]);

  const patch = (fn) => setRecord((r) => { const n = clone(r); fn(n); return n; });
  const set2pm = (field, v) => patch((r) => (r.twopm[field] = v));

  const plan = computePlan(record, bibleId);
  const eff = effectiveMake(record, plan);

  const doReset = () => {
    if (!resetArmed) {
      setResetArmed(true);
      setTimeout(() => setResetArmed(false), 2500);
      return;
    }
    setResetArmed(false);
    setRecord(blankRecord());
    setMode("twopm");
  };

  const statusUI = {
    loading: { color: C.mute, text: "Loading", pulse: true },
    local: { color: C.warn, text: "Saved on phone", pulse: true },
    synced: { color: C.good, text: "Synced" },
    new: { color: C.mute, text: "New night" },
  }[status];

  return (
    <SavedCtx.Provider value={status === "synced"}>
    <div className="min-h-screen w-full" style={{
      background: C.bg, color: C.ink, fontFamily: F.body,
      backgroundImage: `radial-gradient(circle at 20% 10%, ${C.grain} 0%, transparent 40%), radial-gradient(circle at 80% 70%, ${C.grain} 0%, transparent 40%)`,
    }}>
      <style>{GLOBAL_CSS}</style>

      {/* ---------- masthead ---------- */}
      <header className="mx-auto max-w-[460px] px-4 pb-3 pt-5">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={statusUI.pulse ? "pulse" : ""} style={{ width: 8, height: 8, borderRadius: 99, background: statusUI.color, display: "inline-block" }} />
            <MonoCaps size={10}>{statusUI.text}</MonoCaps>
          </div>
          <button onClick={doReset}
            style={{
              fontFamily: F.mono, fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase",
              color: resetArmed ? C.paper : C.mute, padding: "6px 10px", borderRadius: 6,
              border: `1px solid ${resetArmed ? C.accent : C.rule}`, background: resetArmed ? C.accent : "transparent",
            }}>
            {resetArmed ? "Tap again" : "Reset"}
          </button>
        </div>
        <h1 style={{ fontFamily: F.display, fontWeight: 700, fontSize: 42, lineHeight: 0.9, letterSpacing: "-0.02em" }}>
          Dough <em style={{ fontStyle: "italic", fontWeight: 500, color: C.accent }}>Tracker</em>
        </h1>
        <div className="mt-1.5 flex items-center gap-2">
          <MonoCaps size={10}>{BIBLES[bibleId].label}{record.bible == null ? " · auto" : ""}</MonoCaps>
          <span style={{ color: C.rule, fontSize: 8 }}>●</span>
          <MonoCaps size={10}>Pizzeria Ops</MonoCaps>
        </div>
      </header>

      <main className="mx-auto flex max-w-[460px] flex-col gap-4 px-4 pb-24">
        {/* ---------- 00 active date ---------- */}
        <section className="flex flex-col gap-2">
          <StepHead num="00" title="Active Date" sub="Auto-loads" />
          <Card className="p-3">
            <input type="date" value={date} aria-label="Active date"
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="w-full"
              style={{
                height: 44, fontFamily: F.mono, fontWeight: 500, fontSize: 14, color: C.ink,
                background: C.input, border: `1px solid ${C.rule}`, borderRadius: 6, padding: "0 10px",
              }} />
          </Card>
        </section>

        {/* ---------- 2 PM / EON tabs ---------- */}
        <div className="flex rounded-[10px]" style={{ border: `1.5px solid ${C.ink}`, overflow: "hidden" }}>
          {[{ id: "twopm", label: "2 PM" }, { id: "eon", label: "EON" }].map((m) => (
            <button key={m.id} onClick={() => setMode(m.id)} className="flex-1"
              style={{
                height: 44, fontFamily: F.body, fontWeight: 800, fontSize: 13, letterSpacing: "0.1em",
                textTransform: "uppercase", border: "none",
                background: mode === m.id ? C.ink : C.paper, color: mode === m.id ? C.paper : C.ink,
              }}>
              {m.label}
            </button>
          ))}
        </div>

        {status === "loading" ? (
          <div className="py-10 text-center"><Mono size={13} color={C.mute}>Loading {date}…</Mono></div>
        ) : (
          <>
            {mode === "twopm" ? (
              <>
                <SalesSection tp={record.twopm} set={set2pm} plan={plan} bibleId={bibleId} />
                <CountsSection num="02" counts={record.twopm.counts}
                  onChange={(id, f, v) => patch((r) => (r.twopm.counts[id][f] = v))} prefix="2PM" />
                <DaysWork plan={plan} />
                <BySize plan={plan} />
              </>
            ) : (
              <EonSection record={record} patch={patch} plan={plan} bibleId={bibleId} />
            )}

            <div className="flex flex-col gap-2.5 pt-1">
              <BibleTab record={record} patch={patch} bibleId={bibleId} plan={plan} autoBible={autoBible} />
              <TempsTab record={record} patch={patch} plan={plan} />
              <HistoryTab currentDate={date} onOpen={setDate} />
              <MakeTab record={record} patch={patch} plan={plan} eff={eff} />
            </div>
          </>
        )}

        <Mono size={11} color={C.mute} style={{ lineHeight: 1.5 }}>
          v2 preview — data lives in memory for this session and resets on reload; yesterday is
          pre-filled. Production writes every change to the phone instantly, then syncs to Google
          Sheets in the background (that's the two-stage status dot up top).
        </Mono>
      </main>
    </div>
    </SavedCtx.Provider>
  );
}
