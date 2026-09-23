import { supabase } from "./supabaseClient.js";

export async function signUp({ email, password, role, displayName, coachEmail }) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  const userId = data.user?.id;
  if (!userId) throw new Error("Sign-up succeeded but no user was returned.");

  let coachId = null;
  if (role === "athlete" && coachEmail) {
    const { data: coachProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", coachEmail.trim().toLowerCase())
      .eq("role", "coach")
      .maybeSingle();
    coachId = coachProfile?.id || null;
  }

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: userId,
    email: email.trim().toLowerCase(),
    role,
    display_name: displayName || email,
    coach_id: coachId,
    approved: role === "athlete", // coaches need manual approval; athletes don't
  });
  if (profileError) throw profileError;

  return data;
}

export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getMyProfile(userId) {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getMyAthletes(coachId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("coach_id", coachId)
    .order("display_name");
  if (error) throw error;
  return data || [];
}

export async function getAthleteData(userId) {
  const { data, error } = await supabase.from("athlete_data").select("data, updated_at").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getPendingCoaches() {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("role", "coach")
    .eq("approved", false)
    .order("created_at");
  if (error) throw error;
  return data || [];
}

export async function approveCoach(coachId) {
  const { error } = await supabase.from("profiles").update({ approved: true }).eq("id", coachId);
  if (error) throw error;
}

export async function rejectCoach(coachId) {
  const { error } = await supabase.from("profiles").delete().eq("id", coachId);
  if (error) throw error;
}

// Lets an athlete link (or switch) their coach at any point after sign-up —
// not just as a one-time choice made during registration.
export async function linkCoach(athleteUserId, coachEmail) {
  const { data: coachProfile, error: lookupError } = await supabase
    .from("profiles")
    .select("id, approved")
    .eq("email", coachEmail.trim().toLowerCase())
    .eq("role", "coach")
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!coachProfile) {
    throw new Error("No coach account found with that email. Check it's spelled exactly as they gave it to you.");
  }
  if (!coachProfile.approved) {
    throw new Error("That coach account hasn't been approved yet, so linking to it isn't possible just yet.");
  }
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ coach_id: coachProfile.id })
    .eq("id", athleteUserId);
  if (updateError) throw updateError;
}

export async function unlinkCoach(athleteUserId) {
  const { error } = await supabase.from("profiles").update({ coach_id: null }).eq("id", athleteUserId);
  if (error) throw error;
}

export async function changePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function changeEmail(newEmail) {
  const { error } = await supabase.auth.updateUser({ email: newEmail.trim().toLowerCase() });
  if (error) throw error;
}

// A coach's suggested meal picks for one athlete's week. `plan` is a JSON
// object shaped like { "2026-06-08": { lunch: {name, section}, dinner: {...} }, ... }
// (dates as keys rather than "Mon"/"Tue" so it's unambiguous which actual
// day each pick falls on).
export async function saveWeekPlan({ athleteId, coachId, weekStart, plan, coachNote }) {
  const { error } = await supabase
    .from("coach_meal_plans")
    .upsert(
      { athlete_id: athleteId, coach_id: coachId, week_start: weekStart, plan, coach_note: coachNote || null, updated_at: new Date().toISOString() },
      { onConflict: "athlete_id,week_start" }
    );
  if (error) throw error;
}

export async function getAthleteWeekPlan(athleteId, weekStart) {
  const { data, error } = await supabase
    .from("coach_meal_plans")
    .select("*")
    .eq("athlete_id", athleteId)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// The athlete's own view of whatever their coach has planned for the given week.
export async function getMyWeekPlan(weekStart) {
  const { data: session } = await supabase.auth.getUser();
  const userId = session?.user?.id;
  if (!userId) return null;
  const { data, error } = await supabase
    .from("coach_meal_plans")
    .select("*")
    .eq("athlete_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveFeedback({ athleteId, coachId, entryDate, message }) {
  const { error } = await supabase
    .from("coach_feedback")
    .upsert(
      { athlete_id: athleteId, coach_id: coachId, entry_date: entryDate, message, updated_at: new Date().toISOString() },
      { onConflict: "athlete_id,entry_date" }
    );
  if (error) throw error;
}

export async function deleteFeedback(athleteId, entryDate) {
  const { error } = await supabase.from("coach_feedback").delete().eq("athlete_id", athleteId).eq("entry_date", entryDate);
  if (error) throw error;
}

export async function getAthleteFeedback(athleteId) {
  const { data, error } = await supabase.from("coach_feedback").select("*").eq("athlete_id", athleteId);
  if (error) throw error;
  return data || [];
}

// The athlete's own view of feedback their coach has left, keyed by date for easy lookup.
export async function getMyFeedback() {
  const { data: session } = await supabase.auth.getUser();
  const userId = session?.user?.id;
  if (!userId) return {};
  const { data, error } = await supabase.from("coach_feedback").select("*").eq("athlete_id", userId);
  if (error) throw error;
  const byDate = {};
  (data || []).forEach((row) => { byDate[row.entry_date] = row.message; });
  return byDate;
}
