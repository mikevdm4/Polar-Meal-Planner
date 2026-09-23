import React, { useState, useEffect, useMemo, useCallback } from "react";
import { RECIPE_DATA, FOOD_LIST } from "./data.js";
import { schedulePushUserData, pushUserData } from "./authSync.js";import { isGlutenFree, isDairyFree, dietarySwaps } from "./dietaryTags.js";
import { supabase } from "./supabaseClient.js";
import { getMyProfile, linkCoach, unlinkCoach, changePassword, changeEmail, getMyWeekPlan, getMyFeedback } from "./auth.js";
import { pullUserData } from "./authSync.js";
import { AuthScreen, CoachDashboard, ResetPasswordScreen, PendingApprovalScreen, AdminApprovals } from "./Auth.jsx";
import { STRUCTURES, SECTION_MEAL_TYPE, computeTargets, mealTarget, scaledMacros } from "./calculations.js";


const GOALS = ["Fat Loss", "Maintenance", "Muscle Gain"];
const STORE_CUPBOARD_ITEMS = [
  "Olive oil", "Salt", "Black pepper", "Garlic (fresh)", "Onion (fresh, when not tracked as a main ingredient)",
  "Paprika", "Ground cumin", "Dried oregano", "Dried basil", "Dried thyme", "Chilli flakes",
  "Curry powder", "Garam masala", "Ground cinnamon", "Vanilla extract",
  "Balsamic vinegar", "Red wine vinegar", "Soy sauce", "Worcestershire sauce",
  "Dijon mustard", "Stock cubes or stock", "Plain flour or cornflour", "Baking powder",
];

function StoreCupboardList({ compact }) {
  return (
    <div>
      {!compact && (
        <p className="text-xs mb-2" style={{ color: "#948A78" }}>
          Every recipe assumes you already have these basics at home — they're not added to your shopping list
          since a bottle of oil or a jar of paprika lasts for dozens of meals, not one. Worth checking your
          cupboard against this list once, then it's a one-off purchase.
        </p>
      )}
      <ul className={`list-disc list-inside space-y-0.5 ${compact ? "text-[12px]" : "text-sm"}`} style={{ color: "#40473F" }}>
        {STORE_CUPBOARD_ITEMS.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

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
        (item.extras || []).forEach((e) => {
          (e.category === "Proteins" ? proteins : e.category === "Vegetables" ? vegs : carbs).add(e.food);
        });
      }
    });
  });
  return {
    Protein: [...proteins].sort(),
    "Carb / Starch": [...carbs].sort(),
    Vegetable: [...vegs].sort(),
  };
})();

const DEFAULT_PROFILE = {
  bodyweight: 70,
  goal: "Fat Loss",
  structure: STRUCTURES[0],
  adjustment: 0,
  snackCount: 0,
  snackPct: 5,
  mealPercents: null, // null = use evidence-based default (even split) for current structure
};


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

function CookingGuideScreen() {
  const Section = ({ title, children }) => (
    <div className="pe-card p-4 mb-3">
      <div className="pe-display text-sm font-semibold mb-2" style={{ color: "#14403E" }}>{title}</div>
      <div className="text-sm space-y-2" style={{ color: "#40473F" }}>{children}</div>
    </div>
  );

  return (
    <div className="pe-fadein px-4 pb-28 max-w-lg mx-auto pt-4">
      <h2 className="pe-display text-xl font-semibold mb-1" style={{ color: "#14403E" }}>Cooking Guide</h2>
      <p className="text-xs mb-4" style={{ color: "#948A78" }}>
        Meal prep strategy, everyday technique, and the small habits that separate an okay plate from a genuinely
        good one — none of it requires fancy equipment or professional training.
      </p>

      <Section title="📦 Meal prep — set yourself up for the week">
        <p><strong>Batch the base, not the whole dish.</strong> Cook a big tray of rice, a batch of roasted
        vegetables, and a couple of proteins on a Sunday, then mix and match through the week rather than making
        five identical meals — you'll actually want to eat it on day four.</p>
        <p><strong>Undercook slightly if you're reheating.</strong> Vegetables and pasta both keep cooking a
        little in the fridge and again when reheated — pull them off the heat just before they're perfectly done.</p>
        <p><strong>Cool food fully before sealing it in the fridge.</strong> Sealing something hot traps steam,
        which means soggy vegetables and a shorter shelf life. Ten minutes uncovered on the counter first makes
        a real difference.</p>
        <p><strong>Freeze in portions, not one big block.</strong> A single large frozen block of chilli or
        curry takes forever to defrost evenly and often overcooks at the edges before the middle's even thawed.
        Flat bags or individual containers freeze faster and thaw faster too.</p>
        <p><strong>Dress salads and add crunchy toppings just before eating</strong>, not when you prep — nuts,
        seeds and anything meant to be crisp will go soft and soggy sitting in the fridge for days.</p>
      </Section>

      <Section title="🔥 Getting a better sear or golden finish">
        <p><strong>Pat protein dry before it hits the pan.</strong> Surface moisture steams instead of browning
        — a couple of minutes with kitchen paper before cooking chicken, steak, or fish makes a genuinely visible
        difference to colour and crust.</p>
        <p><strong>Don't move it too soon.</strong> Meat, fish and halloumi all release themselves from the pan
        naturally once a proper crust has formed. If it's sticking and tearing when you try to flip it, it's
        not ready yet — give it another minute.</p>
        <p><strong>Don't overcrowd the pan.</strong> Too much in the pan at once drops the temperature and the
        food steams rather than sears. Cook in batches if you need to — it's faster in total than one soggy batch.</p>
        <p><strong>Let meat rest after cooking</strong> — a few minutes for a steak or chicken breast, longer for
        a bigger cut. Cutting straight in lets all the juice run out onto the board instead of staying in the meat.</p>
      </Section>

      <Section title="🧂 Seasoning and flavour">
        <p><strong>Season in layers, not just at the end.</strong> A pinch of salt on the onions as they cook, a
        bit more when you add the next ingredient, then a final taste-and-adjust at the end — builds far more
        flavour than one big pinch right before serving.</p>
        <p><strong>Taste as you go</strong>, genuinely the single most underused habit in home cooking. You can't
        fix a bland dish once it's on the plate, but you can fix it two minutes before.</p>
        <p><strong>Acid at the end wakes a dish up.</strong> A squeeze of lemon or a dash of vinegar right before
        serving, especially on anything rich or a bit flat-tasting, does more than another pinch of salt would.</p>
        <p><strong>Toast whole or ground spices briefly in the dry pan</strong> before adding wet ingredients —
        30 seconds over medium heat brings out a noticeably deeper flavour than adding them straight into liquid.</p>
      </Section>

      <Section title="🍚 Rice, pasta & grains">
        <p><strong>Salt the water properly</strong> — it should taste like the sea. This is the only chance
        pasta or rice has to be seasoned from the inside rather than just on the surface.</p>
        <p><strong>Rinse rice before cooking</strong> (not pasta) — it removes surface starch and gives a
        fluffier, less clumpy result, especially for basmati.</p>
        <p><strong>Save a splash of pasta water</strong> before draining — the starchy water helps any sauce
        cling to the pasta properly instead of pooling at the bottom of the bowl.</p>
      </Section>

      <Section title="🥦 Vegetables">
        <p><strong>Roast at a genuinely high heat</strong> (200°C or above) and don't overcrowd the tray — too
        many vegetables piled together steams them instead of roasting, and you lose the caramelised edges that
        actually taste good.</p>
        <p><strong>Cut everything on the tray to a similar size</strong> so it all finishes cooking at the same
        time, rather than some pieces burning while others are still hard.</p>
        <p><strong>Don't skip drying vegetables after washing</strong> if you're roasting or stir-frying them —
        the same steaming problem as with meat.</p>
      </Section>

      <Section title="🍳 Eggs">
        <p><strong>Low and slow for scrambled eggs</strong> — a gentle heat and patience gets a genuinely
        creamier result than blasting them on high, which just makes them rubbery fast.</p>
        <p><strong>Room-temperature eggs poach and boil more evenly</strong> than eggs straight from the fridge.</p>
      </Section>

      <Section title="🍲 Sauces & stews">
        <p><strong>Deglaze the pan.</strong> After browning meat, add a splash of stock, wine, or even water to
        the same pan and scrape up the browned bits stuck to the bottom — that's genuinely concentrated flavour,
        not something to wash down the drain.</p>
        <p><strong>A longer, gentler simmer beats a rushed boil</strong> for almost any stew or curry — flavours
        have time to actually combine rather than just cooking through.</p>
        <p><strong>Thin a sauce with pasta water, stock, or a splash of milk</strong> rather than plain water if
        you need to loosen it — plain water dilutes flavour along with the texture.</p>
      </Section>

      <Section title="🔪 A few genuinely useful habits">
        <p><strong>Read the whole recipe before you start cooking</strong>, not just the ingredient list —
        nothing derails a meal faster than realising step 4 needed something marinating an hour ago.</p>
        <p><strong>Prep everything before the pan gets hot</strong> (chefs call this mise en place) — chopping
        an onion while something else is already burning is how most kitchen mistakes happen.</p>
        <p><strong>A sharp knife is safer than a dull one</strong> — it requires less force and is far less
        likely to slip.</p>
        <p><strong>Keep a kitchen towel over your shoulder, not a fresh one for every wipe</strong> — small
        thing, but it's exactly how professional kitchens stay fast and organised without constant clean-up stops.</p>
      </Section>
    </div>
  );
}

