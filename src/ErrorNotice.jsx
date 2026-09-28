import React from "react";

// Every user-facing error message goes through this so there's always a
// one-tap way out ("reload the app page") instead of leaving someone stuck
// staring at a message with nothing to do about it.
// The build stamp injected by vite.config.js (falls back to "dev" when running unbundled).
export const APP_VERSION = typeof __APP_BUILD__ !== "undefined" ? __APP_BUILD__ : "dev";

// A plain reload can keep serving a stale cached copy of the app. This clears the
// service-worker cache and unregisters it first, so the reload pulls the latest deploy.
export async function hardReload() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch (e) {
    // Clearing caches is best-effort — still reload even if it fails.
  }
  window.location.reload();
}

export function ReloadButton({ color = "#B5652F" }) {
  return (
    <button
      type="button"
      onClick={hardReload}
      className="underline font-semibold"
      style={{ color, background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit" }}
    >
      reload the app page
    </button>
  );
}

export function ErrorNotice({ children, className = "", center = false }) {
  return (
    <p className={`text-xs ${className}`} style={{ color: "#B5652F", textAlign: center ? "center" : undefined }}>
      {children} If this keeps happening, <ReloadButton />.
    </p>
  );
}
