// Data + maths integrity test. Run with: npm run tally
// Checks that the numbers in the app actually add up — the kind of thing that silently drifts as
// recipes get added (an extra with no protein/carbs recorded quietly drops out of every total).
import fs from "fs";

const src = (f) => fs.readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8").replace(/^export /gm, "");
const code = src("data.js") + "\n" + src("calculations.js") + "\n" + src("servings.js") + "\n" + src("logHelpers.js") + "\n" + src("barcode.js") + "\n" + src("labelParser.js") + "\n" + src("weeklyPrep.js") +
  "\nreturn { RECIPE_DATA, FOOD_LIST, computeTargets, mealTarget, scaledMacros, fixedMacros, SERVINGS, servingsFor, gramsFrom, formatAmount," +
  " normalizeBarcode, isValidBarcode, explainCameraError, parseNutritionText, toPer100, atwaterCheck, makeRng, pickRecipes, generateWeekBox, rerollOne, uniqueIngredientCount, recipeKeyIngredients, parseDate, formatDate, shiftDate, entryKey, templateFromEntry, buildRecents, cloneEntries, groupByMeal, upsertWeight, movingAverage, weeklyRate, weightInRange };";
const {
  RECIPE_DATA, FOOD_LIST, computeTargets, mealTarget, scaledMacros, fixedMacros, SERVINGS, servingsFor, gramsFrom, formatAmount,
  normalizeBarcode, isValidBarcode, explainCameraError, parseNutritionText, toPer100, atwaterCheck, makeRng, pickRecipes, generateWeekBox, rerollOne, uniqueIngredientCount, recipeKeyIngredients, formatDate, shiftDate, entryKey, templateFromEntry, buildRecents, cloneEntries, groupByMeal, upsertWeight, movingAverage, weeklyRate, weightInRange,
} = new Function(code)();

const DB = Object.fromEntries(FOOD_LIST.map((f) => [f.name, f]));
const failures = [];
const fail = (msg) => failures.push(msg);
const section = (name) => console.log(`\n${name}`);

// 1. Food database: calories should roughly equal 4·protein + 4·carbs + 9·fat.
//    Alcohol (7 kcal/g) and fibre-heavy fruit legitimately don't, so those are allow-listed by name.
section("1. Food database: calories agree with macros");
const ALLOW = /wine|beer|prosecco|champagne|spirit|gin |rum |cocktail|passionfruit/i;
let off = 0;
for (const f of FOOD_LIST) {
  const implied = 4 * f.protein + 4 * f.carb + 9 * f.fat;
  if (Math.abs(f.kcal - implied) > 40 && Math.abs(f.kcal - implied) / Math.max(implied, 1) > 0.2 && !ALLOW.test(f.name)) {
    off++; fail(`Food "${f.name}": ${f.kcal} kcal but macros imply ${Math.round(implied)}`);
  }
}
console.log(`   ${FOOD_LIST.length} foods checked, ${off} inconsistent`);

// 2. Every recipe references real foods and carries the fields the maths needs.
section("2. Recipe data is complete");
let recipes = 0;
for (const [sec, sd] of Object.entries(RECIPE_DATA.sections)) {
  for (const it of sd.items) {
    recipes++;
    if (sd.type === "scaled") {
      if (!DB[it.proteinFood]) fail(`${it.name}: unknown protein food "${it.proteinFood}"`);
      if (!DB[it.carbFood]) fail(`${it.name}: unknown carb food "${it.carbFood}"`);
      if (it.proteinCarbPer100 == null || it.carbProteinPer100 == null)
        fail(`${it.name}: missing proteinCarbPer100 / carbProteinPer100 (protein inside the carb source and vice versa would be dropped)`);
      for (const e of it.extras || []) {
        if (!DB[e.food]) fail(`${it.name}: unknown extra "${e.food}"`);
        else if (e.proteinPer100 == null || e.carbPer100 == null)
          fail(`${it.name}: extra "${e.food}" has no proteinPer100/carbPer100 — its protein and carbs would be silently dropped`);
      }
    } else {
      if (!DB[it.food1]) fail(`${it.name}: unknown food1 "${it.food1}"`);
      if (it.food2 && !DB[it.food2]) fail(`${it.name}: unknown food2 "${it.food2}"`);
      if (it.food2 && it.kcal2 === 0 && DB[it.food2] && DB[it.food2].kcal > 0)
        fail(`${it.name}: food2 "${it.food2}" is recorded as 0 kcal`);
    }
  }
}
console.log(`   ${recipes} recipes checked`);

