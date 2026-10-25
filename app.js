import { createStore, localDate } from './store.js';

/* ---------------- constants ---------------- */

const CATEGORIES = [
  { name: 'סופר', icon: '🛒' },
  { name: 'חשבונות', icon: '🧾' },
  { name: 'כללי', icon: '📦' },
  { name: 'אוכל בחוץ ובילויים', icon: '🍽️' },
];
// A one-off task in the HOME_AREA is shared with the household; every other area is private.
const HOME_AREA = 'בית';
const AREAS = [
  { name: 'אישי', icon: '👤' },
  { name: HOME_AREA, icon: '🏠' },
  { name: 'התפתחות אישית', icon: '🌱' },
  { name: 'בריאות וספורט', icon: '💪' },
  { name: 'עבודה', icon: '💼' },
];
const INTERVALS = [[1, 'כל יום'], [2, 'כל יומיים'], [3, 'כל 3 ימים'], [7, 'כל שבוע'], [14, 'כל שבועיים'], [30, 'כל חודש']];
const TABS = [
  { id: 'today', label: 'היום', icon: '☀️' },
  { id: 'home', label: 'בית', icon: '🏠' },
  { id: 'personal', label: 'אישי', icon: '👤' },
  { id: 'expenses', label: 'הוצאות', icon: '💰' },
];
const WEEKDAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const DAY = 86400000;

/* ---------------- state ---------------- */

let store;
const S = {
  tab: 'today',
  ctx: null, // { user, profile, household, members }
  data: null,
  personalView: 'tasks',
  showHomeDone: false,
  expView: 'list',
  month: localDate().slice(0, 7),
  authMode: 'login',
};
try { S.tab = localStorage.getItem('home-app-tab') || 'today'; } catch {}

const app = document.getElementById('app');
const sheetRoot = document.getElementById('sheet-root');
const toastRoot = document.getElementById('toast-root');

/* ---------------- helpers ---------------- */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
const today = () => localDate();
const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayDiff = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);
const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return localDate(d); };
const daysHe = (n) => { n = Math.abs(n); return n === 1 ? 'יום' : n === 2 ? 'יומיים' : `${n} ימים`; };
const agoHe = (n) => (n <= 0 ? 'היום' : n === 1 ? 'אתמול' : `לפני ${daysHe(n)}`);
// The signed-in user is always "אני"; everyone else by name.
const memberName = (id) => (id === S.ctx.profile.id ? 'אני' : S.ctx.members.find((m) => m.id === id)?.name ?? '—');
const me = () => S.ctx.profile;
const membersMeFirst = () => [me(), ...S.ctx.members.filter((m) => m.id !== me().id)];
const doneToday = (t) => t.done_at && localDate(new Date(t.done_at)) === today();
const catIcon = (name) => CATEGORIES.find((c) => c.name === name)?.icon ?? '📦';
const catIndex = (name) => Math.max(0, CATEGORIES.findIndex((c) => c.name === name));

// Each partner has a fixed color (by household join order) so both phones agree on who is who.
const whoClass = (id) => (S.ctx.members.findIndex((m) => m.id === id) === 1 ? 'who-b' : 'who-a');
// Two-Do style: a small filled circle in the partner's colour with their initial.
const whoChip = (id) => (id ? `<span class="who ${whoClass(id)}" aria-hidden="true">${esc((S.ctx.members.find((m) => m.id === id)?.name ?? '?').slice(0, 1))}</span>` : '');

const ICON_PATHS = {
  today: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-6h4v6"/>',
  personal: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  expenses: '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18M16 15h2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  chevron: '<path d="m15 18-6-6 6-6"/>',
};
const icon = (name) => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'לילה טוב' : h < 12 ? 'בוקר טוב' : h < 17 ? 'צהריים טובים' : h < 21 ? 'ערב טוב' : 'לילה טוב';
}

// Theme: 'auto' follows the phone, or force light/dark.
function applyTheme(t) {
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = t;
}
let theme = 'auto';
try { theme = localStorage.getItem('home-app-theme') || 'auto'; } catch {}
applyTheme(theme);

function choreStatus(c) {
  if (!c.last_done_at) return { remaining: 0, ratio: 1.01, level: 'due', pill: 'עוד לא בוצע', sub: `כל ${daysHe(c.interval_days)}` };
  const since = dayDiff(new Date(c.last_done_at), new Date());
  const remaining = c.interval_days - since;
  const ratio = since / c.interval_days;
  const level = remaining < 0 ? 'late' : remaining === 0 ? 'due' : ratio >= 0.6 ? 'soon' : 'ok';
  const pill = remaining < 0 ? `באיחור ${daysHe(remaining)}` : remaining === 0 ? 'להיום' : remaining === 1 ? 'מחר' : `בעוד ${daysHe(remaining)}`;
  return { remaining, ratio, level, pill, sub: `${whoChip(c.last_done_by)}${esc(memberName(c.last_done_by))} · ${agoHe(since)}` };
}

function dueLabel(due) {
  if (!due) return '';
  const n = dayDiff(new Date(), parseDate(due));
  if (n === 0) return 'היום';
  if (n === 1) return 'מחר';
  if (n === -1) return 'אתמול';
  if (n < 0) return `באיחור ${daysHe(n)}`;
  return parseDate(due).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
}

