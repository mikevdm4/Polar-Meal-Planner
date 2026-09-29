// Smoke + interaction test: mounts the real athlete app in a simulated browser, opens every screen, and
// actually uses the new features (quick add, favourites, copy yesterday, serving sizes, macro trends,
// weight tracking, account deletion) the way a person would.
//
// `npm run build` only catches syntax errors — a missing import or undefined variable only blows up when a
// screen actually renders, which is how a Settings crash once shipped. This catches that class of bug
// before deploy. Run everything with:  npm test
import { JSDOM } from "jsdom";
import fs from "fs";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const pad = (n) => String(n).padStart(2, "0");
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return fmt(d); };

const banana = { name: "Banana", kcal: 89, protein: 1.1, carb: 22.8, fat: 0.3 };
const chicken = { name: "Chicken breast (raw)", kcal: 110, protein: 23, carb: 0, fat: 1.5 };
const SEED_LOGS = {
  [daysAgo(1)]: [
    { id: 101, type: "food", food: banana, grams: 236, qty: 2, unitLabel: "medium", time: "08:00", mealType: "Breakfast" },
    { id: 102, type: "food", food: chicken, grams: 150, qty: 1, unitLabel: "medium fillet", time: "13:00", mealType: "Lunch" },
    { id: 103, type: "manual", name: "Protein shake", calories: 200, protein: 30, carbs: 8, fat: 3, quantified: true, time: "16:00", mealType: "Snack" },
  ],
  [daysAgo(2)]: [{ id: 104, type: "food", food: banana, grams: 118, time: "09:00", mealType: "Breakfast" }],
};

// Different account states a real user can be in — Settings renders different branches for each.
const SCENARIOS = {
  default: {
    coachId: null,
    profile: { bodyweight: 75, goal: "Fat Loss", structure: "Breakfast, Lunch & Dinner", adjustment: 0, snackCount: 0, snackPct: 5, mealPercents: null },
    suite: "features",
  },
  "coach linked + custom meal split + snacks": {
    coachId: "coach-123",
    profile: { bodyweight: 82, goal: "Muscle Gain", structure: "Lunch & Dinner", adjustment: 300, snackCount: 2, snackPct: 10, mealPercents: { Lunch: 40, Dinner: 40 } },
  },
  "meals-only, sparse profile": {
    coachId: null,
    profile: { bodyweight: 68, goal: "Maintenance", structure: "Meals Only" },
  },
  "coach views an athlete (synced data)": {
    component: "coach-summary",
    athleteData: {
      pe_profile: { bodyweight: 75, goal: "Fat Loss", structure: "Breakfast, Lunch & Dinner", adjustment: 0 },
      pe_logs_by_date: { [daysAgo(0)]: [{ id: 1, type: "food", food: banana, grams: 236, qty: 2, unitLabel: "medium", time: "08:00", mealType: "Breakfast" }] },
      pe_day_notes: { [daysAgo(0)]: "Felt great, lots of energy" },
      pe_water_by_date: { [daysAgo(0)]: 6 },
      pe_weight_log: [{ date: daysAgo(21), kg: 77.0 }, { date: daysAgo(14), kg: 76.4 }, { date: daysAgo(7), kg: 75.9 }, { date: daysAgo(0), kg: 75.2 }],
    },
  },
  "account deletion succeeds": {
    coachId: null,
    profile: { bodyweight: 75, goal: "Maintenance", structure: "Breakfast, Lunch & Dinner", adjustment: 0, snackCount: 0, snackPct: 5, mealPercents: null },
    deleteOk: true, suite: "delete",
  },
};

// No argument = run every scenario, each in its own fresh process (clean storage each time).
if (!process.argv[2]) {
  let failed = false;
  for (const name of Object.keys(SCENARIOS)) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), name], { stdio: "inherit" });
    if (r.status !== 0) failed = true;
  }
  console.log(failed ? "\nSMOKE TEST FAILED" : "\nAll smoke scenarios passed.");
  process.exit(failed ? 1 : 0);
}

