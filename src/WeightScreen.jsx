import React, { useMemo, useState } from "react";
import { ErrorNotice } from "./ErrorNotice.jsx";
import { formatDate, parseDate, movingAverage, weeklyRate, weightInRange } from "./logHelpers.js";

const RANGES = [["30", "30 days", 30], ["90", "90 days", 90], ["all", "All", 0]];

function niceDate(str) {
  return parseDate(str).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function WeightScreen({ weightLog, onAdd, onDelete, profile, onUseBodyweight }) {
  const today = formatDate(new Date());
  const [date, setDate] = useState(today);
  const [kg, setKg] = useState("");
  const [range, setRange] = useState("90");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const days = RANGES.find((r) => r[0] === range)[2];
  const visible = useMemo(() => weightInRange(weightLog, today, days), [weightLog, today, days]);
  const avg = useMemo(() => movingAverage(weightLog, 7).filter((p) => visible.some((v) => v.date === p.date)), [weightLog, visible]);
  const rate = weeklyRate(visible);
  const latest = weightLog.length ? weightLog[weightLog.length - 1] : null;
  const first = visible.length ? visible[0] : null;
  const change = latest && first && visible.length > 1 ? latest.kg - first.kg : null;
  const profileKg = Number(profile.bodyweight) || 0;
  const targetsOutOfSync = latest && Math.abs(latest.kg - profileKg) >= 0.5;

  const save = () => {
    setError(""); setSaved("");
    const value = Number(String(kg).replace(",", "."));
    if (!(value >= 25 && value <= 300)) { setError("Enter your weight in kilograms (between 25 and 300)."); return; }
    if (date > today) { setError("That date is in the future."); return; }
    onAdd(date, Math.round(value * 10) / 10);
    setKg(""); setSaved(`Saved ${Math.round(value * 10) / 10} kg for ${niceDate(date)}.`);
  };

  // ── chart ──
  const W = 320, H = 150, L = 34, R = 8, T = 8, B = 18;
  const pts = visible;
  let chart = null;
  if (pts.length >= 1) {
    const ys = [...pts.map((p) => p.kg), ...avg.map((p) => p.kg)];
    let lo = Math.min(...ys) - 0.5, hi = Math.max(...ys) + 0.5;
    if (hi - lo < 2) { const mid = (hi + lo) / 2; lo = mid - 1; hi = mid + 1; }
    const t0 = parseDate(pts[0].date).getTime();
    const t1 = parseDate(pts[pts.length - 1].date).getTime();
    const span = Math.max(t1 - t0, 1);
    const x = (d) => (pts.length === 1 ? L + (W - L - R) / 2 : L + ((parseDate(d).getTime() - t0) / span) * (W - L - R));
    const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const line = (arr) => arr.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.kg).toFixed(1)}`).join(" ");
    chart = (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 170 }} role="img" aria-label="Weight over time">
        <text x={L - 4} y={y(hi) + 3} fontSize="9" textAnchor="end" fill="#948A78">{hi.toFixed(1)}</text>
        <text x={L - 4} y={y(lo) + 3} fontSize="9" textAnchor="end" fill="#948A78">{lo.toFixed(1)}</text>
        <line x1={L} x2={W - R} y1={y(lo)} y2={y(lo)} stroke="#E4E1D6" />
        <line x1={L} x2={W - R} y1={y(hi)} y2={y(hi)} stroke="#EFEBE0" />
        {pts.length > 1 && <path d={line(pts)} fill="none" stroke="#C9D8D2" strokeWidth="1.5" />}
        {avg.length > 1 && <path d={line(avg)} fill="none" stroke="#14403E" strokeWidth="2.5" strokeLinecap="round" />}
        {pts.map((p) => <circle key={p.date} cx={x(p.date)} cy={y(p.kg)} r="2.6" fill="#14403E" opacity="0.55" />)}
        <text x={L} y={H - 4} fontSize="9" fill="#948A78">{niceDate(pts[0].date)}</text>
        <text x={W - R} y={H - 4} fontSize="9" textAnchor="end" fill="#948A78">{niceDate(pts[pts.length - 1].date)}</text>
      </svg>
    );
  }

  const fmtSigned = (n) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}`;

  return (
    <div className="pe-fadein px-4 pb-28 max-w-lg mx-auto pt-4">
      <h2 className="pe-display text-xl font-semibold mb-1" style={{ color: "#14403E" }}>Weight</h2>
      <p className="text-xs mb-4" style={{ color: "#948A78" }}>
        Weigh in whenever suits you — same time of day works best. Day-to-day swings of a kilo or so are normal, so the
        dark line shows your 7-day average: that's the trend to watch.
      </p>

      <div className="pe-card p-4 mb-4">
        <div className="pe-display text-sm font-semibold mb-2" style={{ color: "#14403E" }}>Log a weigh-in</div>
        <div className="flex gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <label className="block text-[10px] font-medium mb-1" style={{ color: "#948A78" }}>Weight (kg)</label>
            <input
              type="number" inputMode="decimal" step="0.1" min="0"
              className="pe-input w-full px-3 py-2 text-sm"
              value={kg} onChange={(e) => setKg(e.target.value)} placeholder="e.g. 75.4"
              onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <label className="block text-[10px] font-medium mb-1" style={{ color: "#948A78" }}>Date</label>
            <input type="date" max={today} className="pe-input w-full px-2 py-2 text-sm" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <button className="pe-btn-primary w-full py-2 rounded-full text-sm font-semibold" onClick={save}>Save weigh-in</button>
        {error && <ErrorNotice className="mt-2">{error}</ErrorNotice>}
        {saved && <p className="text-xs mt-2 font-semibold" style={{ color: "#4F6B41" }}>{saved}</p>}
        {targetsOutOfSync && (
          <div className="rounded-lg p-2.5 mt-3 text-xs" style={{ background: "#FFF7ED", border: "1px solid #F5DCC9", color: "#9C5527" }}>
            Your food targets are still based on {profileKg} kg, but your latest weigh-in is {latest.kg} kg.{" "}
            <button className="underline font-semibold" onClick={() => onUseBodyweight(latest.kg)}>Update my targets to {latest.kg} kg</button>
          </div>
        )}
      </div>

      <div className="pe-card p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="pe-display text-sm font-semibold" style={{ color: "#14403E" }}>Trend</div>
          <div className="flex gap-1.5">
            {RANGES.map(([k, label]) => (
              <button key={k} className={`pe-chip px-3 py-1 text-xs font-medium ${range === k ? "active" : ""}`} onClick={() => setRange(k)}>{label}</button>
            ))}
          </div>
        </div>
        {chart || <p className="text-sm text-center py-6" style={{ color: "#948A78" }}>No weigh-ins in this period yet.</p>}
        {latest && (
          <div className="grid grid-cols-3 gap-2 mt-3 text-center">
            <div className="rounded-lg py-2" style={{ background: "#F5F4EE" }}>
              <div className="pe-mono text-sm font-semibold" style={{ color: "#14403E" }}>{latest.kg.toFixed(1)} kg</div>
              <div className="text-[10px]" style={{ color: "#948A78" }}>Latest ({niceDate(latest.date)})</div>
            </div>
            <div className="rounded-lg py-2" style={{ background: "#F5F4EE" }}>
              <div className="pe-mono text-sm font-semibold" style={{ color: "#14403E" }}>{change == null ? "—" : `${fmtSigned(change)} kg`}</div>
              <div className="text-[10px]" style={{ color: "#948A78" }}>This period</div>
            </div>
            <div className="rounded-lg py-2" style={{ background: "#F5F4EE" }}>
              <div className="pe-mono text-sm font-semibold" style={{ color: "#14403E" }}>{rate == null ? "—" : `${fmtSigned(rate)} kg`}</div>
              <div className="text-[10px]" style={{ color: "#948A78" }}>Per week</div>
            </div>
          </div>
        )}
        {latest && rate == null && (
          <p className="text-[11px] mt-2" style={{ color: "#948A78" }}>The weekly rate appears once you have weigh-ins spanning at least a week.</p>
        )}
      </div>

      {weightLog.length > 0 && (
        <div className="pe-card p-4">
          <div className="pe-display text-sm font-semibold mb-2" style={{ color: "#14403E" }}>History</div>
          {[...weightLog].reverse().slice(0, 15).map((w, i) => (
            <div key={w.date} className="flex items-center justify-between py-1.5" style={{ borderTop: i ? "1px solid #EFEBE0" : "none" }}>
              <span className="text-sm">{parseDate(w.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
              <span className="flex items-center gap-3">
                <span className="pe-mono text-sm font-semibold">{w.kg.toFixed(1)} kg</span>
                <button className="text-lg font-bold px-1" style={{ color: "#948A78" }} onClick={() => onDelete(w.date)} aria-label={`Delete weigh-in for ${w.date}`}>×</button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
