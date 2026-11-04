// Sends the app's notifications. Two ways in:
//   {"kind":"tick"}                     – every 15 minutes from pg_cron: morning summary, what's still due, habits
//   {"kind":"partner","text":"..."}     – from the app, with the user's token: tells their housemates what they did
// Deploy with "Verify JWT" off; partner calls check the token themselves.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
webpush.setVapidDetails('https://amiorto.github.io/home-app/', Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);

const ZONE = 'Asia/Jerusalem';
// Each daily notification goes out once, the first tick inside its hours (minutes since midnight).
const WINDOWS = { morning: [8 * 60, 11 * 60], due: [18 * 60, 21 * 60], habits: [20 * 60 + 30, 23 * 60] } as const;

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const body = await req.json().catch(() => ({}));
  try {
    const sent = body.kind === 'partner' ? await partner(req, String(body.text ?? '')) : await tick();
    return Response.json({ sent }, { headers: cors });
  } catch (e) {
    return Response.json({ error: String(e?.message ?? e) }, { status: 400, headers: cors });
  }
});

const ok = <T>({ data, error }: { data: T; error: unknown }) => { if (error) throw error; return data; };

// Local date (YYYY-MM-DD) and minutes since midnight in Israel.
function local(d = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const shift = (day: string, n: number) => new Date(Date.parse(day) + n * 86400000).toISOString().slice(0, 10);
const weekday = (day: string) => new Date(day + 'T00:00:00Z').getUTCDay();

// Same rule as choreStatus/choreDueOn in app.js, including chores limited to some weekdays.
function choreDue(c: any, day: string) {
  const done = c.last_done_at ? local(new Date(c.last_done_at)).day : null;
  const days: number[] | null = c.days?.length && c.days.length < 7 ? c.days : null;
  if (!days) return !done || c.interval_days - daysBetween(done, day) <= 0;
  if (!days.includes(weekday(day))) return false;
  if (!done) return true;
  let start = day;
  for (let i = 1; i < Math.min(c.interval_days, 7); i++) {
    const prev = shift(day, -i);
    if (!days.includes(weekday(prev))) break;
    start = prev;
  }
  return done < start && daysBetween(done, day) >= c.interval_days - 6;
}

async function send(userIds: string[], payload: { title: string; body: string; tab?: string }) {
  if (!userIds.length) return 0;
  const subs = ok(await sb.from('push_subscriptions').select('*').in('user_id', userIds)) as any[];
  let n = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload));
      n++;
    } catch (e) {
      // The phone unsubscribed or the app was removed: forget it.
      if (e?.statusCode === 404 || e?.statusCode === 410) await sb.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
    }
  }
  return n;
}

async function partner(req: Request, text: string) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) throw new Error('not signed in');
  const me = ok(await sb.from('profiles').select('household_id').eq('id', user.id).single()) as any;
  if (!me?.household_id || !text.trim()) return 0;
  const others = ok(await sb.from('profiles').select('id').eq('household_id', me.household_id).eq('notify_partner', true).neq('id', user.id)) as any[];
  return send(others.map((p) => p.id), { title: 'הבית שלנו', body: text.slice(0, 200) });
}

// Marks a daily notification as sent; false if it already was today.
async function claim(userId: string, kind: string, day: string) {
  const rows = ok(await sb.from('notify_log').upsert({ user_id: userId, kind, day }, { onConflict: 'user_id,kind,day', ignoreDuplicates: true }).select()) as any[];
  return rows.length > 0;
}

const count = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);
const list = (titles: string[]) => titles.slice(0, 3).map((t) => `"${t}"`).join(', ') + (titles.length > 3 ? ` ועוד ${titles.length - 3}` : '');

async function tick() {
  const { day, minutes } = local();
  const open = (Object.keys(WINDOWS) as (keyof typeof WINDOWS)[]).filter((k) => minutes >= WINDOWS[k][0] && minutes < WINDOWS[k][1]);
  if (!open.length) return 0;

  // Only people with a phone signed up for notifications.
  const subUsers = [...new Set((ok(await sb.from('push_subscriptions').select('user_id')) as any[]).map((s) => s.user_id))];
  if (!subUsers.length) return 0;
  const people = ok(await sb.from('profiles').select('*').in('id', subUsers)) as any[];
  const households = [...new Set(people.map((p) => p.household_id).filter(Boolean))];
  if (!households.length) return 0;
  const [chores, tasks, checks] = await Promise.all([
    sb.from('chores').select('title, interval_days, days, last_done_at, household_id').in('household_id', households).then(ok),
    sb.from('tasks').select('id, user_id, household_id, kind, title, due_date, done_at').or(`user_id.in.(${subUsers}),household_id.in.(${households})`).then(ok),
    sb.from('habit_checks').select('task_id').eq('day', day).in('user_id', subUsers).then(ok),
  ]) as any[][];
  const checked = new Set(checks.map((c) => c.task_id));

  let sent = 0;
  for (const p of people) {
    if (!p.household_id) continue;
    // The same lists the Today screen shows.
    const dueChores = chores.filter((c) => c.household_id === p.household_id && choreDue(c, day));
    const dueTasks = tasks.filter((t) => t.kind === 'task' && !t.done_at && t.due_date && t.due_date <= day && (t.household_id ? t.household_id === p.household_id : t.user_id === p.id));
    const habits = tasks.filter((t) => t.kind === 'habit' && t.user_id === p.id);
    const unchecked = habits.filter((h) => !checked.has(h.id));

    if (open.includes('morning') && p.notify_morning && (dueChores.length || dueTasks.length || habits.length) && await claim(p.id, 'morning', day)) {
      const parts = [
        dueChores.length && count(dueChores.length, 'מטלת בית אחת', 'מטלות בית'),
        dueTasks.length && count(dueTasks.length, 'משימה אחת', 'משימות'),
        habits.length && count(habits.length, 'הרגל אחד', 'הרגלים'),
      ].filter(Boolean) as string[];
      const joined = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} ו${parts.at(-1)}` : parts[0];
      sent += await send([p.id], { title: `בוקר טוב, ${p.name}`, body: `היום: ${joined}`, tab: 'today' });
    }
    const waiting = [...dueChores, ...dueTasks].map((x) => x.title);
    if (open.includes('due') && p.notify_due && waiting.length && await claim(p.id, 'due', day)) {
      sent += await send([p.id], { title: 'עוד מחכה להיום', body: list(waiting), tab: 'today' });
    }
    if (open.includes('habits') && p.notify_habits && unchecked.length && await claim(p.id, 'habits', day)) {
      const text = unchecked.length === 1 ? `עוד לא סימנת את "${unchecked[0].title}" היום` : `עוד ${unchecked.length} הרגלים לסמן היום, והעציץ מחכה`;
      sent += await send([p.id], { title: 'ההרגלים של היום', body: text, tab: 'personal' });
    }
  }
  return sent;
}