const scenarioName = process.argv[2];
const scenario = SCENARIOS[scenarioName];
if (!scenario) { console.log("Unknown scenario", scenarioName); process.exit(1); }
console.log(`\n--- Scenario: ${scenarioName} ---`);

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', { url: "http://localhost/", pretendToBeVisual: true });
const { window } = dom;
const globals = {
  window, document: window.document, navigator: window.navigator,
  localStorage: window.localStorage, HTMLElement: window.HTMLElement,
  requestAnimationFrame: (cb) => setTimeout(cb, 0), cancelAnimationFrame: (id) => clearTimeout(id),
};
// Newer Node versions define some of these (e.g. navigator) as getter-only, so assign via defineProperty.
for (const [k, v] of Object.entries(globals)) Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });

// Network: everything fails (offline) except, in one scenario, the account-deletion call succeeding.
const OFF = "https://world.openfoodfacts.org/api/v2/product/";
const jsonRes = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const fakeFetch = (url) => {
  const u = String(url);
  if (scenario.deleteOk && u.includes("/rpc/delete_my_account")) return Promise.resolve(new Response(null, { status: 204 }));
  if (u.startsWith(OFF)) {
    // A tiny stand-in for the barcode database. Note the UPC only answers to its 13-digit (0-prefixed) form.
    const code = u.slice(OFF.length).replace(".json", "");
    if (code === "3017620422003") return Promise.resolve(jsonRes({ status: 1, product: { product_name: "Nutella", brands: "Ferrero", serving_quantity: 15, serving_size: "1 tbsp (15 g)", nutriments: { "energy-kcal_100g": 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9 } } }));
    if (code === "0737628064502") return Promise.resolve(jsonRes({ status: 1, product: { product_name: "Test UPC Bar", nutriments: { "energy-kcal_100g": 400, proteins_100g: 10, carbohydrates_100g: 50, fat_100g: 15 } } }));
    return Promise.resolve(jsonRes({ status: 0, status_verbose: "product not found" }, 404));
  }
  return Promise.resolve(jsonRes({ message: "offline" }, 500));
};
globalThis.fetch = fakeFetch; window.fetch = fakeFetch;

window.__TEST_COACH_ID__ = scenario.coachId;
window.__TEST_COMPONENT__ = scenario.component || "athlete-app";
window.__TEST_ATHLETE_DATA__ = scenario.athleteData || null;
window.localStorage.setItem("pe_onboarded", "true");
window.localStorage.setItem("pe_profile", JSON.stringify(scenario.profile));
window.localStorage.setItem("pe_logs_by_date", JSON.stringify(SEED_LOGS));

// Capture what "Export" writes (at the download step) so we can check its actual contents.
// The app runs in Node's own global scope here, so it's Node's URL/Blob we hook (not jsdom's).
URL.createObjectURL = (blob) => { globalThis.__lastBlob = blob; return "blob:test"; };
URL.revokeObjectURL = () => {};


class FakeImage extends window.EventTarget {
  constructor() { super(); this.naturalWidth = 800; this.naturalHeight = 1000; }
  set src(v) { this._src = v; setTimeout(() => { if (this.onload) this.onload(); }, 10); }
  get src() { return this._src; }
}
window.Image = FakeImage;
globalThis.Image = FakeImage;
globalThis.HTMLCanvasElement = window.HTMLCanvasElement;
// jsdom has no <canvas> support at all (getContext returns null) — stub just enough for preprocess() to run.
// The OCR result itself is already mocked above, so the actual pixel values drawn here don't matter.
window.HTMLCanvasElement.prototype.getContext = function () {
  const w = this.width, h = this.height;
  return {
    drawImage: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(w * h * 4).fill(200), width: w, height: h }),
    putImageData: () => {},
  };
};
const realError = console.error;
console.error = () => {}; // React logs expected noise for caught errors; we check the boundary instead
window.eval(fs.readFileSync("dist-test/test-bundle.js", "utf8"));

