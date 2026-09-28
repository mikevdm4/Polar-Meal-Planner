import React, { useState } from "react";

// Recent + Favourites one-tap re-logging, and "copy yesterday".
export function QuickAddCard({
  recents, favourites, describe, onAdd, onToggleFavourite, isFavourite,
  copyGroups, copySourceLabel, onCopy, copyNotice,
}) {
  const [tab, setTab] = useState("recent");
  const [copyOpen, setCopyOpen] = useState(false);
  const list = tab === "recent" ? recents : favourites;
  const totalYesterday = copyGroups.reduce((n, g) => n + g.count, 0);

  return (
    <div className="pe-card p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="pe-display text-sm font-semibold" style={{ color: "#14403E" }}>Quick add</div>
        <button
          className="pe-btn-secondary text-xs font-semibold px-3 py-1.5 rounded-full"
          onClick={() => setCopyOpen((o) => !o)}
          disabled={totalYesterday === 0}
          style={totalYesterday === 0 ? { opacity: 0.5 } : undefined}
          title={totalYesterday === 0 ? "Nothing was logged the day before" : ""}
        >
          📋 Copy {copySourceLabel}
        </button>
      </div>

      {copyOpen && totalYesterday > 0 && (
        <div className="pe-fadein rounded-lg p-3 mb-3" style={{ background: "#F5F4EE", border: "1px solid #E4E1D6" }}>
          <div className="text-xs mb-2" style={{ color: "#6B6355" }}>Copy from {copySourceLabel} into this day:</div>
          <div className="flex flex-wrap gap-2">
            <button className="pe-btn-primary text-xs font-semibold px-3 py-1.5 rounded-full" onClick={() => { onCopy(null); setCopyOpen(false); }}>
              Everything ({totalYesterday})
            </button>
            {copyGroups.map((g) => (
              <button key={g.label} className="pe-btn-secondary text-xs font-semibold px-3 py-1.5 rounded-full" onClick={() => { onCopy(g.label); setCopyOpen(false); }}>
                {g.label} ({g.count})
              </button>
            ))}
          </div>
        </div>
      )}
      {copyNotice && <p className="text-xs mb-2 font-semibold" style={{ color: "#4F6B41" }}>{copyNotice}</p>}

      <div className="flex gap-2 mb-2">
        {[["recent", "Recent"], ["favourites", `★ Favourites${favourites.length ? ` (${favourites.length})` : ""}`]].map(([k, label]) => (
          <button
            key={k}
            className="text-xs font-semibold px-3 py-1 rounded-full"
            style={tab === k ? { background: "#14403E", color: "#fff" } : { background: "#EDE9DD", color: "#14403E" }}
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="text-xs" style={{ color: "#948A78" }}>
          {tab === "recent"
            ? "Foods and meals you log will appear here so you can add them again in one tap."
            : "Tap the ☆ next to anything you've logged to keep it here permanently."}
        </p>
      ) : (
        <div>
          {list.map((item, i) => (
            <div key={item.key} className="flex items-center gap-2 py-2" style={{ borderTop: i ? "1px solid #EFEBE0" : "none" }}>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{describe(item.entry).name}</div>
                <div className="pe-mono text-[11px] truncate" style={{ color: "#948A78" }}>{describe(item.entry).detail}</div>
              </div>
              <button
                className="text-lg px-1 shrink-0"
                style={{ color: isFavourite(item.key) ? "#D9A21B" : "#B8B2A0" }}
                onClick={() => onToggleFavourite(item.entry)}
                aria-label={isFavourite(item.key) ? "Remove from favourites" : "Add to favourites"}
              >
                {isFavourite(item.key) ? "★" : "☆"}
              </button>
              <button className="pe-btn-primary w-8 h-8 rounded-full text-lg font-bold shrink-0 flex items-center justify-center" onClick={() => onAdd(item.entry)} aria-label="Add again">
                +
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
