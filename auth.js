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
