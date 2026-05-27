create table if not exists public.finansys_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.finansys_state enable row level security;

drop policy if exists "finansys_state_select" on public.finansys_state;
drop policy if exists "finansys_state_insert" on public.finansys_state;
drop policy if exists "finansys_state_update" on public.finansys_state;

create policy "finansys_state_select" on public.finansys_state for select using (true);
create policy "finansys_state_insert" on public.finansys_state for insert with check (true);
create policy "finansys_state_update" on public.finansys_state for update using (true) with check (true);

insert into public.finansys_state (id, data)
values ('finansys_producao', '{}'::jsonb)
on conflict (id) do nothing;
