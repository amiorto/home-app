-- Lets a chore be limited to some days of the week (0 = Sunday … 6 = Saturday). Run once in Supabase → SQL Editor.
-- Empty means any day.
alter table public.chores add column if not exists days smallint[];