function HelpGuideScreen({ onGetStarted, isFirstRun }) {
  const Section = ({ title, children }) => (
    <div className="pe-card p-4 mb-3">
      <div className="pe-display text-sm font-semibold mb-2" style={{ color: "#14403E" }}>{title}</div>
      <div className="text-sm space-y-2" style={{ color: "#40473F" }}>{children}</div>
    </div>
  );

  return (
    <div className="pe-fadein px-4 pb-28 max-w-lg mx-auto pt-4">
      <h2 className="pe-display text-xl font-semibold mb-1" style={{ color: "#14403E" }}>
        {isFirstRun ? "Welcome — here's how this works" : "Help & Guide"}
      </h2>
      <p className="text-xs mb-4" style={{ color: "#948A78" }}>
        A quick tour of every part of the app, and what to do if something needs changing.
      </p>

      <Section title="⚙ Setup — start here">
        <p>Your bodyweight, goal (Fat Loss / Maintenance / Muscle Gain) and meal structure drive every target in
        the app. Change your bodyweight here whenever it changes — everything recalculates automatically.</p>
        <p><strong>Calorie adjustment</strong> lets you nudge your daily calories up or down (e.g. +300 on a
        heavier training day) without changing your protein target.</p>
        <p><strong>Meal distribution</strong> — by default your protein and carbs split evenly across your meals.
        Drag the sliders if you want a bigger breakfast and a lighter dinner, say, or add snacks that each claim
        a % of your day.</p>
      </Section>

      <Section title="🍽 Recipes — browsing and filtering">
        <p>Search by recipe name, or by an ingredient (e.g. "chicken" finds every recipe using chicken as the
        main protein). The dropdown under the search box — "Tired and don't know what to cook?" — lets you pick
        an ingredient and see everything that uses it.</p>
        <p><strong>Filters:</strong> Veggie only, Gluten-free, Dairy-free, and 🔥 Recovery day (bigger, tastier,
        less calorie-conscious meals for after a big session) can be combined. A "✕ Reset all" chip appears once
        any filter or search is active.</p>
        <p>Tap a recipe to expand it — you'll see the exact quantity of every tracked ingredient, a "Dietary
        swaps" section if it's easy to make gluten- or dairy-free, and the full method. "Plus: oil, salt, spices —
        see Store Cupboard" is tappable and shows the basics every recipe assumes you already have.</p>
      </Section>

      <Section title="💪 Gym — before and after training">
        <p>Toggle between "Before training" (quick, easy-to-digest snacks) and "After training" (recovery meals
        and smoothies, scaled to a separate post-workout target). Adding something here logs it straight to
        today's Daily Log.</p>
      </Section>

      <Section title="🛒 Order & Shopping">
        <p>Add recipes to your order from the Recipes or Gym tabs, then head to Shopping for the combined
        ingredient list, grouped and totalled. Tick items off as you shop — "Clear ticked" removes just what
        you've bought (handy for a second trip), "Clear all" archives the whole order to Past Orders and starts
        fresh.</p>
        <p>Past Orders can be reordered in one tap, or viewed without changing your current cart.</p>
      </Section>

      <Section title="📋 Daily Log — tracking what you actually eat">
        <p>Three ways to log something: <strong>Add a meal</strong> (pick a recipe, adjust servings, even swap
        the protein source if you used something different), <strong>Add a food</strong> (search the ingredient
        database and enter grams), or <strong>Log manually</strong> for anything else — a takeaway, a meal
        replacement.</p>
        <p>Logging manually doesn't require the numbers up front — leave calories blank if you just want to
        record <em>what</em> and <em>when</em> you ate something, and add the nutrition info later by tapping
        "Add nutrition info" on that entry.</p>
        <p>The <strong>"How are you feeling today?"</strong> notes box is there for tracking bloating, energy,
        digestion, or mood alongside what you ate — useful for spotting patterns over time.</p>
        <p>The <strong>Trends</strong> chart shows your last week or month at a glance, with workout-related
        nutrition shown in a separate colour from everyday meals.</p>
        <p>Tap <strong>⬇ Export</strong> at the top to download your entire log history (every day, every entry,
        every note) as a spreadsheet.</p>
      </Section>

      <Section title="🔄 Syncing & working offline">
        <p>Your data saves to this device instantly and syncs to your account automatically — log in on another
        device and it'll be there. If you're offline, everything still saves locally and syncs the moment you're
        back online; check the sync status in Setup → Account if you want to confirm.</p>
      </Section>

      <Section title="🔥 What 'Recovery Day' actually means">
        <p>Recovery Day recipes (burgers, gyros, real desserts with real sugar and cream) are tagged for days
        after a big session where you want to genuinely enjoy your food rather than watch every gram. They still
        include a proper veg or salad base — they're just not built around minimising calories the way the rest
        of the plan is.</p>
      </Section>

      <div
        className="rounded-lg p-4 mt-2"
        style={{ background: "#FFF7ED", border: "1px solid #F5DCC9" }}
      >
        <div className="text-sm font-semibold mb-1.5" style={{ color: "#9C5527" }}>
          ⚠️ A note on allergens and ingredient accuracy
        </div>
        <p className="text-xs mb-2" style={{ color: "#9C5527" }}>
          This app is <strong>not</strong> built as an allergen-management tool. The Gluten-free and Dairy-free
          filters are a best-effort guide based on each recipe's main tracked ingredients only — they are{" "}
          <strong>not verified safe for coeliac disease or a diagnosed food allergy</strong>, and a method step
          can mention an ingredient (a coating, a dash of sauce, a garnish) that isn't reflected in the filter at
          all. There is currently no filtering for nuts, shellfish, eggs, or any other allergen.
        </p>
        <p className="text-xs" style={{ color: "#9C5527" }}>
          Nutrition figures (calories, protein, carbs, fat) are calculated from standard ingredient data and are
          a close estimate, not a laboratory measurement. If you or a client has any allergy, intolerance, or
          medical dietary requirement, <strong>always independently check every ingredient and full method of
          any recipe before eating it</strong> — don't rely on this app's filters or figures alone.
        </p>
      </div>

      {onGetStarted && (
        <button
          className="pe-btn-primary w-full py-3 rounded-full font-semibold text-sm mt-4"
          onClick={onGetStarted}
        >
          {isFirstRun ? "Get started →" : "Back"}
        </button>
      )}
    </div>
  );
}

