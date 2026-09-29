// Turns the raw text an OCR engine produced from a nutrition-label photo into calories / protein / carbs / fat.
//
// OCR on label tables is imperfect in a very predictable way: the letter "g" after a number is often read as
// a 9 or a 0 ("5.1g" → "5.19", "69g" → "699g"), decimal points sometimes vanish ("5.1" → "51"), and "1" can
// become "l". Rather than trust the digits blindly, each number gets a few plausible readings and the
// combination whose protein + carbs + fat actually adds up to the label's calories wins. Every result is
// shown to the person next to their photo for checking — this makes the typing faster, it never replaces it.
//
// Pure functions, no browser or React dependencies, so they're unit-tested in tests/tally.mjs.

const round1 = (n) => Math.round(n * 10) / 10;

// Fix single-character OCR slips inside numbers ("1l3" → "113", "5O" → "50") and unify decimal commas.
function cleanLine(line) {
  return String(line)
    .replace(/(\d)[lI|](?=\d)/g, (m, d) => d + "1")
    .replace(/(\d)[Oo](?=\d)/g, (m, d) => d + "0")
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/[‘’“”"~_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// All the plain numbers in a row, in reading order, ignoring %RI figures.
function numbersIn(str) {
  const out = [];
  const re = /(\d+(?:\.\d+)?)\s*([a-zA-Z%]{0,4})/g;
  let m;
  while ((m = re.exec(str))) {
    const suffix = m[2] || "";
    const isPercent = suffix.startsWith("%") || str.charAt(m.index + m[0].length) === "%";
    const isEnergyUnit = /^k[jJ)]|^kc|^kca/i.test(suffix);
    if (isPercent || isEnergyUnit) continue;
    out.push({ raw: m[1], hasG: /^g$/i.test(suffix) });
  }
  return out;
}

// Plausible readings of one gram value, each with a "how suspicious" penalty (lower = more believable).
export function gramCandidates(raw, hasG) {
  const cands = [];
  const seen = new Set();
  const add = (str, penalty, corrected) => {
    const v = parseFloat(str);
    if (!Number.isFinite(v) || v < 0 || v > 100) return;
    const key = String(v);
    const existing = cands.find((c) => c.key === key);
    if (existing) { if (penalty < existing.penalty) { existing.penalty = penalty; existing.corrected = corrected; } return; }
    cands.push({ key, value: v, penalty, corrected });
  };
  const decimals = (s) => (s.split(".")[1] || "").length;
  // A label prints one decimal under 10 ("5.1") and whole numbers above — two decimals is a giveaway.
  add(raw, decimals(raw) >= 2 ? 1.0 : 0, false);
  // The "g" read as a digit stuck on the end: 5.19 → 5.1, 699 → 69, 139 → 13, 5.80 → 5.8
  let stripped = null;
  if (/[9068]$/.test(raw) && raw.length > 1) {
    stripped = raw.slice(0, -1).replace(/\.$/, "");
    if (stripped) add(stripped, 0.3, true);
  }
  // A vanished decimal point: 51 → 5.1, 83 → 8.3
  for (const base of [raw, stripped]) {
    if (base && !base.includes(".") && base.length >= 2 && base.length <= 3) {
      add(`${base.slice(0, -1)}.${base.slice(-1)}`, 0.6, true);
    }
  }
  return cands;
}

function pickKcal(row) {
  const kcals = [];
  const re = /(\d+(?:\.\d+)?)\s*k\s?c\s?a?\s?[l1i]/gi;
  let m;
  while ((m = re.exec(row))) kcals.push(parseFloat(m[1]));
  if (kcals.length) return kcals;
  const us = /calories\D{0,8}(\d+)/i.exec(row);
  if (us) return [parseFloat(us[1])];
  const kjs = [];
  const rk = /(\d+(?:\.\d+)?)\s*k\s?[Jj)]/g;
  while ((m = rk.exec(row))) kjs.push(Math.round(parseFloat(m[1]) / 4.184));
  return kjs;
}