// 3. Recipe maths: three different people, every scaled recipe.
const PROFILES = [
  { bodyweight: 60, goal: "Fat Loss" }, { bodyweight: 75, goal: "Maintenance" }, { bodyweight: 90, goal: "Muscle Gain" },
].map((p) => ({ ...p, structure: "Breakfast, Lunch & Dinner", adjustment: 0, snackCount: 0, snackPct: 5, mealPercents: null }));

section("3. Recipe maths tallies (calories = 4P + 4C + 9F, and uncapped meals hit their targets)");
for (const prof of PROFILES) {
  const T = computeTargets(prof);
  let uncapped = 0, onP = 0, onC = 0, carbFree = 0, worstGap = 0;
  for (const sec of ["Breakfast", "Lunch", "Dinner"]) {
    const tg = mealTarget(sec, T);
    for (const it of RECIPE_DATA.sections[sec].items) {
      const m = scaledMacros(it, tg);
      const gap = Math.abs(m.calories - (4 * m.proteinG + 4 * m.carbG + 9 * m.fat));
      worstGap = Math.max(worstGap, gap);
      if (gap > Math.max(40, 0.06 * m.calories)) fail(`${prof.bodyweight}kg ${sec} "${it.name}": calories ${Math.round(m.calories)} vs macros imply ${Math.round(4 * m.proteinG + 4 * m.carbG + 9 * m.fat)}`);
      if (!it.fixedProteinGrams) {
        uncapped++;
        if (Math.abs(m.proteinG - tg.protein) / tg.protein <= 0.08) onP++;
        if (!it.fixedCarbGrams) { carbFree++; if (Math.abs(m.carbG - tg.carbs) / tg.carbs <= 0.08) onC++; }
      }
    }
  }
  const pOk = onP / uncapped, cOk = onC / carbFree;
  console.log(`   ${prof.bodyweight}kg ${prof.goal}: protein on target ${(pOk * 100).toFixed(0)}%, carbs on target ${(cOk * 100).toFixed(0)}% (uncapped meals, ±8%), worst kcal gap ${Math.round(worstGap)}`);
  if (pOk < 0.90) fail(`${prof.bodyweight}kg: only ${(pOk * 100).toFixed(0)}% of uncapped meals land within 8% of the protein target (expected at least 90%)`);
  if (cOk < 0.90) fail(`${prof.bodyweight}kg: only ${(cOk * 100).toFixed(0)}% of uncapped meals land within 8% of the carb target (expected at least 90%)`);
}

// 4. Fixed-portion recipes (snacks, desserts, smoothies…): calories should agree with their macros too.
section("4. Fixed-portion recipes tally");
let fixedOff = 0, fixedN = 0;
for (const [sec, sd] of Object.entries(RECIPE_DATA.sections)) {
  if (sd.type !== "fixed") continue;
  for (const it of sd.items) {
    fixedN++;
    const m = fixedMacros(it);
    const implied = 4 * m.protein + 4 * m.carbs + 9 * m.fat;
    if (Math.abs(m.calories - implied) > 60 && Math.abs(m.calories - implied) / Math.max(implied, 1) > 0.25) {
      fixedOff++; fail(`${sec} "${it.name}": ${Math.round(m.calories)} kcal but macros imply ${Math.round(implied)}`);
    }
  }
}
console.log(`   ${fixedN} fixed-portion recipes checked, ${fixedOff} inconsistent`);


// 5. Serving sizes: every one must be attached to a real food, and sane.
section("5. Serving sizes");
let servingProblems = 0;
for (const [name, list] of Object.entries(SERVINGS)) {
  if (!DB[name]) { servingProblems++; fail(`Serving sizes defined for "${name}" but no such food exists (typo? renamed?)`); continue; }
  const labels = new Set();
  for (const sv of list) {
    if (!(sv.grams > 0 && sv.grams <= 1500)) { servingProblems++; fail(`"${name}" serving "${sv.label}" has an unrealistic weight: ${sv.grams}g`); }
    if (!sv.label || /^\d/.test(sv.label)) { servingProblems++; fail(`"${name}" serving label "${sv.label}" must not start with a number (the quantity box supplies it)`); }
    if (labels.has(sv.label)) { servingProblems++; fail(`"${name}" has two servings labelled "${sv.label}"`); }
    labels.add(sv.label);
  }
}
console.log(`   ${Object.keys(SERVINGS).length} foods have everyday servings, ${servingProblems} problems`);
{
  const banana = DB["Banana"];
  const okA = Math.round(gramsFrom(2, "medium", servingsFor(banana))) === 236;
  const okB = gramsFrom(150, "g", servingsFor(banana)) === 150;
  const okC = gramsFrom(1, "serving", servingsFor({ name: "Some bar", servingG: 60 })) === 60;
  const okD = formatAmount({ grams: 236, qty: 2, unitLabel: "medium" }) === "2 × medium (236g)" && formatAmount({ grams: 150 }) === "150g";
  console.log(`   2 medium bananas = 236g: ${okA} | grams pass through: ${okB} | barcode serving: ${okC} | display text: ${okD}`);
  if (!(okA && okB && okC && okD)) fail("Serving maths (gramsFrom / servingsFor / formatAmount) is wrong");
}

