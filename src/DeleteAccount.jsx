import React, { useState } from "react";
import { deleteMyAccount } from "./auth.js";
import { clearLocalAppData } from "./authSync.js";
import { ErrorNotice } from "./ErrorNotice.jsx";

// In-app account deletion. Apple requires this for any app that lets people create an account, and it
// has to be reachable inside the app (not "email us"). Deliberately needs a typed confirmation.
export function DeleteAccountCard({ isCoach = false }) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [status, setStatus] = useState(""); // "" | "deleting" | "done" | "error"
  const [error, setError] = useState("");
  const ready = confirmText.trim().toUpperCase() === "DELETE" && status !== "deleting";

  const run = async () => {
    setStatus("deleting"); setError("");
    try {
      await deleteMyAccount();
      clearLocalAppData();
      setStatus("done");
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      setStatus("error"); setError(e.message || "Couldn't delete the account.");
    }
  };

  if (status === "done") {
    return (
      <div className="pe-card p-4 mt-4 text-center">
        <div className="text-sm font-semibold" style={{ color: "#14403E" }}>Your account has been deleted.</div>
        <div className="text-xs mt-1" style={{ color: "#948A78" }}>Taking you back to the start…</div>
      </div>
    );
  }

  return (
    <div className="pe-card p-4 mt-4" style={{ borderColor: "#F0D2C2" }}>
      <button className="flex items-center justify-between w-full" onClick={() => setOpen((o) => !o)}>
        <div className="pe-display text-sm font-semibold" style={{ color: "#9C3B27" }}>Delete my account</div>
        <span className="text-xs" style={{ color: "#948A78" }}>{open ? "Hide ▲" : "Show ▼"}</span>
      </button>
      {open && (
        <div className="pe-fadein mt-3">
          <p className="text-xs mb-2" style={{ color: "#40473F" }}>
            This permanently deletes your login and everything stored with it: your profile, food log, water and weight
            history, notes, saved favourites, weekly plans and orders{isCoach ? ", and your coach account" : ""}. It can't be undone.
          </p>
          {isCoach ? (
            <p className="text-xs mb-2" style={{ color: "#40473F" }}>
              Athletes linked to you keep their own accounts, but lose the link to you.
            </p>
          ) : (
            <p className="text-xs mb-2" style={{ color: "#40473F" }}>
              Your coach (if you have one) will no longer be able to see your data. If you'd like a copy first, use
              <strong> ⬇ Export</strong> on the Daily Log screen before deleting.
            </p>
          )}
          <label className="block text-[11px] font-medium mb-1" style={{ color: "#948A78" }}>
            Type DELETE to confirm
          </label>
          <input
            className="pe-input w-full px-3 py-2 text-sm mb-2"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoCapitalize="characters" autoComplete="off"
            placeholder="DELETE"
          />
          <button
            className="w-full py-2.5 rounded-full text-sm font-semibold"
            style={{ background: ready ? "#B5341F" : "#EBD9D2", color: ready ? "#fff" : "#B59A90", cursor: ready ? "pointer" : "not-allowed" }}
            disabled={!ready}
            onClick={run}
          >
            {status === "deleting" ? "Deleting…" : "Permanently delete my account"}
          </button>
          {status === "error" && <ErrorNotice className="mt-2">{error}</ErrorNotice>}
        </div>
      )}
    </div>
  );
}
