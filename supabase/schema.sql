-- Run once in your Supabase project's SQL Editor.
-- The browser never contacts this table: only the Vercel server uses the secret key.
create table if not exists public.pug_saves (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  revision bigint not null default 0 check (revision >= 0),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.pug_saves enable row level security;
revoke all on table public.pug_saves from anon, authenticated;
grant select, insert, update on table public.pug_saves to service_role;
-- Intentionally no anon/authenticated policies. The server owns all game rules.
notify pgrst, 'reload schema';
