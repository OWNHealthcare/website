-- Supabase: SQL Editor öffnen, dieses Skript einmal ausführen.

create table if not exists public.waitlist (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  confirm_token text unique,
  confirmed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists waitlist_confirm_token_idx on public.waitlist (confirm_token);
create index if not exists waitlist_confirmed_at_idx  on public.waitlist (confirmed_at);

-- Row Level Security an, ohne Policies.
-- Damit kommt NUR der service_role-Key (Backend) an die Daten,
-- der öffentliche anon-Key sieht nichts.
alter table public.waitlist enable row level security;

-- Praktische Sicht: nur bestätigte Anmeldungen, in Reihenfolge.
create or replace view public.waitlist_confirmed as
  select email, confirmed_at
  from public.waitlist
  where confirmed_at is not null
  order by confirmed_at asc;
