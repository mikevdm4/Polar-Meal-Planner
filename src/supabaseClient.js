import { createClient } from "@supabase/supabase-js";

// These two values are safe to expose in the browser bundle — the anon key
// is designed for client-side use, and Row Level Security (see
// supabase/schema.sql) is what actually controls who can read/write what.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
