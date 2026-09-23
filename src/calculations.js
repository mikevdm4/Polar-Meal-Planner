// Shared by App.jsx (the athlete app) and Auth.jsx (the coach dashboard's
// week planner) — kept in its own file with no dependencies on either, so
// neither side has to import from the other and risk a circular import.

export const STRUCTURES = ["Breakfast, Lunch & Dinner", "Lunch & Dinner", "Meals Only"];

export const SECTION_MEAL_TYPE = {
  Breakfast: "Breakfast", Lunch: "Lunch", Dinner: "Dinner", "Recovery Meals": "Recovery",
};

export function defaultMealPercents(structure) {
  if (structure === STRUCTURES[0]) return { Breakfast: 33, Lunch: 33, Dinner: 34 };
  if (structure === STRUCTURES[1]) return { Lunch: 50, Dinner: 50 };
  return {};
}

export function activeMealKeys(structure) {
  if (structure === STRUCTURES[0]) return ["Breakfast", "Lunch", "Dinner"];
  if (structure === STRUCTURES[1]) return ["Lunch", "Dinner"];
  return [];
}

export function computeTargets(profile) {
  const bw = Number(profile.bodyweight) || 0;
  const proteinPerKg = profile.goal === "Fat Loss" ? 2.2 : profile.goal === "Maintenance" ? 1.8 : 2.0;
  const kcalPerKg = profile.goal === "Fat Loss" ? 26 : profile.goal === "Maintenance" ? 31 : 36;
  const calories = bw * kcalPerKg + (Number(profile.adjustment) || 0);
  const protein = bw * proteinPerKg;
  const fat = (calories * 0.35) / 9;
  const carbs = (calories - protein * 4 - fat * 9) / 4;

  const snackCount = Number(profile.snackCount) || 0;
  const snackPct = Number(profile.snackPct) || 0;
  const snackPoolPct = snackCount * snackPct;
  const mealPoolPct = Math.max(0, 100 - snackPoolPct);

  const keys = activeMealKeys(profile.structure);
  const mealPercents = profile.mealPercents || defaultMealPercents(profile.structure);

  const perMealByType = {};
  keys.forEach((k) => {
    const pct = mealPercents[k] != null ? mealPercents[k] : 100 / keys.length;
    perMealByType[k] = {
      protein: (protein * pct) / 100,
      carbs: (carbs * pct) / 100,
      pct,
    };
  });

  const mealCount = keys.length || 1;
  const perMeal = { protein: protein / mealCount, carbs: carbs / mealCount };

  const snackBudget = { protein: (protein * snackPct) / 100, carbs: (carbs * snackPct) / 100, calories: (calories * snackPct) / 100 };
  const recovery = { protein: bw * 0.35, carbs: bw * 1.1 };
  return { calories, protein, fat, carbs, perMeal, perMealByType, mealPoolPct, snackPoolPct, snackBudget, recovery, mealCount };
}

export function mealTarget(sectionName, targets) {
  if (sectionName === "Recovery Meals") return targets.recovery;
  if (targets.perMealByType && targets.perMealByType[sectionName]) return targets.perMealByType[sectionName];
  if (SECTION_MEAL_TYPE[sectionName]) return targets.perMeal;
  return null;
}

export function scaledMacros(item, target) {
  const usesFixedProtein = !!item.fixedProteinGrams;
  const proteinPortion = usesFixedProtein
    ? item.fixedProteinGrams
    : target && item.proteinPer100 ? target.protein / (item.proteinPer100 / 100) : 0;
  const proteinTargetEquivalent =
    usesFixedProtein && target && item.proteinPer100 ? target.protein / (item.proteinPer100 / 100) : null;

  const usesFixedCarb = !!item.fixedCarbGrams;
  const carbPortion = usesFixedCarb
    ? item.fixedCarbGrams
    : target && item.carbPer100 ? target.carbs / (item.carbPer100 / 100) : 0;
  const carbTargetEquivalent =
    usesFixedCarb && target && item.carbPer100 ? target.carbs / (item.carbPer100 / 100) : null;

  const proteinG = (proteinPortion * item.proteinPer100) / 100;
  const carbG = (carbPortion * item.carbPer100) / 100;
  const extras = item.extras || [];
  const extrasCalories = extras.reduce((sum, e) => sum + (e.grams * e.kcalPer100) / 100, 0);
  const extrasFat = extras.reduce((sum, e) => sum + (e.grams * (e.fatPer100 || 0)) / 100, 0);
  const calories =
    (proteinPortion * item.proteinKcalPer100) / 100 +
    (carbPortion * item.carbKcalPer100) / 100 +
    extrasCalories;
  const fat =
    (proteinPortion * (item.proteinFatPer100 || 0)) / 100 +
    (carbPortion * (item.carbFatPer100 || 0)) / 100 +
    extrasFat;
  return {
    proteinPortion, carbPortion, proteinG, carbG, calories, fat,
    usesFixedProtein, proteinTargetEquivalent, usesFixedCarb, carbTargetEquivalent,
  };
}