// 6. Recent / Favourites / Copy yesterday logic.
section("6. Recent foods, favourites and copy-yesterday");
{
  const banana = DB["Banana"], oats = DB["Oats (dry)"];
  const food = (f, grams, time) => ({ id: Math.random(), type: "food", food: f, grams, time, mealType: "Snack" });
  const logs = {
    "2026-09-24": [food(banana, 118, "08:00"), food(oats, 40, "08:05")],
    "2026-09-27": [food(banana, 118, "15:00"), { id: 5, type: "manual", name: "Takeaway curry", calories: 900, protein: 40, carbs: 90, fat: 40, quantified: true, mealType: "Dinner" },
                   { id: 6, type: "manual", name: "Mystery snack", quantified: false }],
    "2026-01-01": [food(DB["Apple"], 182, "12:00")], // far too old to count as "recent"
  };
  const r = buildRecents(logs, "2026-09-28");
  const names = r.map((x) => (x.entry.type === "food" ? x.entry.food.name : x.entry.name));
  const okOrder = names.join("|") === "Takeaway curry|Banana|Oats (dry)";
  const okDedupe = r.find((x) => x.key === "food:Banana").count === 2;
  const okOld = !names.includes("Apple");
  const okNameOnly = !names.includes("Mystery snack");
  console.log(`   newest first & de-duplicated: ${okOrder && okDedupe} | ignores >60-day-old: ${okOld} | skips name-only notes: ${okNameOnly}`);
  if (!(okOrder && okDedupe && okOld && okNameOnly)) fail(`Recents wrong: got [${names.join(", ")}]`);

  const src2 = logs["2026-09-27"];
  const copies = cloneEntries(src2, 1000);
  const okIds = new Set(copies.map((c) => c.id)).size === copies.length && copies.every((c, i) => c.id !== src2[i].id);
  const okKeep = copies[0].time === "15:00" && copies[0].mealType === "Snack";
  const groups = [...groupByMeal(src2)].map(([k, v]) => `${k}:${v.length}`).join(",");
  console.log(`   copies get fresh ids: ${okIds} | keep time & meal: ${okKeep} | grouped by meal: ${groups}`);
  if (!okIds || !okKeep || groups !== "Snack:2,Dinner:1" && groups !== "Snack:1,Dinner:1,Other:1") fail(`Copy-yesterday logic wrong (${groups})`);

  const tpl = templateFromEntry(src2[0]);
  if ("id" in tpl || "time" in tpl) fail("templateFromEntry must drop id and time");
  if (entryKey(src2[0]) !== "food:Banana") fail("entryKey wrong for a food");

  // "yesterday" across a month, a year, and the UK clock change (must never use UTC)
  const okDates = shiftDate("2026-03-01", -1) === "2026-02-28" && shiftDate("2026-01-01", -1) === "2025-12-31" &&
                  shiftDate("2026-03-29", -1) === "2026-03-28" && shiftDate("2026-10-25", -1) === "2026-10-24";
  console.log(`   "yesterday" across month/year/clock-change boundaries: ${okDates}`);
  if (!okDates) fail("shiftDate is wrong around month, year or DST boundaries");
}

