// Opens Settings (and a few neighbours) under many different account setups,
// because a screen that renders fine for one tidy profile can still crash for
// another (linked coach, custom meal splits, snacks, half-empty profile...).
import { JSDOM } from "jsdom";
import fs from "fs";

const BUNDLE = fs.readFileSync("dist-test/test-bundle.js", "utf8");
const base = { bodyweight: 75, goal: "Fat Loss", structure: "Breakfast, Lunch & Dinner", adjustment: 0, snackCount: 0, snackPct: 5, mealPercents: null };

const SCENARIOS = {
  "standard profile": { profile: base },
  "lunch & dinner structure": { profile: { ...base, structure: "Lunch & Dinner" } },
  "meals only structure": { profile: { ...base, structure: "Meals Only" } },
  "custom meal split": { profile: { ...base, mealPercents: { Breakfast: 20, Lunch: 35, Dinner: 45 } } },
  "custom split, lunch & dinner": { profile: { ...base, structure: "Lunch & Dinner", mealPercents: { Lunch: 40, Dinner: 60 } } },
  "with snacks": { profile: { ...base, snackCount: 2, snackPct: 8 } },
  "snacks stored as strings": { profile: { ...base, snackCount: "2", snackPct: "8", bodyweight: "82" } },
  "muscle gain + calorie adjustment": { profile: { ...base, goal: "Muscle Gain", adjustment: 300 } },
  "maintenance goal": { profile: { ...base, goal: "Maintenance" } },
  "empty profile object": { profile: {} },
  "profile missing structure": { profile: { bodyweight: 70, goal: "Fat Loss" } },
  "profile with unknown structure text": { profile: { ...base, structure: "Something Old" } },
  "no profile at all": { profile: null },
  "linked coach": { profile: base, props: { coachId: "coach-123" } },
  "custom split + linked coach + snacks": { profile: { ...base, mealPercents: { Breakfast: 25, Lunch: 30, Dinner: 35 }, snackCount: 1, snackPct: 10 }, props: { coachId: "coach-123" } },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(name, { profile, props }) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', { url: "http://localhost/", pretendToBeVisual: true });
  const { window } = dom;
  const g = {
    window, document: window.document, navigator: window.navigator, localStorage: window.localStorage,
    HTMLElement: window.HTMLElement, requestAnimationFrame: (cb) => setTimeout(cb, 0), cancelAnimationFrame: (i) => clearTimeout(i),
  };
  for (const [k, v] of Object.entries(g)) Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  const ff = () => Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
  globalThis.fetch = ff; window.fetch = ff;
  window.localStorage.setItem("pe_onboarded", "true");
  if (profile !== null) window.localStorage.setItem("pe_profile", JSON.stringify(profile));
  window.__TEST_PROPS__ = props || {};
  window.eval(BUNDLE);
  await sleep(1200);

  const btns = () => [...document.querySelectorAll("button")];
  const find = (label, cls) => btns().find((b) => b.textContent.trim().endsWith(label) && b.className.includes(cls));
  const problems = [];
  const check = async (step, fn) => {
    const ok = fn();
    await sleep(350);
    if (!ok) problems.push(`${step}: button not found`);
    else if (document.getElementById("test-crashed")) problems.push(`${step}: CRASHED — ${window.__TEST_RESULTS__.error?.split("\n")[0]}`);
  };
  await check("open More", () => { const b = btns().find((x) => x.textContent.includes("More") && x.className.includes("flex-col")); b?.click(); return !!b; });
  await check("open Setup", () => { const b = find("Setup", "w-full"); b?.click(); return !!b; });
  if (!problems.length && !document.body.textContent.includes("Meal distribution")) problems.push("Setup opened but content missing");
  if (!problems.length) {
    // Poke the interactive bits inside Settings too
    await check("toggle Password & Email", () => { const b = btns().find((x) => x.textContent.includes("Password")); b?.click(); return true; });
    await check("open Help & Guide", () => { const b = btns().find((x) => x.textContent.includes("Help & Guide")); b?.click(); return !!b; });
  }
  window.close();
  return problems;
}

const realErr = console.error; console.error = () => {};
let failed = 0;
for (const [name, cfg] of Object.entries(SCENARIOS)) {
  const problems = await run(name, cfg);
  console.error = realErr;
  console.log(`${problems.length ? "FAIL" : "ok  "}  ${name}${problems.length ? "\n        - " + problems.join("\n        - ") : ""}`);
  console.error = () => {};
  if (problems.length) failed++;
}
console.error = realErr;
console.log(failed ? `\n${failed} scenario(s) failed.` : "\nAll scenarios passed.");
process.exit(failed ? 1 : 0);
