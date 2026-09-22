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
