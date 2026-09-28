import React from "react";
import { servingsFor, gramsFrom } from "./servings.js";

// "2 × [medium ▾]" — quantity plus a unit dropdown (grams always available, everyday servings when known).
export function FoodQuantity({ food, qty, unit, onQty, onUnit }) {
  const servings = servingsFor(food);
  const grams = gramsFrom(qty, unit, servings);
  const kcal = food ? (food.kcal * grams) / 100 : 0;
  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          type="number" inputMode="decimal" min="0" step="any"
          className="pe-input flex-1 min-w-0 px-3 py-2 text-sm"
          value={qty}
          onChange={(e) => onQty(e.target.value)}
          placeholder="amount"
        />
        <select
          className="pe-input min-w-0 px-2 py-2 text-sm"
          style={{ maxWidth: "55%" }}
          value={unit}
          onChange={(e) => onUnit(e.target.value)}
        >
          <option value="g">grams (g)</option>
          {servings.map((s) => (
            <option key={s.label} value={s.label}>{s.label} — {Math.round(s.grams * 10) / 10}g</option>
          ))}
        </select>
      </div>
      {grams > 0 && (
        <div className="pe-mono text-[11px] mt-1" style={{ color: "#948A78" }}>
          {unit !== "g" ? `= ${Math.round(grams * 10) / 10}g · ` : ""}{Math.round(kcal)} kcal
        </div>
      )}
    </div>
  );
}

// Default unit for a food: a pack's own serving if it has one; otherwise the "typical" everyday serving
// (the middle of a small/medium/large set, so a banana starts as "medium"); otherwise 100g.
export function defaultQuantity(food) {
  const servings = servingsFor(food);
  if (!servings.length) return { qty: "100", unit: "g" };
  if (servings[0].label === "serving") return { qty: "1", unit: "serving" };
  const pick = servings.length >= 3 ? servings[Math.floor(servings.length / 2)] : servings[0];
  return { qty: "1", unit: pick.label };
}
