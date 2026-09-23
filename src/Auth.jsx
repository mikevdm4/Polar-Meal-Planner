import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient.js";
import { signUp, signIn, getMyAthletes, getAthleteData, getPendingCoaches, approveCoach, rejectCoach, saveWeekPlan, getAthleteWeekPlan, saveFeedback, deleteFeedback, getAthleteFeedback } from "./auth.js";
import { RECIPE_DATA } from "./data.js";
import { computeTargets, mealTarget, scaledMacros } from "./calculations.js";

export function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState("signin"); // signin | signup | forgot
  const [role, setRole] = useState("athlete");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [coachEmail, setCoachEmail] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError("");
    setInfo("");
    setLoading(true);
    try {
      if (mode === "signup") {
        await signUp({ email, password, role, displayName, coachEmail });
        onAuthed();
      } else if (mode === "forgot") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (resetError) throw resetError;
        setInfo("Check your inbox for a password reset link.");
      } else {
        await signIn({ email, password });
        onAuthed();
      }
    } catch (e) {
      setError(e.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pe-app flex items-center justify-center px-5" style={{ minHeight: "100vh" }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-[11px] font-semibold tracking-widest uppercase mb-1" style={{ color: "#14403E" }}>
            Polar Endurance Coaching
          </div>
          <div className="pe-display text-2xl font-semibold" style={{ color: "#14403E" }}>
            {mode === "signin" ? "Welcome back" : mode === "forgot" ? "Reset your password" : "Create your account"}
          </div>
        </div>

        <div className="pe-card p-5">
          {mode === "signup" && (
            <>
              <label className="block text-sm font-medium mb-1.5">I am a...</label>
              <div className="flex gap-2 mb-4">
                {["athlete", "coach"].map((r) => (
                  <button
                    key={r}
                    className={`pe-chip flex-1 py-2 text-sm font-medium capitalize ${role === r ? "active" : ""}`}
                    onClick={() => setRole(r)}
                  >
                    {r}
                  </button>
                ))}
              </div>

              <label className="block text-sm font-medium mb-1.5">Your name</label>
              <input
                className="pe-input w-full px-3 py-2.5 mb-4 text-sm"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </>
          )}

          <label className="block text-sm font-medium mb-1.5">Email</label>
          <input
            type="email"
            className="pe-input w-full px-3 py-2.5 mb-4 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          {mode !== "forgot" && (
            <>
              <label className="block text-sm font-medium mb-1.5">Password</label>
              <input
                type="password"
                className="pe-input w-full px-3 py-2.5 mb-4 text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </>
          )}

          {mode === "signup" && role === "athlete" && (
            <>
              <label className="block text-sm font-medium mb-1.5">Your coach's email (optional)</label>
              <input
                type="email"
                className="pe-input w-full px-3 py-2.5 mb-1 text-sm"
                placeholder="e.g. mike@polarendure.com"
                value={coachEmail}
                onChange={(e) => setCoachEmail(e.target.value)}
              />
              <p className="text-xs mb-4" style={{ color: "#948A78" }}>
                Enter this if your coach asked you to — it lets them see your progress. Leave blank if not.
              </p>
            </>
          )}

          {mode === "forgot" && (
            <p className="text-xs mb-4" style={{ color: "#948A78" }}>
              Enter the email you signed up with and we'll send a link to set a new password.
            </p>
          )}

          {error && <p className="text-xs mb-3" style={{ color: "#B5652F" }}>{error}</p>}
          {info && <p className="text-xs mb-3" style={{ color: "#4F6B41" }}>{info}</p>}

          <button
            className="pe-btn-primary w-full py-3 rounded-full font-semibold text-sm mb-3"
            onClick={submit}
            disabled={loading || !email || (mode !== "forgot" && !password)}
            style={loading || !email || (mode !== "forgot" && !password) ? { opacity: 0.6 } : {}}
          >
            {loading
              ? "Please wait…"
              : mode === "signin"
              ? "Sign in"
              : mode === "forgot"
              ? "Send reset link"
              : "Create account"}
          </button>

          {mode === "signin" && (
            <button
              className="w-full text-xs font-medium text-center mb-3"
              style={{ color: "#948A78" }}
              onClick={() => { setMode("forgot"); setError(""); setInfo(""); }}
            >
              Forgot password?
            </button>
          )}

          <button
            className="w-full text-xs font-medium text-center"
            style={{ color: "#14403E" }}
            onClick={() => {
              setMode(mode === "signup" ? "signin" : mode === "forgot" ? "signin" : "signup");
              setError(""); setInfo("");
            }}
          >
            {mode === "signin"
              ? "New here? Create an account"
              : mode === "forgot"
              ? "Back to sign in"
              : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ResetPasswordScreen({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError("");
    if (password.length < 6) {
      setError("Password needs to be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      onDone();
    } catch (e) {
      setError(e.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pe-app flex items-center justify-center px-5" style={{ minHeight: "100vh" }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-[11px] font-semibold tracking-widest uppercase mb-1" style={{ color: "#14403E" }}>
            Polar Endurance Coaching
          </div>
          <div className="pe-display text-2xl font-semibold" style={{ color: "#14403E" }}>Set a new password</div>
        </div>
        <div className="pe-card p-5">
          <label className="block text-sm font-medium mb-1.5">New password</label>
          <input
            type="password"
            className="pe-input w-full px-3 py-2.5 mb-4 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <label className="block text-sm font-medium mb-1.5">Confirm new password</label>
          <input
            type="password"
            className="pe-input w-full px-3 py-2.5 mb-4 text-sm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {error && <p className="text-xs mb-3" style={{ color: "#B5652F" }}>{error}</p>}
          <button
            className="pe-btn-primary w-full py-3 rounded-full font-semibold text-sm"
            onClick={submit}
            disabled={loading || !password || !confirm}
            style={loading || !password || !confirm ? { opacity: 0.6 } : {}}
          >
            {loading ? "Saving…" : "Save new password"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PendingApprovalScreen({ email, onSignOut }) {
  return (
    <div className="pe-app flex items-center justify-center px-6" style={{ minHeight: "100vh" }}>
      <div className="w-full max-w-sm text-center">
        <div className="text-4xl mb-3">⏳</div>
        <p className="pe-display text-lg font-semibold mb-2" style={{ color: "#14403E" }}>
          Your coach account is awaiting approval
        </p>
        <p className="text-sm mb-5" style={{ color: "#6B6355" }}>
          {email} has been created, but a coach account needs to be approved before it can be used. You'll be
          able to sign in as normal once that's done — check back shortly, or get in touch if it's been a while.
        </p>
        <button className="pe-btn-secondary w-full py-3 rounded-full font-semibold text-sm" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </div>
  );
}

export function AdminApprovals({ onOpenCoachDashboard, isAlsoCoach, onSignOut }) {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await getPendingCoaches();
      setPending(list);
    } catch (e) {
      setError(e.message || "Couldn't load pending coaches.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const handleApprove = async (id) => {
    setBusyId(id);
    try {
      await approveCoach(id);
      setPending((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      setError(e.message || "Couldn't approve that account.");
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (id) => {
    setBusyId(id);
    try {
      await rejectCoach(id);
      setPending((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      setError(e.message || "Couldn't remove that account.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="pe-app" style={{ minHeight: "100vh" }}>
      <div className="pe-header px-5 pt-6 pb-5">
        <div className="relative flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold tracking-widest uppercase mb-1" style={{ color: "#9FC4BE" }}>
              Admin
            </div>
            <div className="pe-display text-2xl font-semibold">Coach approvals</div>
          </div>
          <button
            className="text-xs font-medium px-3 py-1.5 rounded-full"
            style={{ background: "rgba(255,255,255,0.15)", color: "#F5F4EE" }}
            onClick={onSignOut}
          >
            Sign out
          </button>
        </div>
      </div>

      <div className="px-4 py-4 max-w-2xl mx-auto">
        {isAlsoCoach && (
          <button
            className="pe-chip px-4 py-2 text-xs font-medium mb-4"
            onClick={onOpenCoachDashboard}
          >
            → Go to my coach dashboard
          </button>
        )}

        <h2 className="pe-display text-lg font-semibold mb-3" style={{ color: "#14403E" }}>
          Pending coaches ({pending.length})
        </h2>

        {error && <p className="text-xs mb-3" style={{ color: "#B5652F" }}>{error}</p>}
        {loading && <p className="text-sm" style={{ color: "#948A78" }}>Loading…</p>}

        {!loading && pending.length === 0 && (
          <p className="text-sm" style={{ color: "#948A78" }}>No coach accounts waiting for approval.</p>
        )}

        {pending.map((p) => (
          <div key={p.id} className="pe-card p-4 mb-2.5 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">{p.display_name || p.email}</div>
              <div className="text-xs" style={{ color: "#948A78" }}>{p.email}</div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                className="pe-btn-secondary px-3 py-1.5 rounded-full text-xs font-semibold"
                disabled={busyId === p.id}
                onClick={() => handleReject(p.id)}
              >
                Reject
              </button>
              <button
                className="pe-btn-primary px-3 py-1.5 rounded-full text-xs font-semibold"
                disabled={busyId === p.id}
                onClick={() => handleApprove(p.id)}
              >
                Approve
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function round(n) {
  return Math.round(n || 0);
}

export function CoachDashboard({ profile, onSignOut, onBackToAdmin }) {
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedData, setSelectedData] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [detailTab, setDetailTab] = useState("summary"); // summary | plan

  useEffect(() => {
    (async () => {
      try {
        const list = await getMyAthletes(profile.id);
        setAthletes(list);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [profile.id]);

  const openAthlete = async (athlete) => {
    setSelectedId(athlete.id);
    setSelectedData(null);
    setDetailTab("summary");
    setDataLoading(true);
    try {
      const result = await getAthleteData(athlete.id);
      setSelectedData(result?.data || null);
    } catch (e) {
      console.error(e);
    } finally {
      setDataLoading(false);
    }
  };

  const selectedAthlete = athletes.find((a) => a.id === selectedId);

  return (
    <div className="pe-app" style={{ minHeight: "100vh" }}>
      <div className="pe-header px-5 pt-6 pb-5">
        <div className="relative flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold tracking-widest uppercase mb-1" style={{ color: "#9FC4BE" }}>
              Coach Dashboard
            </div>
            <div className="pe-display text-2xl font-semibold">Polar Endurance</div>
          </div>
          <div className="flex items-center gap-2">
            {onBackToAdmin && (
              <button
                className="text-xs font-medium px-3 py-1.5 rounded-full"
                style={{ background: "rgba(255,255,255,0.15)", color: "#F5F4EE" }}
                onClick={onBackToAdmin}
              >
                ← Admin
              </button>
            )}
            <button
              className="text-xs font-medium px-3 py-1.5 rounded-full"
              style={{ background: "rgba(255,255,255,0.15)", color: "#F5F4EE" }}
              onClick={onSignOut}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 max-w-2xl mx-auto">
        {!selectedId ? (
          <>
            <h2 className="pe-display text-lg font-semibold mb-3" style={{ color: "#14403E" }}>
              Your athletes ({athletes.length})
            </h2>
            {loading && <p className="text-sm" style={{ color: "#948A78" }}>Loading…</p>}
            {!loading && athletes.length === 0 && (
              <p className="text-sm" style={{ color: "#948A78" }}>
                No athletes linked yet. Share your email ({profile.email}) with athletes so they can enter it
                when they sign up.
              </p>
            )}
            {athletes.map((a) => (
              <button
                key={a.id}
                className="pe-card p-4 mb-2.5 w-full text-left flex items-center justify-between"
                onClick={() => openAthlete(a)}
              >
                <div>
                  <div className="text-sm font-medium">{a.display_name || a.email}</div>
                  <div className="text-xs" style={{ color: "#948A78" }}>{a.email}</div>
                </div>
                <span style={{ color: "#948A78" }}>→</span>
              </button>
            ))}
          </>
        ) : (
          <>
            <button
              className="text-xs font-medium mb-4"
              style={{ color: "#14403E" }}
              onClick={() => { setSelectedId(null); setSelectedData(null); }}
            >
              ← Back to athletes
            </button>
            <h2 className="pe-display text-lg font-semibold mb-4" style={{ color: "#14403E" }}>
              {selectedAthlete?.display_name || selectedAthlete?.email}
            </h2>

            <div className="flex gap-2 mb-4">
              <button
                className={`text-xs font-semibold px-3 py-1.5 rounded-full`}
                style={detailTab === "summary" ? { background: "#14403E", color: "#fff" } : { background: "#EDE9DD", color: "#14403E" }}
                onClick={() => setDetailTab("summary")}
              >
                Summary
              </button>
              <button
                className={`text-xs font-semibold px-3 py-1.5 rounded-full`}
                style={detailTab === "plan" ? { background: "#14403E", color: "#fff" } : { background: "#EDE9DD", color: "#14403E" }}
                onClick={() => setDetailTab("plan")}
              >
                🗓 Suggest this week
              </button>
            </div>

            {detailTab === "summary" && (
              <>
                {dataLoading && <p className="text-sm" style={{ color: "#948A78" }}>Loading their data…</p>}
                {!dataLoading && !selectedData && (
                  <p className="text-sm" style={{ color: "#948A78" }}>
                    This athlete hasn't used the app yet — no data saved.
                  </p>
                )}
                {!dataLoading && selectedData && <AthleteSummary data={selectedData} athleteId={selectedId} coachId={profile.id} />}
              </>
            )}

            {detailTab === "plan" && (
              <WeekPlanner athleteId={selectedId} coachId={profile.id} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function AthleteSummary({ data, athleteId, coachId }) {
  const profile = data.pe_profile || {};
  const cart = data.pe_cart || {};
  const logsByDate = data.pe_day_notes ? data.pe_logs_by_date || {} : data.pe_logs_by_date || {};
  const dayNotes = data.pe_day_notes || {};
  const waterByDate = data.pe_water_by_date || {};
  const cartEntries = Object.values(cart).filter((v) => v.qty > 0);
  const recentDates = Object.keys(logsByDate).filter((d) => logsByDate[d]?.length > 0 || dayNotes[d]).sort().reverse().slice(0, 7);

  const [feedback, setFeedback] = useState({}); // { date: message }
  const [editingDate, setEditingDate] = useState(null);
  const [draftMessage, setDraftMessage] = useState("");
  const [feedbackSaving, setFeedbackSaving] = useState(false);

  useEffect(() => {
    getAthleteFeedback(athleteId)
      .then((rows) => {
        const byDate = {};
        rows.forEach((r) => { byDate[r.entry_date] = r.message; });
        setFeedback(byDate);
      })
      .catch(() => {});
  }, [athleteId]);

  const openFeedback = (date) => {
    setEditingDate(date);
    setDraftMessage(feedback[date] || "");
  };

  const saveFeedbackFor = async (date) => {
    setFeedbackSaving(true);
    try {
      if (draftMessage.trim()) {
        await saveFeedback({ athleteId, coachId, entryDate: date, message: draftMessage.trim() });
        setFeedback((prev) => ({ ...prev, [date]: draftMessage.trim() }));
      } else {
        await deleteFeedback(athleteId, date);
        setFeedback((prev) => { const next = { ...prev }; delete next[date]; return next; });
      }
      setEditingDate(null);
    } catch (e) {
      // leave the editor open so they can retry
    } finally {
      setFeedbackSaving(false);
    }
  };

  const entryMacros = (e) => {
    if (e.type === "food") {
      const factor = e.grams / 100;
      return { calories: e.food.kcal * factor, protein: e.food.protein * factor, carbs: e.food.carb * factor, fat: e.food.fat * factor };
    }
    if (e.type === "manual") {
      return { calories: e.calories || 0, protein: e.protein || 0, carbs: e.carbs || 0, fat: e.fat || 0 };
    }
    const servings = e.servings || 1;
    return { calories: e.baseCalories * servings, protein: e.baseProtein * servings, carbs: e.baseCarbs * servings, fat: e.baseFat * servings };
  };
  const round = (n) => Math.round(n || 0);

  return (
    <div>
      <div className="pe-card p-4 mb-4">
        <div className="pe-display text-sm font-semibold mb-3" style={{ color: "#14403E" }}>Profile</div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span style={{ color: "#948A78" }}>Bodyweight:</span> {profile.bodyweight || "—"} kg</div>
          <div><span style={{ color: "#948A78" }}>Goal:</span> {profile.goal || "—"}</div>
          <div><span style={{ color: "#948A78" }}>Structure:</span> {profile.structure || "—"}</div>
          <div><span style={{ color: "#948A78" }}>Calorie adj:</span> {profile.adjustment || 0}</div>
        </div>
      </div>

      <div className="pe-card p-4 mb-4">
        <div className="pe-display text-sm font-semibold mb-3" style={{ color: "#14403E" }}>
          Current order ({cartEntries.length} item{cartEntries.length !== 1 ? "s" : ""})
        </div>
        {cartEntries.length === 0 ? (
          <p className="text-xs" style={{ color: "#948A78" }}>Nothing in their order right now.</p>
        ) : (
          <div className="space-y-1.5">
            {cartEntries.map((v, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span>{v.item?.name}</span>
                <span className="pe-mono" style={{ color: "#948A78" }}>×{v.qty}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pe-display text-sm font-semibold mb-2" style={{ color: "#14403E" }}>Recent daily logs</div>
      {recentDates.length === 0 ? (
        <p className="text-xs" style={{ color: "#948A78" }}>No logged days yet.</p>
      ) : (
        recentDates.map((d) => {
          const entries = logsByDate[d] || [];
          const totals = entries.reduce(
            (sum, e) => {
              const m = entryMacros(e);
              return { calories: sum.calories + m.calories, protein: sum.protein + m.protein, carbs: sum.carbs + m.carbs, fat: sum.fat + m.fat };
            },
            { calories: 0, protein: 0, carbs: 0, fat: 0 }
          );
          const note = dayNotes[d];
          const water = waterByDate[d];
          return (
            <div key={d} className="pe-card p-4 mb-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-semibold" style={{ color: "#14403E" }}>{d}</span>
                <span className="pe-mono text-xs" style={{ color: "#948A78" }}>
                  {round(totals.calories)} kcal · P{round(totals.protein)} C{round(totals.carbs)} F{round(totals.fat)}
                  {water != null && ` · 💧${water}`}
                </span>
              </div>
              {note && (
                <div className="rounded-lg p-2.5 mb-2 text-xs" style={{ background: "#F5F4EE", color: "#40473F" }}>
                  <strong>Their note:</strong> {note}
                </div>
              )}
              {feedback[d] && editingDate !== d && (
                <div className="rounded-lg p-2.5 mb-2 text-xs" style={{ background: "#EEF3EC", color: "#4F6B41" }}>
                  <strong>Your feedback:</strong> {feedback[d]}
                </div>
              )}
              {editingDate === d ? (
                <div className="mb-2">
                  <textarea
                    className="pe-input w-full px-2 py-1.5 text-xs"
                    rows={2}
                    placeholder="e.g. Great protein hit today — try adding a veg side to dinner tomorrow"
                    value={draftMessage}
                    onChange={(e) => setDraftMessage(e.target.value)}
                  />
                  <div className="flex gap-2 mt-1.5">
                    <button
                      className="pe-btn-primary px-3 py-1 rounded-full text-[11px] font-semibold"
                      onClick={() => saveFeedbackFor(d)}
                      disabled={feedbackSaving}
                    >
                      {feedbackSaving ? "Saving…" : "Save"}
                    </button>
                    <button className="text-[11px] font-medium" style={{ color: "#948A78" }} onClick={() => setEditingDate(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="text-[11px] font-semibold mb-2"
                  style={{ color: "#14403E" }}
                  onClick={() => openFeedback(d)}
                >
                  {feedback[d] ? "Edit feedback" : "+ Leave feedback"}
                </button>
              )}
              {entries.length === 0 ? (
                <p className="text-xs" style={{ color: "#948A78" }}>No food logged this day — note only.</p>
              ) : (
                <div className="space-y-1">
                  {entries.map((e, i) => {
                    const m = entryMacros(e);
                    const name = e.type === "food" ? e.food.name : e.type === "manual" ? e.name : e.name;
                    const qty = e.type === "food" ? `${e.grams}g` : e.type === "manual" ? "manual" : `${e.servings || 1}x`;
                    return (
                      <div key={i} className="flex justify-between text-xs pe-divider pt-1" style={{ color: "#40473F" }}>
                        <span>{e.time ? `${e.time} · ` : ""}{name} <span style={{ color: "#948A78" }}>({qty})</span></span>
                        <span className="pe-mono" style={{ color: "#948A78" }}>{round(m.calories)} kcal</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function mondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // shift Sunday back to the Monday before it
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const PLAN_DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function computeDayMacros(dayPlan, targets) {
  let calories = 0, protein = 0, carbs = 0, fat = 0;
  ["lunch", "dinner"].forEach((slot) => {
    const pick = dayPlan?.[slot];
    if (!pick) return;
    const item = RECIPE_DATA.sections[pick.section]?.items.find((i) => i.name === pick.name);
    if (!item) return;
    const target = mealTarget(pick.section, targets);
    const m = scaledMacros(item, target);
    calories += m.calories; protein += m.proteinG; carbs += m.carbG; fat += m.fat;
  });
  return { calories, protein, carbs, fat };
}

function WeekPlanner({ athleteId, coachId }) {
  const [weekOffset, setWeekOffset] = useState(0); // 0 = this week, up to ~4 = about a month out
  const [plan, setPlan] = useState({});
  const [coachNote, setCoachNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState(""); // "" | "saving" | "saved" | "error"
  const [athleteProfile, setAthleteProfile] = useState(null);
  const [copyStatus, setCopyStatus] = useState("");

  const round = (n) => Math.round(n || 0);

  const weekStartDate = new Date();
  weekStartDate.setDate(weekStartDate.getDate() + weekOffset * 7);
  const weekStart = mondayOf(weekStartDate);

  const prevWeekStartDate = new Date();
  prevWeekStartDate.setDate(prevWeekStartDate.getDate() + (weekOffset - 1) * 7);
  const prevWeekStart = mondayOf(prevWeekStartDate);

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

  const lunchOptions = RECIPE_DATA.sections.Lunch.items.map((i) => i.name);
  const dinnerOptions = RECIPE_DATA.sections.Dinner.items.map((i) => i.name);

  useEffect(() => {
    setLoading(true);
    Promise.all([getAthleteWeekPlan(athleteId, weekStart), getAthleteData(athleteId)])
      .then(([existing, athleteData]) => {
        setPlan(existing?.plan || {});
        setCoachNote(existing?.coach_note || "");
        setAthleteProfile(athleteData?.data?.pe_profile || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [athleteId, weekStart]);

  const targets = athleteProfile ? computeTargets(athleteProfile) : null;

  const setPick = (date, mealType, recipeName) => {
    setPlan((prev) => ({
      ...prev,
      [date]: { ...prev[date], [mealType]: recipeName ? { name: recipeName, section: mealType === "lunch" ? "Lunch" : "Dinner" } : undefined },
    }));
  };

  const save = async () => {
    setSaveStatus("saving");
    try {
      await saveWeekPlan({ athleteId, coachId, weekStart, plan, coachNote });
      setSaveStatus("saved");
    } catch (e) {
      setSaveStatus("error");
    }
  };

  const copyFromPreviousWeek = async () => {
    setCopyStatus("loading");
    try {
      const prev = await getAthleteWeekPlan(athleteId, prevWeekStart);
      if (prev?.plan) {
        setPlan(prev.plan);
        setCopyStatus("done");
      } else {
        setCopyStatus("empty");
      }
    } catch (e) {
      setCopyStatus("error");
    }
  };

  if (loading) return <p className="text-sm" style={{ color: "#948A78" }}>Loading…</p>;

  const weekLabel =
    weekOffset === 0 ? "this week" : weekOffset === 1 ? "next week" : `in ${weekOffset} weeks`;

  return (
    <div>
      {!athleteProfile && (
        <div className="rounded-lg p-3 mb-3 text-xs" style={{ background: "#FFF7ED", border: "1px solid #F5DCC9", color: "#9C5527" }}>
          This athlete hasn't set up their profile yet, so macro totals can't be calculated until they do —
          you can still pick recipes below.
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <button
          className="text-xs font-medium"
          style={{ color: weekOffset === 0 ? "#B8B2A0" : "#14403E" }}
          onClick={() => setWeekOffset((w) => Math.max(0, w - 1))}
          disabled={weekOffset === 0}
        >
          ← Prev
        </button>
        <span className="text-sm font-semibold" style={{ color: "#14403E" }}>
          Week of {weekStart} ({weekLabel})
        </span>
        <button
          className="text-xs font-medium"
          style={{ color: weekOffset >= 4 ? "#B8B2A0" : "#14403E" }}
          onClick={() => setWeekOffset((w) => Math.min(4, w + 1))}
          disabled={weekOffset >= 4}
        >
          Next →
        </button>
      </div>

      <button
        className="pe-btn-secondary w-full py-2 rounded-full text-xs font-semibold mb-3"
        onClick={copyFromPreviousWeek}
        disabled={weekOffset === 0}
        style={weekOffset === 0 ? { opacity: 0.5 } : {}}
      >
        📋 Copy last week's plan as a starting point
      </button>
      {copyStatus === "empty" && <p className="text-xs text-center mb-3" style={{ color: "#948A78" }}>No plan found for the previous week.</p>}
      {copyStatus === "done" && <p className="text-xs text-center mb-3" style={{ color: "#4F6B41" }}>Copied — edit any days below, then save.</p>}

      {weekDates.map((date, i) => {
        const dayMacros = targets ? computeDayMacros(plan[date], targets) : null;
        const dailyTarget = targets ? targets.calories : null;
        return (
          <div key={date} className="pe-card p-3 mb-2">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold" style={{ color: "#14403E" }}>
                {PLAN_DAY_LABELS[i]} <span className="pe-mono" style={{ color: "#948A78" }}>· {date}</span>
              </div>
              {dayMacros && (dayMacros.calories > 0) && (
                <div className="pe-mono text-[11px]" style={{ color: "#948A78" }}>
                  {round(dayMacros.calories)} kcal{dailyTarget ? ` / ${round(dailyTarget)}` : ""} · P{round(dayMacros.protein)} C{round(dayMacros.carbs)} F{round(dayMacros.fat)}
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 gap-2">
              <div>
                <label className="text-[10px] font-medium" style={{ color: "#948A78" }}>Lunch</label>
                <select
                  className="pe-input w-full px-2 py-1.5 text-xs"
                  value={plan[date]?.lunch?.name || ""}
                  onChange={(e) => setPick(date, "lunch", e.target.value)}
                >
                  <option value="">— No suggestion —</option>
                  {lunchOptions.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-medium" style={{ color: "#948A78" }}>Dinner</label>
                <select
                  className="pe-input w-full px-2 py-1.5 text-xs"
                  value={plan[date]?.dinner?.name || ""}
                  onChange={(e) => setPick(date, "dinner", e.target.value)}
                >
                  <option value="">— No suggestion —</option>
                  {dinnerOptions.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
          </div>
        );
      })}

      <div className="pe-card p-3 mb-3">
        <label className="text-[10px] font-medium" style={{ color: "#948A78" }}>Note for this week (optional)</label>
        <textarea
          className="pe-input w-full px-2 py-1.5 text-xs mt-1"
          rows={2}
          placeholder="e.g. Heavier week — leaned into the higher-carb options for you"
          value={coachNote}
          onChange={(e) => setCoachNote(e.target.value)}
        />
      </div>

      <button className="pe-btn-primary w-full py-2.5 rounded-full text-sm font-semibold" onClick={save} disabled={saveStatus === "saving"}>
        {saveStatus === "saving" ? "Saving…" : "Save this week's suggestions"}
      </button>
      {saveStatus === "saved" && <p className="text-xs mt-2 text-center" style={{ color: "#4F6B41" }}>Saved — your athlete will see this in their app.</p>}
      {saveStatus === "error" && <p className="text-xs mt-2 text-center" style={{ color: "#B5652F" }}>Couldn't save — try again.</p>}
    </div>
  );
}
