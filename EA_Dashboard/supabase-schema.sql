create table if not exists public.dashboard_state (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.dashboard_state enable row level security;

-- Replace this policy for production auth rules.
create policy "Allow dashboard read" on public.dashboard_state
for select
to anon
using (true);

create policy "Allow dashboard write" on public.dashboard_state
for insert
to anon
with check (true);

create policy "Allow dashboard update" on public.dashboard_state
for update
to anon
using (true)
with check (true);