// Grams for a serving-size figure, tolerating the same "g read as 9" slip.
function servingGrams(raw, hasG) {
  let v = parseFloat(raw);
  if (!hasG && raw.length >= 2 && /9$/.test(raw)) v = parseFloat(raw.slice(0, -1));
  return v > 0 && v <= 2000 ? v : null;
}

export function parseNutritionText(text, { confidence = null } = {}) {
  const lines = String(text || "").split("\n").map(cleanLine).filter(Boolean);
  const all = lines.join("\n");

  // ── which column is per-100g, and is there a per-serving size? ──
  const headerText = lines.filter((l) => /\bper\b|serving|portion|100\s*(g|9|ml)/i.test(l) && !/^(energy|fat|carb|protein|calories)/i.test(l)).join(" ");
  const has100 = /100\s*(g|9|ml)\b/i.test(headerText) || /per\s*100/i.test(headerText);
  let basis = has100 ? "per100" : "perServing";
  let colIndex = 0;
  if (has100) {
    const p100 = headerText.search(/100\s*(g|9|ml)\b|per\s*100/i);
    const pServ = headerText.search(/serving|portion|\bpack\b|\bbar\b|\bslice\b|\bbiscuit\b|per\s+\d+(\.\d+)?\s*(g|9|ml)\b(?!.*100)/i);
    if (pServ >= 0 && pServ < p100) colIndex = 1; // "per serving" listed before "per 100g"
  }
  let servingG = null;
  const perServ = /per\s*(\d+(?:\.\d+)?)\s*(g|9)?\s*(serving|portion|biscuit|bar|slice|pack)/i.exec(all);
  if (perServ) servingG = servingGrams(perServ[1], /^g$/i.test(perServ[2] || ""));
  const sizeLine = lines.find((l) => /serving\s*size/i.test(l));
  if (!servingG && sizeLine) {
    const paren = /\(\s*(\d+(?:\.\d+)?)\s*(g|9)?\s*\)/i.exec(sizeLine) || /(\d+(?:\.\d+)?)\s*(g|ml)\b/i.exec(sizeLine);
    if (paren) servingG = servingGrams(paren[1], /^(g|ml)$/i.test(paren[2] || ""));
  }

  // ── find each row ──
  const isSub = (l) => /of which|saturat|trans|mono|poly|sugar/i.test(l);
  const rowFor = (test, { skipSub = false } = {}) => lines.find((l) => test.test(l) && /\d/.test(l) && !(skipSub && isSub(l)));
  const energyRow = lines.find((l) => /energy|calories|kcal|\bkj\b/i.test(l) && /\d/.test(l));
  const fatRow = rowFor(/^\W*(total\s+)?fat\b/i, { skipSub: true });
  const carbRow = lines.find((l) => /carb/i.test(l) && /\d/.test(l) && !/^of which|^sugars?/i.test(l));
  const proteinRow = rowFor(/prot/i);

  const pickColumn = (arr) => (arr.length ? arr[Math.min(colIndex, arr.length - 1)] : null);
  const fields = {};
  const tokenCounts = {};
  for (const [name, row] of [["fat", fatRow], ["carb", carbRow], ["protein", proteinRow]]) {
    if (!row) { fields[name] = null; continue; }
    // strip the row's label so its own letters/digits don't count as numbers
    const nums = numbersIn(row.replace(/^[^\d]*/, ""));
    tokenCounts[name] = nums.length;
    const tok = pickColumn(nums);
    fields[name] = tok ? gramCandidates(tok.raw, tok.hasG) : null;
  }
  let kcal = null;
  if (energyRow) {
    const ks = pickKcal(energyRow);
    const k = pickColumn(ks);
    if (k && k > 0 && k <= 1500) kcal = Math.round(k);
  }

  // ── choose readings so the macros add up to the calories ──
  const names = ["protein", "carb", "fat"];
  const present = names.filter((n) => fields[n] && fields[n].length);
  const chosen = {};
  if (present.length === 3 && kcal) {
    let best = null;
    for (const p of fields.protein) for (const c of fields.carb) for (const f of fields.fat) {
      const implied = 4 * p.value + 4 * c.value + 9 * f.value;
      const rel = Math.abs(implied - kcal) / Math.max(kcal, 50);
      const score = p.penalty + c.penalty + f.penalty + 10 * rel;
      if (!best || score < best.score) best = { score, p, c, f };
    }
    chosen.protein = best.p; chosen.carb = best.c; chosen.fat = best.f;
  } else {
    for (const n of present) chosen[n] = [...fields[n]].sort((a, b) => a.penalty - b.penalty)[0];
  }

  const result = {
    kcal,
    protein: chosen.protein ? chosen.protein.value : null,
    carb: chosen.carb ? chosen.carb.value : null,
    fat: chosen.fat ? chosen.fat.value : null,
    basis,
    servingG,
    corrected: {
      protein: !!(chosen.protein && chosen.protein.corrected),
      carb: !!(chosen.carb && chosen.carb.corrected),
      fat: !!(chosen.fat && chosen.fat.corrected),
    },
    missing: [],
    unsure: { protein: false, carb: false, fat: false },
    warnings: [],
    warning: null,
    confidence,
  };
  for (const [key, label] of [["kcal", "calories"], ["protein", "protein"], ["carb", "carbohydrate"], ["fat", "fat"]]) {
    if (result[key] == null) result.missing.push(label);
  }
  const check = atwaterCheck(result);
  if (check && !check.ok) result.warnings.push(check.message);

  // A row with fewer numbers than its neighbours usually means a column was garbled, and the number we picked may
  // belong to the wrong column — even when the totals happen to add up.
  const maxTokens = Math.max(0, ...Object.values(tokenCounts));
  const labels = { protein: "protein", carb: "carbohydrate", fat: "fat" };
  if (maxTokens >= 2) {
    for (const n of names) {
      if (tokenCounts[n] != null && tokenCounts[n] < maxTokens) {
        result.unsure[n] = true;
        result.warnings.push(`The ${labels[n]} row looks incomplete in the photo — check that number carefully.`);
      }
    }
  }
  if (confidence != null && confidence < 60) {
    result.warnings.push("The photo was hard to read — check every number against it before using them.");
  }
  result.warning = result.warnings[0] || null;
  result.kcalFromMacros = result.protein != null && result.carb != null && result.fat != null
    ? Math.round(4 * result.protein + 4 * result.carb + 9 * result.fat) : null;
  return result;
}

// Do protein + carbs + fat roughly explain the calories? (Fibre and polyols make it slightly loose, so allow ~20%.)
export function atwaterCheck({ kcal, protein, carb, fat }) {
  if ([kcal, protein, carb, fat].some((v) => v == null || Number.isNaN(Number(v)))) return null;
  const implied = 4 * protein + 4 * carb + 9 * fat;
  const diff = Math.abs(implied - kcal);
  const ok = diff <= 40 || diff / Math.max(kcal, 1) <= 0.2;
  return {
    ok, implied: Math.round(implied),
    message: ok ? "" : `These don't quite add up: ${protein}g protein + ${carb}g carbs + ${fat}g fat comes to about ${Math.round(implied)} kcal, but the label says ${kcal}. One of the numbers is probably misread — check them against your photo.`,
  };
}

// Label values are "per 100g" or "per serving". The app stores everything per 100g.
export function toPer100(values, basis, servingG) {
  if (basis === "per100") return { ...values };
  const g = Number(servingG);
  if (!(g > 0)) return null;
  const f = 100 / g;
  return {
    kcal: Math.round(values.kcal * f),
    protein: round1(values.protein * f),
    carb: round1(values.carb * f),
    fat: round1(values.fat * f),
  };
}
