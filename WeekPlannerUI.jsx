import React from "react";
import { RECIPE_DATA } from "./data.js";
import { recipeMacros } from "./calculations.js";

export const PLAN_DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Every meal slot a plan (coach or athlete) can fill in for a single day.
// "section" must match a real RECIPE_DATA section name exactly.
export const MEAL_SLOTS = [
  { key: "breakfast", label: "Breakfast", section: "Breakfast" },
  { key: "lunch", label: "Lunch", section: "Lunch" },
  { key: "dinner", label: "Dinner", section: "Dinner" },
  { key: "snack", label: "Snack", section: "Snacks" },
  { key: "dessert", label: "Dessert", section: "Desserts & Sweet Treats" },
];

export function mondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function weekDatesFrom(weekStart) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return isoDate(d);
  });
}

// Sums the macros of every slot filled in for one day.
export function computeDayMacros(dayPlan, targets) {
  let calories = 0, protein = 0, carbs = 0, fat = 0;
  MEAL_SLOTS.forEach(({ key, section }) => {
    const pick = dayPlan?.[key];
    if (!pick) return;
    const m = recipeMacros(RECIPE_DATA, pick.section || section, pick.name, targets);
    if (!m) return;
    calories += m.calories; protein += m.protein; carbs += m.carbs; fat += m.fat;
  });
  return { calories, protein, carbs, fat };
}

const round = (n) => Math.round(n || 0);

const MACRO_COLORS = { calories: "#E08D52", protein: "#6FA968", carbs: "#4FA3AC", fat: "#A67FC0" };

// The same 4 colour-coded bars used on the athlete's Daily Log, reused here
// so a coach or athlete sees the identical visual language when planning.
export function DayMacroBars({ macros, targets, compact }) {
  if (!targets) return null;
  const rows = [
    { key: "calories", label: "Energy", value: macros.calories, target: targets.calories, unit: " kcal" },
    { key: "protein", label: "Protein", value: macros.protein, target: targets.protein, unit: "g" },
    { key: "carbs", label: "Net Carbs", value: macros.carbs, target: targets.carbs, unit: "g" },
    { key: "fat", label: "Fat", value: macros.fat, target: targets.fat, unit: "g" },
  ];
  return (
    <div>
      {rows.map((r) => {
        const pct = r.target > 0 ? Math.min(100, (r.value / r.target) * 100) : 0;
        const rawPct = r.target > 0 ? Math.round((r.value / r.target) * 100) : 0;
        return (
          <div key={r.key} className={compact ? "mb-1.5" : "mb-2.5"}>
            <div className="flex justify-between items-baseline mb-0.5">
              <span className={compact ? "text-[11px] font-semibold" : "text-xs font-semibold"} style={{ color: "#14403E" }}>
                {r.label}{" "}
                <span className="pe-mono font-normal" style={{ color: "#948A78" }}>
                  - {round(r.value)} / {round(r.target)}{r.unit}
                </span>
              </span>
              <span className="pe-mono text-[11px] font-semibold" style={{ color: "#948A78" }}>{rawPct}%</span>
            </div>
            <div className="w-full rounded-full" style={{ background: "#E9E5D8", height: compact ? "5px" : "7px" }}>
              <div
                className="rounded-full"
                style={{ width: `${pct}%`, background: MACRO_COLORS[r.key], height: compact ? "5px" : "7px" }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// A compact 7-column strip — one mini bar per day, showing that day's total
// calories as a % of the daily target — so a coach can see the whole week's
// shape (heavier days vs. lighter days) before drilling into any one day.
export function WeekOverviewStrip({ weekDates, plan, targets }) {
  if (!targets) return null;
  return (
    <div className="pe-card p-3 mb-3">
      <div className="text-xs font-semibold mb-2" style={{ color: "#14403E" }}>This week at a glance (Energy)</div>
      <div className="flex items-end gap-2" style={{ height: "72px" }}>
        {weekDates.map((date, i) => {
          const dayMacros = computeDayMacros(plan[date], targets);
          const pct = targets.calories > 0 ? Math.min(100, (dayMacros.calories / targets.calories) * 100) : 0;
          const over = dayMacros.calories > targets.calories;
          return (
            <div key={date} className="flex-1 flex flex-col items-center justify-end h-full">
              <div className="w-full rounded-t-sm" style={{ background: "#E9E5D8", height: "100%", position: "relative" }}>
                <div
                  className="w-full rounded-t-sm absolute bottom-0"
                  style={{ height: `${pct}%`, background: over ? "#B5652F" : "#E08D52" }}
                />
              </div>
              <span className="text-[9px] mt-1" style={{ color: "#948A78" }}>{PLAN_DAY_LABELS[i].slice(0, 3)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MealSlotPicker({ date, plan, setPick }) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {MEAL_SLOTS.map(({ key, label, section }) => {
        const options = RECIPE_DATA.sections[section]?.items.map((i) => i.name) || [];
        return (
          <div key={key}>
            <label className="text-[10px] font-medium" style={{ color: "#948A78" }}>{label}</label>
            <select
              className="pe-input w-full px-2 py-1.5 text-xs"
              value={plan[date]?.[key]?.name || ""}
              onChange={(e) => setPick(date, key, section, e.target.value)}
            >
              <option value="">— No pick —</option>
              {options.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        );
      })}
    </div>
  );
}
