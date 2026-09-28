import React from "react";

// Every user-facing error message goes through this so there's always a
// one-tap way out ("reload the app page") instead of leaving someone stuck
// staring at a message with nothing to do about it.
export function ReloadButton({ color = "#B5652F" }) {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
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