// ── helpers ──
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const buttons = () => [...document.querySelectorAll("button")];
const click = (pred) => { const b = buttons().find(pred); if (!b) return false; b.click(); return true; };
const body = () => document.body.textContent;
const setValue = (el, value) => {
  const proto = el.tagName === "SELECT" ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(new window.Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
};

function setFile(input, name = "label.jpg") {
  // jsdom doesn't implement DataTransfer/FileList construction, so fake a minimal array-like FileList.
  const file = new window.File(["fake-image-bytes"], name, { type: "image/jpeg" });
  const fileList = { 0: file, length: 1, item: (i) => (i === 0 ? file : null), [Symbol.iterator]: function* () { yield file; } };
  Object.defineProperty(input, "files", { value: fileList, configurable: true });
  input.dispatchEvent(new window.Event("change", { bubbles: true }));
}

const byPlaceholder = (sub) => [...document.querySelectorAll("input")].find((i) => (i.placeholder || "").includes(sub));
const stored = (k) => { try { return JSON.parse(window.localStorage.getItem(k)); } catch { return null; } };

const failures = [];
const crashed = () => !!document.getElementById("test-crashed");
async function visit(name, action, expectText) {
  const ok = action();
  await sleep(400);
  const hasText = !expectText || body().includes(expectText);
  if (!ok) failures.push(`${name}: couldn't find the button to open it`);
  else if (crashed()) failures.push(`${name}: CRASHED — ${window.__TEST_RESULTS__.error?.split("\n")[0]}`);
  else if (!hasText) failures.push(`${name}: opened but expected text "${expectText}" not shown`);
  console.log(`${crashed() || !ok || !hasText ? "FAIL" : "ok  "}  ${name}`);
}
async function check(name, fn) {
  let pass = false, why = "";
  try { const r = await fn(); pass = r === true || r === undefined; if (!pass) why = String(r); } catch (e) { why = e.message; }
  if (crashed()) { pass = false; why = `CRASHED — ${window.__TEST_RESULTS__.error?.split("\n")[0]}`; }
  console.log(`${pass ? "ok  " : "FAIL"}  ${name}${pass ? "" : "  → " + why}`);
  if (!pass) failures.push(`${name}: ${why}`);
}

await sleep(1200);
const nav = (label) => (b) => b.textContent.trim().endsWith(label) && b.className.includes("flex-col");
const moreItem = (label) => (b) => b.textContent.trim().endsWith(label) && b.className.includes("w-full");
const openMore = () => click((b) => b.textContent.includes("More") && b.className.includes("flex-col"));

// ── coach-side view of an athlete's synced data ──
if (scenario.component === "coach-summary") {
  await sleep(300);
  await check("Coach sees the athlete's weigh-in progress", () => {
    const t = body();
    return (t.includes("Weigh-ins:") && t.includes("75.2 kg") && t.includes("over 30 days") && t.includes("kg/week")) || `summary text: ${t.slice(0, 300)}`;
  });
  await check("Coach sees the athlete's day notes and water (they now sync)", () => {
    const t = body();
    return (t.includes("Felt great, lots of energy") && t.includes("💧6")) || "notes/water not shown to the coach";
  });
  await check("Coach summary shows serving amounts as logged", () => body().includes("2 × medium (236g)") || "serving amount missing");
  console.error = realError;
  if (failures.length) { console.log("\nSCENARIO FAILED:\n - " + failures.join("\n - ")); process.exit(1); }
  console.log("Scenario passed.");
  process.exit(0);
}

// ── every screen opens ──
await visit("Daily Log", () => click(nav("Daily Log")), "Daily log");
await visit("Recipes", () => click(nav("Recipes")));
await visit("Plan", () => click(nav("Plan")), "Plan your week");
await visit("Gym", () => click(nav("Gym")));
await visit("Weight (via More)", () => openMore() && click(moreItem("Weight")), "Log a weigh-in");
await visit("Order (via More)", () => openMore() && click(moreItem("Order")));
await visit("Shop (via More)", () => openMore() && click(moreItem("Shop")));
await visit("Setup (via More)", () => openMore() && click(moreItem("Setup")), "App version smoke-test");
await visit("Help & Guide", () => click((b) => b.textContent.includes("Help & Guide")), "Quick add");
await visit("Setup again", () => openMore() && click(moreItem("Setup")), "App version smoke-test");
await visit("Cooking Guide", () => click((b) => b.textContent.includes("Cooking Guide")));
await visit("Scan barcode (via More)", () => openMore() && click(moreItem("Scan a barcode")));
await sleep(200);
click((b) => b.textContent.trim() === "×" && b.className.includes("text-2xl")); // close the scanner overlay
await sleep(200);

// ── features, used the way a person would ──
if (scenario.suite === "features") {
  click(nav("Daily Log")); await sleep(300);
  const quickCard = () => [...document.querySelectorAll(".pe-card")].find((c) => c.textContent.includes("Quick add"));

  await check("Recent foods list what you logged before", () => {
    const t = quickCard()?.textContent || "";
    return (t.includes("Banana") && t.includes("Chicken breast") && t.includes("Protein shake")) || `card text was: ${t.slice(0, 200)}`;
  });
  await check("Recent shows the serving you used (2 × medium)", () => (quickCard()?.textContent || "").includes("2 × medium (236g)"));

  await check("One tap re-logs a recent food into today", async () => {
    if (body().includes("Today's log")) return "today unexpectedly already had entries";
    if (!click((b) => b.getAttribute("aria-label") === "Add again")) return "no + button found";
    await sleep(300);
    return body().includes("Today's log") || "nothing was added to today";
  });

  await check("Copy yesterday copies the whole day", async () => {
    if (!click((b) => b.textContent.includes("Copy yesterday"))) return "no copy button";
    await sleep(200);
    if (!click((b) => b.textContent.startsWith("Everything"))) return "no 'Everything' option";
    await sleep(300);
    return body().includes("Copied 3 items") || "no confirmation shown";
  });

  await check("Star saves a favourite and it persists", async () => {
    if (!click((b) => b.getAttribute("aria-label") === "Add to favourites")) return "no star in Quick add";
    await sleep(300);
    click((b) => b.textContent.startsWith("★ Favourites")); await sleep(200);
    const fav = stored("pe_favourites");
    return (Array.isArray(fav) && fav.length === 1 && (quickCard()?.textContent || "").includes("Remove") === false)
      || `pe_favourites was ${JSON.stringify(fav)?.slice(0, 120)}`;
  });

  await check("Typing a food offers everyday servings, defaulting to medium", async () => {
    const box = byPlaceholder("Search foods");
    if (!box) return "no food search box";
    setValue(box, "banana"); await sleep(250);
    if (!click((b) => b.textContent.startsWith("Banana") && b.textContent.includes("kcal/100g"))) return "Banana not in results";
    await sleep(250);
    const select = [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.textContent.includes("medium — 118g")));
    if (!select) return "no unit dropdown with 'medium — 118g'";
    if (select.value !== "medium") return `default unit was "${select.value}", expected medium`;
    return body().includes("= 118g") || "preview didn't show 118g";
  });

  await check("Finding a food opens a real popup, not an inline form", async () => {
    const overlay = document.querySelector('[data-testid="food-confirm-modal"]');
    if (!overlay) return "no popup backdrop found after picking a food";
    return overlay.textContent.includes("Banana") || `popup didn't contain "Banana"`;
  });
  await check("The popup is portalled to <body>, so it can't get trapped inside an animating ancestor card", () => {
    const overlay = document.querySelector('[data-testid="food-confirm-modal"]');
    return overlay?.parentElement === document.body || `popup's parent was ${overlay?.parentElement?.tagName}, expected BODY`;
  });
  await check("Changing the quantity updates grams and calories live", async () => {
    const qty = [...document.querySelectorAll("input")].find((i) => i.type === "number" && i.placeholder === "amount");
    setValue(qty, "2"); await sleep(250);
    return (body().includes("= 236g") && body().includes("210 kcal")) || "expected '= 236g' and '210 kcal'";
  });

  await check("Switching unit keeps the same real amount (2 medium → 236 g)", async () => {
    const select = [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.value === "medium"));
    setValue(select, "g"); await sleep(250);
    const qty = [...document.querySelectorAll("input")].find((i) => i.type === "number" && i.placeholder === "amount");
    if (qty.value !== "236") return `quantity became ${qty.value}`;
    setValue(select, "medium"); await sleep(250);
    return qty.value === "2" || `switching back gave ${qty.value}`;
  });

  await check("Adding it logs '2 × medium (236g)'", async () => {
    if (!click((b) => b.textContent.trim() === "Add to log")) return "no Add to log button";
    await sleep(300);
    const entries = stored("pe_logs_by_date")?.[daysAgo(0)] || [];
    const last = entries[entries.length - 1];
    return (last && last.grams === 236 && last.qty === 2 && last.unitLabel === "medium") || `saved entry: ${JSON.stringify(last)?.slice(0, 160)}`;
  });

  // ── barcode scanner: the camera can't run here, so this tests everything AROUND it ──
  const openScanner = async () => { await openMore(); await sleep(200); click(moreItem("Scan a barcode")); await sleep(500); };
  const typeNumber = async (n) => { setValue(byPlaceholder("type the number"), n); click((b) => b.textContent.trim() === "Look up"); await sleep(250); };

  await check("Scanner: explains why the camera can't start and offers a photo and a typed number", async () => {
    await openScanner();
    const msg = document.querySelector('[data-testid="camera-error"]')?.textContent || "";
    if (!msg.includes("can't access the camera")) return `camera message was "${msg}"`;
    if (!document.querySelector('[data-testid="barcode-photo-input"]')) return "no photo fallback";
    if (!byPlaceholder("type the number")) return "no typed-number fallback";
    return true;
  });
  await check("Scanner: a mistyped number is caught before any lookup", async () => {
    await typeNumber("123");
    if (!body().includes("8–14 digits")) return "no 'too short' message";
    await typeNumber("3017620422004");
    return body().includes("doesn't look right") || "no checksum message";
  });
  await check("Scanner: a valid number finds the product, defaults to its pack serving, and logs it", async () => {
    await typeNumber("3017620422003"); // (typeNumber already waits 250ms — the confirmation is on screen for 500ms)
    if (!body().includes("Barcode found")) return "no 'Barcode found' confirmation";
    await sleep(1000);
    if (!body().includes("Per 100g: 539 kcal")) return "product card didn't appear";
    if (!body().includes("Pack serving: 1 tbsp (15 g)")) return "pack serving not shown";
    if (!body().includes("= 15g")) return "didn't default to the 15g serving";
    click((b) => b.textContent.trim() === "Add to log"); await sleep(300);
    const entries = stored("pe_logs_by_date")?.[daysAgo(0)] || [];
    const last = entries[entries.length - 1];
    return (last && last.food.name.includes("Nutella") && last.grams === 15 && last.unitLabel === "serving") || `saved: ${JSON.stringify(last)?.slice(0, 160)}`;
  });
  await check("Scanner: a US (12-digit UPC) barcode is converted so it's found", async () => {
    await openScanner();
    await typeNumber("737628064502");
    await sleep(1200);
    const ok = body().includes("Test UPC Bar");
    click((b) => b.textContent.trim() === "Cancel"); await sleep(200);
    return ok || "UPC-A wasn't converted to the 13-digit form the database expects";
  });
  await check("Scanner: a product that isn't in the database says so, with the number and next steps", async () => {
    await openScanner();
    await typeNumber("5000159407236");
    await sleep(1200);
    const t = body();
    if (!t.includes("The barcode scanned fine (5000159407236)")) return "no 'scanned fine' message with the number";
    if (!t.includes("isn't in the Open Food Facts database yet")) return "no 'not in the database' wording";
    const link = [...document.querySelectorAll("a")].find((a) => (a.href || "").includes("product/5000159407236"));
    if (!link) return "no link to check/add it on Open Food Facts";
    return (t.includes("Try scanning again") && t.includes("Log manually instead")) || "recovery buttons missing";
  });

  await check("Trends switch between calories, protein, carbs and fat", async () => {
    for (const m of ["Protein", "Carbs", "Fat", "Calories"]) {
      if (!click((b) => b.textContent.trim() === m && b.className.includes("rounded-full"))) return `no ${m} button`;
      await sleep(200);
      if (!body().includes("Days within 10% of target")) return `${m} view didn't render its summary`;
    }
    return true;
  });

  await check("Scanner: 'More options' offers the label photo, food search, and manual entry — even before any error", async () => {
    await openScanner();
    if (body().includes("More options")) {
      // still scanning, no error — this is exactly the case the request was about
    } else {
      return "no 'More options' toggle while just scanning";
    }
    if (!click((b) => b.getAttribute("data-testid") === "more-options-toggle")) return "couldn't click the toggle";
    await sleep(200);
    const ok = body().includes("Photograph the nutrition label instead") && body().includes("Type in the meal name instead") && body().includes("Full manual entry");
    return ok || "one or more of the three options is missing";
  });
  await check("Scanner: 'Photograph the nutrition label instead' closes the scanner and opens the label photo screen", async () => {
    if (!click((b) => b.textContent.includes("Photograph the nutrition label instead"))) return "button not found";
    await sleep(300);
    return (document.querySelector('[data-testid="label-photo-input"]') && !document.querySelector('[data-testid="camera-view"]'))
      || "didn't hand off to the label scanner (or the barcode scanner is still open)";
  });
  await check("Scanner: 'Type in the meal name instead' closes the scanner and lands on food search", async () => {
    click((b) => b.textContent.trim() === "×" && b.className.includes("text-2xl")); await sleep(200); // close label scanner
    await openScanner();
    click((b) => b.getAttribute("data-testid") === "more-options-toggle"); await sleep(200);
    if (!click((b) => b.textContent.includes("Type in the meal name instead"))) return "button not found";
    await sleep(300);
    return (!document.querySelector('[data-testid="camera-view"]') && !!byPlaceholder("Search foods")) || "didn't land back on the food search box";
  });
  await check("Scanner: 'Full manual entry' closes the scanner and opens the manual-entry form", async () => {
    await openScanner();
    click((b) => b.getAttribute("data-testid") === "more-options-toggle"); await sleep(200);
    if (!click((b) => b.textContent.includes("Full manual entry"))) return "button not found";
    await sleep(300);
    return (!document.querySelector('[data-testid="camera-view"]') && body().includes("Time eaten")) || "manual entry form didn't open";
  });
  // Reset back to a clean Daily Log before the next block, which assumes nothing is left open.
  if (document.querySelector('[data-testid="camera-view"]')) click((b) => b.textContent.trim() === "×" && b.className.includes("text-2xl"));
  click((b) => b.textContent.includes("Log manually") && b.className.includes("w-full")); // collapses it back if still open
  await sleep(200);

  // ── nutrition-label photo scanning ──
  await check("Label scanner: opens from the barcode 'not found' screen and reads a photo", async () => {
    await openScanner();
    await typeNumber("5000159407236"); // seeded as "not found" earlier in this file
    await sleep(900);
    if (!click((b) => b.textContent.includes("Photo the nutrition label instead"))) return "no hand-off button from a failed barcode scan";
    await sleep(300);
    const fileInput = document.querySelector('[data-testid="label-photo-input"]');
    if (!fileInput) return "no photo input on the label scanner";
    setFile(fileInput);
    await sleep(600);
    // The mock resolves almost instantly (unlike real OCR), so check it got past reading rather than catching
    // that transient state — either outcome proves the read-a-photo pipeline actually ran.
    return (body().includes("Calories (per 100g)") || body().includes("Couldn't make out")) || "stuck, or crashed, reading the photo";
  });
  await check("Label scanner: shows the parsed values per 100g for checking, pre-filled from the photo", async () => {
    await sleep(600);
    const kcalBox = [...document.querySelectorAll("input")].find((i) => i.previousElementSibling?.textContent?.includes("Calories"));
    if (!kcalBox) return `no calories field — status text on screen: "${body().slice(0, 400)}"`;
    return (kcalBox.value === "378" && body().includes("Check each one against your photo")) || `kcal field was "${kcalBox?.value}"`;
  });
  await check("Label scanner: the person can correct a misread value before confirming", async () => {
    const proteinBox = [...document.querySelectorAll("input")].find((i) => i.previousElementSibling?.textContent?.includes("Protein"));
    setValue(proteinBox, "8.4");
    return proteinBox.value === "8.4" || "edited value didn't stick";
  });
  await check("Label scanner: confirming logs it through the normal food-entry flow (grams, time, meal)", async () => {
    if (!click((b) => b.textContent.trim() === "Use these values")) return "no confirm button";
    await sleep(300);
    if (!body().includes("Photographed label")) return "didn't hand off to the normal scanned-product confirmation card";
    click((b) => b.textContent.trim() === "Add to log"); await sleep(300);
    const entries = stored("pe_logs_by_date")?.[daysAgo(0)] || [];
    const last = entries.find((e) => e.food?.name === "Photographed label");
    return (last && last.food.protein === 8.4 && last.food.kcal === 378)
      || `saved entry: ${JSON.stringify(last)?.slice(0, 160)}`;
  });

  // ── weight ──
  await openMore(); await sleep(200); click(moreItem("Weight")); await sleep(300);
  await check("Weight: a bad value is rejected with a reload option", async () => {
    setValue(byPlaceholder("e.g. 75.4"), "5");
    click((b) => b.textContent.trim() === "Save weigh-in"); await sleep(250);
    return (body().includes("between 25 and 300") && body().includes("reload the app page")) || "no validation message";
  });
  await check("Weight: a weigh-in saves, shows in history and persists", async () => {
    setValue(byPlaceholder("e.g. 75.4"), "74.2");
    click((b) => b.textContent.trim() === "Save weigh-in"); await sleep(300);
    const log = stored("pe_weight_log");
    return (Array.isArray(log) && log.length === 1 && log[0].kg === 74.2 && body().includes("Saved 74.2 kg")) || `pe_weight_log = ${JSON.stringify(log)}`;
  });
  await check("Weight: offers to update targets when it drifts ≥0.5kg, and does so only on request", async () => {
    if (stored("pe_profile").bodyweight !== 75) return "profile changed on its own!";
    if (!click((b) => b.textContent.includes("Update my targets to 74.2 kg"))) return "no update button";
    await sleep(300);
    return String(stored("pe_profile").bodyweight) === "74.2" || `bodyweight is ${stored("pe_profile").bodyweight}`;
  });
  await check("Weight: two weigh-ins draw a chart and stats", async () => {
    setValue(byPlaceholder("e.g. 75.4"), "75.0");
    const dateBox = [...document.querySelectorAll("input")].find((i) => i.type === "date");
    setValue(dateBox, daysAgo(10));
    click((b) => b.textContent.trim() === "Save weigh-in"); await sleep(300);
    return (document.querySelector('svg[aria-label="Weight over time"]') && body().includes("Per week")) || "no chart rendered";
  });

  await check("Export contains serving amounts AND the weight log", async () => {
    click(nav("Daily Log")); await sleep(300);
    globalThis.__lastBlob = null;
    if (!click((b) => b.textContent.includes("Export"))) return "no Export button";
    await sleep(300);
    const csv = globalThis.__lastBlob ? await globalThis.__lastBlob.text() : "";
    return (csv.includes("2 × medium (236g)") && csv.includes("Weight log") && csv.includes("74.2")) || `CSV was: ${csv.slice(0, 200)}`;
  });

  // ── delete account: failure path must NOT wipe anything ──
  await openMore(); await sleep(200); click(moreItem("Setup")); await sleep(300);
  await check("Delete account: confirm button stays disabled until DELETE is typed", async () => {
    click((b) => b.textContent.includes("Delete my account")); await sleep(200);
    const confirm = buttons().find((b) => b.textContent.includes("Permanently delete my account"));
    if (!confirm || !confirm.disabled) return "confirm button missing or not disabled";
    setValue(byPlaceholder("DELETE"), "delete"); await sleep(200);
    return !buttons().find((b) => b.textContent.includes("Permanently delete my account")).disabled || "still disabled after typing DELETE";
  });
  await check("Delete account: a failed deletion shows an error and keeps your data", async () => {
    click((b) => b.textContent.includes("Permanently delete my account")); await sleep(600);
    return (body().includes("reload the app page") && stored("pe_profile") !== null && stored("pe_weight_log") !== null && !body().includes("has been deleted"))
      || "data was wiped or no error shown";
  });
}

if (scenario.suite === "delete") {
  await openMore(); await sleep(200); click(moreItem("Setup")); await sleep(300);
  await check("Delete account: success wipes local data and confirms", async () => {
    click((b) => b.textContent.includes("Delete my account")); await sleep(200);
    setValue(byPlaceholder("DELETE"), "DELETE"); await sleep(200);
    click((b) => b.textContent.includes("Permanently delete my account")); await sleep(800);
    return (body().includes("Your account has been deleted") && stored("pe_profile") === null && stored("pe_logs_by_date") === null)
      || `message shown: ${body().includes("has been deleted")}, profile left: ${stored("pe_profile") !== null}`;
  });
}

console.error = realError;
if (failures.length) {
  console.log("\nSCENARIO FAILED:\n - " + failures.join("\n - "));
  process.exit(1);
}
console.log("Scenario passed.");
process.exit(0);
