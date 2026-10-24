// Data layer. Two interchangeable backends with the same interface:
//   demo  – localStorage, two fake users you can switch between
//   cloud – Supabase (auth + Postgres + realtime)
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// Tables shared by the household vs. private to each user.
export const SHARED_TABLES = ['chores', 'chore_log', 'expenses'];
export const PERSONAL_TABLES = ['tasks', 'habit_checks'];

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function createStore() {
  return SUPABASE_URL && SUPABASE_ANON_KEY ? createCloudStore() : createDemoStore();
}

/* ---------------- demo ---------------- */

const DEMO_KEY = 'home-app-demo-v4';

function seedDemo() {
  const now = Date.now();
  const day = 86400000;
  const iso = (msAgo) => new Date(now - msAgo).toISOString();
  const date = (daysOffset) => localDate(new Date(now + daysOffset * day));
  const hh = { id: uid(), name: 'הבית שלנו', join_code: 'DEMO42' };
  const me = { id: uid(), name: 'עמיאור', household_id: hh.id };
  const partner = { id: uid(), name: 'אלה', household_id: hh.id };
  const chore = (title, interval_days, daysAgo, by) => ({
    id: uid(), household_id: hh.id, title, interval_days,
    last_done_at: daysAgo == null ? null : iso(daysAgo * day), last_done_by: daysAgo == null ? null : by.id,
  });
  const habitId = uid();
  const month = localDate(new Date()).slice(0, 7);
  const exp = (amount, description, category, by, dayOfMonth) => ({
    id: uid(), household_id: hh.id, amount, description, category, paid_by: by.id,
    spent_on: `${month}-${String(dayOfMonth).padStart(2, '0')}`, created_at: new Date().toISOString(),
  });
  const today = new Date().getDate();
  const d = (n) => Math.max(1, Math.min(today, n));
  const chores = [
    chore('להשקות עציצים', 1, 1, partner),
    chore('לשטוף רצפה', 7, 9, partner),
    chore('להוריד זבל', 2, 1, me),
    chore('כביסה', 4, 3, partner),
    chore('לנקות שירותים', 7, 2, me),
    chore('להחליף מצעים', 14, 10, partner),
    chore('לנקות מקרר', 30, null, me),
  ];
  // Some history so "together this week" and the activity log aren't empty.
  const logEntry = (c, daysAgo, by) => ({ id: uid(), household_id: hh.id, chore_id: c.id, done_by: by.id, done_at: iso(daysAgo * day + 3600000) });
  const chore_log = [
    ...chores.filter((c) => c.last_done_at).map((c) => ({ id: uid(), household_id: hh.id, chore_id: c.id, done_by: c.last_done_by, done_at: c.last_done_at })),
    logEntry(chores[0], 2, me), logEntry(chores[0], 3, partner), logEntry(chores[0], 4, me), logEntry(chores[2], 3, partner),
  ];
  return {
    household: hh,
    profiles: [me, partner],
    currentUserId: me.id,
    chores,
    chore_log,
    tasks: [
      { id: uid(), user_id: me.id, kind: 'task', title: 'לקבוע תור לרופא שיניים', area: 'אישי', due_date: date(0), done_at: null, created_at: iso(day) },
      { id: uid(), user_id: me.id, kind: 'task', title: 'לחדש ביטוח רכב', area: 'אישי', due_date: date(-2), done_at: null, created_at: iso(5 * day) },
      { id: uid(), user_id: me.id, kind: 'task', title: 'לסיים פרק 3 בקורס', area: 'התפתחות אישית', due_date: date(3), done_at: null, created_at: iso(day) },
      { id: habitId, user_id: me.id, kind: 'habit', title: 'לקרוא 20 דקות', area: 'התפתחות אישית', due_date: null, done_at: null, created_at: iso(10 * day) },
      { id: uid(), user_id: me.id, kind: 'habit', title: 'אימון', area: 'בריאות וספורט', due_date: null, done_at: null, created_at: iso(10 * day) },
      { id: uid(), user_id: me.id, kind: 'task', title: 'לשלוח קורות חיים', area: 'עבודה', due_date: null, done_at: iso(day), done_by: me.id, created_at: iso(3 * day) },
      { id: uid(), user_id: partner.id, kind: 'task', title: 'משימה פרטית של אלה', area: 'אישי', due_date: date(0), done_at: null, created_at: iso(day) },
      { id: uid(), user_id: partner.id, household_id: hh.id, kind: 'task', title: 'להזמין טכנאי למזגן', area: 'בית', due_date: date(1), done_at: null, created_at: iso(day) },
      { id: uid(), user_id: me.id, household_id: hh.id, kind: 'task', title: 'לתלות מדף בסלון', area: 'בית', due_date: null, done_at: null, created_at: iso(2 * day) },
    ],
    habit_checks: [1, 2, 3, 5].map((n) => ({ id: uid(), user_id: me.id, task_id: habitId, day: date(-n) })),
    expenses: [
      exp(412.5, 'קניות שבועיות', 'סופר', me, d(2)),
      exp(289, 'חשבון חשמל', 'חשבונות', partner, d(4)),
      exp(180, 'ארוחת ערב במסעדה', 'אוכל בחוץ ובילויים', me, d(6)),
      exp(356.9, 'סופר', 'סופר', partner, d(8)),
      exp(64, 'נורות ומטאטא', 'כללי', partner, d(9)),
    ],
  };
}