function streak(habitId) {
  const days = new Set(S.data.habit_checks.filter((c) => c.task_id === habitId).map((c) => c.day));
  let cur = days.has(today()) ? today() : addDays(today(), -1);
  let n = 0;
  while (days.has(cur)) { n++; cur = addDays(cur, -1); }
  return n;
}

/* ---------------- boot ---------------- */

async function boot() {
  try {
    store = await createStore();
    await reloadSession();
  } catch (e) {
    app.innerHTML = `<div class="splash">שגיאה בטעינה: ${esc(e.message)}</div>`;
    return;
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.data) refresh(); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Realtime: when the partner changes shared data, reload (debounced).
let unsubscribe = () => {};
let remoteTimer;
const onRemoteChange = () => { clearTimeout(remoteTimer); remoteTimer = setTimeout(refresh, 250); };

async function reloadSession() {
  S.ctx = await store.session();
  S.data = S.ctx.user && S.ctx.household ? await store.loadAll() : null;
  unsubscribe();
  unsubscribe = S.ctx.household ? store.subscribe(onRemoteChange) : () => {};
  render();
}

async function refresh() {
  if (!S.ctx?.household) return;
  S.data = await store.loadAll();
  render();
}

/* ---------------- rendering ---------------- */

function render() {
  if (!S.ctx.user) return renderAuth();
  if (!S.ctx.household) return renderOnboarding();
  const tab = TABS.find((t) => t.id === S.tab) ?? TABS[0];
  const body = { today: viewToday, home: viewHome, personal: viewPersonal, expenses: viewExpenses }[tab.id]();
  const dateLine = new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
  const tabBtn = (t) => `<button class="tab ${t.id === tab.id ? 'on' : ''}" data-action="tab" data-tab="${t.id}">${icon(t.id)}<span>${t.label}</span></button>`;
  // Two-Do top bar: wordmark on one side, settings + "name & name" on the other (the signed-in one lit up).
  const names = S.ctx.members.map((m) => `<span class="${whoClass(m.id)} ${m.id === me().id ? 'me' : ''}">${esc(m.name)}</span>`).join('<i>&amp;</i>');
  app.innerHTML = `
    <header class="topbar">
      <div class="brand">הבית<span>שלנו</span></div>
      <div class="topbar-right">
        <button class="icon-btn" data-action="settings" aria-label="הגדרות">${icon('settings')}</button>
        <div class="names">${names}</div>
      </div>
    </header>
    <div class="hello">
      <div class="eyebrow">${tab.id === 'today' ? esc(dateLine) : esc(S.ctx.household.name)}</div>
      <h1>${tab.id === 'today' ? `${greeting()}, ${esc(me().name)}` : tab.label}</h1>
    </div>
    ${tab.id === 'today' || tab.id === 'home' ? togetherBar() : ''}
    ${store.mode === 'demo' ? `<div class="demo-bar"><span>מצב הדגמה</span><button data-action="switch-user">החלפת משתמש</button></div>` : ''}
    <main class="content">${body}</main>
    <nav class="tabbar">
      ${TABS.slice(0, 2).map(tabBtn).join('')}
      <button class="tab-add" data-action="add" aria-label="הוספה">${icon('plus')}</button>
      ${TABS.slice(2).map(tabBtn).join('')}
    </nav>`;
}

// A rolling week (the last 7 days), so the bar isn't empty every Sunday morning.
function weekStartIso() {
  const d = startOfDay(new Date());
  d.setDate(d.getDate() - 6);
  return d.toISOString();
}

// "Together this week": how many shared home things each partner did in the last 7 days.
function togetherBar() {
  if (S.ctx.members.length < 2) return '';
  const since = weekStartIso();
  const counts = {};
  const add = (id) => { if (id) counts[id] = (counts[id] ?? 0) + 1; };
  for (const l of S.data.chore_log) if (l.done_at >= since) add(l.done_by);
  for (const t of S.data.tasks) if (t.household_id && t.done_at && t.done_at >= since) add(t.done_by);
  const [a, b] = S.ctx.members;
  const ca = counts[a.id] ?? 0;
  const cb = counts[b.id] ?? 0;
  const total = ca + cb;
  // Each side grows from its own end toward the middle, against a soft weekly scale (Two-Do's together bar).
  const scale = Math.max(total, 14);
  return `
    <div class="together">
      <div class="together-bar"><span class="who-a" style="width:${(ca / scale) * 100}%"></span><span class="who-b" style="width:${(cb / scale) * 100}%"></span></div>
      <div class="together-legend">
        <span><i class="dot who-a"></i>${esc(a.name)} <b>${ca}</b></span>
        <span><b>${total}</b> יחד השבוע</span>
        <span><b>${cb}</b> ${esc(b.name)} <i class="dot who-b"></i></span>
      </div>
    </div>`;
}

function section(title, inner, count) {
  return `<section class="sec"><h2 class="section-label">${title}${count ? `<span class="count">${count}</span>` : ''}</h2>${inner}</section>`;
}

function choreRow(c) {
  const st = choreStatus(c);
  const fill = Math.min(st.ratio, 1) * 100;
  return `
    <div class="row chore lvl-${st.level}" data-action="edit-chore" data-id="${c.id}">
      <button class="box" data-action="done-chore" data-id="${c.id}" aria-label="סמן כבוצע"></button>
      <div class="row-main">
        <div class="row-head"><span class="row-title">${esc(c.title)}</span><span class="pill">${st.pill}</span></div>
        <div class="row-sub">${st.sub}</div>
        <div class="meter"><span style="width:${fill}%"></span></div>
      </div>
    </div>`;
}

function taskRow(t) {
  const late = t.due_date && !t.done_at && t.due_date < today();
  const sub = [
    t.household_id ? '<span class="tag">בית · משותף</span>' : `<span class="tag">${esc(t.area)}</span>`,
    t.due_date && !t.done_at ? `<span class="${late ? 'late' : ''}">${dueLabel(t.due_date)}</span>` : '',
    t.done_at ? `${t.household_id && t.done_by ? `${whoChip(t.done_by)}${esc(memberName(t.done_by))} · ` : ''}${agoHe(dayDiff(new Date(t.done_at), new Date()))}` : '',
  ].filter(Boolean).join(' · ');
  return `
    <div class="row task ${t.done_at ? 'done' : ''}" data-action="edit-task" data-id="${t.id}">
      <button class="box" data-action="toggle-task" data-id="${t.id}" aria-label="סימון">${t.done_at ? icon('check') : ''}</button>
      <div class="row-main">
        <div class="row-title">${esc(t.title)}</div>
        <div class="row-sub">${sub}</div>
      </div>
    </div>`;
}

function habitRow(h, compact = false) {
  const days = new Set(S.data.habit_checks.filter((c) => c.task_id === h.id).map((c) => c.day));
  const s = streak(h.id);
  const checkedToday = days.has(today());
  const week = Array.from({ length: 7 }, (_, i) => addDays(today(), i - 6));
  const dots = week.map((d) => `
    <button class="dot ${days.has(d) ? 'on' : ''} ${d === today() ? 'is-today' : ''}" data-action="toggle-habit" data-id="${h.id}" data-day="${d}" aria-label="${d}">
      <small>${WEEKDAYS[parseDate(d).getDay()]}</small>
    </button>`).join('');
  return `
    <div class="row habit ${compact && checkedToday ? 'done' : ''}" data-action="edit-task" data-id="${h.id}">
      ${compact ? `<button class="box" data-action="toggle-habit" data-id="${h.id}" data-day="${today()}" aria-label="בוצע היום">${checkedToday ? icon('check') : ''}</button>` : ''}
      <div class="row-main">
        <div class="row-title">${esc(h.title)}</div>
        <div class="row-sub"><span class="tag">${esc(h.area)}</span>${s ? `<span class="streak">✦ ${s} ${s === 1 ? 'יום' : 'ימים ברצף'}</span>` : ''}</div>
      </div>
      ${compact ? '' : `<div class="dots">${dots}</div>`}
    </div>`;
}

function empty(text) { return `<div class="empty">${text}</div>`; }

function sortedChores() {
  return [...S.data.chores].sort((a, b) => choreStatus(b).ratio - choreStatus(a).ratio);
}

function monthExpenses(month = S.month) {
  return S.data.expenses.filter((e) => e.spent_on.startsWith(month));
}

// Open tasks first (by due date), then the ones completed today (they stay visible, struck through, until tomorrow).
const byOpenThenDue = (a, b) => !!a.done_at - !!b.done_at || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999');
const visibleNow = (t) => !t.done_at || doneToday(t);
const listOrEmpty = (rows, text) => (rows.length ? `<div class="list">${rows.join('')}</div>` : empty(text));

function viewToday() {
  const dueChores = sortedChores().filter((c) => choreStatus(c).remaining <= 0);
  const tasks = S.data.tasks
    .filter((t) => t.kind === 'task' && visibleNow(t) && t.due_date && t.due_date <= today())
    .sort(byOpenThenDue);
  const habits = S.data.tasks.filter((t) => t.kind === 'habit');
  const total = monthExpenses(today().slice(0, 7)).reduce((s, e) => s + e.amount, 0);
  return `
    ${section('בבית, לעשות היום', dueChores.length ? `<div class="list">${dueChores.map(choreRow).join('')}</div>` : empty('הבית מסודר, אין מטלות להיום'), dueChores.length)}
    ${section('משימות להיום', listOrEmpty(tasks.map(taskRow), 'אין משימות להיום'), tasks.filter((t) => !t.done_at).length)}
    ${habits.length ? section('הרגלים', `<div class="list">${habits.map((h) => habitRow(h, true)).join('')}</div>`) : ''}
    <button class="card summary-link" data-action="tab" data-tab="expenses">
      <span>הוצאות משותפות החודש</span><b>${money(total)}</b>
    </button>`;
}

function viewHome() {
  const chores = sortedChores();
  const homeTasks = S.data.tasks.filter((t) => t.household_id);
  const current = homeTasks.filter(visibleNow).sort(byOpenThenDue);
  const olderDone = homeTasks.filter((t) => t.done_at && !doneToday(t)).sort((a, b) => b.done_at.localeCompare(a.done_at));
  const choresById = Object.fromEntries(S.data.chores.map((c) => [c.id, c]));
  const log = [
    ...S.data.chore_log.map((l) => ({ who: l.done_by, title: choresById[l.chore_id]?.title ?? 'מטלה שנמחקה', at: l.done_at })),
    ...homeTasks.filter((t) => t.done_at).map((t) => ({ who: t.done_by, title: t.title, at: t.done_at })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
  return `
    ${section('מטלות חוזרות', listOrEmpty(chores.map(choreRow), 'עוד אין מטלות. לחצו + כדי להוסיף'), chores.length)}
    ${section('משימות לבית', listOrEmpty(current.map(taskRow), 'אין משימות פתוחות לבית'), current.filter((t) => !t.done_at).length)}
    ${olderDone.length ? `<button class="link" data-action="toggle-home-done">${S.showHomeDone ? 'הסתרת' : 'הצגת'} משימות שהושלמו (${olderDone.length})</button>
      ${S.showHomeDone ? `<div class="list">${olderDone.slice(0, 50).map(taskRow).join('')}</div>` : ''}` : ''}
    ${log.length ? section('פעילות אחרונה', `<div class="list log">${log.map((l) => `
      <div class="row log-row">${whoChip(l.who)}<b>${esc(memberName(l.who))}</b> ${esc(l.title)}<span>${agoHe(dayDiff(new Date(l.at), new Date()))}</span></div>`).join('')}</div>`) : ''}`;
}

function viewPersonal() {
  const views = [['tasks', 'משימות'], ['habits', 'הרגלים'], ['done', 'הושלמו']];
  const seg = `<div class="seg">${views.map(([id, label]) => `<button class="${S.personalView === id ? 'on' : ''}" data-action="personal-view" data-view="${id}">${label}</button>`).join('')}</div>`;
  const mine = S.data.tasks.filter((t) => t.kind === 'task' && !t.household_id);

  if (S.personalView === 'habits') {
    const habits = S.data.tasks.filter((t) => t.kind === 'habit');
    return seg + (habits.length ? `<div class="list">${habits.map((h) => habitRow(h)).join('')}</div>` : empty('עוד אין הרגלים. לחצו + כדי להוסיף הרגל'));
  }

  if (S.personalView === 'done') {
    const done = mine.filter((t) => t.done_at).sort((a, b) => b.done_at.localeCompare(a.done_at)).slice(0, 200);
    if (!done.length) return seg + empty('עוד לא הושלמו משימות. כשתסמנו משימה היא תופיע כאן');
    const byDay = {};
    for (const t of done) (byDay[localDate(new Date(t.done_at))] ??= []).push(t);
    return seg + Object.entries(byDay).map(([d, list]) => {
      const n = dayDiff(parseDate(d), new Date());
      const label = n === 0 ? 'היום' : n === 1 ? 'אתמול' : parseDate(d).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
      return section(label, `<div class="list">${list.map(taskRow).join('')}</div>`, list.length);
    }).join('');
  }

  const current = mine.filter(visibleNow);
  const groups = AREAS.map((a) => [a, current.filter((t) => t.area === a.name).sort(byOpenThenDue)]).filter(([, list]) => list.length);
  return `
    ${seg}
    ${groups.length ? groups.map(([a, list]) => section(a.name, `<div class="list">${list.map(taskRow).join('')}</div>`, list.filter((t) => !t.done_at).length)).join('') : empty('אין משימות פתוחות 🎉')}`;
}

function viewExpenses() {
  const list = monthExpenses().sort((a, b) => b.spent_on.localeCompare(a.spent_on) || (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  const total = list.reduce((s, e) => s + e.amount, 0);
  const members = S.ctx.members; // household order, so the colors match on both phones
  const paid = Object.fromEntries(members.map((m) => [m.id, 0]));
  for (const e of list) paid[e.paid_by] = (paid[e.paid_by] ?? 0) + e.amount;

  let balance = '';
  if (members.length === 2) {
    const other = members.find((m) => m.id !== me().id);
    const diff = (paid[me().id] - paid[other.id]) / 2; // >0 → the other person owes me
    const otherName = esc(other.name);
    balance = Math.abs(diff) < 0.5
      ? `<div class="balance even">מאוזן, אין צורך בהעברה</div>`
      : `<div class="balance"><span>${diff > 0 ? `לקבל מ${otherName}` : `להעביר ל${otherName}`}</span><b>${money(Math.abs(diff))}</b></div>`;
  }

  const monthLabel = parseDate(S.month + '-01').toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
  const isCurrent = S.month === today().slice(0, 7);
  const first = paid[members[0].id] ?? 0;
  const views = [['list', 'תנועות'], ['cats', 'קטגוריות']];

  let body;
  if (S.expView === 'cats') {
    const byCat = CATEGORIES.map((c, i) => ({ ...c, i, sum: list.filter((e) => e.category === c.name).reduce((s, e) => s + e.amount, 0) }))
      .filter((c) => c.sum > 0).sort((a, b) => b.sum - a.sum);
    body = byCat.length ? `<div class="list">${byCat.map((c) => `
      <div class="row cat-row">
        <span class="tile cat-${c.i}">${c.icon}</span>
        <div class="row-main">
          <div class="row-title">${c.name}</div>
          <div class="bar"><span class="cat-${c.i}" style="width:${(c.sum / total) * 100}%"></span></div>
        </div>
        <div class="amount-col"><b>${money(c.sum)}</b><small>${Math.round((c.sum / total) * 100)}%</small></div>
      </div>`).join('')}</div>` : empty('אין הוצאות בחודש הזה');
  } else {
    const byDay = {};
    for (const e of list) (byDay[e.spent_on] ??= []).push(e);
    body = Object.keys(byDay).length ? Object.entries(byDay).map(([d, items]) => `
      <div class="day-head"><span>${parseDate(d).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}</span>${items.length > 1 ? `<b>${money(items.reduce((s, e) => s + e.amount, 0))}</b>` : ''}</div>
      <div class="list">${items.map((e) => `
        <div class="row expense" data-action="edit-expense" data-id="${e.id}">
          <span class="tile cat-${catIndex(e.category)}">${catIcon(e.category)}</span>
          <div class="row-main"><div class="row-title">${esc(e.description)}</div><div class="row-sub">${esc(e.category)} · ${whoChip(e.paid_by)}${esc(memberName(e.paid_by))}</div></div>
          <b class="amount">${money(e.amount)}</b>
        </div>`).join('')}</div>`).join('') : empty('אין הוצאות בחודש הזה. לחצו + כדי להוסיף');
  }

  return `
    <div class="panel hero">
      <div class="hero-top">
        <button data-action="month" data-dir="-1" aria-label="חודש קודם">›</button>
        <span>${monthLabel}</span>
        <button data-action="month" data-dir="1" aria-label="חודש הבא" ${isCurrent ? 'disabled' : ''}>‹</button>
      </div>
      <div class="hero-label">הוצאות משותפות</div>
      <div class="total">${money(total)}</div>
      ${members.length === 2 ? `
        <div class="split-bar"><span class="who-a" style="width:${total ? (first / total) * 100 : 50}%"></span><span class="who-b"></span></div>
        <div class="payers">${members.map((m, i) => `<div><span><i class="dot ${i === 0 ? 'who-a' : 'who-b'}"></i>${esc(m.name)} שילם/ה</span><b>${money(paid[m.id] ?? 0)}</b></div>`).join('')}</div>` : ''}
      ${total ? balance : ''}
    </div>
    <div class="seg">${views.map(([id, label]) => `<button class="${(S.expView ?? 'list') === id ? 'on' : ''}" data-action="exp-view" data-view="${id}">${label}</button>`).join('')}</div>
    ${body}`;
}

/* ---------------- auth & onboarding (cloud mode) ---------------- */

function renderAuth() {
  const signup = S.authMode === 'signup';
  app.innerHTML = `
    <div class="auth">
      <div class="auth-logo">🏠</div>
      <h1>הבית שלנו</h1>
      <p class="muted">משימות, מטלות בית והוצאות משותפות</p>
      <form data-form="auth" class="stack">
        ${signup ? `<input name="name" placeholder="השם שלך" required autocomplete="given-name">` : ''}
        <input name="email" type="email" placeholder="אימייל" required autocomplete="email" dir="ltr">
        <input name="password" type="password" placeholder="סיסמה (לפחות 6 תווים)" required minlength="6" autocomplete="${signup ? 'new-password' : 'current-password'}" dir="ltr">
        <button class="btn primary" type="submit">${signup ? 'הרשמה' : 'כניסה'}</button>
      </form>
      <button class="link" data-action="auth-mode">${signup ? 'כבר יש לי חשבון, להתחברות' : 'אין לי חשבון, להרשמה'}</button>
    </div>`;
}

function renderOnboarding() {
  app.innerHTML = `
    <div class="auth">
      <div class="auth-logo">👋</div>
      <h1>שלום ${esc(S.ctx.profile?.name ?? '')}</h1>
      <p class="muted">צרו בית משותף, או הצטרפו לבית שבן/בת הזוג כבר יצר/ה</p>
      <form data-form="create-household" class="stack card">
        <b>בית חדש</b>
        <input name="name" placeholder="שם הבית" value="הבית שלנו">
        <button class="btn primary" type="submit">יצירת בית</button>
      </form>
      <form data-form="join-household" class="stack card">
        <b>הצטרפות עם קוד</b>
        <input name="code" placeholder="קוד הזמנה (6 תווים)" required dir="ltr" autocapitalize="characters" autocomplete="off">
        <button class="btn" type="submit">הצטרפות</button>
      </form>
      <button class="link" data-action="sign-out">התנתקות</button>
    </div>`;
}

/* ---------------- sheets (forms) ---------------- */

function openSheet(title, inner) {
  sheetRoot.innerHTML = `
    <div class="sheet-backdrop" data-action="close-sheet"></div>
    <div class="sheet" role="dialog" aria-modal="true">
      <div class="sheet-head"><button class="link" data-action="close-sheet">ביטול</button><b>${title}</b><span></span></div>
      ${inner}
    </div>`;
  requestAnimationFrame(() => sheetRoot.classList.add('open'));
  const first = sheetRoot.querySelector('[autofocus]');
  if (first) setTimeout(() => first.focus(), 50);
}

function closeSheet() {
  sheetRoot.classList.remove('open');
  setTimeout(() => { if (!sheetRoot.classList.contains('open')) sheetRoot.innerHTML = ''; }, 250);
}

const chips = (name, options, selected) => `<div class="chips">${options.map(([value, label]) => `
  <label class="chip"><input type="radio" name="${name}" value="${esc(value)}" ${String(value) === String(selected) ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div>`;

function choreSheet(c) {
  const interval = c?.interval_days ?? 7;
  const preset = INTERVALS.some(([v]) => v === interval) ? interval : 'custom';
  openSheet(c ? 'עריכת מטלה' : 'מטלת בית חדשה', `
    <form data-form="chore" data-id="${c?.id ?? ''}" class="stack">
      <input name="title" placeholder="למשל: לשטוף רצפה" value="${esc(c?.title)}" required ${c ? '' : 'autofocus'}>
      <label class="field-label">באיזו תדירות?</label>
      ${chips('preset', [...INTERVALS, ['custom', 'אחר']], preset)}
      <div class="inline">כל <input name="custom_days" type="number" min="1" max="365" inputmode="numeric" value="${interval}" class="num"> ימים <small class="muted">(כשבוחרים "אחר")</small></div>
      <button class="btn primary" type="submit">${c ? 'שמירה' : 'הוספה'}</button>
      ${c ? `<button class="btn danger" type="button" data-action="delete" data-table="chores" data-id="${c.id}">מחיקת מטלה</button>` : ''}
    </form>`);
}

function homeAddSheet() {
  openSheet('מה להוסיף לבית?', `
    <div class="stack">
      <button class="card choice" data-action="add-home-chore"><b>🔁 מטלה חוזרת</b><span class="muted">כל יום, כל שבוע או כל כמה ימים. למשל: להשקות עציצים כל יום</span></button>
      <button class="card choice" data-action="add-home-task"><b>✅ משימה חד-פעמית</b><span class="muted">משהו שצריך לעשות פעם אחת, כמו להזמין טכנאי</span></button>
    </div>`);
}

// Keeps the add/edit task form consistent:
// habits are always private (no "home" area, no due date); a new home task can instead
// be made recurring, which turns it into a chore (no due date either).
function syncTaskForm(form) {
  const kind = form.querySelector('[name="kind"]:checked, [name="kind"][type="hidden"]')?.value;
  const isHabit = kind === 'habit';
  const home = form.querySelector(`[name="area"][value="${HOME_AREA}"]`);
  if (home) {
    home.closest('.chip').hidden = isHabit;
    if (isHabit && home.checked) form.querySelector('[name="area"]').checked = true;
  }
  const repeatBlock = form.querySelector('.repeat-block');
  if (repeatBlock) repeatBlock.hidden = !home?.checked;
  const repeating = !!repeatBlock && !repeatBlock.hidden && form.querySelector('[name="repeat"]:checked')?.value !== '0';
  form.querySelector('.due-block').hidden = isHabit || repeating;
}

function taskSheet(t, kind = 'task', area = AREAS[0].name, repeat = '0') {
  kind = t?.kind ?? kind;
  openSheet(t ? (kind === 'habit' ? 'עריכת הרגל' : 'עריכת משימה') : 'הוספה', `
    <form data-form="task" data-id="${t?.id ?? ''}" class="stack">
      ${t ? `<input type="hidden" name="kind" value="${kind}">` : chips('kind', [['task', '✅ משימה'], ['habit', '🌱 הרגל יומי']], kind)}
      <input name="title" placeholder="מה צריך לעשות?" value="${esc(t?.title)}" required ${t ? '' : 'autofocus'}>
      <label class="field-label">תחום</label>
      ${chips('area', AREAS.map((a) => [a.name, `${a.icon} ${a.name}${a.name === HOME_AREA ? ' (משותף)' : ''}`]), t?.area ?? area)}
      ${t ? '' : `<div class="repeat-block">
        <label class="field-label">חוזרת?</label>
        ${chips('repeat', [['0', 'פעם אחת'], ...INTERVALS], repeat)}
      </div>`}
      <div class="due-block">
        <label class="field-label">תאריך יעד</label>
        <div class="quick">
          <button type="button" class="chip-btn" data-action="set-date" data-value="${today()}">היום</button>
          <button type="button" class="chip-btn" data-action="set-date" data-value="${addDays(today(), 1)}">מחר</button>
          <button type="button" class="chip-btn" data-action="set-date" data-value="">ללא</button>
          <input type="date" name="due_date" value="${t?.due_date ?? (t ? '' : today())}">
        </div>
      </div>
      <button class="btn primary" type="submit">${t ? 'שמירה' : 'הוספה'}</button>
      ${t ? `<button class="btn danger" type="button" data-action="delete" data-table="tasks" data-id="${t.id}">מחיקה</button>` : ''}
    </form>`);
  syncTaskForm(sheetRoot.querySelector('form'));
}

function expenseSheet(e) {
  openSheet(e ? 'עריכת הוצאה' : 'הוצאה משותפת חדשה', `
    <form data-form="expense" data-id="${e?.id ?? ''}" class="stack">
      <div class="amount-input"><span>₪</span><input name="amount" type="text" inputmode="decimal" placeholder="0" value="${e?.amount ?? ''}" required ${e ? '' : 'autofocus'}></div>
      <input name="description" placeholder="על מה? למשל: קניות בסופר" value="${esc(e?.description)}" required>
      <label class="field-label">קטגוריה</label>
      ${chips('category', CATEGORIES.map((c) => [c.name, `${c.icon} ${c.name}`]), e?.category ?? CATEGORIES[0].name)}
      <label class="field-label">מי שילם?</label>
      ${chips('paid_by', membersMeFirst().map((m) => [m.id, esc(memberName(m.id))]), e?.paid_by ?? me().id)}
      <label class="field-label">תאריך</label>
      <input type="date" name="spent_on" value="${e?.spent_on ?? today()}" required>
      <button class="btn primary" type="submit">${e ? 'שמירה' : 'הוספה'}</button>
      ${e ? `<button class="btn danger" type="button" data-action="delete" data-table="expenses" data-id="${e.id}">מחיקת הוצאה</button>` : ''}
    </form>`);
}

function settingsSheet() {
  const h = S.ctx.household;
  openSheet('הגדרות', `
    <form data-form="profile" class="stack">
      <label class="field-label">השם שלי</label>
      <input name="name" value="${esc(me().name)}" required>
      <button class="btn" type="submit">שמירת שם</button>
    </form>
    <div class="card stack">
      <b>מראה</b>
      <div class="seg">${[['auto', 'אוטומטי'], ['dark', 'כהה'], ['light', 'בהיר']].map(([id, label]) => `<button class="${theme === id ? 'on' : ''}" data-action="set-theme" data-theme="${id}">${label}</button>`).join('')}</div>
    </div>
    <div class="card stack">
      <b>${esc(h.name)}</b>
      <div class="muted">חברים: ${S.ctx.members.map((m) => esc(m.name)).join(', ')}</div>
      ${S.ctx.members.length < 2 ? `<div>שלחו לבן/בת הזוג את קוד ההצטרפות:</div>` : `<div class="muted">קוד הבית:</div>`}
      <button class="code" data-action="copy-code" data-code="${esc(h.join_code)}">${esc(h.join_code)} <small>העתקה</small></button>
    </div>
    ${store.mode === 'demo'
      ? `<div class="card stack"><b>מצב הדגמה</b><div class="muted">הנתונים נשמרים רק בדפדפן הזה. אחרי החיבור ל-Supabase הנתונים יסונכרנו בין שני הטלפונים.</div>
          <button class="btn" data-action="switch-user">החלפת משתמש (${esc(S.ctx.members.find((m) => m.id !== me().id).name)})</button>
          <button class="btn danger" data-action="reset-demo">איפוס נתוני הדגמה</button></div>`
      : `<button class="btn danger" data-action="sign-out">התנתקות</button>`}`);
}

/* ---------------- toast ---------------- */

let toastTimer;
function toast(msg, undo) {
  clearTimeout(toastTimer);
  toastRoot.innerHTML = `<div class="toast">${esc(msg)}${undo ? ' <button data-action="undo">ביטול</button>' : ''}</div>`;
  toastRoot.onclick = async (e) => {
    if (e.target.closest('[data-action="undo"]') && undo) { toastRoot.innerHTML = ''; await undo(); await refresh(); }
  };
  toastTimer = setTimeout(() => { toastRoot.innerHTML = ''; }, 4000);
}

/* ---------------- actions ---------------- */

const find = (table, id) => S.data[table].find((r) => r.id === id);

const actions = {
  tab: (el) => { S.tab = el.dataset.tab; try { localStorage.setItem('home-app-tab', S.tab); } catch {} render(); window.scrollTo(0, 0); },
  settings: () => settingsSheet(),
  'close-sheet': () => closeSheet(),
  'personal-view': (el) => { S.personalView = el.dataset.view; render(); },
  'exp-view': (el) => { S.expView = el.dataset.view; render(); },
  'set-theme': (el) => {
    theme = el.dataset.theme;
    try { localStorage.setItem('home-app-theme', theme); } catch {}
    applyTheme(theme);
    settingsSheet();
  },
  'toggle-home-done': () => { S.showHomeDone = !S.showHomeDone; render(); },
  'add-home-chore': () => choreSheet(),
  'add-home-task': () => taskSheet(null, 'task', HOME_AREA),
  'auth-mode': () => { S.authMode = S.authMode === 'login' ? 'signup' : 'login'; render(); },
  month: (el) => {
    const d = parseDate(S.month + '-01');
    d.setMonth(d.getMonth() + Number(el.dataset.dir));
    S.month = localDate(d).slice(0, 7);
    render();
  },
  add: () => {
    if (S.tab === 'home') return homeAddSheet();
    if (S.tab === 'expenses') return expenseSheet();
    return taskSheet(null, S.tab === 'personal' && S.personalView === 'habits' ? 'habit' : 'task');
  },
  'edit-chore': (el) => choreSheet(find('chores', el.dataset.id)),
  'edit-task': (el) => taskSheet(find('tasks', el.dataset.id)),
  'edit-expense': (el) => expenseSheet(find('expenses', el.dataset.id)),
  'done-chore': async (el) => {
    const c = find('chores', el.dataset.id);
    const prev = { last_done_at: c.last_done_at, last_done_by: c.last_done_by };
    const now = new Date().toISOString();
    await store.update('chores', c.id, { last_done_at: now, last_done_by: me().id });
    const log = await store.insert('chore_log', { chore_id: c.id, done_by: me().id, done_at: now });
    await refresh();
    toast(`"${c.title}" סומן כבוצע ✓`, async () => {
      await store.update('chores', c.id, prev);
      await store.remove('chore_log', log.id);
    });
  },
  'toggle-task': async (el) => {
    const t = find('tasks', el.dataset.id);
    const undone = { done_at: null, done_by: null };
    await store.update('tasks', t.id, t.done_at ? undone : { done_at: new Date().toISOString(), done_by: me().id });
    await refresh();
    if (!t.done_at) toast('כל הכבוד! ✓', () => store.update('tasks', t.id, undone));
  },
  'toggle-habit': async (el) => {
    const { id, day } = el.dataset;
    const existing = S.data.habit_checks.find((c) => c.task_id === id && c.day === day);
    if (existing) await store.remove('habit_checks', existing.id);
    else await store.insert('habit_checks', { task_id: id, day });
    await refresh();
  },
  'set-date': (el) => {
    el.closest('form').querySelector('[name="due_date"]').value = el.dataset.value;
  },
  delete: async (el) => {
    if (!confirm('למחוק?')) return;
    await store.remove(el.dataset.table, el.dataset.id);
    closeSheet();
    await refresh();
  },
  'copy-code': async (el) => {
    try { await navigator.clipboard.writeText(el.dataset.code); toast('הקוד הועתק'); } catch { toast(el.dataset.code); }
  },
  'switch-user': async () => { store.switchUser(); closeSheet(); await reloadSession(); },
  'reset-demo': async () => { if (!confirm('לאפס את כל נתוני ההדגמה?')) return; store.reset(); closeSheet(); await reloadSession(); },
  'sign-out': async () => { await store.signOut(); closeSheet(); await reloadSession(); },
};

const forms = {
  auth: async (f) => {
    if (S.authMode === 'signup') {
      const { needsConfirm } = await store.signUp(f.email.trim(), f.password, f.name.trim());
      if (needsConfirm) { toast('נשלח אליך מייל לאישור. אשרו אותו ואז התחברו'); S.authMode = 'login'; return render(); }
    } else {
      await store.signIn(f.email.trim(), f.password);
    }
    await reloadSession();
  },
  'create-household': async (f) => { await store.createHousehold(f.name.trim()); await reloadSession(); },
  'join-household': async (f) => { await store.joinHousehold(f.code.trim()); await reloadSession(); },
  profile: async (f) => { await store.updateProfile({ name: f.name.trim() }); closeSheet(); await reloadSession(); },
  chore: async (f, id) => {
    const interval_days = f.preset === 'custom' ? Number(f.custom_days) : Number(f.preset);
    if (!interval_days || interval_days < 1) throw new Error('תדירות לא תקינה');
    const row = { title: f.title.trim(), interval_days };
    if (id) await store.update('chores', id, row);
    else await store.insert('chores', { ...row, last_done_at: null, last_done_by: null });
  },
  task: async (f, id) => {
    // A recurring home task is a chore.
    if (!id && f.kind === 'task' && f.area === HOME_AREA && f.repeat && f.repeat !== '0') {
      const interval_days = Number(f.repeat);
      await store.insert('chores', { title: f.title.trim(), interval_days, last_done_at: null, last_done_by: null });
      toast(`נוספה מטלת בית חוזרת · ${INTERVALS.find(([v]) => v === interval_days)[1]} 🔁`);
      return;
    }
    const shared = f.kind === 'task' && f.area === HOME_AREA;
    const row = {
      title: f.title.trim(), area: f.area, kind: f.kind,
      due_date: f.kind === 'task' ? f.due_date || null : null,
      household_id: shared ? S.ctx.household.id : null,
    };
    // A task taken out of the shared home area becomes private to whoever moved it.
    if (id) await store.update('tasks', id, shared ? row : { ...row, user_id: me().id });
    else await store.insert('tasks', { ...row, done_at: null, done_by: null });
    if (shared && S.tab !== 'home' && S.tab !== 'today') toast('נוסף ללשונית בית 🏠 (משותף)');
  },
  expense: async (f, id) => {
    const amount = Number(String(f.amount).replace(/[^\d.,]/g, '').replace(',', '.'));
    if (!amount || amount <= 0) throw new Error('סכום לא תקין');
    const row = { amount: Math.round(amount * 100) / 100, description: f.description.trim(), category: f.category, paid_by: f.paid_by, spent_on: f.spent_on };
    if (id) await store.update('expenses', id, row);
    else await store.insert('expenses', row);
    S.month = f.spent_on.slice(0, 7);
  },
};

/* ---------------- event wiring ---------------- */

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.closest('#toast-root')) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  e.preventDefault();
  try { await fn(el); } catch (err) { toast('שגיאה: ' + err.message); }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheetRoot.classList.contains('open')) closeSheet();
});

document.addEventListener('change', (e) => {
  if (['kind', 'area', 'repeat'].includes(e.target.name) && e.target.closest('form[data-form="task"]')) syncTaskForm(e.target.closest('form'));
  if (e.target.name === 'custom_days') {
    const custom = e.target.closest('form').querySelector('[name="preset"][value="custom"]');
    if (custom) custom.checked = true;
  }
});

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const btn = form.querySelector('[type="submit"]');
  btn.disabled = true;
  try {
    const name = form.dataset.form;
    await forms[name](Object.fromEntries(new FormData(form)), form.dataset.id || null);
    if (['chore', 'task', 'expense'].includes(name)) { closeSheet(); await refresh(); }
  } catch (err) {
    toast('שגיאה: ' + err.message);
  } finally {
    btn.disabled = false;
  }
});

boot();
