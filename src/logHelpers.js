// Pure helpers behind Recent / Favourites / Copy-yesterday and the weight chart.
// No React in here so they can be unit-tested directly (tests/tally.mjs).

// Local-date helpers (never toISOString — that's UTC and breaks the day boundary for UK users in BST).
export function parseDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function shiftDate(str, days) {
  const d = parseDate(str);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

// Identity of a "thing you eat" across days, so the same banana logged five times shows up once.
export function entryKey(entry) {
  if (entry.type === "food") return `food:${entry.food.name}`;
  if (entry.type === "manual") return `manual:${(entry.name || "").trim().toLowerCase()}`;
  return `recipe:${entry.section}::${entry.name}`;
}

// The entry minus the bits that belong to one specific moment (its id and the time it was eaten).
export function templateFromEntry(entry) {
  const { id, time, ...rest } = entry;
  return rest;
}

// Most recently eaten distinct items, newest first, looking back `days` days from `today`.
export function buildRecents(logsByDate, today, { days = 60, limit = 12 } = {}) {
  const cutoff = shiftDate(today, -days);
  const seen = new Map();
  const dates = Object.keys(logsByDate || {}).filter((d) => d >= cutoff && d <= today).sort().reverse();
  for (const date of dates) {
    const entries = logsByDate[date] || [];
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      if (e.type === "manual" && e.quantified === false) continue; // a name-only note can't be re-logged meaningfully
      const key = entryKey(e);
      const hit = seen.get(key);
      if (hit) hit.count += 1;
      else seen.set(key, { key, count: 1, lastDate: date, entry: e });
    }
  }
  return [...seen.values()].slice(0, limit);
}

// Fresh copies of entries with unique ids — used for "copy yesterday" and one-tap re-logging.
export function cloneEntries(entries, idSeed = Date.now()) {
  return entries.map((e, i) => ({ ...e, id: idSeed + i }));
}

// Group a day's entries by meal label for the "copy just breakfast" picker.
export function mealLabel(entry) {
  return entry.mealType || (entry.type === "recipe" ? entry.section : "Other");
}
export function groupByMeal(entries) {
  const groups = new Map();
  for (const e of entries) {
    const k = mealLabel(e);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }
  return groups;
}

// ── Weight ──
export function upsertWeight(log, date, kg) {
  const next = (log || []).filter((w) => w.date !== date);
  next.push({ date, kg });
  return next.sort((a, b) => a.date.localeCompare(b.date));
}

// Trailing 7-entry-day moving average: smooths out the ±1kg day-to-day noise (water, salt, food in the gut)
// so the direction of travel is visible.
export function movingAverage(log, windowDays = 7) {
  return (log || []).map((w) => {
    const from = shiftDate(w.date, -(windowDays - 1));
    const inWindow = log.filter((x) => x.date >= from && x.date <= w.date);
    return { date: w.date, kg: inWindow.reduce((s, x) => s + x.kg, 0) / inWindow.length };
  });
}

// Least-squares slope in kg per week across the given entries (needs ≥2 entries spanning ≥7 days to mean much).
export function weeklyRate(log) {
  if (!log || log.length < 2) return null;
  const t0 = parseDate(log[0].date).getTime();
  const pts = log.map((w) => [(parseDate(w.date).getTime() - t0) / 86400000, w.kg]);
  const spanDays = pts[pts.length - 1][0];
  if (spanDays < 7) return null;
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n;
  const my = pts.reduce((s, p) => s + p[1], 0) / n;
  const den = pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
  if (den === 0) return null;
  const slopePerDay = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / den;
  return slopePerDay * 7;
}

export function weightInRange(log, today, days) {
  if (!days) return log || [];
  const from = shiftDate(today, -days);
  return (log || []).filter((w) => w.date >= from);
}
