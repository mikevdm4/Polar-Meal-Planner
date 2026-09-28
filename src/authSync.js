import { supabase } from "./supabaseClient.js";

// Everything the app saves to this device lives under the "pe_" prefix, and everything under that prefix
// syncs. This used to be a hand-written list of keys, which meant every new feature that saved something
// new (day notes, water, the weekly planner…) silently never synced unless someone remembered to add it.
// Prefix-based means a new feature can't forget.
export const SYNC_PREFIX = "pe_";

function localSyncKeys() {
  const keys = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k && k.startsWith(SYNC_PREFIX)) keys.push(k);
  }
  return keys;
}

function readAllLocal() {
  const bundle = {};
  localSyncKeys().forEach((k) => {
    try {
      bundle[k] = JSON.parse(window.localStorage.getItem(k));
    } catch {
      // unreadable value — leave it out rather than upload garbage
    }
  });
  return bundle;
}

function writeAllLocal(bundle) {
  Object.entries(bundle || {}).forEach(([k, v]) => {
    if (k.startsWith(SYNC_PREFIX) && v !== undefined && v !== null) {
      try {
        window.localStorage.setItem(k, JSON.stringify(v));
      } catch {}
    }
  });
}

// Wipe everything this app stored on the device (used when an account is deleted).
export function clearLocalAppData() {
  localSyncKeys().forEach((k) => {
    try { window.localStorage.removeItem(k); } catch {}
  });
}

// Pull this user's saved data down from Supabase and use it to populate
// local storage, so the rest of the app (which reads from localStorage)
// picks it up transparently. Called once right after login.
export async function pullUserData(userId) {
  const { data, error } = await supabase
    .from("athlete_data")
    .select("data")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (data?.data) writeAllLocal(data.data);
  return data?.data || null;
}

export async function pushUserData(userId) {
  const bundle = readAllLocal();
  const { error } = await supabase
    .from("athlete_data")
    .upsert({ user_id: userId, data: bundle, updated_at: new Date().toISOString() });
  if (error) throw error;
}

let pushTimer = null;
let lastFailedUserId = null;

// If a push failed (most likely because the device was offline), retry the
// moment the browser regains connectivity — otherwise that data only syncs
// on the next unrelated change, which may never come.
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    if (lastFailedUserId) {
      const userId = lastFailedUserId;
      pushUserData(userId)
        .then(() => { lastFailedUserId = null; })
        .catch(() => { lastFailedUserId = userId; });
    }
  });
}

export function schedulePushUserData(userId, delayMs = 1500) {
  if (!userId) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushUserData(userId)
      .then(() => { lastFailedUserId = null; })
      .catch(() => {
        // Local storage already holds the authoritative copy — nothing is
        // lost — but remember this so the "online" listener above can
        // retry automatically once connectivity returns.
        lastFailedUserId = userId;
      });
  }, delayMs);
}
