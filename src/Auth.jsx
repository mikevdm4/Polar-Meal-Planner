import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient.js";
import { signUp, signIn, getMyAthletes, getAthleteData } from "./auth.js";

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

function round(n) {
  return Math.round(n || 0);
}

export function CoachDashboard({ profile, onSignOut }) {
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedData, setSelectedData] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);

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

            {dataLoading && <p className="text-sm" style={{ color: "#948A78" }}>Loading their data…</p>}

            {!dataLoading && !selectedData && (
              <p className="text-sm" style={{ color: "#948A78" }}>
                This athlete hasn't used the app yet — no data saved.
              </p>
            )}

            {!dataLoading && selectedData && (
              <AthleteSummary data={selectedData} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function AthleteSummary({ data }) {
  const profile = data.pe_profile || {};
  const cart = data.pe_cart || {};
  const logsByDate = data.pe_logs_by_date || {};
  const cartEntries = Object.values(cart).filter((v) => v.qty > 0);
  const recentDates = Object.keys(logsByDate).filter((d) => logsByDate[d]?.length > 0).sort().reverse().slice(0, 5);

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

      <div className="pe-card p-4">
        <div className="pe-display text-sm font-semibold mb-3" style={{ color: "#14403E" }}>Recent daily logs</div>
        {recentDates.length === 0 ? (
          <p className="text-xs" style={{ color: "#948A78" }}>No logged days yet.</p>
        ) : (
          <div className="space-y-3">
            {recentDates.map((d) => {
              const entries = logsByDate[d];
              const totalCal = entries.reduce((sum, e) => {
                if (e.type === "food") return sum + (e.food.kcal * e.grams) / 100;
                if (e.type === "manual") return sum + (e.calories || 0);
                return sum + e.baseCalories * (e.servings || 1);
              }, 0);
              return (
                <div key={d} className="flex justify-between text-sm pe-divider pt-2">
                  <span>{d}</span>
                  <span className="pe-mono" style={{ color: "#948A78" }}>{round(totalCal)} kcal · {entries.length} item{entries.length !== 1 ? "s" : ""}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
