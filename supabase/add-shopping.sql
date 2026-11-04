-- The household's shopping list. Run once in Supabase → SQL Editor.
create table if not exists public.shopping (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  title text not null,
  category text not null default 'סופר',
  bought_at timestamptz, -- null while it's still to buy
  bought_by uuid references public.profiles on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists shopping_household on public.shopping (household_id);

alter table public.shopping enable row level security;
create policy "household shopping" on public.shopping
  for all using (household_id = public.my_household()) with check (household_id = public.my_household());

-- Live updates between the two phones
alter publication supabase_realtime add table public.shopping;
