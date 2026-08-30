-- Run this once in your Supabase project's SQL editor (Supabase dashboard -> SQL Editor -> New query).

create table if not exists sync_data (
  code text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Row Level Security stays enabled with no public policies — the app never
-- talks to Supabase directly from the browser. Only the Vercel serverless
-- function (using the service_role key, which bypasses RLS) can read/write.
alter table sync_data enable row level security;
