import React, { useState, useEffect, useMemo, useCallback } from "react";
import { RECIPE_DATA, FOOD_LIST } from "./data.js";
import { schedulePushUserData } from "./authSync.js";
import { isGlutenFree, isDairyFree, dietarySwaps } from "./dietaryTags.js";
import { supabase } from "./supabaseClient.js";
import { getMyProfile } from "./auth.js";
import { pullUserData } from "./authSync.js";
import { AuthScreen, CoachDashboard } from "./Auth.jsx";


const GOALS = ["Fat Loss", "Maintenance", "Muscle Gain"];
const STRUCTURES = ["Breakfast, Lunch & Dinner", "Lunch & Dinner", "Meals Only"];
const SECTION_ORDER = [
  "Breakfast", "Smoothies", "Granola", "Lunch", "Dinner",
  "Snacks", "Desserts & Sweet Treats", "Pre-Gym & Pre-Run", "Recovery Meals", "Recovery Smoothies",
];

// Precomputed once: every distinct protein/carb/veg ingredient across the whole
// plan, grouped for the "what can I make with X" dropdown filter.
const INGREDIENT_GROUPS = (() => {
  const proteins = new Set();
  const carbs = new Set();
  const vegs = new Set();
  Object.values(RECIPE_DATA.sections).forEach((sectionData) => {
    sectionData.items.forEach((item) => {
      if (sectionData.type === "fixed") {
        if (item.food1) {
          const cat = item.category1;
          (cat === "Proteins" ? proteins : cat === "Vegetables" ? vegs : carbs).add(item.food1);
        }
        if (item.food2) {
          const cat = item.category2;
          (cat === "Proteins" ? proteins : cat === "Vegetables" ? vegs : carbs).add(item.food2);
        }
      } else {
        if (item.proteinFood) proteins.add(item.proteinFood);
        if (item.carbFood) carbs.add(item.carbFood);
        if (item.vegFood) vegs.add(item.vegFood);
      }
    });
  });
  return {
    Protein: [...proteins].sort(),
    "Carb / Starch": [...carbs].sort(),
    Vegetable: [...vegs].sort(),
  };
})();

const SECTION_MEAL_TYPE = {
  Breakfast: "Breakfast", Lunch: "Lunch", Dinner: "Dinner", "Recovery Meals": "Recovery",
};

const DEFAULT_PROFILE = {
  bodyweight: 70,
  goal: "Fat Loss",
  structure: STRUCTURES[0],
  adjustment: 0,
  snackCount: 0,
  snackPct: 5,
  mealPercents: null, // null = use evidence-based default (even split) for current structure
};

function defaultMealPercents(structure) {
  if (structure === STRUCTURES[0]) return { Breakfast: 33, Lunch: 33, Dinner: 34 };
  if (structure === STRUCTURES[1]) return { Lunch: 50, Dinner: 50 };
  return {};
}

function activeMealKeys(structure) {
  if (structure === STRUCTURES[0]) return ["Breakfast", "Lunch", "Dinner"];
  if (structure === STRUCTURES[1]) return ["Lunch", "Dinner"];
  return [];
}

function computeTargets(profile) {
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

  // Legacy shared value (used only by "Meals Only" fallback and the summary card)
  const mealCount = keys.length || 1;
  const perMeal = { protein: protein / mealCount, carbs: carbs / mealCount };

  const snackBudget = { protein: (protein * snackPct) / 100, carbs: (carbs * snackPct) / 100, calories: (calories * snackPct) / 100 };
  const recovery = { protein: bw * 0.35, carbs: bw * 1.1 };
  return { calories, protein, fat, carbs, perMeal, perMealByType, mealPoolPct, snackPoolPct, snackBudget, recovery, mealCount };
}

function mealTarget(sectionName, targets) {
  if (sectionName === "Recovery Meals") return targets.recovery;
  if (targets.perMealByType && targets.perMealByType[sectionName]) return targets.perMealByType[sectionName];
  if (SECTION_MEAL_TYPE[sectionName]) return targets.perMeal; // Meals Only fallback
  return null; // fixed-portion sections don't use bodyweight targets
}

function scaledMacros(item, target) {
  const proteinPortion = target && item.proteinPer100 ? target.protein / (item.proteinPer100 / 100) : 0;
  const carbPortion = target && item.carbPer100 ? target.carbs / (item.carbPer100 / 100) : 0;
  const proteinG = (proteinPortion * item.proteinPer100) / 100;
  const carbG = (carbPortion * item.carbPer100) / 100;
  const calories =
    (proteinPortion * item.proteinKcalPer100) / 100 +
    (carbPortion * item.carbKcalPer100) / 100 +
    (item.vegFood ? (item.vegGrams * item.vegKcalPer100) / 100 : 0);
  const fat =
    (proteinPortion * (item.proteinFatPer100 || 0)) / 100 +
    (carbPortion * (item.carbFatPer100 || 0)) / 100 +
    (item.vegFood ? (item.vegGrams * (item.vegFatPer100 || 0)) / 100 : 0);
  return { proteinPortion, carbPortion, proteinG, carbG, calories, fat };
}

function fixedMacros(item) {
  const protein = (item.g1 * item.protein1) / 100 + (item.food2 ? (item.g2 * item.protein2) / 100 : 0);
  const carbs = (item.g1 * item.carb1) / 100 + (item.food2 ? (item.g2 * item.carb2) / 100 : 0);
  const calories = (item.g1 * item.kcal1) / 100 + (item.food2 ? (item.g2 * item.kcal2) / 100 : 0);
  const fat = (item.g1 * (item.fat1 || 0)) / 100 + (item.food2 ? (item.g2 * (item.fat2 || 0)) / 100 : 0);
  return { protein, carbs, calories, fat };
}

function round(n) {
  return Math.round(n || 0);
}

// ---------- storage helpers ----------
// Persisted storage — real localStorage for a standalone deployment
// (the Claude-artifact `window.storage` API isn't available outside claude.ai).
let currentSyncUserId = null;
export function setSyncUserId(id) {
  currentSyncUserId = id;
}

async function loadStored(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw !== null) return JSON.parse(raw);
  } catch (e) {}
  return fallback;
}
async function saveStored(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {}
  if (currentSyncUserId) schedulePushUserData(currentSyncUserId);
}

function ContourSVG() {
  return (
    <svg className="pe-contour" viewBox="0 0 400 120" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M0,90 Q50,60 100,85 T200,80 T300,95 T400,75" fill="none" stroke="#F5F4EE" strokeWidth="1.5" />
      <path d="M0,105 Q60,75 120,100 T240,95 T400,90" fill="none" stroke="#F5F4EE" strokeWidth="1.5" />
      <path d="M0,60 Q40,35 90,55 T190,50 T290,65 T400,45" fill="none" stroke="#F5F4EE" strokeWidth="1" />
    </svg>
  );
}

function SetupScreen({ profile, setProfile, userEmail, onSignOut }) {
  return (
    <div className="pe-fadein max-w-md mx-auto px-5 py-6">
      <h2 className="pe-display text-2xl font-semibold mb-1" style={{ color: "#14403E" }}>Your details</h2>
      <p className="text-sm mb-6" style={{ color: "#6B6355" }}>
        This scales every recipe portion to you — update it any time your weight or goal changes.
      </p>

      <label className="block text-sm font-medium mb-1.5">Bodyweight (kg)</label>
      <input
        type="number"
        className="pe-input w-full px-3 py-2.5 mb-5 text-base"
        value={profile.bodyweight}
        onChange={(e) => setProfile({ ...profile, bodyweight: e.target.value })}
        min="30" max="200"
      />

      <label className="block text-sm font-medium mb-1.5">Goal</label>
      <div className="flex gap-2 mb-5 flex-wrap">
        {GOALS.map((g) => (
          <button
            key={g}
            className={`pe-chip px-3.5 py-2 text-sm font-medium ${profile.goal === g ? "active" : ""}`}
            onClick={() => setProfile({ ...profile, goal: g })}
          >
            {g}
          </button>
        ))}
      </div>

      <label className="block text-sm font-medium mb-1.5">Meal structure</label>
      <div className="flex flex-col gap-2 mb-5">
        {STRUCTURES.map((s) => (
          <button
            key={s}
            className={`pe-chip px-3.5 py-2.5 text-sm font-medium text-left ${profile.structure === s ? "active" : ""}`}
            onClick={() => setProfile({ ...profile, structure: s, mealPercents: null })}
          >
            {s}
          </button>
        ))}
      </div>

      <label className="block text-sm font-medium mb-1.5">Calorie adjustment (±)</label>
      <input
        type="number"
        className="pe-input w-full px-3 py-2.5 mb-1 text-base"
        value={profile.adjustment}
        onChange={(e) => setProfile({ ...profile, adjustment: e.target.value })}
        placeholder="0"
      />
      <p className="text-xs mb-6" style={{ color: "#948A78" }}>
        e.g. +300 for a treat day, -200 on a rest day. Only carbs and calories shift — protein stays fixed.
      </p>

      <MealDistribution profile={profile} setProfile={setProfile} />

      <div className="pe-card p-4 mb-5">
        <div className="pe-display text-sm font-semibold mb-1" style={{ color: "#14403E" }}>Account</div>
        <p className="text-xs mb-3" style={{ color: "#948A78" }}>
          Signed in as <strong>{userEmail}</strong>. Your data syncs automatically to any device you log into
          with this account.
        </p>
        <button className="pe-btn-secondary w-full py-2 rounded-full text-xs font-semibold" onClick={onSignOut}>
          Sign out
        </button>
      </div>

      <TargetsSummary profile={profile} />
    </div>
  );
}

