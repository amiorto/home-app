-- Notifications. Run once in Supabase → SQL Editor, after the main schema.

-- Which notifications each person wants (all on to start with).
alter table public.profiles
  add column if not exists notify_morning boolean not null default true,
  add column if not exists notify_due boolean not null default true,
  add column if not exists notify_habits boolean not null default true,
  add column if not exists notify_partner boolean not null default true;
grant update (notify_morning, notify_due, notify_habits, notify_partner) on public.profiles to authenticated;

-- One row per phone that agreed to notifications.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references public.profiles on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy "own subscriptions" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Saving goes through here, so a phone that changes hands moves to whoever is signed in now.
create or replace function public.save_push(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

-- What was already sent today, so each daily notification goes out once. Only the server function reads it.
create table if not exists public.notify_log (
  user_id uuid not null references public.profiles on delete cascade,
  kind text not null,
  day date not null,
  primary key (user_id, kind, day)
);
alter table public.notify_log enable row level security;
