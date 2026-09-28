// Smoke test: mounts the real athlete app in jsdom and opens every screen.
// `npm run build` only catches syntax errors — a missing import or undefined
// variable only blows up when a screen actually renders, which is how a
// Settings crash once shipped. This catches that class of bug before deploy.
import { JSDOM } from "jsdom";
import fs from "fs";

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
  url: "http://localhost/", pretendToBeVisual: true,
});
const { window } = dom;
const globals = {
  window, document: window.document, navigator: window.navigator,
  localStorage: window.localStorage, HTMLElement: window.HTMLElement,
  requestAnimationFrame: (cb) => setTimeout(cb, 0), cancelAnimationFrame: (id) => clearTimeout(id),
};
// Newer Node versions define some of these (e.g. navigator) as getter-only, so assign via defineProperty.
for (const [k, v] of Object.entries(globals)) {
  Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
}
const fakeFetch = () => Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
globalThis.fetch = fakeFetch; window.fetch = fakeFetch;

window.localStorage.setItem("pe_onboarded", "true");
window.localStorage.setItem("pe_profile", JSON.stringify({
  bodyweight: 75, goal: "Fat Loss", structure: "Breakfast, Lunch & Dinner",
  adjustment: 0, snackCount: 0, snackPct: 5, mealPercents: null,
}));

const realError = console.error;
console.error = () => {}; // React logs expected noise for caught errors; we check the boundary instead
window.eval(fs.readFileSync("dist-test/test-bundle.js", "utf8"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const buttons = () => [...document.querySelectorAll("button")];
const click = (pred) => { const b = buttons().find(pred); if (!b) return false; b.click(); return true; };

const failures = [];
async function visit(name, action, expectText) {
  const ok = action();
  await sleep(400);
  const crashed = !!document.getElementById("test-crashed");
  const hasText = !expectText || document.body.textContent.includes(expectText);
  if (!ok) failures.push(`${name}: couldn't find the button to open it`);
  else if (crashed) failures.push(`${name}: CRASHED — ${window.__TEST_RESULTS__.error?.split("\n")[0]}`);
  else if (!hasText) failures.push(`${name}: opened but expected text "${expectText}" not shown`);
  console.log(`${crashed || !ok || !hasText ? "FAIL" : "ok  "}  ${name}`);
}

await sleep(1200);
const nav = (label) => (b) => b.textContent.trim().endsWith(label) && b.className.includes("flex-col");
const moreItem = (label) => (b) => b.textContent.trim().endsWith(label) && b.className.includes("w-full");
const openMore = () => click((b) => b.textContent.includes("More") && b.className.includes("flex-col"));

await visit("Daily Log", () => click(nav("Daily Log")), "Daily log");
await visit("Recipes", () => click(nav("Recipes")));
await visit("Plan", () => click(nav("Plan")), "Plan your week");
await visit("Gym", () => click(nav("Gym")));
await visit("Order (via More)", () => openMore() && click(moreItem("Order")));
await visit("Shop (via More)", () => openMore() && click(moreItem("Shop")));
await visit("Setup (via More)", () => openMore() && click(moreItem("Setup")), "Meal distribution");
await visit("Help & Guide", () => click((b) => b.textContent.includes("Help & Guide")));
await visit("Setup again", () => openMore() && click(moreItem("Setup")), "Meal distribution");
await visit("Cooking Guide", () => click((b) => b.textContent.includes("Cooking Guide")));
await visit("Scan barcode (via More)", () => openMore() && click(moreItem("Scan a barcode")));

console.error = realError;
if (failures.length) {
  console.log("\nSMOKE TEST FAILED:\n - " + failures.join("\n - "));
  process.exit(1);
}
console.log("\nSmoke test passed — every screen opened without crashing.");
process.exit(0);