function MealDistribution({ profile, setProfile }) {
  const structure = profile.structure;
  const keys = activeMealKeys(structure);
  const isMealsOnly = structure === STRUCTURES[2];
  const mealPercents = profile.mealPercents || defaultMealPercents(structure);
  const isDefault = !profile.mealPercents;

  const snackCount = Number(profile.snackCount) || 0;
  const snackPct = Number(profile.snackPct) || 0;
  const snackTotal = snackCount * snackPct;
  const mealTotal = keys.reduce((sum, k) => sum + (mealPercents[k] != null ? mealPercents[k] : 100 / keys.length), 0);
  const grandTotal = mealTotal + snackTotal;
  const isBalanced = Math.abs(grandTotal - 100) < 0.5;

  const setMealPct = (key, value) => {
    const base = profile.mealPercents || defaultMealPercents(structure);
    setProfile({ ...profile, mealPercents: { ...base, [key]: Number(value) } });
  };

  const resetToDefault = () => setProfile({ ...profile, mealPercents: null, snackCount: 0, snackPct: 5 });

  const normalize = () => {
    if (grandTotal === 0) return;
    const scale = (100 - snackTotal) / mealTotal;
    const next = {};
    keys.forEach((k) => {
      const cur = mealPercents[k] != null ? mealPercents[k] : 100 / keys.length;
      next[k] = Math.round(cur * scale);
    });
    setProfile({ ...profile, mealPercents: next });
  };

  return (
    <div className="pe-card p-4 mb-5">
      <div className="flex items-center justify-between mb-1">
        <div className="pe-display text-sm font-semibold" style={{ color: "#14403E" }}>Meal distribution</div>
        {!isDefault && (
          <button className="text-xs font-medium" style={{ color: "#B5652F" }} onClick={resetToDefault}>
            Reset to default
          </button>
        )}
      </div>
      <p className="text-xs mb-3" style={{ color: "#948A78" }}>
        By default your daily protein and carbs split evenly across meals — research doesn't strongly favour one
        distribution over another for body composition, so this is a sensible neutral starting point. Adjust it
        below if you prefer, say, a smaller breakfast and bigger dinner, or want calories set aside for snacks.
      </p>

      {isMealsOnly ? (
        <p className="text-xs italic" style={{ color: "#948A78" }}>
          "Meals Only" shows a single daily total rather than per-meal splits, so distribution doesn't apply here.
        </p>
      ) : (
        <>
          {keys.map((k) => {
            const pct = mealPercents[k] != null ? mealPercents[k] : 100 / keys.length;
            return (
              <div key={k} className="mb-3">
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-xs font-medium">{k}</span>
                  <span className="pe-mono text-xs font-semibold" style={{ color: "#14403E" }}>{Math.round(pct)}%</span>
                </div>
                <input
                  type="range"
                  min="5" max="80" step="1"
                  value={pct}
                  onChange={(e) => setMealPct(k, e.target.value)}
                  className="w-full"
                  style={{ accentColor: "#14403E" }}
                />
              </div>
            );
          })}

          <div className="pe-divider pt-3 mb-3">
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-xs font-medium">Snacks per day</span>
              <span className="pe-mono text-xs font-semibold" style={{ color: "#14403E" }}>{snackCount}</span>
            </div>
            <div className="flex gap-2">
              {[0, 1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  className={`pe-chip flex-1 py-1.5 text-xs font-medium ${snackCount === n ? "active" : ""}`}
                  onClick={() => setProfile({ ...profile, snackCount: n })}
                >
                  {n}
                </button>
              ))}
            </div>
            {snackCount > 0 && (
              <p className="text-[11px] mt-1.5" style={{ color: "#948A78" }}>
                {snackPct}% of daily calories set aside per snack ({snackTotal}% total) — reduce your meal
                percentages below to make room.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between text-xs pt-1">
            <span style={{ color: isBalanced ? "#4F6B41" : "#B5652F" }} className="font-semibold">
              Total: {Math.round(grandTotal)}%{!isBalanced && " (should be 100%)"}
            </span>
            {!isBalanced && (
              <button className="pe-chip px-3 py-1 text-xs font-medium" onClick={normalize}>
                Auto-balance
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function TargetsSummary({ profile }) {
  const t = useMemo(() => computeTargets(profile), [profile]);
  const keys = activeMealKeys(profile.structure);
  return (
    <div className="pe-card p-4">
      <div className="pe-display text-sm font-semibold mb-3" style={{ color: "#14403E" }}>Daily targets</div>
      <div className="grid grid-cols-4 gap-2 text-center mb-3">
        {[
          ["Calories", round(t.calories), ""],
          ["Protein", round(t.protein), "g"],
          ["Carbs", round(t.carbs), "g"],
          ["Fat", round(t.fat), "g"],
        ].map(([label, val, unit]) => (
          <div key={label}>
            <div className="pe-mono text-lg font-semibold" style={{ color: "#14403E" }}>{val}{unit}</div>
            <div className="text-[11px]" style={{ color: "#948A78" }}>{label}</div>
          </div>
        ))}
      </div>
      {keys.length > 0 ? (
        <div className="pe-divider pt-3 space-y-1">
          {keys.map((k) => (
            <div key={k} className="flex justify-between text-xs" style={{ color: "#6B6355" }}>
              <span>{k} ({Math.round(t.perMealByType[k].pct)}%)</span>
              <span className="pe-mono">
                <strong>{round(t.perMealByType[k].protein)}g</strong> protein, <strong>{round(t.perMealByType[k].carbs)}g</strong> carbs
              </span>
            </div>
          ))}
          {Number(profile.snackCount) > 0 && (
            <div className="flex justify-between text-xs" style={{ color: "#6B6355" }}>
              <span>Snacks × {profile.snackCount} ({t.snackPoolPct}%)</span>
              <span className="pe-mono">~{round(t.snackBudget.calories)} kcal each</span>
            </div>
          )}
        </div>
      ) : (
        <div className="pe-divider pt-3 text-xs" style={{ color: "#6B6355" }}>
          Single daily total — no per-meal split with "Meals Only".
        </div>
      )}
    </div>
  );
}

const WORKOUT_LOG_SECTIONS = new Set(["Recovery Meals", "Recovery Smoothies", "Pre-Gym & Pre-Run"]);

function dateStr(d) {
  return d.toISOString().slice(0, 10);
}

function splitDayCalories(entries) {
  let daily = 0;
  let workout = 0;
  (entries || []).forEach((entry) => {
    const m = entryMacros(entry);
    const isWorkout = entry.type === "recipe" && WORKOUT_LOG_SECTIONS.has(entry.section);
    if (isWorkout) workout += m.calories;
    else daily += m.calories;
  });
  return { daily, workout };
}

function TrendsChart({ logsByDate, targets }) {
  const [range, setRange] = useState("week"); // week | month
  const days = range === "week" ? 7 : 30;

  const data = useMemo(() => {
    const today = new Date();
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = dateStr(d);
      const { daily, workout } = splitDayCalories(logsByDate[key]);
      out.push({ date: d, daily, workout, total: daily + workout });
    }
    return out;
  }, [logsByDate, days]);

  const baseline = targets.calories;
  const maxVal = Math.max(baseline * 1.3, ...data.map((d) => d.total), 1);

  const chartWidth = 320;
  const chartHeight = 140;
  const barGap = 2;
  const barWidth = Math.max(1.5, chartWidth / days - barGap);
  const scaleY = (val) => (val / maxVal) * chartHeight;
  const baselineY = chartHeight - scaleY(baseline);

  return (
    <div className="pe-card p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="pe-display text-sm font-semibold" style={{ color: "#14403E" }}>Trends</div>
        <div className="flex gap-1.5">
          {["week", "month"].map((r) => (
            <button
              key={r}
              className={`pe-chip px-3 py-1 text-xs font-medium ${range === r ? "active" : ""}`}
              onClick={() => setRange(r)}
            >
              {r === "week" ? "Week" : "Month"}
            </button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${chartWidth} ${chartHeight + 10}`} className="w-full" style={{ maxHeight: 160 }}>
        <line
          x1="0" y1={baselineY} x2={chartWidth} y2={baselineY}
          stroke="#B5652F" strokeWidth="1" strokeDasharray="4,3"
        />
        {data.map((d, i) => {
          const x = i * (barWidth + barGap);
          const dailyH = scaleY(d.daily);
          const workoutH = scaleY(d.workout);
          return (
            <g key={i}>
              <rect x={x} y={chartHeight - dailyH} width={barWidth} height={dailyH} fill="#14403E" rx="1" />
              <rect x={x} y={chartHeight - dailyH - workoutH} width={barWidth} height={workoutH} fill="#B5652F" rx="1" />
            </g>
          );
        })}
      </svg>

      <div className="flex items-center gap-4 mt-2 text-[11px]" style={{ color: "#6B6355" }}>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "#14403E" }} /> Daily meals
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "#B5652F" }} /> Workout nutrition
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 border-t border-dashed" style={{ borderColor: "#B5652F" }} /> Target ({round(baseline)} kcal)
        </span>
      </div>
      <p className="text-[11px] mt-2" style={{ color: "#948A78" }}>
        The target line is your main daily-eating baseline — pre-gym snacks and recovery meals/smoothies stack
        on top of it separately, since training days are expected to need more.
      </p>
    </div>
  );
}

function ProgressBar({ label, consumed, target, unit }) {
  const pct = target > 0 ? Math.min(100, (consumed / target) * 100) : 0;
  const over = consumed > target;
  return (
    <div className="mb-3">
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-xs font-medium" style={{ color: "#40473F" }}>{label}</span>
        <span className="pe-mono text-xs" style={{ color: over ? "#B5652F" : "#6B6355" }}>
          {round(consumed)} / {round(target)}{unit}
          {over && <span className="font-semibold"> · over by {round(consumed - target)}{unit}</span>}
        </span>
      </div>
      <div className="w-full rounded-full h-2" style={{ background: "#E9E5D8" }}>
        <div
          className="h-2 rounded-full"
          style={{ width: `${pct}%`, background: over ? "#B5652F" : "#14403E", transition: "width 0.2s ease" }}
        />
      </div>
    </div>
  );
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function entryMacros(entry) {
  if (entry.type === "food") {
    const factor = entry.grams / 100;
    return {
      calories: entry.food.kcal * factor,
      protein: entry.food.protein * factor,
      carbs: entry.food.carb * factor,
      fat: entry.food.fat * factor,
    };
  }
  if (entry.type === "manual") {
    return {
      calories: entry.calories || 0,
      protein: entry.protein || 0,
      carbs: entry.carbs || 0,
      fat: entry.fat || 0,
    };
  }
  const servings = entry.servings || 1;
  return {
    calories: entry.baseCalories * servings,
    protein: entry.baseProtein * servings,
    carbs: entry.baseCarbs * servings,
    fat: entry.baseFat * servings,
  };
}

function AddMealLog({ profile, onAdd, sections, onViewRecipe }) {
  const sectionList = sections || SECTION_ORDER;
  const [section, setSection] = useState(sectionList[0]);
  const [query, setQuery] = useState("");
  const [pendingItem, setPendingItem] = useState(null);
  const [servings, setServings] = useState(1);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [customProteinFood, setCustomProteinFood] = useState(null);
  const [customProteinGrams, setCustomProteinGrams] = useState(0);
  const targets = useMemo(() => computeTargets(profile), [profile]);

  const sectionData = RECIPE_DATA.sections[section];
  const isFixed = sectionData.type === "fixed";

  const matches = useMemo(() => {
    const list = sectionData.items;
    if (!query) return list.slice(0, 8);
    const q = query.toLowerCase();
    return list.filter((it) => it.name.toLowerCase().includes(q)).slice(0, 8);
  }, [sectionData, query]);

  const baseMacros = useMemo(() => {
    if (!pendingItem) return null;
    if (isFixed) return fixedMacros(pendingItem);
    const target = mealTarget(section, targets);
    return scaledMacros(pendingItem, target);
  }, [pendingItem, isFixed, section, targets]);

  const baseProtein = baseMacros ? (isFixed ? baseMacros.protein : baseMacros.proteinG) : 0;
  const baseCarbs = baseMacros ? (isFixed ? baseMacros.carbs : baseMacros.carbG) : 0;

  // Protein-swap adjustment: subtract the recipe's original protein-source
  // contribution and add whatever the client actually used instead.
  const proteinOptions = useMemo(
    () => FOOD_LIST.filter((f) => f.category === "Proteins").sort((a, b) => a.name.localeCompare(b.name)),
    []
  );

  const openCustomize = () => {
    if (!pendingItem) return;
    setCustomProteinFood(pendingItem.proteinFood);
    setCustomProteinGrams(Math.round(baseMacros.proteinPortion));
    setCustomizeOpen(true);
  };

  const finalMacros = useMemo(() => {
    if (!pendingItem || !baseMacros) return null;
    if (isFixed || !customizeOpen || !customProteinFood) {
      return { calories: baseMacros.calories, protein: baseProtein, carbs: baseCarbs, fat: baseMacros.fat };
    }
    const originalProteinCal = (baseMacros.proteinPortion * pendingItem.proteinKcalPer100) / 100;
    const originalProteinFat = (baseMacros.proteinPortion * (pendingItem.proteinFatPer100 || 0)) / 100;
    const swapFood = FOOD_LIST.find((f) => f.name === customProteinFood);
    if (!swapFood) return { calories: baseMacros.calories, protein: baseProtein, carbs: baseCarbs, fat: baseMacros.fat };
    const grams = Number(customProteinGrams) || 0;
    const newProteinCal = (grams * swapFood.kcal) / 100;
    const newProteinFat = (grams * swapFood.fat) / 100;
    const newProteinG = (grams * swapFood.protein) / 100;
    return {
      calories: baseMacros.calories - originalProteinCal + newProteinCal,
      protein: newProteinG,
      carbs: baseCarbs,
      fat: baseMacros.fat - originalProteinFat + newProteinFat,
    };
  }, [pendingItem, baseMacros, isFixed, customizeOpen, customProteinFood, customProteinGrams, baseProtein, baseCarbs]);

  const SERVING_OPTIONS = [0.5, 1, 1.5, 2];

  const adjustServings = (delta) => {
    setServings((s) => Math.max(0.25, Math.round((s + delta) * 4) / 4));
  };

  const resetPending = () => {
    setPendingItem(null);
    setQuery("");
    setServings(1);
    setCustomizeOpen(false);
    setCustomProteinFood(null);
  };

  const add = () => {
    if (!pendingItem || !finalMacros) return;
    onAdd({
      id: Date.now(),
      type: "recipe",
      name: pendingItem.name,
      section,
      servings,
      baseCalories: finalMacros.calories,
      baseProtein: finalMacros.protein,
      baseCarbs: finalMacros.carbs,
      baseFat: finalMacros.fat,
      proteinOverride:
        customizeOpen && customProteinFood && customProteinFood !== pendingItem.proteinFood
          ? { food: customProteinFood, grams: Number(customProteinGrams) }
          : undefined,
    });
    resetPending();
  };

  return (
    <div className="pe-card p-4 mb-4">
      <div className="pe-display text-sm font-semibold mb-3" style={{ color: "#14403E" }}>Add a meal</div>
      <div className="flex gap-2 overflow-x-auto pe-scroll mb-3 -mx-1 px-1">
        {sectionList.map((s) => (
          <button
            key={s}
            className={`pe-chip whitespace-nowrap px-3 py-1.5 text-xs font-medium ${section === s ? "active" : ""}`}
            onClick={() => { setSection(s); resetPending(); }}
          >
            {s}
          </button>
        ))}
      </div>

      <input
        className="pe-input w-full px-3 py-2.5 mb-2 text-sm"
        placeholder={`Search ${section.toLowerCase()}...`}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setPendingItem(null); }}
      />

      {!pendingItem && matches.length > 0 && (
        <div className="mb-2 rounded-lg overflow-hidden pe-scroll" style={{ border: "1px solid #E4E1D6", maxHeight: 220, overflowY: "auto" }}>
          {matches.map((it) => (
            <button
              key={it.name}
              className="w-full text-left px-3 py-2 text-sm block"
              style={{ background: "#FFFFFF", borderBottom: "1px solid #F0ECE0" }}
              onClick={() => setPendingItem(it)}
            >
              {it.name}
            </button>
          ))}
        </div>
      )}
      {!pendingItem && query && matches.length === 0 && (
        <p className="text-xs mb-2" style={{ color: "#948A78" }}>No matches in {section}.</p>
      )}

      {pendingItem && baseMacros && finalMacros && (
        <div className="pe-fadein rounded-lg p-3 mb-2" style={{ background: "#F5F4EE" }}>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">{pendingItem.name}</div>
            {onViewRecipe && (
              <button
                className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold"
                style={{ color: "#14403E", background: "#E4E1D6" }}
                title="View full recipe"
                onClick={() => onViewRecipe(section, pendingItem.name)}
              >
                ⋯
              </button>
            )}
          </div>

          <div className="text-xs font-medium mb-1.5" style={{ color: "#40473F" }}>Servings</div>
          <div className="flex items-center gap-2 mb-3">
            {SERVING_OPTIONS.map((opt) => (
              <button
                key={opt}
                className={`pe-chip px-3 py-1.5 text-xs font-medium ${servings === opt ? "active" : ""}`}
                onClick={() => setServings(opt)}
              >
                {opt === 0.5 ? "½" : opt === 1.5 ? "1½" : `${opt}×`}
              </button>
            ))}
            <div className="flex items-center gap-1.5 ml-auto">
              <button className="pe-btn-secondary w-6 h-6 rounded-full text-xs font-bold" onClick={() => adjustServings(-0.25)}>−</button>
              <span className="pe-mono text-xs font-semibold w-8 text-center">{servings}×</span>
              <button className="pe-btn-primary w-6 h-6 rounded-full text-xs font-bold" onClick={() => adjustServings(0.25)}>+</button>
            </div>
          </div>

          {!isFixed && (
            <>
              {!customizeOpen ? (
                <button className="text-xs font-medium mb-3" style={{ color: "#14403E" }} onClick={openCustomize}>
                  Didn't use {pendingItem.proteinFood.toLowerCase()}? Swap the protein →
                </button>
              ) : (
                <div className="pe-fadein rounded-lg p-2.5 mb-3" style={{ background: "#FFFFFF", border: "1px solid #E4E1D6" }}>
                  <div className="text-xs font-medium mb-1.5" style={{ color: "#40473F" }}>
                    Actual protein used (replaces {pendingItem.proteinFood})
                  </div>
                  <select
                    className="pe-input w-full px-2 py-2 text-sm mb-2"
                    value={customProteinFood || ""}
                    onChange={(e) => setCustomProteinFood(e.target.value)}
                  >
                    {proteinOptions.map((f) => (
                      <option key={f.name} value={f.name}>{f.name}</option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      className="pe-input flex-1 px-2 py-2 text-sm"
                      value={customProteinGrams}
                      onChange={(e) => setCustomProteinGrams(e.target.value)}
                    />
                    <span className="text-xs" style={{ color: "#948A78" }}>g</span>
                    <button
                      className="text-xs font-medium"
                      style={{ color: "#B5652F" }}
                      onClick={() => setCustomizeOpen(false)}
                    >
                      Undo
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          <div className="pe-mono text-xs mb-3" style={{ color: "#6B6355" }}>
            {round(finalMacros.calories * servings)} kcal · P{round(finalMacros.protein * servings)} · C{round(finalMacros.carbs * servings)} · F{round(finalMacros.fat * servings)}
            <span style={{ color: "#948A78" }}> (at {servings}× serving)</span>
          </div>
          <div className="flex gap-2">
            <button className="pe-btn-secondary flex-1 py-2 rounded-full text-xs font-semibold" onClick={resetPending}>
              Cancel
            </button>
            <button className="pe-btn-primary flex-1 py-2 rounded-full text-xs font-semibold" onClick={add}>
              Add to log
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function GymScreen({ profile, onAddToTodayLog, onViewRecipe }) {
  const [mode, setMode] = useState("pre");
  const sections = mode === "pre" ? ["Pre-Gym & Pre-Run"] : ["Recovery Meals", "Recovery Smoothies"];

  return (
    <div className="pe-fadein px-4 pb-28 max-w-lg mx-auto pt-4">
      <h2 className="pe-display text-xl font-semibold mb-1" style={{ color: "#14403E" }}>Gym</h2>
      <p className="text-xs mb-4" style={{ color: "#948A78" }}>
        Heading out to train, or just finished? Pick an option below and it'll drop straight into today's log.
      </p>

      <div className="flex gap-2 mb-4">
        <button
          className={`pe-chip flex-1 py-2.5 text-sm font-semibold ${mode === "pre" ? "active" : ""}`}
          onClick={() => setMode("pre")}
        >
          Before training
        </button>
        <button
          className={`pe-chip flex-1 py-2.5 text-sm font-semibold ${mode === "post" ? "active" : ""}`}
          onClick={() => setMode("post")}
        >
          After training
        </button>
      </div>

      {mode === "pre" ? (
        <p className="text-xs mb-3" style={{ color: "#948A78" }}>
          Quick, easy-digesting carbs — deliberately lower in fat and fibre than a normal snack so it doesn't sit
          heavy before a session.
        </p>
      ) : (
        <p className="text-xs mb-3" style={{ color: "#948A78" }}>
          Recovery meals scale to a dedicated post-workout target (≈0.35g/kg protein, 1.1g/kg carbs) independent
          of your regular meal split, since refuelling needs are driven by training load, not daily goals.
        </p>
      )}

      <AddMealLog key={mode} profile={profile} onAdd={onAddToTodayLog} sections={sections} onViewRecipe={onViewRecipe} />
    </div>
  );
}

function DailyLogScreen({ profile, logsByDate, updateDayLog, clearDayLog, onViewRecipe }) {
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [query, setQuery] = useState("");
  const [pendingFood, setPendingFood] = useState(null);
  const [pendingGrams, setPendingGrams] = useState(100);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualCal, setManualCal] = useState("");
  const [manualProtein, setManualProtein] = useState("");
  const [manualCarbs, setManualCarbs] = useState("");
  const [manualFat, setManualFat] = useState("");
  const targets = useMemo(() => computeTargets(profile), [profile]);

  const dayLog = logsByDate[selectedDate] || [];
  const daysWithEntries = Object.keys(logsByDate).filter((d) => logsByDate[d]?.length > 0).sort().reverse();

  const matches = useMemo(() => {
    if (!query) return [];
    const q = query.toLowerCase();
    return FOOD_LIST.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query]);

  const totals = useMemo(() => {
    return dayLog.reduce(
      (acc, entry) => {
        const m = entryMacros(entry);
        acc.calories += m.calories;
        acc.protein += m.protein;
        acc.carbs += m.carbs;
        acc.fat += m.fat;
        return acc;
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
  }, [dayLog]);

  const addFood = () => {
    if (!pendingFood || !pendingGrams) return;
    updateDayLog(selectedDate, [
      ...dayLog,
      { id: Date.now(), type: "food", food: pendingFood, grams: Number(pendingGrams) },
    ]);
    setPendingFood(null);
    setQuery("");
    setPendingGrams(100);
  };

  const addMealEntry = (entry) => updateDayLog(selectedDate, [...dayLog, entry]);
  const removeEntry = (id) => updateDayLog(selectedDate, dayLog.filter((e) => e.id !== id));
  const setEntryServings = (id, servings) =>
    updateDayLog(selectedDate, dayLog.map((e) => (e.id === id ? { ...e, servings: Math.max(0.25, servings) } : e)));

  const addManualEntry = () => {
    if (!manualName || !manualCal) return;
    updateDayLog(selectedDate, [
      ...dayLog,
      {
        id: Date.now(),
        type: "manual",
        name: manualName,
        calories: Number(manualCal) || 0,
        protein: Number(manualProtein) || 0,
        carbs: Number(manualCarbs) || 0,
        fat: Number(manualFat) || 0,
      },
    ]);
    setManualName(""); setManualCal(""); setManualProtein(""); setManualCarbs(""); setManualFat("");
    setManualOpen(false);
  };

  return (
    <div className="pe-fadein px-4 pb-28 max-w-lg mx-auto pt-4">
      <h2 className="pe-display text-xl font-semibold mb-1" style={{ color: "#14403E" }}>Daily log</h2>
      <p className="text-xs mb-4" style={{ color: "#948A78" }}>
        Log meals or individual foods and see them stack up against your daily target. Each day is saved separately.
      </p>

      <div className="flex items-center gap-2 mb-4">
        <input
          type="date"
          className="pe-input flex-1 px-3 py-2 text-sm"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
        />
        {selectedDate !== todayStr() && (
          <button className="pe-chip px-3 py-2 text-xs font-medium" onClick={() => setSelectedDate(todayStr())}>
            Today
          </button>
        )}
      </div>

      {daysWithEntries.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pe-scroll mb-4 -mx-1 px-1">
          {daysWithEntries.map((d) => (
            <button
              key={d}
              className={`pe-chip whitespace-nowrap px-3 py-1.5 text-xs font-medium ${selectedDate === d ? "active" : ""}`}
              onClick={() => setSelectedDate(d)}
            >
              {d === todayStr() ? "Today" : d}
            </button>
          ))}
        </div>
      )}

      <TrendsChart logsByDate={logsByDate} targets={targets} />

      <div className="pe-card p-4 mb-4">
        <ProgressBar label="Calories" consumed={totals.calories} target={targets.calories} unit="" />
        <ProgressBar label="Protein" consumed={totals.protein} target={targets.protein} unit="g" />
        <ProgressBar label="Carbs" consumed={totals.carbs} target={targets.carbs} unit="g" />
        <ProgressBar label="Fat" consumed={totals.fat} target={targets.fat} unit="g" />
      </div>

      <AddMealLog profile={profile} onAdd={addMealEntry} onViewRecipe={onViewRecipe} />

      <div className="pe-card p-4 mb-4">
        <div className="pe-display text-sm font-semibold mb-3" style={{ color: "#14403E" }}>Add a food</div>
        <input
          className="pe-input w-full px-3 py-2.5 mb-2 text-sm"
          placeholder="Search foods (e.g. chicken breast, oats...)"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPendingFood(null); }}
        />
        {query && !pendingFood && matches.length > 0 && (
          <div className="mb-2 rounded-lg overflow-hidden" style={{ border: "1px solid #E4E1D6" }}>
            {matches.map((f) => (
              <button
                key={f.name}
                className="w-full text-left px-3 py-2 text-sm block"
                style={{ background: "#FFFFFF", borderBottom: "1px solid #F0ECE0" }}
                onClick={() => { setPendingFood(f); setQuery(f.name); }}
              >
                {f.name}
                <span className="pe-mono text-[11px] ml-2" style={{ color: "#948A78" }}>
                  {round(f.kcal)}kcal/100g
                </span>
              </button>
            ))}
          </div>
        )}
        {query && !pendingFood && matches.length === 0 && (
          <p className="text-xs mb-2" style={{ color: "#948A78" }}>No matching foods.</p>
        )}

        {pendingFood && (
          <div className="pe-fadein flex items-center gap-2 mb-2">
            <input
              type="number"
              className="pe-input flex-1 px-3 py-2 text-sm"
              value={pendingGrams}
              onChange={(e) => setPendingGrams(e.target.value)}
              placeholder="grams"
            />
            <span className="text-xs" style={{ color: "#948A78" }}>g</span>
            <button className="pe-btn-primary px-4 py-2 rounded-full text-xs font-semibold" onClick={addFood}>
              Add
            </button>
          </div>
        )}
      </div>

      <div className="pe-card p-4 mb-4">
        <button
          className="flex items-center justify-between w-full"
          onClick={() => setManualOpen((o) => !o)}
        >
          <div className="pe-display text-sm font-semibold" style={{ color: "#14403E" }}>
            Log manually (takeaway, meal replacement, etc.)
          </div>
          <span className="text-xs" style={{ color: "#948A78" }}>{manualOpen ? "Hide ▲" : "Show ▼"}</span>
        </button>
        {manualOpen && (
          <div className="pe-fadein mt-3">
            <p className="text-xs mb-3" style={{ color: "#948A78" }}>
              For anything not in the food database — a takeaway, a shop-bought meal replacement, whatever a
              nutrition-label lookup (e.g. MyFitnessPal) gives you. Enter the numbers for the whole meal as eaten.
            </p>
            <input
              className="pe-input w-full px-3 py-2 text-sm mb-2"
              placeholder="What was it? (e.g. Chicken tikka takeaway)"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
            />
            <div className="grid grid-cols-4 gap-2 mb-3">
              <div>
                <label className="block text-[10px] font-medium mb-1" style={{ color: "#948A78" }}>Kcal</label>
                <input type="number" className="pe-input w-full px-2 py-2 text-sm" value={manualCal} onChange={(e) => setManualCal(e.target.value)} />
              </div>
              <div>
                <label className="block text-[10px] font-medium mb-1" style={{ color: "#948A78" }}>Protein</label>
                <input type="number" className="pe-input w-full px-2 py-2 text-sm" value={manualProtein} onChange={(e) => setManualProtein(e.target.value)} />
              </div>
              <div>
                <label className="block text-[10px] font-medium mb-1" style={{ color: "#948A78" }}>Carbs</label>
                <input type="number" className="pe-input w-full px-2 py-2 text-sm" value={manualCarbs} onChange={(e) => setManualCarbs(e.target.value)} />
              </div>
              <div>
                <label className="block text-[10px] font-medium mb-1" style={{ color: "#948A78" }}>Fat</label>
                <input type="number" className="pe-input w-full px-2 py-2 text-sm" value={manualFat} onChange={(e) => setManualFat(e.target.value)} />
              </div>
            </div>
            <button
              className="pe-btn-primary w-full py-2.5 rounded-full text-xs font-semibold"
              onClick={addManualEntry}
              disabled={!manualName || !manualCal}
              style={!manualName || !manualCal ? { opacity: 0.5 } : {}}
            >
              Add to log
            </button>
          </div>
        )}
      </div>

      {dayLog.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="pe-display text-sm font-semibold" style={{ color: "#14403E" }}>
              {selectedDate === todayStr() ? "Today's" : selectedDate} log
            </div>
            <button className="text-xs font-medium" style={{ color: "#B5652F" }} onClick={() => clearDayLog(selectedDate)}>
              Clear day
            </button>
          </div>
          <div className="pe-card divide-y" style={{ borderColor: "#E4E1D6" }}>
            {dayLog.map((entry) => {
              const m = entryMacros(entry);
              return (
                <div key={entry.id} className="flex items-center justify-between px-4 py-3" style={{ borderColor: "#EFEBE0" }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {entry.type === "recipe" && (
                        <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: "#E4EEDD", color: "#4F6B41" }}>
                          {entry.section}
                        </span>
                      )}
                      {entry.type === "recipe" ? (
                        <button
                          className="text-sm font-medium truncate text-left underline decoration-dotted"
                          onClick={() => onViewRecipe && onViewRecipe(entry.section, entry.name)}
                        >
                          {entry.name}
                        </button>
                      ) : entry.type === "manual" ? (
                        <div className="text-sm font-medium truncate">{entry.name}</div>
                      ) : (
                        <div className="text-sm font-medium truncate">{entry.food.name}</div>
                      )}
                    </div>
                    <div className="pe-mono text-xs" style={{ color: "#948A78" }}>
                      {entry.type === "food" && `${entry.grams}g · `}
                      {entry.type === "manual" && "manual entry · "}
                      {round(m.calories)} kcal · P{round(m.protein)} C{round(m.carbs)} F{round(m.fat)}
                    </div>
                    {entry.proteinOverride && (
                      <div className="text-[11px] italic mt-0.5" style={{ color: "#B5652F" }}>
                        Swapped: {entry.proteinOverride.grams}g {entry.proteinOverride.food}
                      </div>
                    )}
                    {entry.type === "recipe" && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <button
                          className="pe-btn-secondary w-5 h-5 rounded-full text-[10px] font-bold"
                          onClick={() => setEntryServings(entry.id, (entry.servings || 1) - 0.25)}
                        >
                          −
                        </button>
                        <span className="pe-mono text-[11px] font-semibold w-9 text-center" style={{ color: "#40473F" }}>
                          {entry.servings || 1}× serving
                        </span>
                        <button
                          className="pe-btn-primary w-5 h-5 rounded-full text-[10px] font-bold"
                          onClick={() => setEntryServings(entry.id, (entry.servings || 1) + 0.25)}
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    className="text-lg font-bold px-2 shrink-0"
                    style={{ color: "#948A78" }}
                    onClick={() => removeEntry(entry.id)}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {dayLog.length === 0 && (
        <p className="text-sm text-center py-8" style={{ color: "#948A78" }}>Nothing logged for this day yet.</p>
      )}
    </div>
  );
}


function RecipeCard({ item, isFixed, macros, veggie, cartQty, onAdd, onRemove, onBulkAdd, expanded, onToggleExpand, sectionBadge }) {
  return (
    <div className="pe-card p-4 mb-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 cursor-pointer" onClick={onToggleExpand}>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {sectionBadge && (
              <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: "#E4E1D6", color: "#6B6355" }}>
                {sectionBadge}
              </span>
            )}
            <span className="pe-display text-[15px] font-semibold leading-tight" style={{ color: "#26312F" }}>
              {item.name}
            </span>
            {veggie && <span className="pe-badge-veggie text-[10px] font-semibold px-2 py-0.5 rounded-full">VEGGIE</span>}
          </div>
          {item.time && <span className="pe-badge-time text-[11px] px-2 py-0.5 rounded-full">{item.time}</span>}
        </div>
        <div className="text-right shrink-0">
          <div className="pe-mono text-base font-semibold" style={{ color: "#14403E" }}>{round(macros.calories)}</div>
          <div className="text-[10px]" style={{ color: "#948A78" }}>kcal</div>
        </div>
      </div>

      <div className="flex gap-4 mt-2 text-xs pe-mono" style={{ color: "#6B6355" }}>
        <span>P {round(isFixed ? macros.protein : macros.proteinG)}g</span>
        <span>C {round(isFixed ? macros.carbs : macros.carbG)}g</span>
        <span>F {round(macros.fat)}g</span>
      </div>

      {expanded && (
        <div className="pe-fadein pe-divider mt-3 pt-3 text-sm" style={{ color: "#40473F" }}>
          <div className="font-semibold text-xs uppercase tracking-wide mb-1.5" style={{ color: "#14403E" }}>
            Pantry check
          </div>
          <ul className="list-disc list-inside mb-3 space-y-0.5 text-[13px]">
            {isFixed ? (
              <>
                <li>{item.food1} — {round(item.g1)}g</li>
                {item.food2 && <li>{item.food2} — {round(item.g2)}g</li>}
              </>
            ) : (
              <>
                <li>{item.proteinFood} — {round(macros.proteinPortion)}g</li>
                <li>{item.carbFood} — {round(macros.carbPortion)}g</li>
                {item.vegFood && <li>{item.vegText}</li>}
              </>
            )}
            <li className="text-[12px]" style={{ color: "#948A78" }}>Plus: oil, salt, spices (see Store Cupboard)</li>
          </ul>
          {dietarySwaps(item, isFixed).length > 0 && (
            <>
              <div className="font-semibold text-xs uppercase tracking-wide mb-1.5" style={{ color: "#14403E" }}>Dietary swaps</div>
              <ul className="list-disc list-inside mb-3 space-y-0.5 text-[13px]">
                {dietarySwaps(item, isFixed).map((s, i) => (
                  <li key={i}>{s.type}: use {s.to} instead of {s.from}</li>
                ))}
              </ul>
              <p className="text-[11px] mb-3" style={{ color: "#948A78" }}>
                Best-effort suggestion based on this recipe's main ingredients — always check the full method for a diagnosed allergy or coeliac disease.
              </p>
            </>
          )}
          {(item.method || item.prep) && (
            <>
              <div className="font-semibold text-xs uppercase tracking-wide mb-1.5" style={{ color: "#14403E" }}>Method</div>
              <p className="whitespace-pre-line text-[13px] mb-3">{item.method || item.prep}</p>
            </>
          )}
          {item.note && (
            <>
              <div className="font-semibold text-xs uppercase tracking-wide mb-1.5" style={{ color: "#14403E" }}>Dietitian's note</div>
              <p className="text-[13px] italic" style={{ color: "#6B6355" }}>{item.note}</p>
            </>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mt-3 pe-divider pt-3">
        <button className="text-xs font-medium" style={{ color: "#14403E" }} onClick={onToggleExpand}>
          {expanded ? "Show less" : "Recipe & method"}
        </button>
        {cartQty > 0 ? (
          <div className="flex items-center gap-2">
            <button className="pe-btn-secondary w-7 h-7 rounded-full text-sm font-bold" onClick={onRemove}>−</button>
            <span className="pe-mono text-sm font-semibold w-5 text-center">{cartQty}</span>
            <button className="pe-btn-primary w-7 h-7 rounded-full text-sm font-bold" onClick={onAdd}>+</button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <button className="pe-btn-primary text-xs font-semibold px-3.5 py-1.5 rounded-full" onClick={onAdd}>
              Add to order
            </button>
            {onBulkAdd && (
              <button
                className="pe-btn-secondary text-xs font-semibold px-2.5 py-1.5 rounded-full"
                title="Add 4 — handy for batch-cooking a few days at once"
                onClick={onBulkAdd}
              >
                ×4
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const ALL_KEY = "All";
const BROWSE_TABS = [...SECTION_ORDER, ALL_KEY];

function BrowseScreen({ profile, cart, updateCart, jumpTarget, onJumpHandled }) {
  const [section, setSection] = useState(jumpTarget ? jumpTarget.section : "Breakfast");
  const [search, setSearch] = useState(jumpTarget ? jumpTarget.name : "");
  const [veggieOnly, setVeggieOnly] = useState(false);
  const [glutenFreeOnly, setGlutenFreeOnly] = useState(false);
  const [dairyFreeOnly, setDairyFreeOnly] = useState(false);
  const [timeFilter, setTimeFilter] = useState("any"); // any | quick | standard | batch
  const [expandedKey, setExpandedKey] = useState(jumpTarget ? `${jumpTarget.section}::${jumpTarget.name}` : null);
  const targets = useMemo(() => computeTargets(profile), [profile]);

  useEffect(() => {
    if (jumpTarget) {
      setSection(jumpTarget.section);
      setSearch(jumpTarget.name);
      setExpandedKey(`${jumpTarget.section}::${jumpTarget.name}`);
      if (onJumpHandled) onJumpHandled();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpTarget]);

  const isAll = section === ALL_KEY;
  const sectionData = isAll ? null : RECIPE_DATA.sections[section];
  const isFixed = isAll ? null : sectionData.type === "fixed";
  const target = isAll ? null : mealTarget(section, targets);

  const itemMatchesSearch = (x, query) => {
    if (!query) return true;
    const q = query.toLowerCase();
    if (x.item.name.toLowerCase().includes(q)) return true;
    if (x.isFixed) {
      if (x.item.food1 && x.item.food1.toLowerCase().includes(q)) return true;
      if (x.item.food2 && x.item.food2.toLowerCase().includes(q)) return true;
    } else {
      if (x.item.proteinFood && x.item.proteinFood.toLowerCase().includes(q)) return true;
      if (x.item.carbFood && x.item.carbFood.toLowerCase().includes(q)) return true;
      if (x.item.vegFood && x.item.vegFood.toLowerCase().includes(q)) return true;
      if (x.item.vegText && x.item.vegText.toLowerCase().includes(q)) return true;
    }
    return false;
  };

  const timeInMinutes = (timeStr) => {
    if (!timeStr) return null;
    const match = timeStr.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  };
  const matchesTimeFilter = (item, isFixed) => {
    if (timeFilter === "any" || isFixed) return true; // fixed items (snacks etc.) have no comparable cook time
    const mins = timeInMinutes(item.time);
    if (mins === null) return true;
    if (timeFilter === "quick") return mins <= 15;
    if (timeFilter === "standard") return mins > 15 && mins <= 25;
    if (timeFilter === "batch") return mins > 25;
    return true;
  };

  const items = useMemo(() => {
    const sourceSections = isAll ? SECTION_ORDER : [section];
    const list = [];
    sourceSections.forEach((s) => {
      const sd = RECIPE_DATA.sections[s];
      const fixed = sd.type === "fixed";
      const t = mealTarget(s, targets);
      sd.items.forEach((item) => {
        list.push({
          item,
          itemSection: s,
          isFixed: fixed,
          macros: fixed ? fixedMacros(item) : scaledMacros(item, t),
          veggie: !!item.veggie,
        });
      });
    });
    return list
      .filter((x) => !veggieOnly || x.veggie)
      .filter((x) => !glutenFreeOnly || isGlutenFree(x.item, x.isFixed))
      .filter((x) => !dairyFreeOnly || isDairyFree(x.item, x.isFixed))
      .filter((x) => matchesTimeFilter(x.item, x.isFixed))
      .filter((x) => itemMatchesSearch(x, search));
  }, [isAll, section, targets, veggieOnly, glutenFreeOnly, dairyFreeOnly, search, timeFilter]);

  return (
    <div className="pe-fadein">
      <div className="sticky top-0 z-10 pe-scroll" style={{ background: "#F5F4EE" }}>
        <div className="flex gap-2 overflow-x-auto px-4 pt-4 pb-2 pe-scroll">
          {BROWSE_TABS.map((s) => (
            <button
              key={s}
              className={`pe-tab whitespace-nowrap px-3.5 py-2 rounded-full text-sm font-medium ${section === s ? "active" : ""}`}
              style={section === s ? {} : { background: "#E9E5D8" }}
              onClick={() => { setSection(s); setExpandedKey(null); }}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto pe-scroll">
          <input
            className="pe-input flex-1 px-3 py-2 text-sm"
            placeholder="Search by recipe, protein, carb or veg (e.g. chicken)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            className={`pe-chip px-3 py-2 text-xs font-semibold ${veggieOnly ? "active" : ""}`}
            onClick={() => setVeggieOnly((v) => !v)}
          >
            Veggie only
          </button>
          <button
            className={`pe-chip px-3 py-2 text-xs font-semibold ${glutenFreeOnly ? "active" : ""}`}
            onClick={() => setGlutenFreeOnly((v) => !v)}
          >
            Gluten-free
          </button>
          <button
            className={`pe-chip px-3 py-2 text-xs font-semibold ${dairyFreeOnly ? "active" : ""}`}
            onClick={() => setDairyFreeOnly((v) => !v)}
          >
            Dairy-free
          </button>
        </div>
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto pe-scroll">
          {[
            ["any", "Any time"],
            ["quick", "Quick (≤15 min)"],
            ["standard", "Standard (16-25 min)"],
            ["batch", "Batch / slow (25 min+)"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={`pe-chip whitespace-nowrap px-3 py-1.5 text-xs font-medium ${timeFilter === key ? "active" : ""}`}
              onClick={() => setTimeFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="px-4 pb-3">
          <select
            className="pe-input w-full px-3 py-2 text-sm"
            value=""
            onChange={(e) => {
              if (!e.target.value) return;
              setSearch(e.target.value);
              setSection(ALL_KEY);
              setExpandedKey(null);
            }}
          >
            <option value="">Tired and don't know what to cook? Pick an ingredient…</option>
            {Object.entries(INGREDIENT_GROUPS).map(([groupLabel, names]) => (
              <optgroup key={groupLabel} label={groupLabel}>
                {names.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      <div className="px-4 pb-24 max-w-lg mx-auto">
        {isAll ? (
          <div className="text-xs mb-3 px-1" style={{ color: "#948A78" }}>
            Every recipe and option across the whole plan — portions still scale to each item's own meal target.
          </div>
        ) : (
          !isFixed && (
            <div className="text-xs mb-3 px-1" style={{ color: "#948A78" }}>
              Portions scaled to your {round(target.protein)}g protein / {round(target.carbs)}g carb target for this meal.
            </div>
          )
        )}
        {items.length === 0 && (
          <p className="text-sm text-center py-10" style={{ color: "#948A78" }}>No recipes match — try clearing filters.</p>
        )}
        {items.map(({ item, itemSection, isFixed: itemIsFixed, macros, veggie }) => {
          const key = `${itemSection}::${item.name}`;
          return (
            <RecipeCard
              key={key}
              item={item}
              isFixed={itemIsFixed}
              macros={macros}
              veggie={veggie}
              sectionBadge={isAll ? itemSection : null}
              cartQty={cart[key]?.qty || 0}
              expanded={expandedKey === key}
              onToggleExpand={() => setExpandedKey(expandedKey === key ? null : key)}
              onAdd={() => updateCart(key, itemSection, item, itemIsFixed, 1)}
              onRemove={() => updateCart(key, itemSection, item, itemIsFixed, -1)}
              onBulkAdd={!itemIsFixed ? () => updateCart(key, itemSection, item, itemIsFixed, 4) : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}

function OrderScreen({ cart, updateCart, profile, onGoShopping, orderHistory, onReorder, onViewRecipe }) {
  const targets = useMemo(() => computeTargets(profile), [profile]);
  const entries = Object.entries(cart).filter(([, v]) => v.qty > 0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewedEntryId, setViewedEntryId] = useState(null);

  const historySection = orderHistory && orderHistory.length > 0 && (
    <div className="mt-6">
      <button
        className="flex items-center justify-between w-full px-1 mb-2"
        onClick={() => setHistoryOpen((o) => !o)}
      >
        <span className="pe-display text-sm font-semibold" style={{ color: "#14403E" }}>
          Past orders ({orderHistory.length})
        </span>
        <span className="text-xs" style={{ color: "#948A78" }}>{historyOpen ? "Hide ▲" : "Show ▼"}</span>
      </button>
      {historyOpen && (
        <div className="space-y-2">
          {orderHistory.map((h) => (
            <div key={h.id} className="pe-card p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{h.date}</div>
                  <div className="pe-mono text-xs" style={{ color: "#948A78" }}>{h.items.length} item{h.items.length !== 1 ? "s" : ""}</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    className="pe-chip px-3 py-1.5 rounded-full text-xs font-medium"
                    onClick={() => setViewedEntryId(viewedEntryId === h.id ? null : h.id)}
                  >
                    {viewedEntryId === h.id ? "Hide" : "View meals"}
                  </button>
                  <button
                    className="pe-btn-secondary px-3.5 py-1.5 rounded-full text-xs font-semibold"
                    onClick={() => onReorder(h)}
                  >
                    Add to order
                  </button>
                </div>
              </div>
              {viewedEntryId === h.id && (
                <div className="pe-fadein pe-divider mt-3 pt-3 space-y-1.5">
                  {h.items.map((it, i) => (
                    <div key={i} className="flex items-center justify-between text-xs gap-2">
                      <button
                        className="truncate text-left underline decoration-dotted"
                        style={{ color: "#40473F" }}
                        onClick={() => onViewRecipe && onViewRecipe(it.section, it.name)}
                      >
                        <span className="font-semibold" style={{ color: "#B5652F" }}>{it.section}: </span>
                        {it.name}
                      </button>
                      <span className="pe-mono shrink-0" style={{ color: "#948A78" }}>×{it.qty}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (entries.length === 0) {
    return (
      <div className="pe-fadein px-4 pt-10 max-w-lg mx-auto">
        <div className="flex flex-col items-center justify-center text-center px-6 mb-4">
          <div className="text-5xl mb-3">🧺</div>
          <p className="pe-display text-lg font-semibold mb-1" style={{ color: "#14403E" }}>Your order is empty</p>
          <p className="text-sm" style={{ color: "#948A78" }}>Browse recipes and tap "Add to order" to build your week.</p>
        </div>
        {historySection}
      </div>
    );
  }

  let totalCalories = 0;
  entries.forEach(([, v]) => {
    const sectionData = RECIPE_DATA.sections[v.section];
    const isFixed = sectionData.type === "fixed";
    const target = mealTarget(v.section, targets);
    const macros = isFixed ? fixedMacros(v.item) : scaledMacros(v.item, target);
    totalCalories += macros.calories * v.qty;
  });

  return (
    <div className="pe-fadein px-4 pb-28 max-w-lg mx-auto pt-4">
      <h2 className="pe-display text-xl font-semibold mb-1" style={{ color: "#14403E" }}>Your order</h2>
      <p className="text-xs mb-4" style={{ color: "#948A78" }}>{entries.length} item{entries.length !== 1 ? "s" : ""} · {round(totalCalories)} kcal total</p>

      {entries.map(([key, v]) => {
        const sectionData = RECIPE_DATA.sections[v.section];
        const isFixed = sectionData.type === "fixed";
        const target = mealTarget(v.section, targets);
        const macros = isFixed ? fixedMacros(v.item) : scaledMacros(v.item, target);
        return (
          <div key={key} className="pe-card p-3.5 mb-2.5 flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: "#B5652F" }}>{v.section}</div>
              <button
                className="text-sm font-medium truncate text-left underline decoration-dotted"
                style={{ color: "#26312F" }}
                onClick={() => onViewRecipe && onViewRecipe(v.section, v.item.name)}
              >
                {v.item.name}
              </button>
              <div className="pe-mono text-xs mt-0.5" style={{ color: "#948A78" }}>{round(macros.calories * v.qty)} kcal</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button className="pe-btn-secondary w-7 h-7 rounded-full text-sm font-bold" onClick={() => updateCart(key, v.section, v.item, isFixed, -1)}>−</button>
              <span className="pe-mono text-sm font-semibold w-5 text-center">{v.qty}</span>
              <button className="pe-btn-primary w-7 h-7 rounded-full text-sm font-bold" onClick={() => updateCart(key, v.section, v.item, isFixed, 1)}>+</button>
            </div>
          </div>
        );
      })}

      <button className="pe-btn-primary w-full py-3.5 rounded-full font-semibold text-sm mt-4" onClick={onGoShopping}>
        View shopping list →
      </button>

      {historySection}
    </div>
  );
}

function ShoppingListScreen({ cart, profile, checkedItems, toggleChecked, clearChecks, onArchive, hiddenItems, onClearTicked }) {
  const [confirmMode, setConfirmMode] = useState(null); // null | "all" | "ticked"
  const targets = useMemo(() => computeTargets(profile), [profile]);
  const entries = Object.entries(cart).filter(([, v]) => v.qty > 0);

  const grouped = useMemo(() => {
    const totals = {}; // name -> { grams, category }
    const addQty = (name, category, grams) => {
      if (!name || !grams) return;
      if (!totals[name]) totals[name] = { grams: 0, category: category || "Other" };
      totals[name].grams += grams;
    };

    entries.forEach(([, v]) => {
      const sectionData = RECIPE_DATA.sections[v.section];
      const isFixed = sectionData.type === "fixed";
      if (isFixed) {
        addQty(v.item.food1, v.item.category1, v.item.g1 * v.qty);
        if (v.item.food2) addQty(v.item.food2, v.item.category2, v.item.g2 * v.qty);
      } else {
        const target = mealTarget(v.section, targets);
        const m = scaledMacros(v.item, target);
        addQty(v.item.proteinFood, v.item.proteinCategory, m.proteinPortion * v.qty);
        addQty(v.item.carbFood, v.item.carbCategory, m.carbPortion * v.qty);
        if (v.item.vegFood) addQty(v.item.vegFood, v.item.vegCategory, v.item.vegGrams * v.qty);
      }
    });

    const byCategory = { Proteins: [], "Carbs & Starches": [], Vegetables: [], Other: [] };
    Object.entries(totals).forEach(([name, { grams, category }]) => {
      if (hiddenItems && hiddenItems[name]) return; // removed via "Clear ticked"
      const bucket = byCategory[category] ? category : "Other";
      byCategory[bucket].push({ name, grams });
    });
    Object.values(byCategory).forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));
    return byCategory;
  }, [entries, targets, hiddenItems]);

  const hasAny = entries.length > 0;
  const allNames = Object.values(grouped).flat().map((i) => i.name);
  const checkedCount = allNames.filter((n) => checkedItems[n]).length;

  return (
    <div className="pe-fadein px-4 pb-28 max-w-lg mx-auto pt-4">
      <h2 className="pe-display text-xl font-semibold mb-1" style={{ color: "#14403E" }}>Shopping list</h2>
      <p className="text-xs mb-4" style={{ color: "#948A78" }}>
        Totals from everything in your order. Pantry basics (oil, salt, spices, sauces) aren't included — stock those separately.
      </p>

      {!hasAny && (
        <p className="text-sm text-center py-10" style={{ color: "#948A78" }}>Add some meals to your order first.</p>
      )}

      {hasAny && (
        <div className="flex items-center justify-between mb-4 px-1">
          <span className="pe-mono text-xs font-semibold" style={{ color: "#6B6355" }}>
            {checkedCount} / {allNames.length} ticked off
          </span>
          {checkedCount > 0 && (
            <button className="text-xs font-medium" style={{ color: "#B5652F" }} onClick={clearChecks}>
              Reset ticks
            </button>
          )}
        </div>
      )}

      {["Proteins", "Carbs & Starches", "Vegetables", "Other"].map((cat) =>
        grouped[cat] && grouped[cat].length > 0 ? (
          <div key={cat} className="mb-5">
            <div className="pe-display text-sm font-semibold mb-2 px-1" style={{ color: "#14403E" }}>{cat}</div>
            <div className="pe-card divide-y" style={{ borderColor: "#E4E1D6" }}>
              {grouped[cat].map(({ name, grams }) => {
                const checked = !!checkedItems[name];
                return (
                  <button
                    key={name}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left"
                    style={{ borderColor: "#EFEBE0" }}
                    onClick={() => toggleChecked(name)}
                  >
                    <span
                      className="shrink-0 w-5 h-5 rounded-md flex items-center justify-center"
                      style={{
                        border: checked ? "none" : "1.5px solid #DAD5C7",
                        background: checked ? "#14403E" : "transparent",
                      }}
                    >
                      {checked && <span style={{ color: "#F5F4EE", fontSize: 12, fontWeight: 700 }}>✓</span>}
                    </span>
                    <span
                      className="text-sm flex-1"
                      style={{
                        color: checked ? "#B0A996" : "#26312F",
                        textDecoration: checked ? "line-through" : "none",
                      }}
                    >
                      {name}
                    </span>
                    <span
                      className="pe-mono text-sm font-semibold"
                      style={{ color: checked ? "#B0A996" : "#14403E" }}
                    >
                      {grams >= 1000 ? `${(grams / 1000).toFixed(2)} kg` : `${round(grams)} g`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null
      )}

      {hasAny && (
        <div className="mt-6">
          {confirmMode === null && (
            <div className="flex gap-2">
              <button
                className="pe-btn-secondary flex-1 py-3 rounded-full font-semibold text-xs"
                onClick={() => setConfirmMode("ticked")}
                disabled={checkedCount === 0}
                style={checkedCount === 0 ? { opacity: 0.5 } : {}}
              >
                Clear ticked ({checkedCount})
              </button>
              <button
                className="pe-btn-primary flex-1 py-3 rounded-full font-semibold text-xs"
                onClick={() => setConfirmMode("all")}
              >
                Clear all
              </button>
            </div>
          )}

          {confirmMode === "ticked" && (
            <div className="pe-card p-4">
              <p className="text-sm font-medium mb-1">Clear the {checkedCount} ticked item{checkedCount !== 1 ? "s" : ""}?</p>
              <p className="text-xs mb-3" style={{ color: "#948A78" }}>
                Removes just what you've already bought from this list. Your order stays active and anything not
                yet ticked stays put — handy for a second trip later in the week. (If you add more meals later
                that need one of these same ingredients again, it won't reappear automatically — worth noting
                the extra amount yourself.)
              </p>
              <div className="flex gap-2">
                <button
                  className="pe-btn-secondary flex-1 py-2.5 rounded-full text-xs font-semibold"
                  onClick={() => setConfirmMode(null)}
                >
                  Cancel
                </button>
                <button
                  className="pe-btn-primary flex-1 py-2.5 rounded-full text-xs font-semibold"
                  onClick={() => { onClearTicked(); setConfirmMode(null); }}
                >
                  Yes, clear ticked
                </button>
              </div>
            </div>
          )}

          {confirmMode === "all" && (
            <div className="pe-card p-4">
              <p className="text-sm font-medium mb-1">Clear the whole shopping list?</p>
              <p className="text-xs mb-3" style={{ color: "#948A78" }}>
                This saves today's order to Past Orders (so you can reorder it later) and clears your current
                order and ticks completely, ready for next week. It won't touch your Daily Log.
              </p>
              <div className="flex gap-2">
                <button
                  className="pe-btn-secondary flex-1 py-2.5 rounded-full text-xs font-semibold"
                  onClick={() => setConfirmMode(null)}
                >
                  Cancel
                </button>
                <button
                  className="pe-btn-primary flex-1 py-2.5 rounded-full text-xs font-semibold"
                  onClick={() => { onArchive(); setConfirmMode(null); }}
                >
                  Yes, clear all
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const TABS = [
  { key: "log", label: "Daily Log", icon: "📊" },
  { key: "browse", label: "Recipes", icon: "🍴" },
  { key: "gym", label: "Gym", icon: "🏋" },
  { key: "order", label: "Order", icon: "🧺" },
  { key: "shopping", label: "Shop", icon: "🛒" },
  { key: "setup", label: "Setup", icon: "⚙" },
];

function AthleteApp({ currentUserId, userEmail, onSignOut }) {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("setup");
  const [profile, setProfileState] = useState(DEFAULT_PROFILE);
  const [cart, setCartState] = useState({});
  const [logsByDate, setLogsByDate] = useState({});
  const [checkedItems, setCheckedItemsState] = useState({});
  const [jumpTarget, setJumpTarget] = useState(null);
  const [orderHistory, setOrderHistory] = useState([]);
  const [hiddenItems, setHiddenItemsState] = useState({});
  const [syncStatus, setSyncStatus] = useState("idle"); // idle | syncing | synced | error

  const viewRecipe = useCallback((section, name) => {
    setJumpTarget({ section, name });
    setTab("browse");
  }, []);

  useEffect(() => {
    (async () => {
      setSyncUserId(currentUserId);
      if (currentUserId) {
        setSyncStatus("syncing");
        try {
          await pullUserData(currentUserId);
          setSyncStatus("synced");
        } catch {
          setSyncStatus("error");
        }
      }
      const onboarded = await loadStored("pe_onboarded", false);
      const p = await loadStored("pe_profile", DEFAULT_PROFILE);
      const c = await loadStored("pe_cart", {});
      const l = await loadStored("pe_logs_by_date", {});
      const ch = await loadStored("pe_checked_items", {});
      const oh = await loadStored("pe_order_history", []);
      const hi = await loadStored("pe_hidden_items", {});
      setProfileState(p);
      setCartState(c);
      setLogsByDate(l);
      setCheckedItemsState(ch);
      setOrderHistory(oh);
      setHiddenItemsState(hi);
      setTab(onboarded ? "log" : "setup");
      setReady(true);
    })();
  }, [currentUserId]);

  const setProfile = useCallback((next) => {
    setProfileState(next);
    saveStored("pe_profile", next);
    saveStored("pe_onboarded", true);
  }, []);

  const updateCart = useCallback((key, section, item, isFixed, delta) => {
    setCartState((prev) => {
      const current = prev[key]?.qty || 0;
      const nextQty = Math.max(0, current + delta);
      const next = { ...prev };
      if (nextQty === 0) {
        delete next[key];
      } else {
        next[key] = { section, item, qty: nextQty };
      }
      saveStored("pe_cart", next);
      return next;
    });
  }, []);

  const cartCount = Object.values(cart).reduce((sum, v) => sum + v.qty, 0);

  const updateDayLog = useCallback((date, entries) => {
    setLogsByDate((prev) => {
      const next = { ...prev, [date]: entries };
      saveStored("pe_logs_by_date", next);
      return next;
    });
  }, []);

  const addToTodayLog = useCallback((entry) => {
    const today = todayStr();
    setLogsByDate((prev) => {
      const next = { ...prev, [today]: [...(prev[today] || []), entry] };
      saveStored("pe_logs_by_date", next);
      return next;
    });
  }, []);

  const clearDayLog = useCallback((date) => {
    setLogsByDate((prev) => {
      const next = { ...prev, [date]: [] };
      saveStored("pe_logs_by_date", next);
      return next;
    });
  }, []);

  const toggleChecked = useCallback((name) => {
    setCheckedItemsState((prev) => {
      const next = { ...prev, [name]: !prev[name] };
      saveStored("pe_checked_items", next);
      return next;
    });
  }, []);

  const clearChecks = useCallback(() => {
    setCheckedItemsState({});
    saveStored("pe_checked_items", {});
  }, []);

  const archiveOrder = useCallback(() => {
    setCartState((prevCart) => {
      const entries = Object.values(prevCart).filter((v) => v.qty > 0);
      if (entries.length === 0) return prevCart;
      const snapshot = {
        id: Date.now(),
        date: todayStr(),
        items: entries.map((v) => ({ section: v.section, name: v.item.name, qty: v.qty })),
      };
      setOrderHistory((prevHistory) => {
        const next = [snapshot, ...prevHistory].slice(0, 20);
        saveStored("pe_order_history", next);
        return next;
      });
      saveStored("pe_cart", {});
      return {};
    });
    setCheckedItemsState({});
    saveStored("pe_checked_items", {});
    setHiddenItemsState({});
    saveStored("pe_hidden_items", {});
  }, []);

  const clearTicked = useCallback(() => {
    setCheckedItemsState((prevChecked) => {
      const tickedNames = Object.keys(prevChecked).filter((n) => prevChecked[n]);
      if (tickedNames.length === 0) return prevChecked;
      setHiddenItemsState((prevHidden) => {
        const nextHidden = { ...prevHidden };
        tickedNames.forEach((n) => { nextHidden[n] = true; });
        saveStored("pe_hidden_items", nextHidden);
        return nextHidden;
      });
      saveStored("pe_checked_items", {});
      return {};
    });
  }, []);

  const reorderFromHistory = useCallback((historyEntry) => {
    setCartState((prev) => {
      const next = { ...prev };
      historyEntry.items.forEach(({ section, name, qty }) => {
        const sectionData = RECIPE_DATA.sections[section];
        if (!sectionData) return;
        const item = sectionData.items.find((i) => i.name === name);
        if (!item) return;
        const key = `${section}::${name}`;
        const currentQty = next[key]?.qty || 0;
        next[key] = { section, item, qty: currentQty + qty };
      });
      saveStored("pe_cart", next);
      return next;
    });
    setTab("order");
  }, []);

  if (!ready) {
    return (
      <div className="pe-app flex items-center justify-center" style={{ minHeight: "100vh" }}>
          <div className="pe-mono text-sm" style={{ color: "#948A78" }}>Loading…</div>
      </div>
    );
  }

  return (
    <div className="pe-app" style={{ minHeight: "100vh" }}>
      <div className="pe-header px-5 pt-6 pb-5">
        <ContourSVG />
        <div className="relative">
          <div className="text-[11px] font-semibold tracking-widest uppercase mb-1" style={{ color: "#9FC4BE" }}>
            Polar Endurance Coaching
          </div>
          <div className="pe-display text-2xl font-semibold">Meal Picker</div>
          <div className="text-xs italic mt-0.5" style={{ color: "#9FC4BE" }}>The outdoors is waiting.</div>
        </div>
      </div>

      <div style={{ paddingBottom: "76px" }}>
        {tab === "setup" && (
          <SetupScreen
            profile={profile}
            setProfile={setProfile}
            userEmail={userEmail}
            onSignOut={onSignOut}
          />
        )}
        {tab === "log" && <DailyLogScreen profile={profile} logsByDate={logsByDate} updateDayLog={updateDayLog} clearDayLog={clearDayLog} onViewRecipe={viewRecipe} />}
        {tab === "gym" && <GymScreen profile={profile} onAddToTodayLog={addToTodayLog} onViewRecipe={viewRecipe} />}
        {tab === "browse" && <BrowseScreen profile={profile} cart={cart} updateCart={updateCart} jumpTarget={jumpTarget} onJumpHandled={() => setJumpTarget(null)} />}
        {tab === "order" && <OrderScreen cart={cart} updateCart={updateCart} profile={profile} onGoShopping={() => setTab("shopping")} orderHistory={orderHistory} onReorder={reorderFromHistory} onViewRecipe={viewRecipe} />}
        {tab === "shopping" && <ShoppingListScreen cart={cart} profile={profile} checkedItems={checkedItems} toggleChecked={toggleChecked} clearChecks={clearChecks} onArchive={archiveOrder} hiddenItems={hiddenItems} onClearTicked={clearTicked} />}
      </div>

      <div
        className="fixed bottom-0 left-0 right-0 flex justify-around items-center py-2 px-2"
        style={{ background: "#FFFFFF", borderTop: "1px solid #E4E1D6", maxWidth: "100vw" }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            className="flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl relative"
            style={{ color: tab === t.key ? "#14403E" : "#948A78" }}
            onClick={() => setTab(t.key)}
          >
            <span className="text-lg leading-none">{t.icon}</span>
            <span className="text-[10px] font-semibold">{t.label}</span>
            {t.key === "order" && cartCount > 0 && (
              <span
                className="absolute -top-0.5 right-1.5 pe-mono text-[9px] font-bold text-white rounded-full flex items-center justify-center"
                style={{ background: "#B5652F", minWidth: 15, height: 15, padding: "0 3px" }}
              >
                {cartCount}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Root() {
  const [session, setSession] = useState(undefined); // undefined = checking, null = signed out
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState(false);

  const loadSessionAndProfile = useCallback(async () => {
    setProfileError(false);
    const { data } = await supabase.auth.getSession();
    setSession(data.session || null);
    if (data.session) {
      setLoadingProfile(true);
      try {
        // A profile row is created right after sign-up; on the very first
        // load after signing up there can be a brief moment where it
        // hasn't landed yet, so retry a couple of times before giving up.
        let p = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          p = await getMyProfile(data.session.user.id);
          if (p) break;
          await new Promise((resolve) => setTimeout(resolve, 800));
        }
        setProfile(p);
        if (!p) setProfileError(true);
      } catch (e) {
        console.error(e);
        setProfileError(true);
      } finally {
        setLoadingProfile(false);
      }
    }
  }, []);

  useEffect(() => {
    loadSessionAndProfile();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (!newSession) {
        setProfile(null);
        setProfileError(false);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, [loadSessionAndProfile]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setProfileError(false);
  };

  if (session === undefined) {
    return (
      <div className="pe-app flex items-center justify-center" style={{ minHeight: "100vh" }}>
        <div className="pe-mono text-sm" style={{ color: "#948A78" }}>Loading…</div>
      </div>
    );
  }

  if (!session) {
    return <AuthScreen onAuthed={loadSessionAndProfile} />;
  }

  if (profileError) {
    return (
      <div className="pe-app flex items-center justify-center px-6" style={{ minHeight: "100vh" }}>
        <div className="w-full max-w-sm text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="pe-display text-lg font-semibold mb-2" style={{ color: "#14403E" }}>
            We couldn't find your account
          </p>
          <p className="text-sm mb-5" style={{ color: "#6B6355" }}>
            You're signed in, but no profile is set up for this account yet. This can happen if sign-up was
            interrupted partway through. Try signing out and creating your account again.
          </p>
          <button className="pe-btn-primary w-full py-3 rounded-full font-semibold text-sm" onClick={handleSignOut}>
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  if (loadingProfile || !profile) {
    return (
      <div className="pe-app flex items-center justify-center" style={{ minHeight: "100vh" }}>
        <div className="pe-mono text-sm" style={{ color: "#948A78" }}>Loading your account…</div>
      </div>
    );
  }

  if (profile.role === "coach") {
    return <CoachDashboard profile={profile} onSignOut={handleSignOut} />;
  }

  return (
    <AthleteApp
      currentUserId={session.user.id}
      userEmail={session.user.email}
      onSignOut={handleSignOut}
    />
  );
}