// 7. Weight maths.
section("7. Weight tracking maths");
{
  let log = [];
  for (let i = 0; i < 29; i++) log = upsertWeight(log, shiftDate("2026-09-28", -(28 - i)), 80 - i * 0.1); // exactly -0.1kg/day
  const rate = weeklyRate(log);
  const okRate = Math.abs(rate - -0.7) < 0.01;
  const replaced = upsertWeight(log, "2026-09-28", 99);
  const okUpsert = replaced.length === log.length && replaced[replaced.length - 1].kg === 99;
  const sorted = upsertWeight([{ date: "2026-09-10", kg: 70 }], "2026-09-01", 71)[0].date === "2026-09-01";
  const ma = movingAverage([{ date: "2026-09-01", kg: 80 }, { date: "2026-09-02", kg: 82 }], 7);
  const okMa = ma[1].kg === 81;
  const okShort = weeklyRate([{ date: "2026-09-01", kg: 80 }, { date: "2026-09-03", kg: 79 }]) === null;
  const okRange = weightInRange(log, "2026-09-28", 7).length === 8;
  console.log(`   weekly rate of a steady -0.1kg/day = ${rate.toFixed(2)} kg/wk: ${okRate} | same-day re-log replaces: ${okUpsert} | stays sorted: ${sorted} | 7-day average: ${okMa} | too-short span gives no rate: ${okShort} | range filter: ${okRange}`);
  if (!(okRate && okUpsert && sorted && okMa && okShort && okRange)) fail("Weight maths is wrong");
}

