import React, { useMemo, useState } from "react";
import { RECIPE_DATA } from "./data.js";
import { computeTargets, mealTarget, scaledMacros } from "./calculations.js";
import { makeRng, generateWeekBox, rerollOne, uniqueIngredientCount } from "./weeklyPrep.js";

const round = (n) => Math.round(n || 0);

function recipeMacrosFor(section, name, targets) {
  const item = RECIPE_DATA.sections[section]?.items.find((i) => i.name === name);
  if (!item) return null;
  const m = scaledMacros(item, mealTarget(section, targets));
  return { calories: m.calories, protein: m.proteinG, time: item.time };
}

// A compact, searchable picker for "choose my own" — not the full Recipes browser (filters, GF/DF, etc.),
// just enough to fill a box quickly: search by name, tap to add up to the target count.
function PickOwnList({ section, target, chosen, onToggle }) {
  const [query, setQuery] = useState("");
  const items = RECIPE_DATA.sections[section].items.filter((i) => !i.recoveryDay);
  const filtered = query ? items.filter((i) => i.name.toLowerCase().includes(query.toLowerCase())) : items;
  return (
    <div>
      <input
        className="pe-input w-full px-3 py-2 text-sm mb-2"
        placeholder={`Search ${section.toLowerCase()} recipes…`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="rounded-lg overflow-hidden pe-scroll" style={{ border: "1px solid #E4E1D6", maxHeight: 260, overflowY: "auto" }}>
        {filtered.slice(0, 80).map((item, i) => {
          const picked = chosen.includes(item.name);
          const disabled = !picked && chosen.length >= target;
          return (
            <button
              key={item.name}
              className="w-full flex items-center justify-between px-3 py-2 text-left text-sm"
              style={{ borderTop: i ? "1px solid #EFEBE0" : "none", opacity: disabled ? 0.4 : 1 }}
              onClick={() => !disabled && onToggle(item.name)}
              disabled={disabled}
            >
              <span className="truncate pr-2">{item.name}</span>
              <span className="text-lg shrink-0" style={{ color: picked ? "#6FA968" : "#B8B2A0" }}>{picked ? "✓" : "+"}</span>
            </button>
          );
        })}
        {filtered.length === 0 && <p className="text-xs p-3" style={{ color: "#948A78" }}>No matches.</p>}
      </div>
    </div>
  );
}

function RecipeCard({ section, name, targets, onShuffle, onViewRecipe }) {
  const m = recipeMacrosFor(section, name, targets);
  return (
    <div className="flex items-center justify-between py-2.5" style={{ borderTop: "1px solid #EFEBE0" }}>
      <button className="text-left flex-1 min-w-0 pr-2" onClick={() => onViewRecipe?.(section, name)}>
        <div className="text-sm font-medium truncate">{name}</div>
        {m && (
          <div className="pe-mono text-[11px]" style={{ color: "#948A78" }}>
            {m.time ? `${m.time} · ` : ""}{round(m.calories)} kcal · P{round(m.protein)}g
          </div>
        )}
      </button>
      <button className="text-sm px-2 py-1 shrink-0" style={{ color: "#948A78" }} onClick={onShuffle} title="Shuffle this one" aria-label="Shuffle this recipe">
        🔄
      </button>
    </div>
  );
}

export default function WeeklyPrepScreen({ profile, updateCart, onViewRecipe }) {
  const targets = computeTargets(profile);
  const [counts, setCounts] = useState({ Dinner: 4, Lunch: 3 });
  const [veggieOnly, setVeggieOnly] = useState(false);
  const [mode, setMode] = useState(null); // null | "pick" | "box"
  const [pickChoices, setPickChoices] = useState({ Dinner: [], Lunch: [] });
  const [box, setBox] = useState(null); // { Dinner: [names], Lunch: [names] }
  const [addStatus, setAddStatus] = useState("");

  const totalMeals = (counts.Dinner || 0) + (counts.Lunch || 0);
  const ingredientStats = useMemo(() => (box ? uniqueIngredientCount(RECIPE_DATA, box) : null), [box]);

  const setCount = (section, delta) => {
    setCounts((c) => ({ ...c, [section]: Math.max(0, Math.min(14, (c[section] || 0) + delta)) }));
  };

  const surpriseMe = () => {
    const generated = generateWeekBox(RECIPE_DATA, counts, { rng: makeRng(Date.now() % 2147483647), veggieOnly });
    setBox(generated);
    setMode("box");
    setAddStatus("");
  };

  const shuffleWhole = () => surpriseMe();

  const shuffleOne = (section, index) => {
    setBox((prev) => ({ ...prev, [section]: rerollOne(RECIPE_DATA, section, prev[section], index, { rng: makeRng(Date.now() % 2147483647), veggieOnly }) }));
  };

  const togglePick = (section, name) => {
    setPickChoices((prev) => {
      const list = prev[section];
      const next = list.includes(name) ? list.filter((n) => n !== name) : [...list, name];
      return { ...prev, [section]: next };
    });
  };

  const confirmPicks = () => {
    setBox({ ...pickChoices });
    setMode("box");
    setAddStatus("");
  };

  const pickReady = (counts.Dinner || 0) === pickChoices.Dinner.length && (counts.Lunch || 0) === pickChoices.Lunch.length;

  const addAllToOrder = () => {
    let added = 0;
    for (const [section, names] of Object.entries(box)) {
      for (const name of names) {
        const item = RECIPE_DATA.sections[section]?.items.find((i) => i.name === name);
        if (!item) continue;
        updateCart(`${section}::${name}`, section, item, false, 1);
        added++;
      }
    }
    setAddStatus(added > 0 ? "added" : "empty");
  };

  return (
    <div className="pe-fadein px-4 pb-28 max-w-lg mx-auto pt-4">
      <h2 className="pe-display text-xl font-semibold mb-1" style={{ color: "#14403E" }}>Weekly Prep</h2>
      <p className="text-xs mb-4" style={{ color: "#948A78" }}>
        Pick how many lunches and dinners you want this week, then either hand-pick them or let it build a box for
        you — like a meal-kit box, but from your own plan. It favours recipes that share ingredients, so the whole
        week comes off one shopping trip rather than a dozen single-use bits and pieces.
      </p>

      {!mode && (
        <>
          <div className="pe-card p-4 mb-4">
            <div className="pe-display text-sm font-semibold mb-3" style={{ color: "#14403E" }}>How many meals?</div>
            {["Dinner", "Lunch"].map((section) => (
              <div key={section} className="flex items-center justify-between mb-3 last:mb-0">
                <span className="text-sm font-medium">{section}s</span>
                <div className="flex items-center gap-3">
                  <button data-testid={`prep-minus-${section}`} className="w-8 h-8 rounded-full text-lg font-bold" style={{ background: "#EDE9DD", color: "#14403E" }} onClick={() => setCount(section, -1)}>−</button>
                  <span data-testid={`prep-count-${section}`} className="pe-mono text-sm font-semibold w-5 text-center">{counts[section]}</span>
                  <button data-testid={`prep-plus-${section}`} className="w-8 h-8 rounded-full text-lg font-bold" style={{ background: "#14403E", color: "#fff" }} onClick={() => setCount(section, 1)}>+</button>
                </div>
              </div>
            ))}
            <label className="flex items-center gap-2 mt-3 text-xs" style={{ color: "#40473F" }}>
              <input type="checkbox" checked={veggieOnly} onChange={(e) => setVeggieOnly(e.target.checked)} />
              Veggie recipes only
            </label>
          </div>

          {totalMeals === 0 ? (
            <p className="text-xs text-center" style={{ color: "#948A78" }}>Choose at least one lunch or dinner to continue.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              <button className="pe-btn-primary w-full py-3 rounded-full text-sm font-semibold" onClick={surpriseMe}>
                🎲 Surprise me — build {totalMeals} meal{totalMeals === 1 ? "" : "s"} now
              </button>
              <button
                className="pe-btn-secondary w-full py-3 rounded-full text-sm font-semibold"
                onClick={() => { setPickChoices({ Dinner: [], Lunch: [] }); setMode("pick"); }}
              >
                👆 Pick my own {totalMeals} meal{totalMeals === 1 ? "" : "s"}
              </button>
            </div>
          )}
        </>
      )}

      {mode === "pick" && (
        <div className="pe-fadein">
          {["Dinner", "Lunch"].map((section) =>
            (counts[section] || 0) > 0 ? (
              <div key={section} className="pe-card p-4 mb-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="pe-display text-sm font-semibold" style={{ color: "#14403E" }}>{section}s</div>
                  <span className="pe-mono text-xs" style={{ color: "#948A78" }}>{pickChoices[section].length} / {counts[section]}</span>
                </div>
                <PickOwnList section={section} target={counts[section]} chosen={pickChoices[section]} onToggle={(name) => togglePick(section, name)} />
              </div>
            ) : null
          )}
          <div className="flex gap-2">
            <button className="pe-btn-secondary flex-1 py-2.5 rounded-full text-sm font-semibold" onClick={() => setMode(null)}>Back</button>
            <button
              className="pe-btn-primary flex-1 py-2.5 rounded-full text-sm font-semibold"
              style={!pickReady ? { opacity: 0.5 } : undefined}
              disabled={!pickReady}
              onClick={confirmPicks}
            >
              Build my box
            </button>
          </div>
        </div>
      )}

      {mode === "box" && box && (
        <div className="pe-fadein">
          <div className="pe-card p-4 mb-3">
            {["Dinner", "Lunch"].map((section) =>
              box[section].length > 0 ? (
                <div key={section} className="mb-1 last:mb-0">
                  <div className="pe-display text-sm font-semibold mt-1" style={{ color: "#14403E" }}>{section}s</div>
                  {box[section].map((name, i) => (
                    <RecipeCard key={name} section={section} name={name} targets={targets} onViewRecipe={onViewRecipe} onShuffle={() => shuffleOne(section, i)} />
                  ))}
                </div>
              ) : null
            )}
          </div>

          {ingredientStats && (
            <div className="rounded-lg p-3 mb-3 text-xs" style={{ background: "#F5F4EE", color: "#40473F" }}>
              This box needs just <strong>{ingredientStats.total} different core ingredients</strong> ({ingredientStats.proteins} proteins, {ingredientStats.carbs} carbs)
              across {totalMeals} meals — genuinely doable as one shopping trip.
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 mb-3">
            <button className="pe-btn-primary w-full py-2.5 rounded-full text-sm font-semibold" onClick={addAllToOrder}>
              🧺 Add this whole week to my order
            </button>
            <div className="flex gap-2">
              <button className="pe-btn-secondary flex-1 py-2 rounded-full text-xs font-semibold" onClick={shuffleWhole}>🎲 Shuffle the whole week</button>
              <button className="pe-btn-secondary flex-1 py-2 rounded-full text-xs font-semibold" onClick={() => { setMode(null); setBox(null); }}>Start over</button>
            </div>
          </div>

          {addStatus === "added" && (
            <p className="text-xs text-center" style={{ color: "#4F6B41" }}>
              Added to your order — head to <strong>🛒 Shop</strong> (under More) for the combined shopping list for the whole week.
            </p>
          )}
          <p className="text-[11px] text-center mt-3" style={{ color: "#B8B2A0" }}>
            No major UK supermarket currently offers direct checkout integration to independent apps, so for now
            this gives you a clean list to shop from yourself, in one trip, rather than sending the order anywhere automatically.
          </p>
        </div>
      )}
    </div>
  );
}