function SetupScreen({ profile, setProfile, userEmail, onSignOut, syncStatus, isOnline, onOpenGuide, onOpenCookingGuide, currentUserId, coachId, onProfileRefresh }) {
  const [coachEmailInput, setCoachEmailInput] = useState("");
  const [coachLinkStatus, setCoachLinkStatus] = useState(""); // "" | "saving" | "error" | "success"
  const [coachLinkError, setCoachLinkError] = useState("");

  const handleLinkCoach = async () => {
    if (!coachEmailInput.trim()) return;
    setCoachLinkStatus("saving");
    setCoachLinkError("");
    try {
      await linkCoach(currentUserId, coachEmailInput);
      setCoachLinkStatus("success");
      setCoachEmailInput("");
      if (onProfileRefresh) await onProfileRefresh();
    } catch (e) {
      setCoachLinkStatus("error");
      setCoachLinkError(e.message || "Couldn't link that coach — try again.");
    }
  };

  const handleUnlinkCoach = async () => {
    setCoachLinkStatus("saving");
    try {
      await unlinkCoach(currentUserId);
      setCoachLinkStatus("");
      if (onProfileRefresh) await onProfileRefresh();
    } catch (e) {
      setCoachLinkStatus("error");
      setCoachLinkError(e.message || "Couldn't remove your coach — try again.");
    }
  };

  const [showSecurity, setShowSecurity] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState(""); // "" | "saving" | "error" | "success"
  const [passwordError, setPasswordError] = useState("");

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      setPasswordStatus("error");
      setPasswordError("Password needs to be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordStatus("error");
      setPasswordError("Those two passwords don't match.");
      return;
    }
    setPasswordStatus("saving");
    setPasswordError("");
    try {
      await changePassword(newPassword);
      setPasswordStatus("success");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      setPasswordStatus("error");
      setPasswordError(e.message || "Couldn't change your password — try again.");
    }
  };

  const [newEmail, setNewEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState(""); // "" | "saving" | "error" | "success"
  const [emailError, setEmailError] = useState("");

  const handleChangeEmail = async () => {
    if (!newEmail.trim() || !newEmail.includes("@")) {
      setEmailStatus("error");
      setEmailError("Enter a valid email address.");
      return;
    }
    setEmailStatus("saving");
    setEmailError("");
    try {
      await changeEmail(newEmail);
      setEmailStatus("success");
      setNewEmail("");
    } catch (e) {
      setEmailStatus("error");
      setEmailError(e.message || "Couldn't change your email — try again.");
    }
  };

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

      {onOpenGuide && (
        <button
          className="pe-card w-full p-4 mb-3 text-left flex items-center justify-between"
          onClick={onOpenGuide}
        >
          <div>
            <div className="pe-display text-sm font-semibold" style={{ color: "#14403E" }}>📖 Help & Guide</div>
            <div className="text-xs mt-0.5" style={{ color: "#948A78" }}>
              How to use every part of the app, plus a note on allergens and ingredient accuracy
            </div>
          </div>
          <span style={{ color: "#948A78" }}>→</span>
        </button>
      )}

      {onOpenCookingGuide && (
        <button
          className="pe-card w-full p-4 mb-5 text-left flex items-center justify-between"
          onClick={onOpenCookingGuide}
        >
          <div>
            <div className="pe-display text-sm font-semibold" style={{ color: "#14403E" }}>🔪 Cooking Guide</div>
            <div className="text-xs mt-0.5" style={{ color: "#948A78" }}>
              Meal prep strategy and everyday technique tips — searing, seasoning, roasting, and more
            </div>
          </div>
          <span style={{ color: "#948A78" }}>→</span>
        </button>
      )}

      <div className="pe-card p-4 mb-5">
        <div className="pe-display text-sm font-semibold mb-1" style={{ color: "#14403E" }}>Account</div>
        <p className="text-xs mb-3" style={{ color: "#948A78" }}>
          Signed in as <strong>{userEmail}</strong>. Your data syncs automatically to any device you log into
          with this account.
        </p>
        <div className="flex items-center gap-1.5 mb-3">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{
              background: !isOnline ? "#B5652F" : syncStatus === "error" ? "#B5652F" : syncStatus === "syncing" ? "#D4A15C" : "#4F6B41",
            }}
          />
          <span className="text-xs" style={{ color: "#6B6355" }}>
            {!isOnline
              ? "Offline — will sync automatically once reconnected"
              : syncStatus === "syncing"
              ? "Syncing…"
              : syncStatus === "error"
              ? "Couldn't sync last change — will retry automatically"
              : "Synced"}
          </span>
        </div>
        <button className="pe-btn-secondary w-full py-2 rounded-full text-xs font-semibold" onClick={onSignOut}>
          Sign out
        </button>
      </div>

      <div className="pe-card p-4 mb-5">
        <div className="pe-display text-sm font-semibold mb-1" style={{ color: "#14403E" }}>Coach</div>
        {coachId ? (
          <>
            <p className="text-xs mb-3" style={{ color: "#948A78" }}>
              You're currently linked to a coach — they can see your profile, order, and logs.
            </p>
            <button
              className="pe-btn-secondary w-full py-2 rounded-full text-xs font-semibold"
              onClick={handleUnlinkCoach}
              disabled={coachLinkStatus === "saving"}
            >
              {coachLinkStatus === "saving" ? "Removing…" : "Remove my coach"}
            </button>
          </>
        ) : (
          <>
            <p className="text-xs mb-3" style={{ color: "#948A78" }}>
              Not linked to a coach yet. If you didn't add one when you signed up — or want to switch — enter
              their email below at any time.
            </p>
            <div className="flex gap-2 mb-2">
              <input
                type="email"
                className="pe-input flex-1 px-3 py-2 text-sm"
                placeholder="Your coach's email"
                value={coachEmailInput}
                onChange={(e) => setCoachEmailInput(e.target.value)}
              />
              <button
                className="pe-btn-primary px-4 py-2 rounded-full text-xs font-semibold"
                onClick={handleLinkCoach}
                disabled={!coachEmailInput.trim() || coachLinkStatus === "saving"}
                style={!coachEmailInput.trim() || coachLinkStatus === "saving" ? { opacity: 0.5 } : {}}
              >
                {coachLinkStatus === "saving" ? "Linking…" : "Link"}
              </button>
            </div>
          </>
        )}
        {coachLinkStatus === "error" && (
          <p className="text-xs mt-1" style={{ color: "#B5652F" }}>{coachLinkError}</p>
        )}
        {coachLinkStatus === "success" && (
          <p className="text-xs mt-1" style={{ color: "#4F6B41" }}>Linked! Your coach can now see your progress.</p>
        )}
      </div>

      <div className="pe-card p-4 mb-5">
        <button className="flex items-center justify-between w-full" onClick={() => setShowSecurity((v) => !v)}>
          <div className="pe-display text-sm font-semibold" style={{ color: "#14403E" }}>Password & Email</div>
          <span className="text-xs" style={{ color: "#948A78" }}>{showSecurity ? "Hide ▲" : "Show ▼"}</span>
        </button>

        {showSecurity && (
          <div className="pe-fadein mt-4">
            <div className="mb-5">
              <div className="text-xs font-semibold mb-1.5" style={{ color: "#40473F" }}>Change password</div>
              <input
                type="password"
                className="pe-input w-full px-3 py-2 text-sm mb-2"
                placeholder="New password (min. 8 characters)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <input
                type="password"
                className="pe-input w-full px-3 py-2 text-sm mb-2"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <button
                className="pe-btn-primary w-full py-2 rounded-full text-xs font-semibold"
                onClick={handleChangePassword}
                disabled={passwordStatus === "saving"}
              >
                {passwordStatus === "saving" ? "Saving…" : "Update password"}
              </button>
              {passwordStatus === "error" && (
                <p className="text-xs mt-1.5" style={{ color: "#B5652F" }}>{passwordError}</p>
              )}
              {passwordStatus === "success" && (
                <p className="text-xs mt-1.5" style={{ color: "#4F6B41" }}>Password updated.</p>
              )}
            </div>

            <div className="pe-divider pt-4">
              <div className="text-xs font-semibold mb-1.5" style={{ color: "#40473F" }}>Change email</div>
              <p className="text-[11px] mb-2" style={{ color: "#948A78" }}>
                You'll get a confirmation link at the new address — the change only takes effect once you click it.
              </p>
              <input
                type="email"
                className="pe-input w-full px-3 py-2 text-sm mb-2"
                placeholder="New email address"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
              <button
                className="pe-btn-primary w-full py-2 rounded-full text-xs font-semibold"
                onClick={handleChangeEmail}
                disabled={emailStatus === "saving"}
              >
                {emailStatus === "saving" ? "Saving…" : "Send confirmation link"}
              </button>
              {emailStatus === "error" && (
                <p className="text-xs mt-1.5" style={{ color: "#B5652F" }}>{emailError}</p>
              )}
              {emailStatus === "success" && (
                <p className="text-xs mt-1.5" style={{ color: "#4F6B41" }}>
                  Check your new inbox for a confirmation link to finish the change.
                </p>
              )}
            </div>
          </div>
        )}
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
  // Same local-date fix as todayStr() — must match it exactly, otherwise the
  // chart's day boundaries and the log's actual day boundaries drift apart.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

