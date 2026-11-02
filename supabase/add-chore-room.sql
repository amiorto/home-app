-- For a database created before chores had a room. Run once in Supabase → SQL Editor.
-- Empty means the app works out the room from the chore's name.
alter table public.chores add column if not exists room text;
