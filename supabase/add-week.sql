-- "Thank you" between the two of you, whose turn a chore is next time, and the Saturday-night week recap.
-- Run once in Supabase → SQL Editor.

-- A thank-you for something the other one did. `item` says what: 'chore_log:<id>' or 'tasks:<id>'.
create table if not exists public.thanks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  from_id uuid not null default auth.uid() references public.profiles on delete cascade,
  to_id uuid not null references public.profiles on delete cascade,
  item text not null,
  title text not null,
  created_at timestamptz not null default now(),
  unique (from_id, item)
);
create index if not exists thanks_household on public.thanks (household_id);

alter table public.thanks enable row level security;
create policy "household thanks" on public.thanks
  for all using (household_id = public.my_household())
  with check (household_id = public.my_household() and from_id = auth.uid());

alter publication supabase_realtime add table public.thanks;

-- Who does a chore next time (set when planning the week); cleared once it's done.
alter table public.chores add column if not exists next_by uuid references public.profiles on delete set null;

-- The Saturday-night "your week is ready" notification.
alter table public.profiles add column if not exists notify_week boolean not null default true;
grant update (notify_week) on public.profiles to authenticated;
