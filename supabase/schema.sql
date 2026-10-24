-- Database schema for the app. Paste the whole file into Supabase → SQL Editor → Run.
-- Shared (household): chores, chore_log, expenses, and tasks that have a household_id (one-off home tasks).
-- Private (per user): all other tasks, habit_checks.

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'הבית שלנו',
  join_code text not null unique default upper(substr(md5(random()::text), 1, 6)),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  household_id uuid references public.households on delete set null,
  created_at timestamptz not null default now()
);

create table public.chores (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  title text not null,
  interval_days int not null check (interval_days between 1 and 365),
  last_done_at timestamptz,
  last_done_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now()
);

create table public.chore_log (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  chore_id uuid not null references public.chores on delete cascade,
  done_by uuid references public.profiles on delete set null,
  done_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  paid_by uuid not null references public.profiles on delete cascade,
  amount numeric(10, 2) not null check (amount > 0),
  description text not null,
  category text not null,
  spent_on date not null default current_date,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  household_id uuid references public.households on delete cascade, -- set → shared home task
  kind text not null check (kind in ('task', 'habit')),
  title text not null,
  area text not null,
  due_date date,
  done_at timestamptz,
  done_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  check (household_id is null or kind = 'task')
);

create table public.habit_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  task_id uuid not null references public.tasks on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  unique (task_id, day)
);

create index on public.chores (household_id);
create index on public.chore_log (household_id, done_at desc);
create index on public.expenses (household_id, spent_on desc);
create index on public.tasks (user_id);
create index on public.tasks (household_id);
create index on public.habit_checks (user_id, day);

-- The current user's household (security definer so policies can call it without recursion).
create function public.my_household() returns uuid
language sql stable security definer set search_path = public as $$
  select household_id from profiles where id = auth.uid()
$$;

-- Create a profile automatically on sign-up, using the name given in the sign-up form.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create function public.create_household(p_name text default null) returns public.households
language plpgsql security definer set search_path = public as $$
declare h households;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into households (name) values (coalesce(nullif(trim(p_name), ''), 'הבית שלנו')) returning * into h;
  update profiles set household_id = h.id where id = auth.uid();
  return h;
end $$;

create function public.join_household(p_code text) returns public.households
language plpgsql security definer set search_path = public as $$
declare h households;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into h from households where join_code = upper(trim(p_code));
  if not found then raise exception 'קוד ההזמנה לא נמצא'; end if;
  update profiles set household_id = h.id where id = auth.uid();
  return h;
end $$;

-- Row level security
alter table public.households enable row level security;
alter table public.profiles enable row level security;
alter table public.chores enable row level security;
alter table public.chore_log enable row level security;
alter table public.expenses enable row level security;
alter table public.tasks enable row level security;
alter table public.habit_checks enable row level security;

create policy "members read household" on public.households
  for select using (id = public.my_household());

create policy "read self and housemates" on public.profiles
  for select using (id = auth.uid() or household_id = public.my_household());
create policy "update own profile" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
-- Users may only rename themselves; joining a household goes through join_household().
revoke update on public.profiles from authenticated;
grant update (name) on public.profiles to authenticated;

create policy "household chores" on public.chores
  for all using (household_id = public.my_household()) with check (household_id = public.my_household());
create policy "household chore log" on public.chore_log
  for all using (household_id = public.my_household()) with check (household_id = public.my_household());
create policy "household expenses" on public.expenses
  for all using (household_id = public.my_household()) with check (household_id = public.my_household());

create policy "own or shared home tasks" on public.tasks
  for all using (user_id = auth.uid() or household_id = public.my_household())
  with check (user_id = auth.uid() or household_id = public.my_household());
create policy "own habit checks" on public.habit_checks
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Live updates between the two phones
alter publication supabase_realtime add table public.chores, public.chore_log, public.expenses, public.tasks;
