import { supabase } from "./supabaseClient.js";

const ALL_KEYS = [
  "pe_profile",
  "pe_cart",
  "pe_logs_by_date",
  "pe_checked_items",
  "pe_order_history",
  "pe_hidden_items",
  "pe_onboarded",
];

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
export function schedulePushUserData(userId, delayMs = 1500) {
  if (!userId) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushUserData(userId).catch(() => {
      // Background sync failure is non-fatal — localStorage already has
      // the authoritative local copy, and the next save retries.
    });
  }, delayMs);
}