function ProgressBar({ label, consumed, target, unit, color }) {
  const pct = target > 0 ? Math.min(100, (consumed / target) * 100) : 0;
  const rawPct = target > 0 ? Math.round((consumed / target) * 100) : 0;
  const over = consumed > target;
  const barColor = color || "#14403E";
  return (
    <div className="mb-3">
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-sm font-semibold" style={{ color: "#14403E" }}>
          {label} <span className="text-xs font-normal pe-mono" style={{ color: "#948A78" }}>- {round(consumed)} / {round(target)}{unit}</span>
        </span>
        <span className="pe-mono text-xs font-semibold" style={{ color: over ? "#B5652F" : "#948A78" }}>
          {over && <span>over by {round(consumed - target)}{unit} · </span>}
          {rawPct}%
        </span>
      </div>
      <div className="w-full rounded-full h-2" style={{ background: "#E9E5D8" }}>
        <div
          className="h-2 rounded-full"
          style={{ width: `${pct}%`, background: over ? "#B5652F" : barColor, transition: "width 0.2s ease" }}
        />
      </div>
    </div>
  );
}

function todayStr() {
  // Deliberately using local date parts, not .toISOString() (which is UTC) —
  // using UTC here would file anything logged in the first hour or so after
  // local midnight under the previous day, for anyone not exactly on GMT
  // (this includes the UK itself during British Summer Time).
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nowTimeStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function mondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function CoachWeekPlanCard({ onViewRecipe }) {
  const [weekPlan, setWeekPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    const weekStart = mondayOf(new Date());
    getMyWeekPlan(weekStart)
      .then((res) => setWeekPlan(res))
      .catch(() => setWeekPlan(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !weekPlan || !weekPlan.plan || Object.keys(weekPlan.plan).length === 0) return null;

  const days = Object.keys(weekPlan.plan).sort();

  return (
    <div className="pe-card p-4 mb-4">
      <button className="flex items-center justify-between w-full" onClick={() => setExpanded((v) => !v)}>
        <div className="pe-display text-sm font-semibold" style={{ color: "#14403E" }}>
          🗓 Your coach's picks this week
        </div>
        <span className="text-xs" style={{ color: "#948A78" }}>{expanded ? "Hide ▲" : "Show ▼"}</span>
      </button>
      {expanded && (
        <div className="pe-fadein mt-3">
          {weekPlan.coach_note && (
            <div className="rounded-lg p-2.5 mb-3 text-xs" style={{ background: "#F5F4EE", color: "#40473F" }}>
              {weekPlan.coach_note}
            </div>
          )}
          <div className="space-y-2">
            {days.map((date) => {
              const dayPlan = weekPlan.plan[date];
              const picks = [dayPlan?.lunch, dayPlan?.dinner].filter(Boolean);
              if (picks.length === 0) return null;
              return (
                <div key={date} className="pe-divider pt-2">
                  <div className="pe-mono text-[11px] mb-1" style={{ color: "#948A78" }}>{date}</div>
                  {picks.map((p, i) => (
                    <button
                      key={i}
                      className="text-xs font-medium block mb-1"
                      style={{ color: "#14403E" }}
                      onClick={() => onViewRecipe(p.section, p.name)}
                    >
                      {p.section}: {p.name} →
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
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
      time: nowTimeStr(),
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

          {baseMacros && baseMacros.usesFixedProtein && baseMacros.proteinTargetEquivalent && (
            <div className="rounded-lg p-2.5 mb-3 text-[11px]" style={{ background: "#FFF7ED", border: "1px solid #F5DCC9", color: "#9C5527" }}>
              This uses a normal serving of {pendingItem.proteinFood.toLowerCase()} ({round(baseMacros.proteinPortion)}g) rather than scaling it
              to your full protein target (which would need ~{round(baseMacros.proteinTargetEquivalent)}g — unrealistic as a single portion).
              Consider pairing with an extra protein source to close the gap.
            </div>
          )}
          {baseMacros && baseMacros.usesFixedCarb && baseMacros.carbTargetEquivalent && (
            <div className="rounded-lg p-2.5 mb-3 text-[11px]" style={{ background: "#FFF7ED", border: "1px solid #F5DCC9", color: "#9C5527" }}>
              This uses a normal serving of {pendingItem.carbFood.toLowerCase()} ({round(baseMacros.carbPortion)}g) — a deliberately
              lower-carb ingredient, so it won't cover your full carb target on its own (~{round(baseMacros.carbTargetEquivalent)}g would be
              needed). Add carbs elsewhere in the day if you need them.
            </div>
          )}

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

function DailyLogScreen({ profile, logsByDate, updateDayLog, clearDayLog, onViewRecipe, dayNotes, updateDayNotes, waterByDate, updateWater }) {
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [coachFeedback, setCoachFeedback] = useState({});
  useEffect(() => {
    getMyFeedback().then(setCoachFeedback).catch(() => {});
  }, []);
  const [query, setQuery] = useState("");
  const [pendingFood, setPendingFood] = useState(null);
  const [pendingGrams, setPendingGrams] = useState(100);
  const [pendingTime, setPendingTime] = useState(() => nowTimeStr());
  const [manualOpen, setManualOpen] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualCal, setManualCal] = useState("");
  const [manualProtein, setManualProtein] = useState("");
  const [manualCarbs, setManualCarbs] = useState("");
  const [manualFat, setManualFat] = useState("");
  const [manualTime, setManualTime] = useState(() => nowTimeStr());
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

  const [editingFoodEntryId, setEditingFoodEntryId] = useState(null);

  const addFood = () => {
    if (!pendingFood || !pendingGrams) return;
    if (editingFoodEntryId) {
      updateDayLog(
        selectedDate,
        dayLog.map((e) =>
          e.id === editingFoodEntryId
            ? { ...e, food: pendingFood, grams: Number(pendingGrams), time: pendingTime }
            : e
        )
      );
      setEditingFoodEntryId(null);
    } else {
      updateDayLog(selectedDate, [
        ...dayLog,
        { id: Date.now(), type: "food", food: pendingFood, grams: Number(pendingGrams), time: pendingTime },
      ]);
    }
    setPendingFood(null);
    setQuery("");
    setPendingGrams(100);
    setPendingTime(nowTimeStr());
  };

  const openEditFoodEntry = (entry) => {
    setPendingFood(entry.food);
    setQuery(entry.food.name);
    setPendingGrams(entry.grams);
    setPendingTime(entry.time || nowTimeStr());
    setEditingFoodEntryId(entry.id);
  };

  const addMealEntry = (entry) => updateDayLog(selectedDate, [...dayLog, entry]);
  const removeEntry = (id) => updateDayLog(selectedDate, dayLog.filter((e) => e.id !== id));
  const setEntryServings = (id, servings) =>
    updateDayLog(selectedDate, dayLog.map((e) => (e.id === id ? { ...e, servings: Math.max(0.25, servings) } : e)));

  const [editingEntryId, setEditingEntryId] = useState(null);

  const addManualEntry = () => {
    if (!manualName) return;
    const hasNumbers = manualCal !== "";
    const newEntry = {
      id: editingEntryId || Date.now(),
      type: "manual",
      name: manualName,
      calories: Number(manualCal) || 0,
      protein: Number(manualProtein) || 0,
      carbs: Number(manualCarbs) || 0,
      fat: Number(manualFat) || 0,
      time: manualTime,
      quantified: hasNumbers,
    };
    if (editingEntryId) {
      updateDayLog(selectedDate, dayLog.map((e) => (e.id === editingEntryId ? newEntry : e)));
    } else {
      updateDayLog(selectedDate, [...dayLog, newEntry]);
    }
    setManualName(""); setManualCal(""); setManualProtein(""); setManualCarbs(""); setManualFat("");
    setManualTime(nowTimeStr());
    setManualOpen(false);
    setEditingEntryId(null);
  };

  const openEditManualEntry = (entry) => {
    setManualName(entry.name);
    setManualCal(entry.calories ? String(entry.calories) : "");
    setManualProtein(entry.protein ? String(entry.protein) : "");
    setManualCarbs(entry.carbs ? String(entry.carbs) : "");
    setManualFat(entry.fat ? String(entry.fat) : "");
    setManualTime(entry.time || nowTimeStr());
    setEditingEntryId(entry.id);
    setManualOpen(true);
  };

  const exportLogCSV = () => {
    const rows = [["Date", "Time", "Type", "Item", "Quantity", "Calories", "Protein (g)", "Carbs (g)", "Fat (g)", "Water (glasses)", "Day notes"]];
    const dates = Object.keys(logsByDate).sort();
    dates.forEach((date) => {
      const entries = logsByDate[date] || [];
      const notes = dayNotes?.[date] || "";
      const water = waterByDate?.[date];
      if (entries.length === 0 && !notes && !water) return;
      if (entries.length === 0) {
        rows.push([date, "", "", "", "", "", "", "", "", water || "", notes]);
        return;
      }
      entries.forEach((entry, i) => {
        const m = entryMacros(entry);
        const name = entry.type === "food" ? entry.food.name : entry.name;
        const qty =
          entry.type === "food" ? `${entry.grams}g` :
          entry.type === "manual" ? "manual entry" :
          `${entry.servings || 1}x serving`;
        const notYetQuantified = entry.type === "manual" && entry.quantified === false;
        rows.push([
          date, entry.time || "", entry.type, name, qty,
          notYetQuantified ? "not yet quantified" : round(m.calories),
          notYetQuantified ? "" : round(m.protein),
          notYetQuantified ? "" : round(m.carbs),
          notYetQuantified ? "" : round(m.fat),
          i === 0 ? (water || "") : "",
          i === 0 ? notes : "", // notes only on the first row of that day, to avoid repeating
        ]);
      });
    });
    const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `polar-endurance-food-log-${todayStr()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="pe-fadein px-4 pb-28 max-w-lg mx-auto pt-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="pe-display text-xl font-semibold" style={{ color: "#14403E" }}>Daily log</h2>
        <button
          className="pe-btn-secondary text-xs font-semibold px-3 py-1.5 rounded-full"
          onClick={exportLogCSV}
          title="Download your entire food log history as a spreadsheet (opens in Excel)"
        >
          ⬇ Export
        </button>
      </div>
      <p className="text-xs mb-4" style={{ color: "#948A78" }}>
        Log meals or individual foods and see them stack up against your daily target. Each day is saved separately.
      </p>

      <CoachWeekPlanCard onViewRecipe={onViewRecipe} />

      {coachFeedback[selectedDate] && (
        <div className="pe-card p-4 mb-4" style={{ background: "#EEF3EC" }}>
          <div className="pe-display text-sm font-semibold mb-1.5" style={{ color: "#4F6B41" }}>
            💬 Feedback from your coach
          </div>
          <p className="text-sm" style={{ color: "#40473F" }}>{coachFeedback[selectedDate]}</p>
        </div>
      )}

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
        <ProgressBar label="Energy" consumed={totals.calories} target={targets.calories} unit=" kcal" color="#E08D52" />
        <ProgressBar label="Protein" consumed={totals.protein} target={targets.protein} unit="g" color="#6FA968" />
        <ProgressBar label="Net Carbs" consumed={totals.carbs} target={targets.carbs} unit="g" color="#4FA3AC" />
        <ProgressBar label="Fat" consumed={totals.fat} target={targets.fat} unit="g" color="#A67FC0" />
      </div>

      <div className="pe-card p-4 mb-4">
        <div className="pe-display text-sm font-semibold mb-2" style={{ color: "#14403E" }}>💧 Water</div>
        <ProgressBar label="Glasses" consumed={waterByDate?.[selectedDate] || 0} target={8} unit="" color="#5B9BD5" />
        <div className="flex items-center gap-3 mt-2">
          <button
            className="pe-btn-secondary w-9 h-9 rounded-full text-lg font-bold flex items-center justify-center"
            onClick={() => updateWater(selectedDate, (waterByDate?.[selectedDate] || 0) - 1)}
          >
            −
          </button>
          <span className="text-xs flex-1 text-center" style={{ color: "#948A78" }}>
            Tap to log a glass as you drink it — roughly 8 x 250ml is a common everyday guideline, not a strict target.
          </span>
          <button
            className="pe-btn-primary w-9 h-9 rounded-full text-lg font-bold flex items-center justify-center"
            onClick={() => updateWater(selectedDate, (waterByDate?.[selectedDate] || 0) + 1)}
          >
            +
          </button>
        </div>
      </div>

      <div className="pe-card p-4 mb-4">
        <div className="pe-display text-sm font-semibold mb-1.5" style={{ color: "#14403E" }}>
          How are you feeling today?
        </div>
        <p className="text-xs mb-2" style={{ color: "#948A78" }}>
          Bloating, energy, digestion, mood — anything worth tracking alongside what you ate. Useful for spotting
          patterns over time, including with a coach or GP.
        </p>
        <textarea
          className="pe-input w-full px-3 py-2 text-sm"
          rows={3}
          placeholder="e.g. Felt bloated after lunch, low energy this afternoon..."
          value={dayNotes?.[selectedDate] || ""}
          onChange={(e) => updateDayNotes(selectedDate, e.target.value)}
        />
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
            <input
              type="time"
              className="pe-input px-2 py-2 text-sm"
              value={pendingTime}
              onChange={(e) => setPendingTime(e.target.value)}
            />
            <button className="pe-btn-primary px-4 py-2 rounded-full text-xs font-semibold" onClick={addFood}>
              {editingFoodEntryId ? "Save" : "Add"}
            </button>
            {editingFoodEntryId && (
              <button
                className="text-xs font-medium"
                style={{ color: "#948A78" }}
                onClick={() => { setPendingFood(null); setQuery(""); setPendingGrams(100); setEditingFoodEntryId(null); }}
              >
                Cancel
              </button>
            )}
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
            <div className="mb-3">
              <label className="block text-[10px] font-medium mb-1" style={{ color: "#948A78" }}>Time eaten</label>
              <input
                type="time"
                className="pe-input px-2 py-2 text-sm"
                value={manualTime}
                onChange={(e) => setManualTime(e.target.value)}
              />
            </div>
            <p className="text-[11px] mb-3" style={{ color: "#948A78" }}>
              Just tracking what you ate for now? Leave the numbers blank and add them later — useful if you're
              trying to spot which foods trigger something and don't want the calorie lookup to slow you down in
              the moment.
            </p>
            <button
              className="pe-btn-primary w-full py-2.5 rounded-full text-xs font-semibold"
              onClick={addManualEntry}
              disabled={!manualName}
              style={!manualName ? { opacity: 0.5 } : {}}
            >
              {editingEntryId ? "Save changes" : "Add to log"}
            </button>
            {editingEntryId && (
              <button
                className="w-full text-xs font-medium text-center mt-2"
                style={{ color: "#948A78" }}
                onClick={() => {
                  setManualName(""); setManualCal(""); setManualProtein(""); setManualCarbs(""); setManualFat("");
                  setManualTime(nowTimeStr());
                  setEditingEntryId(null);
                  setManualOpen(false);
                }}
              >
                Cancel
              </button>
            )}
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
                    {entry.type === "manual" && entry.quantified === false ? (
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="pe-mono text-xs" style={{ color: "#948A78" }}>
                          {entry.time && `${entry.time} · `}not yet quantified
                        </span>
                        <button
                          className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: "#F5DCC9", color: "#9C5527" }}
                          onClick={() => openEditManualEntry(entry)}
                        >
                          Add nutrition info
                        </button>
                      </div>
                    ) : (
                      <div className="pe-mono text-xs" style={{ color: "#948A78" }}>
                        {entry.time && `${entry.time} · `}
                        {entry.type === "food" && `${entry.grams}g · `}
                        {entry.type === "manual" && "manual entry · "}
                        {round(m.calories)} kcal · P{round(m.protein)} C{round(m.carbs)} F{round(m.fat)}
                        {entry.type === "manual" && (
                          <button
                            className="ml-2 underline decoration-dotted"
                            onClick={() => openEditManualEntry(entry)}
                          >
                            edit
                          </button>
                        )}
                        {entry.type === "food" && (
                          <button
                            className="ml-2 underline decoration-dotted"
                            onClick={() => openEditFoodEntry(entry)}
                          >
                            edit
                          </button>
                        )}
                      </div>
                    )}
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
  const [showCupboard, setShowCupboard] = useState(false);
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
            {item.recoveryDay && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#F5DCC9", color: "#9C5527" }}>
                🔥 RECOVERY DAY
              </span>
            )}
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
                {(item.extras || []).map((e, i) => (
                  <li key={i}>{e.food} — {round(e.grams)}g</li>
                ))}
                {item.vegText && (
                  <li className="text-[12px]" style={{ color: "#948A78" }}>Also: {item.vegText}</li>
                )}
              </>
            )}
            <li className="text-[12px]" style={{ color: "#948A78" }}>
              Plus: oil, salt, spices —{" "}
              <button
                className="underline decoration-dotted"
                onClick={(e) => { e.stopPropagation(); setShowCupboard((v) => !v); }}
              >
                see Store Cupboard
              </button>
            </li>
          </ul>
          {showCupboard && (
            <div className="rounded-lg p-3 mb-3" style={{ background: "#F5F4EE", border: "1px solid #E4E1D6" }}>
              <StoreCupboardList compact />
            </div>
          )}
          {macros.usesFixedProtein && macros.proteinTargetEquivalent && (
            <div className="rounded-lg p-3 mb-3 text-[12px]" style={{ background: "#FFF7ED", border: "1px solid #F5DCC9", color: "#9C5527" }}>
              <strong>Protein note:</strong> this recipe uses a normal serving of {item.proteinFood.toLowerCase()} ({round(macros.proteinPortion)}g),
              giving {round(macros.proteinG)}g protein. To get your full protein target for this meal from {item.proteinFood.toLowerCase()} alone,
              you'd need roughly {round(macros.proteinTargetEquivalent)}g — a genuinely unrealistic single portion. Pair this with an extra
              protein source (a shake, some Greek yoghurt, a couple of eggs) to close the gap, or treat this as a lighter meal within your day's total.
            </div>
          )}
          {macros.usesFixedCarb && macros.carbTargetEquivalent && (
            <div className="rounded-lg p-3 mb-3 text-[12px]" style={{ background: "#FFF7ED", border: "1px solid #F5DCC9", color: "#9C5527" }}>
              <strong>Carb note:</strong> this recipe uses a normal serving of {item.carbFood.toLowerCase()} ({round(macros.carbPortion)}g),
              giving {round(macros.carbG)}g carbs. {item.carbFood} is deliberately low in carbs, so hitting your full carb target from it
              alone would need roughly {round(macros.carbTargetEquivalent)}g — an unrealistic single portion, and it would also defeat the
              point of a lower-carb dish. If you need the rest of your carbs today, add them elsewhere in the day rather than to this meal.
            </div>
          )}
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
  const [recoveryDayOnly, setRecoveryDayOnly] = useState(false);
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
      if ((x.item.extras || []).some((e) => e.food.toLowerCase().includes(q))) return true;
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
      .filter((x) => !recoveryDayOnly || x.item.recoveryDay)
      .filter((x) => matchesTimeFilter(x.item, x.isFixed))
      .filter((x) => itemMatchesSearch(x, search));
  }, [isAll, section, targets, veggieOnly, glutenFreeOnly, dairyFreeOnly, recoveryDayOnly, search, timeFilter]);

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
          <button
            className={`pe-chip px-3 py-2 text-xs font-semibold ${recoveryDayOnly ? "active" : ""}`}
            onClick={() => setRecoveryDayOnly((v) => !v)}
            title="Big, tasty, carb-and-protein-forward meals for after a hard session — calories aren't the focus here"
          >
            🔥 Recovery day
          </button>
          {(veggieOnly || glutenFreeOnly || dairyFreeOnly || recoveryDayOnly || timeFilter !== "any" || search) && (
            <button
              className="pe-chip px-3 py-2 text-xs font-semibold"
              style={{ background: "#F5DCC9", color: "#9C5527" }}
              onClick={() => {
                setVeggieOnly(false);
                setGlutenFreeOnly(false);
                setDairyFreeOnly(false);
                setRecoveryDayOnly(false);
                setTimeFilter("any");
                setSearch("");
              }}
            >
              ✕ Reset all
            </button>
          )}
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
        (v.item.extras || []).forEach((e) => addQty(e.food, e.category, e.grams * v.qty));
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

  const [showCupboard, setShowCupboard] = useState(false);

  return (
    <div className="pe-fadein px-4 pb-28 max-w-lg mx-auto pt-4">
      <h2 className="pe-display text-xl font-semibold mb-1" style={{ color: "#14403E" }}>Shopping list</h2>
      <p className="text-xs mb-4" style={{ color: "#948A78" }}>
        Totals from everything in your order. Pantry basics (oil, salt, spices, sauces) aren't included — stock those separately.
      </p>

      <div className="pe-card p-4 mb-4">
        <button className="flex items-center justify-between w-full" onClick={() => setShowCupboard((v) => !v)}>
          <div className="pe-display text-sm font-semibold" style={{ color: "#14403E" }}>Store Cupboard Essentials</div>
          <span className="text-xs" style={{ color: "#948A78" }}>{showCupboard ? "Hide ▲" : "Show ▼"}</span>
        </button>
        {showCupboard && (
          <div className="pe-fadein mt-3">
            <StoreCupboardList />
          </div>
        )}
      </div>

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

function AthleteApp({ currentUserId, userEmail, onSignOut, coachId, onProfileRefresh }) {
  const [ready, setReady] = useState(false);
  const [hasOnboarded, setHasOnboarded] = useState(true); // default true so returning users never briefly see the first-run framing
  const [tab, setTab] = useState("setup");
  const [profile, setProfileState] = useState(DEFAULT_PROFILE);
  const [cart, setCartState] = useState({});
  const [logsByDate, setLogsByDate] = useState({});
  const [dayNotes, setDayNotes] = useState({});
  const [waterByDate, setWaterByDate] = useState({});
  const [checkedItems, setCheckedItemsState] = useState({});
  const [jumpTarget, setJumpTarget] = useState(null);
  const [orderHistory, setOrderHistory] = useState([]);
  const [hiddenItems, setHiddenItemsState] = useState({});
  const [syncStatus, setSyncStatus] = useState("idle"); // idle | syncing | synced | error
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const viewRecipe = useCallback((section, name) => {
    setJumpTarget({ section, name });
    setTab("browse");
  }, []);

  useEffect(() => {
    (async () => {
      setSyncUserId(currentUserId);
      if (currentUserId) {
        // If this device already has local data (has been used before), it may
        // hold changes made while offline that were never successfully pushed —
        // pulling first would silently overwrite and lose them. Push first to
        // make sure anything local is safely persisted, then only pull if this
        // is a genuinely fresh device with nothing local to protect yet.
        const hasLocalData = await loadStored("pe_onboarded", false);
        setSyncStatus("syncing");
        try {
          if (hasLocalData) {
            await pushUserData(currentUserId);
          } else {
            await pullUserData(currentUserId);
          }
          setSyncStatus("synced");
        } catch {
          setSyncStatus("error");
        }
      }
      const onboarded = await loadStored("pe_onboarded", false);
      const p = await loadStored("pe_profile", DEFAULT_PROFILE);
      const c = await loadStored("pe_cart", {});
      const l = await loadStored("pe_logs_by_date", {});
      const dn = await loadStored("pe_day_notes", {});
      const wt = await loadStored("pe_water_by_date", {});
      const ch = await loadStored("pe_checked_items", {});
      const oh = await loadStored("pe_order_history", []);
      const hi = await loadStored("pe_hidden_items", {});
      setProfileState(p);
      setCartState(c);
      setLogsByDate(l);
      setDayNotes(dn);
      setWaterByDate(wt);
      setCheckedItemsState(ch);
      setOrderHistory(oh);
      setHiddenItemsState(hi);
      setTab(onboarded ? "log" : "guide");
      setHasOnboarded(onboarded);
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

  const updateDayNotes = useCallback((date, text) => {
    setDayNotes((prev) => {
      const next = { ...prev, [date]: text };
      saveStored("pe_day_notes", next);
      return next;
    });
  }, []);

  const updateWater = useCallback((date, glasses) => {
    setWaterByDate((prev) => {
      const next = { ...prev, [date]: Math.max(0, glasses) };
      saveStored("pe_water_by_date", next);
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
        {!isOnline && (
          <div className="px-5 py-2 text-xs font-medium text-center" style={{ background: "#FFF7ED", color: "#9C5527", borderBottom: "1px solid #F5DCC9" }}>
            You're offline — everything you log is saved on this device and will sync automatically once you're back online.
          </div>
        )}
        {tab === "guide" && (
          <HelpGuideScreen
            isFirstRun={!hasOnboarded}
            onGetStarted={() => setTab("setup")}
          />
        )}
        {tab === "cooking" && <CookingGuideScreen />}
        {tab === "setup" && (
          <SetupScreen
            profile={profile}
            setProfile={setProfile}
            userEmail={userEmail}
            onSignOut={onSignOut}
            syncStatus={syncStatus}
            isOnline={isOnline}
            onOpenGuide={() => setTab("guide")}
            onOpenCookingGuide={() => setTab("cooking")}
            currentUserId={currentUserId}
            coachId={coachId}
            onProfileRefresh={onProfileRefresh}
          />
        )}
        {tab === "log" && <DailyLogScreen profile={profile} logsByDate={logsByDate} updateDayLog={updateDayLog} clearDayLog={clearDayLog} onViewRecipe={viewRecipe} dayNotes={dayNotes} updateDayNotes={updateDayNotes} waterByDate={waterByDate} updateWater={updateWater} />}
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
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  const loadSessionAndProfile = useCallback(async () => {
    setProfileError(false);
    const { data } = await supabase.auth.getSession();
    setSession(data.session || null);
    if (data.session) {
      setLoadingProfile(true);
      try {
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
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecovery(true);
        setSession(newSession);
        return;
      }
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
    setPasswordRecovery(false);
  };

  if (session === undefined) {
    return (
      <div className="pe-app flex items-center justify-center" style={{ minHeight: "100vh" }}>
        <div className="pe-mono text-sm" style={{ color: "#948A78" }}>Loading…</div>
      </div>
    );
  }

  if (passwordRecovery) {
    return (
      <ResetPasswordScreen
        onDone={() => {
          setPasswordRecovery(false);
          loadSessionAndProfile();
        }}
      />
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
    if (profile.is_super_admin) {
      return (
        <RootAdminOrCoach
          profile={profile}
          onSignOut={handleSignOut}
        />
      );
    }
    if (!profile.approved) {
      return <PendingApprovalScreen email={profile.email} onSignOut={handleSignOut} />;
    }
    return <CoachDashboard profile={profile} onSignOut={handleSignOut} />;
  }

  return (
    <AthleteApp
      currentUserId={session.user.id}
      userEmail={session.user.email}
      onSignOut={handleSignOut}
      coachId={profile.coach_id}
      onProfileRefresh={loadSessionAndProfile}
    />
  );
}

function RootAdminOrCoach({ profile, onSignOut }) {
  const [view, setView] = useState("admin"); // admin | coach
  if (view === "coach") {
    return <CoachDashboard profile={profile} onSignOut={onSignOut} onBackToAdmin={() => setView("admin")} />;
  }
  return (
    <AdminApprovals
      isAlsoCoach
      onOpenCoachDashboard={() => setView("coach")}
      onSignOut={onSignOut}
    />
  );
}
