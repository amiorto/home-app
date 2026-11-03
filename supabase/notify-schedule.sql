-- Runs the notify function every 15 minutes. Run once in Supabase → SQL Editor, after the function is deployed.
-- Calling it more often is harmless: each daily notification is sent once, and only inside its hours.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('notify', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://tpmbmieqbsnynbmxpyss.supabase.co/functions/v1/notify',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"kind": "tick"}'::jsonb
  )
$$);
