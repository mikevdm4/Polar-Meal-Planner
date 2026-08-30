// Cloud sync layer. Works entirely on top of the existing localStorage
// behaviour: if the person never sets up a sync code, nothing changes and
// the app behaves exactly as before (device-local only). Once a code is
// set, every save also pushes to the cloud, and app startup pulls the
// latest cloud copy down first.

const SYNC_CODE_KEY = "pe_sync_code";
const ALL_KEYS = [
  "pe_profile",
  "pe_cart",
  "pe_logs_by_date",
  "pe_checked_items",
  "pe_order_history",
  "pe_hidden_items",
  "pe_onboarded",
];

export function getSyncCode() {
  try {
    return window.localStorage.getItem(SYNC_CODE_KEY) || null;
  } catch {
    return null;
  }
}

export function setSyncCode(code) {
  try {
    if (code) window.localStorage.setItem(SYNC_CODE_KEY, code);
    else window.localStorage.removeItem(SYNC_CODE_KEY);
  } catch {}
}

export function generateSyncCode() {
  // 8 chars, unambiguous alphabet (no 0/O/1/I) — easy to read aloud or type on a phone
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

function readAllLocal() {
  const bundle = {};
  ALL_KEYS.forEach((k) => {
    try {
      const raw = window.localStorage.getItem(k);
      bundle[k] = raw !== null ? JSON.parse(raw) : null;
    } catch {
      bundle[k] = null;
    }
  });
  return bundle;
}

function writeAllLocal(bundle) {
  ALL_KEYS.forEach((k) => {
    if (bundle[k] !== undefined && bundle[k] !== null) {
      try {
        window.localStorage.setItem(k, JSON.stringify(bundle[k]));
      } catch {}
    }
  });
}

// Pull the cloud copy down and overwrite local storage with it.
// Called once when a sync code is entered/loaded on a device.
export async function pullFromCloud(code) {
  const res = await fetch(`/api/sync?code=${encodeURIComponent(code)}`);
  if (!res.ok) throw new Error("Could not reach sync server");
  const json = await res.json();
  if (json.data) writeAllLocal(json.data);
  return json.data;
}

// Push everything currently in local storage up to the cloud.
// Debounced by the caller — don't call this on every keystroke.
export async function pushToCloud(code) {
  const bundle = readAllLocal();
  const res = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, data: bundle }),
  });
  if (!res.ok) throw new Error("Could not reach sync server");
  return res.json();
}

let pushTimer = null;
export function schedulePush(code, delayMs = 1500) {
  if (!code) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushToCloud(code).catch(() => {
      // Silent failure is intentional here — sync is a background
      // convenience; localStorage already has the authoritative copy
      // and the next successful save will retry.
    });
  }, delayMs);
}
