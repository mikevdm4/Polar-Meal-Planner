// Logic behind the "Weekly Prep" tab — a Gousto/HelloFresh-style front door onto the recipe database:
// pick how many lunches/dinners you want, either hand-pick them or let it generate a set, and get a single
// combined shopping list out the other end. Pure functions, no React, so they're unit-tested directly in
// tests/tally.mjs rather than only ever being exercised by clicking through the UI.

export const PREP_SECTIONS = { Lunch: "Lunch", Dinner: "Dinner" };

// A deterministic, seedable RNG (mulberry32) — tests need reproducible "random" output, and so does a
// person tapping "Shuffle this one" twice in a row expecting two different, re-checkable results.
export function makeRng(seed) {
  let s = seed >>> 0;
  return function rng() {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// The core ingredients a recipe actually needs buying — what decides whether two recipes share a shopping
// trip easily (same protein, same carb) or pull in totally different things.
export function recipeKeyIngredients(recipeData, section, name) {
  const item = recipeData.sections[section]?.items.find((i) => i.name === name);
  if (!item) return null;
  const sd = recipeData.sections[section];
  if (sd.type === "fixed") {
    return { protein: item.food1 || null, carb: item.food2 || null };
  }
  return { protein: item.proteinFood || null, carb: item.carbFood || null };
}

function eligibleItems(recipeData, section, { excludeNames = new Set(), veggieOnly = false } = {}) {
  return (recipeData.sections[section]?.items || []).filter(
    (it) => !it.recoveryDay && !excludeNames.has(it.name) && (!veggieOnly || it.veggie)
  );
}

// Picks `count` recipes from `section`, preferring ones that reuse a protein or carb already chosen
// elsewhere in the box — a lighter shopping list for one trip, not just a coincidence. Falls back to a
// plain random pick once the overlap-friendly options run out, rather than ever repeating a recipe.
export function pickRecipes(recipeData, section, count, { rng = Math.random, excludeNames = new Set(), veggieOnly = false, usedIngredients = { proteins: new Set(), carbs: new Set() } } = {}) {
  const pool = shuffle(eligibleItems(recipeData, section, { excludeNames, veggieOnly }), rng);
  const chosen = [];
  const takenNames = new Set(excludeNames);
  const proteins = new Set(usedIngredients.proteins);
  const carbs = new Set(usedIngredients.carbs);

  const take = (predicate) => {
    const idx = pool.findIndex((it) => !takenNames.has(it.name) && predicate(it));
    if (idx === -1) return false;
    const it = pool[idx];
    chosen.push(it.name);
    takenNames.add(it.name);
    const ing = recipeKeyIngredients(recipeData, section, it.name);
    if (ing?.protein) proteins.add(ing.protein);
    if (ing?.carb) carbs.add(ing.carb);
    return true;
  };

  for (let i = 0; i < count; i++) {
    const overlapsSomething = (it) => {
      const ing = recipeKeyIngredients(recipeData, section, it.name);
      return !!ing && ((ing.protein && proteins.has(ing.protein)) || (ing.carb && carbs.has(ing.carb)));
    };
    // Every other pick tries to reuse an ingredient already in the box; alternating (rather than always
    // preferring overlap) keeps the week from being three variations on the same chicken-and-rice dish.
    const preferOverlap = i > 0 && i % 2 === 1;
    if (preferOverlap && take(overlapsSomething)) continue;
    if (take(() => true)) continue;
    break; // the pool is genuinely exhausted
  }
  return chosen;
}

// Builds a full box: given how many lunches/dinners are wanted, returns the chosen recipe names for each,
// biased toward sharing ingredients across BOTH sections too (a dinner's leftover protein showing up at
// lunch is exactly the kind of thing that keeps a shopping list down to one trip).
export function generateWeekBox(recipeData, counts, { rng = Math.random, veggieOnly = false } = {}) {
  const result = {};
  const used = { proteins: new Set(), carbs: new Set() };
  // Dinner first: it's usually the more deliberately chosen meal, so lunches lean toward reusing what it needs.
  for (const section of ["Dinner", "Lunch"]) {
    const count = counts[section] || 0;
    if (count <= 0) { result[section] = []; continue; }
    const names = pickRecipes(recipeData, section, count, { rng, veggieOnly, usedIngredients: used });
    result[section] = names;
    names.forEach((name) => {
      const ing = recipeKeyIngredients(recipeData, section, name);
      if (ing?.protein) used.proteins.add(ing.protein);
      if (ing?.carb) used.carbs.add(ing.carb);
    });
  }
  return result;
}

// Swaps just one recipe for a different one in the same section, keeping everything else in the box as-is.
export function rerollOne(recipeData, section, currentNames, indexToReplace, { rng = Math.random, veggieOnly = false } = {}) {
  const exclude = new Set(currentNames);
  const [replacement] = pickRecipes(recipeData, section, 1, { rng, excludeNames: exclude, veggieOnly });
  if (!replacement) return currentNames; // nothing left to swap to
  const next = [...currentNames];
  next[indexToReplace] = replacement;
  return next;
}

// How many DISTINCT core ingredients (proteins + carbs) a box actually needs buying — the number that
// matters for "is this really one shopping trip", shown back to the person as a simple at-a-glance figure.
export function uniqueIngredientCount(recipeData, box) {
  const proteins = new Set(), carbs = new Set();
  for (const [section, names] of Object.entries(box)) {
    for (const name of names) {
      const ing = recipeKeyIngredients(recipeData, section, name);
      if (ing?.protein) proteins.add(ing.protein);
      if (ing?.carb) carbs.add(ing.carb);
    }
  }
  return { proteins: proteins.size, carbs: carbs.size, total: proteins.size + carbs.size };
}