function createDemoStore() {
  let db;
  try { db = JSON.parse(localStorage.getItem(DEMO_KEY)); } catch { db = null; }
  if (!db) db = seedDemo();
  const save = () => { try { localStorage.setItem(DEMO_KEY, JSON.stringify(db)); } catch {} };
  save();
  const listeners = new Set();
  const me = () => db.profiles.find((p) => p.id === db.currentUserId);

  return {
    mode: 'demo',
    async session() {
      return { user: { id: db.currentUserId }, profile: me(), household: db.household, members: db.profiles };
    },
    async loadAll() {
      const out = {};
      for (const t of SHARED_TABLES) out[t] = db[t].map((r) => ({ ...r }));
      for (const t of PERSONAL_TABLES) out[t] = db[t].filter((r) => r.user_id === db.currentUserId).map((r) => ({ ...r }));
      // Home tasks are shared with the household even though they live in `tasks`.
      out.tasks.push(...db.tasks.filter((r) => r.household_id && r.user_id !== db.currentUserId).map((r) => ({ ...r })));
      return out;
    },
    async insert(table, row) {
      const full = { id: uid(), created_at: new Date().toISOString(), ...row };
      if (PERSONAL_TABLES.includes(table)) full.user_id ??= db.currentUserId;
      db[table].push(full);
      save();
      return { ...full };
    },
    async update(table, id, patch) {
      const r = db[table].find((x) => x.id === id);
      if (r) Object.assign(r, patch);
      save();
      return r && { ...r };
    },
    async remove(table, id) {
      db[table] = db[table].filter((x) => x.id !== id);
      if (table === 'tasks') db.habit_checks = db.habit_checks.filter((c) => c.task_id !== id);
      if (table === 'chores') db.chore_log = db.chore_log.filter((c) => c.chore_id !== id);
      save();
    },
    async updateProfile(patch) { Object.assign(me(), patch); save(); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    // demo-only helpers
    switchUser() {
      db.currentUserId = db.profiles.find((p) => p.id !== db.currentUserId).id;
      save();
    },
    reset() { db = seedDemo(); save(); },
  };
}

/* ---------------- cloud ---------------- */

async function createCloudStore() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  let ctx = null; // { user, profile, household, members }
  let channel = null;
  const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

  async function session() {
    const { data: { session: s } } = await sb.auth.getSession();
    if (!s) return (ctx = { user: null });
    const user = s.user;
    const profile = ok(await sb.from('profiles').select('*').eq('id', user.id).maybeSingle());
    if (!profile?.household_id) return (ctx = { user, profile, household: null, members: profile ? [profile] : [] });
    const [household, members] = await Promise.all([
      sb.from('households').select('*').eq('id', profile.household_id).single().then(ok),
      sb.from('profiles').select('*').eq('household_id', profile.household_id).order('created_at').then(ok),
    ]);
    return (ctx = { user, profile, household, members });
  }

  return {
    mode: 'cloud',
    session,
    async signIn(email, password) { ok(await sb.auth.signInWithPassword({ email, password })); },
    async signUp(email, password, name) {
      const data = ok(await sb.auth.signUp({ email, password, options: { data: { name } } }));
      return { needsConfirm: !data.session };
    },
    async signOut() { if (channel) sb.removeChannel(channel); channel = null; await sb.auth.signOut(); },
    async createHousehold(name) { ok(await sb.rpc('create_household', { p_name: name })); },
    async joinHousehold(code) { ok(await sb.rpc('join_household', { p_code: code })); },
    async loadAll() {
      const since = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
      const [chores, chore_log, expenses, tasks, habit_checks] = await Promise.all([
        sb.from('chores').select('*').order('created_at').then(ok),
        sb.from('chore_log').select('*').order('done_at', { ascending: false }).limit(300).then(ok),
        sb.from('expenses').select('*').order('spent_on', { ascending: false }).then(ok),
        // RLS returns my own tasks plus the household's shared home tasks.
        sb.from('tasks').select('*').order('created_at').then(ok),
        sb.from('habit_checks').select('*').eq('user_id', ctx.user.id).gte('day', since).then(ok),
      ]);
      for (const e of expenses) e.amount = Number(e.amount);
      return { chores, chore_log, expenses, tasks, habit_checks };
    },
    async insert(table, row) {
      const full = { ...row };
      if (SHARED_TABLES.includes(table)) full.household_id = ctx.household.id;
      if (PERSONAL_TABLES.includes(table)) full.user_id ??= ctx.user.id;
      return ok(await sb.from(table).insert(full).select().single());
    },
    async update(table, id, patch) { return ok(await sb.from(table).update(patch).eq('id', id).select().single()); },
    async remove(table, id) { ok(await sb.from(table).delete().eq('id', id)); },
    async updateProfile(patch) { ok(await sb.from('profiles').update(patch).eq('id', ctx.user.id)); },
    subscribe(fn) {
      if (!ctx?.household) return () => {};
      if (channel) sb.removeChannel(channel);
      channel = sb.channel('household-' + ctx.household.id);
      for (const t of [...SHARED_TABLES, 'tasks']) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: `household_id=eq.${ctx.household.id}` }, fn);
      }
      channel.subscribe();
      return () => { sb.removeChannel(channel); channel = null; };
    },
  };
}

export function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