// 8. Sync must cover EVERYTHING the app saves (a hand-kept list once silently dropped notes, water and plans).
section("8. Everything the app saves is synced to the account");
{
  const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const sync = fs.readFileSync(new URL("../src/authSync.js", import.meta.url), "utf8");
  const keys = [...new Set([...app.matchAll(/(?:saveStored|loadStored)\("([^"]+)"/g)].map((m) => m[1]))];
  const badKey = keys.filter((k) => !k.startsWith("pe_"));
  console.log(`   ${keys.length} saved keys found, all under the synced "pe_" prefix: ${badKey.length === 0}`);
  if (badKey.length) fail(`These saved keys are outside the "pe_" prefix so they would never sync: ${badKey.join(", ")}`);
  if (!/startsWith\(SYNC_PREFIX\)/.test(sync) || /const ALL_KEYS/.test(sync)) fail("authSync.js must sync by prefix, not a hand-written key list");
  for (const k of ["pe_day_notes", "pe_water_by_date", "pe_my_week_plans", "pe_favourites", "pe_weight_log"]) {
    if (!keys.includes(k)) fail(`Expected the app to save "${k}"`);
  }
}

// 9. Barcode helpers: typed numbers are checked, US (UPC-A) codes are converted, camera failures are explained.
section("9. Barcode helpers");
{
  const good = ["3017620422003", "5449000000996", "5000159407236", "737628064502", "96385074", "3017 6204 22003"];
  const bad = ["3017620422004", "30176204220", "12345678901234567", "abc"];
  const okGood = good.every((c) => isValidBarcode(c));
  const okBad = bad.every((c) => !isValidBarcode(c));
  const okNorm = normalizeBarcode("737628064502") === "0737628064502" && normalizeBarcode("03017620422003") === "3017620422003" &&
                 normalizeBarcode("3017620422003") === "3017620422003" && normalizeBarcode(" 3017-6204-22003 ") === "3017620422003";
  console.log(`   real barcodes accepted: ${okGood} | typos & junk rejected: ${okBad} | UPC-A/GTIN-14 converted for the lookup: ${okNorm}`);
  if (!okGood) fail("A real, valid barcode was rejected by isValidBarcode");
  if (!okBad) fail("A wrong/garbage number was accepted by isValidBarcode");
  if (!okNorm) fail("normalizeBarcode is wrong — US barcodes would come back 'not found'");

  const cases = [
    ["NotAllowedError: Permission denied", /permission is blocked/i],
    ["Error getting userMedia, error = NotFoundError: Requested device not found", /no camera was found/i],
    ["NotReadableError: Could not start video source", /another app|couldn't start/i],
    ["OverconstrainedError", /doesn't support the requested settings/i],
    ["mediaDevices not supported", /can't access the camera/i],
    ["some weird failure", /couldn't start/i],
  ];
  const okMsgs = cases.every(([input, re]) => re.test(explainCameraError(input)));
  console.log(`   camera failures explained specifically: ${okMsgs}`);
  if (!okMsgs) fail("explainCameraError doesn't map camera failures to the right explanation: " + cases.map(([i]) => explainCameraError(i)).join(" | "));
}

// 10. Nutrition-label photo reading: real OCR output from tests/fixtures label photos (see README), including
// the exact garbled text the OCR engine produces on a small/blurry photo — not idealized clean input.
section("10. Nutrition-label photo parsing");
{
  const cases = [
    {
      name: "UK label, decent phone photo (g misread as 9, decimals dropped)",
      text: "Nutrition\nTypical values Per 100g Per 30g serving %RI*\nEnergy 1590kJ/378kcal 477kJ/113kcal 6%\nFat 5.19 1.59 2%\nof which saturates 1.0g 0.39 2%\nCarbohydrate 699 219g 8%\nof which sugars 139g 3.99 4%\nFibre 5.80 1.79\nProtein 8.39 2.59 5%\nSalt 0.019 0.00g 0%",
      expect: { kcal: 378, protein: 8.3, carb: 69, fat: 5.1, basis: "per100" },
    },
    {
      name: "US Nutrition Facts panel (per-serving only, with a serving size)",
      text: "Nutrition Facts\n8 servings per container\nServing size 2/3 cup (55g)\nCalories 230\nTotal Fat 8g 10%\nSaturated Fat 1g 5%\nTotal Carbohydrate 37g 13%\nDietary Fiber 4g 14%\nTotal Sugars 12g\nProtein 3g",
      expect: { kcal: 230, protein: 3, carb: 37, fat: 8, basis: "perServing", servingG: 55 },
    },
    {
      name: "Badly garbled photo: Energy and Fat rows unreadable, Protein/Carb fine — must NOT guess the unreadable ones",
      text: "Nutrition\nTypical values Per 100g Per 30g serving %RI*\nEw 1500kuSTekcal4T7kNIISkeR EE\n= sig = 5\nof which saturates 1.09 0.39 2%\nCarbohydrate 699g 21g 8%\nof which sugars 13g 3.99 4%\nFibre 5.89 1.79\nProtein 8.39 2.59 5%",
      expect: { kcal: null, protein: 8.3, carb: 69, fat: null },
    },
  ];
  let ok = 0;
  for (const c of cases) {
    const r = parseNutritionText(c.text, { confidence: 70 });
    const pass = Object.entries(c.expect).every(([k, v]) => r[k] === v);
    console.log(`   ${pass ? "ok  " : "FAIL"}  ${c.name}`);
    if (pass) ok++;
    else fail(`Label parse "${c.name}": got ${JSON.stringify({ kcal: r.kcal, protein: r.protein, carb: r.carb, fat: r.fat, basis: r.basis, servingG: r.servingG })}, expected ${JSON.stringify(c.expect)}`);
  }
  console.log(`   ${ok}/${cases.length} label-parsing cases correct`);

  // Numbers that add up are accepted; numbers that clearly don't are flagged rather than silently trusted.
  const goodSum = atwaterCheck({ kcal: 378, protein: 8.3, carb: 69, fat: 5.1 });
  const badSum = atwaterCheck({ kcal: 230, protein: 3, carb: 37, fat: 40 }); // fat alone would be 360 kcal
  console.log(`   consistent numbers pass the sense-check: ${goodSum.ok} | wildly inconsistent numbers are flagged: ${!badSum.ok}`);
  if (!goodSum.ok) fail("atwaterCheck rejected numbers that genuinely add up");
  if (badSum.ok) fail("atwaterCheck accepted numbers that clearly don't add up (protein+carb+fat far exceeds the stated calories)");

  const converted = toPer100({ kcal: 230, protein: 3, carb: 37, fat: 8 }, "perServing", 55);
  const okConvert = converted.kcal === 418 && converted.protein === 5.5;
  console.log(`   per-serving values convert to per-100g correctly: ${okConvert}`);
  if (!okConvert) fail(`toPer100 conversion wrong: ${JSON.stringify(converted)}`);
}

// 11. Weekly Prep generation logic, exercised against the REAL recipe database — not a toy fixture — since
// a bug here (duplicate recipes, a recovery-day meal slipping in, or a box that doesn't actually reduce the
// shopping list) is exactly the kind of thing that only shows up with real data at real scale.
section("11. Weekly Prep box generation");
{
  const rng1 = makeRng(42);
  const dinners = pickRecipes(RECIPE_DATA, "Dinner", 5, { rng: rng1 });
  const noDupes = new Set(dinners).size === dinners.length;
  const noRecoveryDay = dinners.every((n) => !RECIPE_DATA.sections.Dinner.items.find((i) => i.name === n).recoveryDay);
  console.log(`   5 picks: got ${dinners.length}, no duplicates: ${noDupes}, no recovery-day meals: ${noRecoveryDay}`);
  if (dinners.length !== 5 || !noDupes) fail(`pickRecipes gave the wrong count or a duplicate: ${JSON.stringify(dinners)}`);
  if (!noRecoveryDay) fail("pickRecipes let a Recovery Day meal into an ordinary weekly box");

  const a = pickRecipes(RECIPE_DATA, "Dinner", 5, { rng: makeRng(7) });
  const b = pickRecipes(RECIPE_DATA, "Dinner", 5, { rng: makeRng(7) });
  const c = pickRecipes(RECIPE_DATA, "Dinner", 5, { rng: makeRng(8) });
  const deterministic = JSON.stringify(a) === JSON.stringify(b);
  const actuallyRandom = JSON.stringify(a) !== JSON.stringify(c);
  console.log(`   same seed reproducible: ${deterministic} | different seed differs: ${actuallyRandom}`);
  if (!deterministic) fail("pickRecipes isn't deterministic for a given seed — 'shuffle this one' wouldn't be testable/reviewable");
  if (!actuallyRandom) fail("pickRecipes gives the same result regardless of seed — it isn't actually randomising");

  // The actual point of the feature: does batching recipes together meaningfully cut the ingredient list,
  // or is "favours shared ingredients" just a claim in the UI copy with nothing behind it?
  const box = generateWeekBox(RECIPE_DATA, { Dinner: 4, Lunch: 3 }, { rng: makeRng(99) });
  const totalMeals = box.Dinner.length + box.Lunch.length;
  const stats = uniqueIngredientCount(RECIPE_DATA, box);
  const maxPossible = totalMeals * 2; // worst case: every recipe needs two ingredients nothing else uses
  const genuinelyReduced = stats.total < maxPossible;
  console.log(`   ${totalMeals}-meal box needs ${stats.total} unique core ingredients (max possible ${maxPossible}) — meaningfully fewer: ${genuinelyReduced}`);
  if (totalMeals !== 7) fail(`generateWeekBox gave ${totalMeals} meals, expected 7 (4 dinners + 3 lunches)`);
  if (!genuinelyReduced) fail(`generateWeekBox isn't actually reducing the ingredient list — got ${stats.total} unique ingredients for ${totalMeals} meals, no better than fully independent recipes`);

  const veggieBox = generateWeekBox(RECIPE_DATA, { Dinner: 3, Lunch: 3 }, { rng: makeRng(5), veggieOnly: true });
  const allVeggie = [...veggieBox.Dinner, ...veggieBox.Lunch].every((n) =>
    (RECIPE_DATA.sections.Dinner.items.find((i) => i.name === n) || RECIPE_DATA.sections.Lunch.items.find((i) => i.name === n))?.veggie
  );
  console.log(`   veggieOnly box is entirely veggie recipes: ${allVeggie}`);
  if (!allVeggie) fail("generateWeekBox with veggieOnly:true included a non-veggie recipe");

  const r2 = rerollOne(RECIPE_DATA, "Dinner", dinners, 2, { rng: makeRng(123) });
  const onlyThatSlotChanged = r2[2] !== dinners[2] && dinners.every((n, i) => i === 2 || r2[i] === n);
  const stillNoDupes = new Set(r2).size === r2.length;
  console.log(`   reroll changes only the targeted slot: ${onlyThatSlotChanged} | still no duplicates: ${stillNoDupes}`);
  if (!onlyThatSlotChanged) fail(`rerollOne changed more than the one targeted slot: before ${JSON.stringify(dinners)}, after ${JSON.stringify(r2)}`);
  if (!stillNoDupes) fail("rerollOne introduced a duplicate recipe");

  const eligibleLunches = RECIPE_DATA.sections.Lunch.items.filter((i) => !i.recoveryDay).length;
  const tooMany = pickRecipes(RECIPE_DATA, "Lunch", 999, { rng: makeRng(1) });
  const capped = tooMany.length === eligibleLunches && new Set(tooMany).size === tooMany.length;
  console.log(`   asking for more than exist (999) is handled safely: got ${tooMany.length} of ${eligibleLunches} eligible, no duplicates: ${capped}`);
  if (!capped) fail(`pickRecipes should cap at the number of eligible recipes (${eligibleLunches}) without duplicating, got ${tooMany.length}`);
}

if (failures.length) {
  console.log(`\nTALLY TEST FAILED (${failures.length}):\n - ` + failures.slice(0, 40).join("\n - "));
  if (failures.length > 40) console.log(`   …and ${failures.length - 40} more`);
  process.exit(1);
}
console.log("\nTally test passed — the numbers add up.");
