import { createStore, localDate } from './store.js';
import { VAPID_PUBLIC_KEY } from './config.js';
import { parseQuick, shoppingItems } from './parse.js';

/* ---------------- constants ---------------- */

// `icon` names a line icon in ICON_PATHS.
const CATEGORIES = [
  { name: 'סופר', icon: 'cart' },
  { name: 'חשבונות', icon: 'receipt' },
  { name: 'כללי', icon: 'box' },
  { name: 'אוכל בחוץ ובילויים', icon: 'cup' },
];
// A one-off task in the HOME_AREA is shared with the household; every other area is private.
const HOME_AREA = 'בית';
const AREAS = [
  { name: 'אישי' },
  { name: HOME_AREA },
  { name: 'התפתחות אישית' },
  { name: 'בריאות וספורט' },
  { name: 'עבודה' },
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
  homeView: 'chores', // or 'shop'
  showHomeDone: false,
  room: null, // the room picked on the Home screen, null for all of them
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
const catIcon = (name) => icon(CATEGORIES.find((c) => c.name === name)?.icon ?? 'box');
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
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2.5"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  cart: '<path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.2L20.5 8H6.2"/><circle cx="9.5" cy="20" r="1.2"/><circle cx="17" cy="20" r="1.2"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  box: '<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/>',
  cup: '<path d="M5 9h12v4a6 6 0 0 1-12 0z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3c0 1.5 1 1.5 1 3M12 3c0 1.5 1 1.5 1 3"/>',
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

const WEEKDAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const WEEKDAY_LETTERS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const daysList = (days) => (days.length <= 2 ? days.map((d) => WEEKDAY_NAMES[d]).join(' או ') : days.map((d) => WEEKDAY_LETTERS[d]).join(', '));
// The weekdays a chore is limited to, or null for any day.
const choreDays = (c) => (c.days?.length && c.days.length < 7 ? c.days : null);

/* A chore limited to some weekdays ("every week, Friday or Saturday") is due on one of its days when it wasn't
   done yet in this run of its days, and enough time passed since last time: the interval, less up to the six days
   a run can span. Done on Friday, it waits for next weekend; skipped altogether, it's late the next time round.
   Mirrored in supabase/functions/notify. */
function choreDueOn(c, days, day) {
  if (!days.includes(parseDate(day).getDay())) return false;
  if (!c.last_done_at) return true;
  const done = localDate(new Date(c.last_done_at));
  let start = day;
  for (let i = 1; i < Math.min(c.interval_days, 7); i++) {
    const prev = addDays(day, -i);
    if (!days.includes(parseDate(prev).getDay())) break;
    start = prev;
  }
  return done < start && dayDiff(parseDate(done), parseDate(day)) >= c.interval_days - 6;
}

function choreStatus(c) {
  const days = choreDays(c);
  const every = `${INTERVALS.find(([v]) => v === c.interval_days)?.[1] ?? `כל ${daysHe(c.interval_days)}`}${days ? `, ${daysList(days)}` : ''}`;
  if (!days) {
    if (!c.last_done_at) return { remaining: 0, ratio: 1.01, level: 'due', pill: 'עוד לא בוצע', sub: every };
    const since = dayDiff(new Date(c.last_done_at), new Date());
    const remaining = c.interval_days - since;
    const ratio = since / c.interval_days;
    const level = remaining < 0 ? 'late' : remaining === 0 ? 'due' : ratio >= 0.6 ? 'soon' : 'ok';
    const pill = remaining < 0 ? `באיחור ${daysHe(remaining)}` : remaining === 0 ? 'להיום' : remaining === 1 ? 'מחר' : `בעוד ${daysHe(remaining)}`;
    return { remaining, ratio, level, pill, sub: `<span class="who-line">${whoChip(c.last_done_by)}${esc(memberName(c.last_done_by))}</span><span>${agoHe(since)}</span>` };
  }
  // Days until it's next due (0: today).
  let ahead = 0;
  while (ahead < 60 && !choreDueOn(c, days, addDays(today(), ahead))) ahead++;
  const since = c.last_done_at ? dayDiff(new Date(c.last_done_at), new Date()) : null;
  const remaining = ahead || (since !== null && since > c.interval_days ? c.interval_days - since : 0);
  const ratio = remaining <= 0 ? 1.01 - remaining / 100 : 1 - remaining / (c.interval_days + 7);
  const level = remaining < 0 ? 'late' : remaining === 0 ? 'due' : remaining === 1 ? 'soon' : 'ok';
  const pill = remaining < 0 ? `באיחור ${daysHe(remaining)}`
    : remaining === 0 ? (c.last_done_at ? 'להיום' : 'עוד לא בוצע')
    : remaining === 1 ? 'מחר'
    : remaining < 7 ? `ביום ${WEEKDAY_NAMES[parseDate(addDays(today(), remaining)).getDay()]}`
    : `בעוד ${daysHe(remaining)}`;
  const sub = c.last_done_at
    ? `<span class="who-line">${whoChip(c.last_done_by)}${esc(memberName(c.last_done_by))}</span><span>${agoHe(since)}</span><span>${daysList(days)}</span>`
    : every;
  return { remaining, ratio, level, pill, sub };
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
  // A phone that already allowed notifications re-registers, so the server always has it under whoever is signed in.
  if (S.ctx.household && canPush && Notification.permission === 'granted') subscribePush().catch(() => {});
}

// Reloads can overlap (your own change, the partner's, coming back to the app); only the latest one is drawn.
let loads = 0;
async function refresh() {
  if (!S.ctx?.household) return;
  const n = ++loads;
  const data = await store.loadAll();
  if (n !== loads) return;
  S.data = data;
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
  // The signed-in person's colour (swipe background, recording mic).
  document.body.classList.remove('who-a', 'who-b');
  document.body.classList.add(whoClass(me().id));
  // A redraw (say, the partner added something) shouldn't wipe what's being typed into the list's add field.
  const typing = document.activeElement?.closest('.shop-add') && document.activeElement;
  const typed = typing && { value: typing.value, start: typing.selectionStart };
  app.innerHTML = `
    ${{ today: () => houseScene(dateLine), home: homeScene, personal: plantScene, expenses: expenseScene }[tab.id]()}
    ${store.mode === 'demo' ? `<div class="demo-bar"><span>מצב הדגמה. מחובר/ת כ<b>${esc(me().name)}</b></span><button data-action="switch-user">החלפה</button></div>` : ''}
    <main class="content">${body}</main>
    <nav class="tabbar">
      ${TABS.slice(0, 2).map(tabBtn).join('')}
      <button class="tab-add" data-action="add" aria-label="הוספה בהקלדה">${icon('plus')}</button>
      ${TABS.slice(2).map(tabBtn).join('')}
    </nav>
    <button class="voice-fab" data-action="voice" aria-label="הוספה בהקלטה">${icon('mic')}</button>`;
  const input = typed && document.querySelector('.shop-add input');
  if (input) {
    input.value = typed.value;
    input.focus({ preventScroll: true });
    input.setSelectionRange(typed.start, typed.start);
  }
  fitScene();
  if (tab.id === 'expenses') animateExpenses();
  else S.anim = null;
}

// The scene is a fixed backdrop photo; the page starts at the photo's `end` line and scrolls over the rest.
function fitScene() {
  const photo = document.querySelector('.scene .photo-frame');
  if (!photo) return;
  const crop = Number(photo.dataset.crop);
  const scale = photo.getBoundingClientRect().height / (photo.dataset.h - crop);
  document.documentElement.style.setProperty('--scene-h', `${Math.round((photo.dataset.end - crop) * scale)}px`);
}
addEventListener('resize', fitScene);
// As the page scrolls, the scene's words fade and its picture dims, so nothing collides with the cards.
addEventListener('scroll', () => {
  const root = document.documentElement.style;
  root.setProperty('--fade', Math.max(0, 1 - scrollY / 130).toFixed(2));
  root.setProperty('--dim', (Math.min(1, scrollY / 240) * .6).toFixed(2));
}, { passive: true });
document.fonts?.ready.then(fitScene);

function sceneTop(text) {
  return `
    <div class="scene-top">
      <div class="date">${esc(text)}</div>
      <button class="icon-btn" data-action="settings" aria-label="הגדרות">${icon('settings')}</button>
    </div>`;
}

/* The house on the Today screen: a photo at dusk with its lights off, and the same photo with them on.
   Each window shows through from the lit photo as another share of the day gets done. */

// Each window in the photo's own pixels (941 × 1672): x, y, width, height. Upstairs first.
const ROOMS = [
  [186, 744, 151, 145], [381, 744, 187, 145], [612, 744, 152, 145],
  [178, 958, 159, 191], [381, 958, 188, 191], [612, 958, 159, 191],
];
// The strip of pool below the house, which mirrors whichever downstairs window is lit.
const POOL = [1203, 58];

function roomsLit(done, total) {
  if (!total) return ROOMS.length;
  if (done >= total) return ROOMS.length;
  return done ? Math.min(ROOMS.length - 1, Math.max(1, Math.round((done / total) * ROOMS.length))) : 0;
}

// Everything on today's plate (the same items the Today lists show), done or not.
function todayProgress() {
  const open = S.data.chores.filter((c) => choreStatus(c).remaining <= 0).length;
  const doneChores = S.data.chores.filter((c) => c.last_done_at && dayDiff(new Date(c.last_done_at), new Date()) === 0).length;
  const tasks = S.data.tasks.filter((t) => t.kind === 'task' && visibleNow(t) && t.due_date && t.due_date <= today());
  const doneTasks = tasks.filter((t) => t.done_at).length;
  const habits = S.data.tasks.filter((t) => t.kind === 'habit');
  const doneHabits = habits.filter((h) => S.data.habit_checks.some((c) => c.task_id === h.id && c.day === today())).length;
  const done = doneChores + doneTasks + doneHabits;
  return { done, total: done + open + tasks.length - doneTasks + habits.length - doneHabits };
}


function houseScene(dateLine) {
  const { done, total } = todayProgress();
  const lit = roomsLit(done, total);
  const left = total - done;
  const line = !total ? 'אין כלום להיום, הבית מואר' : !left ? 'סיימת הכל, הבית מואר' : left === 1 ? 'עוד דבר אחד להיום' : `עוד ${left} דברים להיום`;
  const rooms = ROOMS.map(([x, y, w, h], i) => {
    const rects = [[x - 6, y - 6, w + 12, h + 12], ...(i >= 3 ? [[x - 6, POOL[0], w + 12, POOL[1]]] : [])];
    return `<img class="room ${i < lit ? 'on' : ''}" src="images/house-on.jpg" alt="" style="${clipStyle(rects)}">`;
  }).join('');
  return `
    <header class="scene photo">
      ${photoFrame({ off: 'images/house-off.jpg', crop: 280, end: POOL[0], label: `בית שבו ${lit} מתוך ${ROOMS.length} חדרים מוארים`, layers: rooms })}
      ${sceneTop(dateLine)}
      <h1 class="hello">${greeting()},<br>${esc(me().name)}</h1>
      <p class="scene-line">${line}</p>
    </header>`;
}

/* Photo scenes. Each is a pair of matching photos, 941 × 1672 unless said otherwise: the "off" one fills the screen
   and parts of the "on" one show through on top. The frame shows the photo from `crop` px down; the page starts at `end`. */
const PHOTO_W = 941;
const PHOTO_H = 1672;

function photoFrame({ off, crop, end, label, layers, w = PHOTO_W, h: full = PHOTO_H }) {
  const h = full - crop;
  return `
    <div class="photo-bg" role="img" aria-label="${label}">
      <div class="photo-frame" data-crop="${crop}" data-end="${end}" data-h="${full}" style="--top:${(-crop / h * 100).toFixed(3)}%;aspect-ratio:${w}/${h};height:max(100%, calc(100vw * ${h} / ${w}))">
        <img src="${off}" alt="">${layers}
      </div>
    </div>`;
}

// Plain <img> layers cut with clip-path polygons (in % of the photo): Safari draws these reliably, unlike SVG
// <image> with clipPath. Rects stacked in one column join into one polygon through a zero-width seam.
function clipStyle(rects) {
  const pct = (v, of) => `${((v / of) * 100).toFixed(2)}%`;
  const pts = rects.flatMap(([x, y, w, h]) => {
    const [l, r, t, b] = [pct(x, PHOTO_W), pct(x + w, PHOTO_W), pct(y, PHOTO_H), pct(y + h, PHOTO_H)];
    return [`${l} ${t}`, `${r} ${t}`, `${r} ${b}`, `${l} ${b}`];
  }).join(', ');
  return `-webkit-clip-path:polygon(${pts});clip-path:polygon(${pts})`;
}

// A rolling week (the last 7 days), so the bar isn't empty every Sunday morning.
function weekStartIso() {
  const d = startOfDay(new Date());
  d.setDate(d.getDate() - 6);
  return d.toISOString();
}

// How many shared home things each partner did in the last 7 days.
function weekCounts() {
  const since = weekStartIso();
  const counts = {};
  const add = (id) => { if (id) counts[id] = (counts[id] ?? 0) + 1; };
  for (const l of S.data.chore_log) if (l.done_at >= since) add(l.done_by);
  for (const t of S.data.tasks) if (t.household_id && t.done_at && t.done_at >= since) add(t.done_by);
  return counts;
}

/* The Home screen: the house cut open. A room with chores waiting is dark; finish them and its light comes on. */

// Each room in the cutaway photo's pixels: x, y, width, height.
const CELLS = [
  { id: 'bedroom', name: 'חדר שינה', x: 80, y: 576, w: 300, h: 249, words: ['מצעים', 'מיטה', 'ארון', 'שינה'] },
  { id: 'bath', name: 'אמבטיה', x: 401, y: 576, w: 160, h: 249, words: ['אמבטיה', 'מקלחת', 'שירותים', 'אסלה', 'מראה'] },
  { id: 'balcony', name: 'מרפסת', x: 582, y: 576, w: 307, h: 249, words: ['עציץ', 'עציצים', 'צמחים', 'מרפסת', 'גינה', 'להשקות'] },
  { id: 'living', name: 'סלון', x: 80, y: 862, w: 353, h: 286, words: ['סלון', 'ספה', 'אבק', 'שטיח', 'טלוויזיה', 'מדף'] },
  { id: 'kitchen', name: 'מטבח', x: 455, y: 862, w: 222, h: 286, words: ['מטבח', 'מקרר', 'כלים', 'מדיח', 'תנור', 'כיריים', 'שיש', 'זבל', 'מיקרו'] },
  { id: 'other', name: 'שאר הבית', x: 698, y: 862, w: 171, h: 286, words: [] },
];
const ROOMS_CROP = 100;

const roomOf = (c) => c.room ?? CELLS.find((r) => r.words.some((w) => c.title.includes(w)))?.id ?? 'other';
const roomName = (id) => CELLS.find((r) => r.id === id)?.name;
const waitingIn = (room) => S.data.chores.filter((c) => roomOf(c) === room && choreStatus(c).remaining <= 0).length;

function homeScene() {
  const waiting = CELLS.filter((r) => waitingIn(r.id)).length;
  const line = !S.data.chores.length ? 'הוסיפו מטלות, וכל מטלה תמצא את החדר שלה' : !waiting ? 'כל החדרים מוארים' : waiting === 1 ? 'חדר אחד מחכה לך' : `${waiting} חדרים מחכים לך`;
  const h = PHOTO_H - ROOMS_CROP;
  const pos = (r) => `left:${(r.x / PHOTO_W * 100).toFixed(2)}%;top:${((r.y - ROOMS_CROP) / h * 100).toFixed(2)}%;width:${(r.w / PHOTO_W * 100).toFixed(2)}%;height:${(r.h / h * 100).toFixed(2)}%`;
  // Per room: the lit photo cut to its walls, and a button over it with its name and how many chores wait there.
  const cells = CELLS.map((r) => {
    const n = waitingIn(r.id);
    return `
      <div class="cell ${n ? '' : 'on'} ${S.room === r.id ? 'picked' : ''}" data-room="${r.id}">
        <img src="images/rooms-on.jpg" alt="" style="${clipStyle([[r.x, r.y, r.w, r.h]])}">
        <button class="cell-btn" data-action="room" data-room="${r.id}" style="${pos(r)}" aria-label="${r.name}${n ? `, ${n} מטלות מחכות` : ''}">
          <span class="cell-name">${n ? `<b>${n}</b>` : ''}${r.name}</span>
        </button>
      </div>`;
  }).join('');
  const counts = weekCounts();
  return `
    <header class="scene photo">
      ${photoFrame({ off: 'images/rooms-off.jpg', crop: ROOMS_CROP, end: 1160, label: 'חתך של הבית', layers: cells })}
      ${sceneTop(S.ctx.household.name)}
      <h1 class="hello">הבית</h1>
      <p class="scene-line">${line}</p>
      ${S.ctx.members.length === 2 ? `<div class="payers">${S.ctx.members.map((m, i) => `<div class="${i ? 'who-b' : 'who-a'}"><span>${esc(m.name)}, השבוע</span><b>${counts[m.id] ?? 0}</b></div>`).join('')}</div>` : ''}
    </header>`;
}

/* The Personal screen: a pot that grows with every day you kept a habit. It stops when you stop, but never wilts. */

// Days of habits needed for each stage; images/plant-N.jpg is the same windowsill with stage N's plant.
const PLANT_STAGES = [0, 3, 7, 14, 30, 60];

function plantProgress() {
  const days = new Set(S.data.habit_checks.map((c) => c.day)).size;
  const stage = PLANT_STAGES.filter((d) => days >= d).length - 1;
  return { days, stage, next: PLANT_STAGES[stage + 1] };
}

function plantScene() {
  const { days, stage, next } = plantProgress();
  // On growing, the new stage's photo fades in over the last one.
  const was = S.plantStage ?? stage;
  S.plantStage = stage;
  const line = !next ? 'העציץ שלך פורח' : !days ? 'סמן הרגל, והעציץ יתחיל לצמוח' : `עוד ${next - days} ימי הרגלים לשלב הבא`;
  const open = S.data.tasks.filter((t) => t.kind === 'task' && !t.household_id && !t.done_at).length;
  return `
    <header class="scene photo">
      ${photoFrame({ off: `images/plant-${Math.min(was, stage)}.jpg`, crop: 0, end: 990, w: 768, h: 1376,
        label: `עציץ בשלב ${stage + 1} מתוך ${PLANT_STAGES.length}`, layers: was < stage ? `<img class="grow" src="images/plant-${stage}.jpg" alt="">` : '' })}
      ${sceneTop(me().name)}
      <h1 class="hello">אישי</h1>
      <p class="scene-line">${line}</p>
      <div class="payers">
        <div><span>ימי הרגלים</span><b>${days}</b></div>
        <div class="who-b"><span>משימות פתוחות</span><b>${open}</b></div>
      </div>
    </header>`;
}

function section(title, inner, count) {
  return `<section class="sec"><h2>${title}${count ? `<span class="count">${count}</span>` : ''}</h2>${inner}</section>`;
}

// Swipeable wrapper: dragging the row sideways uncovers a button. Dragging left uncovers `action`
// (like tapping the checkbox) and dragging right uncovers delete; nothing happens until it's tapped.
function swipe(rowHtml, action, id, table, doneLabel, day = '') {
  return `
    <div class="swipe" data-swipe="${action}" data-table="${table}" data-id="${id}"${day ? ` data-day="${day}"` : ''}>
      <div class="swipe-bg">
        <button class="swipe-btn swipe-done" data-action="swipe-done">${icon('check')}<span>${doneLabel}</span></button>
        <button class="swipe-btn swipe-delete" data-action="swipe-delete">${icon('trash')}<span>מחיקה</span></button>
      </div>
      ${rowHtml}
    </div>`;
}

function choreRow(c) {
  const st = choreStatus(c);
  return swipe(`
    <div class="row chore lvl-${st.level}" data-action="edit-chore" data-id="${c.id}">
      <button class="box" data-action="done-chore" data-id="${c.id}" aria-label="סמן כבוצע"></button>
      <div class="row-main">
        <div class="row-title">${esc(c.title)}</div>
        <div class="row-sub">${st.sub}</div>
      </div>
      <span class="pill">${st.pill}</span>
    </div>`, 'done-chore', c.id, 'chores', 'בוצע');
}

function taskRow(t) {
  const late = t.due_date && !t.done_at && t.due_date < today();
  const sub = [
    `<span>${t.household_id ? 'בית, משותף' : esc(t.area)}</span>`,
    t.due_date && !t.done_at ? `<span class="${late ? 'late' : ''}">${dueLabel(t.due_date)}</span>` : '',
    t.done_at && t.household_id && t.done_by ? `<span class="who-line">${whoChip(t.done_by)}${esc(memberName(t.done_by))}</span>` : '',
    t.done_at ? `<span>בוצע ${agoHe(dayDiff(new Date(t.done_at), new Date()))}</span>` : '',
  ].filter(Boolean).join('');
  return swipe(`
    <div class="row task ${t.done_at ? 'done' : ''}" data-action="edit-task" data-id="${t.id}">
      <button class="box" data-action="toggle-task" data-id="${t.id}" aria-label="סימון">${t.done_at ? icon('check') : ''}</button>
      <div class="row-main">
        <div class="row-title">${esc(t.title)}</div>
        <div class="row-sub">${sub}</div>
      </div>
    </div>`, 'toggle-task', t.id, 'tasks', t.done_at ? 'החזרה' : 'בוצע');
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
  const row = `
    <div class="row habit ${compact && checkedToday ? 'done' : ''}" data-action="edit-task" data-id="${h.id}">
      ${compact ? `<button class="box" data-action="toggle-habit" data-id="${h.id}" data-day="${today()}" aria-label="בוצע היום">${checkedToday ? icon('check') : ''}</button>` : ''}
      <div class="row-main">
        <div class="row-title">${esc(h.title)}</div>
        <div class="row-sub"><span>${esc(h.area)}</span>${s ? `<span class="streak">${s === 1 ? 'יום ראשון ברצף' : `${s} ימים ברצף`}</span>` : ''}</div>
      </div>
      ${compact ? '' : `<div class="dots">${dots}</div>`}
    </div>`;
  return compact ? swipe(row, 'toggle-habit', h.id, 'tasks', checkedToday ? 'החזרה' : 'בוצע', today()) : row;
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

/* The shopping list, shared by the household. Ticking an item off moves it to "bought lately", where a tap puts it back. */
const SHOP_CATEGORIES = ['סופר', 'כללי'];
const toBuy = () => S.data.shopping.filter((i) => !i.bought_at);

function shopRow(i) {
  return swipe(`
    <div class="row shop-row" data-action="edit-shop" data-id="${i.id}">
      <button class="box" data-action="buy" data-id="${i.id}" aria-label="סמן שנקנה"></button>
      <div class="row-main"><div class="row-title">${esc(i.title)}</div></div>
    </div>`, 'buy', i.id, 'shopping', 'נקנה');
}

function viewShopping() {
  const open = toBuy();
  const openTitles = new Set(open.map((i) => i.title));
  // Each thing bought lately once, newest first, unless it's already back on the list.
  const recent = [];
  for (const i of S.data.shopping.filter((x) => x.bought_at).sort((a, b) => b.bought_at.localeCompare(a.bought_at))) {
    if (!openTitles.has(i.title) && !recent.some((r) => r.title === i.title)) recent.push(i);
  }
  return `
    <form data-form="shop" class="shop-add">
      <input name="title" placeholder="מה צריך לקנות? אפשר כמה, עם פסיקים" autocomplete="off" enterkeyhint="done" required>
      <button class="btn" type="submit" aria-label="הוספה">${icon('plus')}</button>
    </form>
    ${open.length
      ? SHOP_CATEGORIES.map((cat) => [cat, open.filter((i) => i.category === cat)]).filter(([, list]) => list.length)
        .map(([cat, list]) => section(cat, `<div class="list">${list.map(shopRow).join('')}</div>`, list.length)).join('')
      : empty('הרשימה ריקה. מה שתוסיפו כאן יופיע גם אצל בן/בת הזוג')}
    ${recent.length ? section('קנינו לאחרונה', `<div class="chips recent">${recent.slice(0, 14).map((i) => `<button class="chip-btn" data-action="shop-again" data-id="${i.id}">+ ${esc(i.title)}</button>`).join('')}</div>`) : ''}`;
}

// Adds items by name; one bought before comes back instead of piling up a duplicate.
async function addShopping(items) {
  const listed = new Set(toBuy().map((i) => i.title));
  for (const { title, category } of items) {
    if (listed.has(title)) continue; // already on the list, or twice in one sentence
    listed.add(title);
    const old = S.data.shopping.find((i) => i.title === title);
    if (old) await store.update('shopping', old.id, { bought_at: null, bought_by: null });
    else await store.insert('shopping', { title, category, bought_at: null, bought_by: null });
  }
}

function shopSheet(i) {
  openSheet('עריכת פריט', `
    <form data-form="shop-edit" data-id="${i.id}" class="stack">
      <input name="title" value="${esc(i.title)}" required>
      <label class="field-label">איפה קונים?</label>
      ${chips('category', SHOP_CATEGORIES.map((c) => [c, c]), i.category)}
      <button class="btn primary" type="submit">שמירה</button>
      <button class="btn danger" type="button" data-action="delete" data-table="shopping" data-id="${i.id}">מחיקה מהרשימה</button>
    </form>`);
}

function viewHome() {
  const seg = `<div class="seg">${[['chores', 'מטלות'], ['shop', `קניות${toBuy().length ? ` ${toBuy().length}` : ''}`]].map(([id, label]) => `<button class="${S.homeView === id ? 'on' : ''}" data-action="home-view" data-view="${id}">${label}</button>`).join('')}</div>`;
  return seg + (S.homeView === 'shop' ? viewShopping() : viewChores());
}

function viewChores() {
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
    ${S.room
    ? `<section class="sec"><h2 class="sec-row">${roomName(S.room)}<button data-action="room" data-room="${S.room}">כל החדרים</button></h2>${listOrEmpty(chores.filter((c) => roomOf(c) === S.room).map(choreRow), 'אין כאן מטלות')}</section>`
    : section('מטלות חוזרות', listOrEmpty(chores.map(choreRow), 'עוד אין מטלות. לחצו + כדי להוסיף'), chores.length)}
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
    ${groups.length ? groups.map(([a, list]) => section(a.name, `<div class="list">${list.map(taskRow).join('')}</div>`, list.filter((t) => !t.done_at).length)).join('') : empty('אין משימות פתוחות')}`;
}

function expenseSummary() {
  const list = monthExpenses().sort((a, b) => b.spent_on.localeCompare(a.spent_on) || (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  const total = list.reduce((s, e) => s + e.amount, 0);
  const members = S.ctx.members; // household order, so the colors match on both phones
  const paid = Object.fromEntries(members.map((m) => [m.id, 0]));
  for (const e of list) paid[e.paid_by] = (paid[e.paid_by] ?? 0) + e.amount;
  return { list, total, members, paid };
}

/* The scale: photos of a brass balance on the table by the window. Whoever paid more this month weighs their
   side down: the first member's pan is on the right (as their name is), the second's on the left. */
function scalePose(lean) {
  const side = lean > 0 ? 'r' : 'l';
  const size = Math.abs(lean);
  return size < .08 ? '0' : `${side}${size < .35 ? 1 : 2}`;
}

function expenseScene() {
  const { total, members, paid } = expenseSummary();
  const monthLabel = parseDate(S.month + '-01').toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
  const isCurrent = S.month === today().slice(0, 7);
  const pair = members.length === 2;
  const lean = pair && total ? (paid[members[0].id] - paid[members[1].id]) / total : 0;
  const pose = scalePose(lean);
  // When the balance shifts, the new photo fades in over the last one.
  const was = S.anim?.pose ?? pose;
  const label = !pair ? 'מאזניים' : pose === '0' ? 'מאזניים מאוזנים' : `מאזניים נוטים לצד של ${esc((lean > 0 ? members[0] : members[1]).name)}`;
  return `
    <header class="scene photo">
      ${photoFrame({ off: `images/scale-${was}.jpg`, crop: 0, end: 1075, w: 768, h: 1376, label,
        layers: was !== pose ? `<img class="grow" src="images/scale-${pose}.jpg" alt="">` : '' })}
      ${sceneTop(S.ctx.household.name)}
      <div class="month-nav">
        <button data-action="month" data-dir="-1" aria-label="חודש קודם">›</button>
        <span>${monthLabel}</span>
        <button data-action="month" data-dir="1" aria-label="חודש הבא" ${isCurrent ? 'disabled' : ''}>‹</button>
      </div>
      <h1 class="total" data-total="${total}" data-pose="${pose}">${money(total)}</h1>
      <div class="total-note">הוצאות משותפות החודש</div>
      ${pair ? `<div class="payers">${members.map((m, i) => `<div class="${i ? 'who-b' : 'who-a'}"><span>${esc(m.name)}</span><b>${money(paid[m.id] ?? 0)}</b></div>`).join('')}</div>` : ''}
    </header>`;
}

// The total counts up from wherever it was before.
function animateExpenses() {
  const el = document.querySelector('.total');
  if (!el) return;
  const to = { pose: el.dataset.pose, total: Number(el.dataset.total) };
  const from = S.anim ?? { total: 0 };
  S.anim = to;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || from.total === to.total) return;
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / 700);
    const eased = 1 - (1 - t) ** 3;
    el.textContent = t < 1 ? money(Math.round(from.total + (to.total - from.total) * eased)) : money(to.total);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// A ring of the month's categories, largest first, with one share each.
function categoryRing(byCat, total) {
  let offset = 0;
  const arcs = byCat.map((c) => {
    const share = (c.sum / total) * 100;
    const arc = `<circle class="arc cat-${c.i}" cx="60" cy="60" r="46" pathLength="100" stroke-dasharray="${Math.max(share - 1, .5)} 100" stroke-dashoffset="${-offset}"/>`;
    offset += share;
    return arc;
  }).join('');
  return `
    <div class="ring">
      <svg viewBox="0 0 120 120" aria-hidden="true">${arcs}</svg>
      <div class="ring-mid"><b>${money(Math.round(total))}</b><span>${byCat.length === 1 ? 'קטגוריה אחת' : `${byCat.length} קטגוריות`}</span></div>
    </div>`;
}

function viewExpenses() {
  const { list, total, members, paid } = expenseSummary();

  let balance = '';
  if (members.length === 2) {
    const other = members.find((m) => m.id !== me().id);
    const diff = (paid[me().id] - paid[other.id]) / 2; // >0 → the other person owes me
    const otherName = esc(other.name);
    balance = Math.abs(diff) < 0.5
      ? `<div class="balance even">מאוזן, אין צורך בהעברה</div>`
      : `<div class="balance"><span>${diff > 0 ? `לקבל מ${otherName}` : `להעביר ל${otherName}`}</span><b>${money(Math.abs(diff))}</b></div>`;
  }

  const views = [['list', 'תנועות'], ['cats', 'קטגוריות']];

  let body;
  if (S.expView === 'cats') {
    const byCat = CATEGORIES.map((c, i) => ({ ...c, i, sum: list.filter((e) => e.category === c.name).reduce((s, e) => s + e.amount, 0) }))
      .filter((c) => c.sum > 0).sort((a, b) => b.sum - a.sum);
    body = byCat.length ? `${categoryRing(byCat, total)}<div class="list">${byCat.map((c) => `
      <div class="row cat-row">
        <span class="tile cat-${c.i}">${icon(c.icon)}</span>
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
          <div class="row-main"><div class="row-title">${esc(e.description)}</div><div class="row-sub"><span>${esc(e.category)}</span><span class="who-line">${whoChip(e.paid_by)}${esc(memberName(e.paid_by))}</span></div></div>
          <b class="amount">${money(e.amount)}</b>
        </div>`).join('')}</div>`).join('') : empty('אין הוצאות בחודש הזה. לחצו + כדי להוסיף');
  }

  return `
    ${total ? balance : ''}
    <div class="seg">${views.map(([id, label]) => `<button class="${(S.expView ?? 'list') === id ? 'on' : ''}" data-action="exp-view" data-view="${id}">${label}</button>`).join('')}</div>
    ${body}`;
}

/* ---------------- auth & onboarding (cloud mode) ---------------- */

function renderAuth() {
  const signup = S.authMode === 'signup';
  app.innerHTML = `
    <div class="auth">
      <div class="auth-logo">${icon('home')}</div>
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
  qa.rec?.abort();
  sheetRoot.classList.remove('open');
  setTimeout(() => { if (!sheetRoot.classList.contains('open')) sheetRoot.innerHTML = ''; }, 250);
}

// Pull a sheet down to close it: by its top bar, or from anywhere once it's scrolled to the top.
// Let go past a quarter of its height (or flick it) and it closes; otherwise it springs back.
let pull = null;
sheetRoot.addEventListener('touchstart', (e) => {
  const sheet = e.target.closest('.sheet');
  if (!sheet || e.touches.length > 1 || e.target.closest('textarea, input:not([type="checkbox"]):not([type="radio"])')) return;
  pull = { sheet, y: e.touches[0].clientY, t: Date.now(), dy: 0, on: false, head: !!e.target.closest('.sheet-head') };
}, { passive: true });

sheetRoot.addEventListener('touchmove', (e) => {
  if (!pull) return;
  const dy = e.touches[0].clientY - pull.y;
  if (!pull.on) {
    if (dy < -6 || (!pull.head && pull.sheet.scrollTop > 0)) { pull = null; return; } // scrolling the sheet
    if (dy < 6) return;
    pull.on = true;
    pull.sheet.style.transition = 'none';
  }
  e.preventDefault();
  pull.dy = Math.max(0, dy);
  pull.sheet.style.transform = `translateY(${pull.dy}px)`;
  sheetRoot.querySelector('.sheet-backdrop').style.opacity = String(1 - pull.dy / pull.sheet.offsetHeight);
}, { passive: false });

function endPull() {
  if (!pull) return;
  const { sheet, dy, t, on } = pull;
  pull = null;
  if (!on) return;
  sheet.style.transition = '';
  sheetRoot.querySelector('.sheet-backdrop').style.opacity = '';
  if (dy > sheet.offsetHeight / 4 || (dy > 40 && dy / (Date.now() - t) > .6)) {
    sheet.style.transform = 'translateY(100%)';
    closeSheet();
  } else {
    sheet.style.transform = '';
  }
}
sheetRoot.addEventListener('touchend', endPull);
sheetRoot.addEventListener('touchcancel', endPull);

const chips = (name, options, selected) => `<div class="chips">${options.map(([value, label]) => `
  <label class="chip"><input type="radio" name="${name}" value="${esc(value)}" ${String(value) === String(selected) ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div>`;

// `draft` pre-fills a new item (from quick add) without making it an edit.
function choreSheet(c, draft = null) {
  const v = c ?? draft ?? {};
  const interval = v.interval_days ?? 7;
  const preset = INTERVALS.some(([v]) => v === interval) ? interval : 'custom';
  openSheet(c ? 'עריכת מטלה' : 'מטלת בית חדשה', `
    <form data-form="chore" data-id="${c?.id ?? ''}" class="stack">
      <input name="title" placeholder="למשל: לשטוף רצפה" value="${esc(v.title)}" required ${c ? '' : 'autofocus'}>
      <label class="field-label">באיזו תדירות?</label>
      ${chips('preset', [...INTERVALS, ['custom', 'אחר']], preset)}
      <div class="inline">כל <input name="custom_days" type="number" min="1" max="365" inputmode="numeric" value="${interval}" class="num"> ימים <small class="muted">(כשבוחרים "אחר")</small></div>
      <label class="field-label">באילו ימים? <small class="muted">לא חובה</small></label>
      <div class="chips days">${WEEKDAY_LETTERS.map((d, i) => `<label class="chip"><input type="checkbox" name="days" value="${i}" ${v.days?.includes(i) ? 'checked' : ''}><span>${d}</span></label>`).join('')}</div>
      <small class="muted">למשל "כל שבוע" עם ו׳ ו-ש׳: המטלה תחכה לכם בסופ"ש, ואחרי שעשיתם אותה באחד מהימים היא תחזור רק בסופ"ש הבא.</small>
      <label class="field-label">באיזה חדר?</label>
      ${chips('room', [['', 'לפי השם'], ...CELLS.map((r) => [r.id, r.name])], c?.room ?? S.room ?? '')}
      <button class="btn primary" type="submit">${c ? 'שמירה' : 'הוספה'}</button>
      ${c ? `<button class="btn danger" type="button" data-action="delete" data-table="chores" data-id="${c.id}">מחיקת מטלה</button>` : ''}
    </form>`);
}

function homeAddSheet() {
  openSheet('מה להוסיף לבית?', `
    <div class="stack">
      <button class="card choice" data-action="add-home-chore"><b>מטלה חוזרת</b><span class="muted">כל יום, כל שבוע או כל כמה ימים. למשל: להשקות עציצים כל יום</span></button>
      <button class="card choice" data-action="add-home-task"><b>משימה חד-פעמית</b><span class="muted">משהו שצריך לעשות פעם אחת, כמו להזמין טכנאי</span></button>
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

function taskSheet(t, kind = 'task', area = AREAS[0].name, repeat = '0', draft = null) {
  kind = t?.kind ?? kind;
  const due = t ? t.due_date ?? '' : draft ? draft.due_date ?? '' : today();
  openSheet(t ? (kind === 'habit' ? 'עריכת הרגל' : 'עריכת משימה') : 'הוספה', `
    <form data-form="task" data-id="${t?.id ?? ''}" class="stack">
      ${t ? `<input type="hidden" name="kind" value="${kind}">` : chips('kind', [['task', 'משימה'], ['habit', 'הרגל יומי']], kind)}
      <input name="title" placeholder="מה צריך לעשות?" value="${esc(t?.title ?? draft?.title)}" required ${t ? '' : 'autofocus'}>
      <label class="field-label">תחום</label>
      ${chips('area', AREAS.map((a) => [a.name, `${a.name}${a.name === HOME_AREA ? ' (משותף)' : ''}`]), t?.area ?? area)}
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
          <input type="date" name="due_date" value="${due}">
        </div>
      </div>
      <button class="btn primary" type="submit">${t ? 'שמירה' : 'הוספה'}</button>
      ${t ? `<button class="btn danger" type="button" data-action="delete" data-table="tasks" data-id="${t.id}">מחיקה</button>` : ''}
    </form>`);
  syncTaskForm(sheetRoot.querySelector('form'));
}

function expenseSheet(e, draft = null) {
  const v = e ?? draft ?? {};
  openSheet(e ? 'עריכת הוצאה' : 'הוצאה משותפת חדשה', `
    <form data-form="expense" data-id="${e?.id ?? ''}" class="stack">
      <div class="amount-input"><span>₪</span><input name="amount" type="text" inputmode="decimal" placeholder="0" value="${v.amount ?? ''}" required ${e || v.amount ? '' : 'autofocus'}></div>
      <input name="description" placeholder="על מה? למשל: קניות בסופר" value="${esc(v.description)}" required>
      <label class="field-label">קטגוריה</label>
      ${chips('category', CATEGORIES.map((c) => [c.name, c.name]), v.category ?? CATEGORIES[0].name)}
      <label class="field-label">מי שילם?</label>
      ${chips('paid_by', membersMeFirst().map((m) => [m.id, esc(memberName(m.id))]), v.paid_by ?? me().id)}
      <label class="field-label">תאריך</label>
      <input type="date" name="spent_on" value="${v.spent_on ?? today()}" required>
      <button class="btn primary" type="submit">${e ? 'שמירה' : 'הוספה'}</button>
      ${e ? `<button class="btn danger" type="button" data-action="delete" data-table="expenses" data-id="${e.id}">מחיקת הוצאה</button>` : ''}
    </form>`);
}

const APP_VERSION = 18; // shown in settings, to tell which version a phone is running

/* Notifications: the phone subscribes here; a Supabase function sends them (supabase/functions/notify). */
const canPush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const NOTIFY_PREFS = [
  ['notify_morning', 'סיכום בוקר, ב-8:00'],
  ['notify_due', 'מה שעוד מחכה להיום, ב-18:00'],
  ['notify_habits', 'תזכורת להרגלים, ב-20:30'],
  ['notify_partner', 'עדכונים מהבית: מטלות שבוצעו והוצאות חדשות'],
];

async function subscribePush() {
  const reg = await navigator.serviceWorker.ready;
  const key = Uint8Array.from(atob(VAPID_PUBLIC_KEY.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
  await store.savePush(sub.toJSON());
}

function notifyCard() {
  if (store.mode === 'demo') return '';
  const homeScreen = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  let body;
  // On iPhone, notifications exist only for an app opened from the home screen.
  if (!canPush) body = `<div class="muted">${/iPhone|iPad/.test(navigator.userAgent) && !homeScreen ? 'כדי לקבל התראות באייפון, הוסיפו את האפליקציה למסך הבית (שיתוף ← הוספה למסך הבית) ופתחו אותה משם.' : 'הדפדפן הזה לא תומך בהתראות.'}</div>`;
  else if (Notification.permission === 'denied') body = '<div class="muted">ההתראות חסומות בטלפון. אפשר להפעיל אותן בהגדרות הטלפון, תחת "הבית שלנו".</div>';
  else if (Notification.permission !== 'granted') body = '<button class="btn" data-action="enable-push">הפעלת התראות</button>';
  else body = NOTIFY_PREFS.map(([key, label]) => `<label class="pref"><input type="checkbox" data-pref="${key}" ${me()[key] !== false ? 'checked' : ''}><span>${label}</span></label>`).join('');
  return `<div class="card stack"><b>התראות</b>${body}</div>`;
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
    ${notifyCard()}
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
      : `<button class="btn danger" data-action="sign-out">התנתקות</button>`}
    <p class="version">גרסה ${APP_VERSION}</p>`);
}

/* ---------------- quick add (one sentence, typed or spoken) ---------------- */

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const QA_KINDS = [['task', 'משימה'], ['chore', 'מטלה חוזרת'], ['shopping', 'קניות'], ['expense', 'הוצאה'], ['habit', 'הרגל']];
const QA_EXAMPLES = ['הוצאתי 400 שקל על צבע טמבור', 'להשקות עציצים כל יום', 'לקנות חלב, ביצים ולחם', 'לקבוע תור לרופא מחר', 'אלה שילמה 120 על פיצה'];
const qa = { text: '', kind: null, rec: null, mode: 'type' };

// Two separate ways in, sharing the same preview and save:
//   + (bottom bar)        → typing only, keyboard ready
//   floating microphone   → voice only, starts listening right away
function quickAddSheet(text = '') {
  Object.assign(qa, { text, kind: null, mode: 'type' });
  openSheet('מה להוסיף?', `
    <div class="qa">
      <textarea id="qa-text" rows="2" placeholder="למשל: הוצאתי 400 שקל על צבע" autofocus enterkeyhint="done">${esc(text)}</textarea>
      <div id="qa-out"></div>
      <button class="link qa-form" data-action="qa-form">או פתחו טופס מלא</button>
    </div>`);
  renderQuickAdd();
}

function voiceSheet() {
  if (!SpeechRecognition) {
    // No in-app speech recognition here (e.g. some iPhone home-screen apps): type, using the keyboard's own mic.
    quickAddSheet();
    toast('הקלטה ישירה לא זמינה כאן. לחצו על המיקרופון שבמקלדת והכתיבו');
    return;
  }
  Object.assign(qa, { text: '', kind: null, mode: 'voice' });
  openSheet('מה לרשום?', `
    <div class="qa">
      <button class="qa-voice" data-action="qa-mic" aria-label="הקלטה">
        <span class="qa-voice-orb">${icon('mic')}</span>
        <span class="qa-voice-label"><span class="idle">לחצו כדי להקליט שוב</span><span class="busy">מקשיב… דברו עכשיו</span></span>
      </button>
      <div id="qa-transcript" class="qa-transcript"></div>
      <div id="qa-out"></div>
      <button class="link qa-form" data-action="qa-to-type">להקליד במקום</button>
    </div>`);
  renderQuickAdd();
  toggleMic(sheetRoot.querySelector('.qa-voice'));
}

function parsedQuick() {
  return parseQuick(qa.text, { members: S.ctx.members, meId: me().id }, qa.kind);
}

function renderQuickAdd() {
  const out = document.getElementById('qa-out');
  if (!out) return;
  if (!qa.text.trim()) {
    out.innerHTML = qa.mode === 'voice'
      ? `<div class="qa-hint qa-hint-voice">אמרו משפט אחד, למשל:<br>"הוצאתי 400 שקל על צבע טמבור"<br>"להשקות עציצים כל יום"</div>`
      : `<div class="qa-hint">כתבו משפט אחד (או הכתיבו עם המיקרופון שבמקלדת). למשל:</div>
         <div class="qa-examples">${QA_EXAMPLES.map((x) => `<button class="tag qa-example" data-action="qa-example" data-text="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;
    return;
  }
  const p = parsedQuick();
  const AREA_LABEL = (a) => (a === HOME_AREA ? 'בית, משותף' : a);
  const payer = p.paid_by === me().id ? 'שילמתי' : `${esc(memberName(p.paid_by))} שילם/ה`;
  const lines = {
    expense: [p.amount != null ? money(p.amount) : 'חסר סכום', `${esc(p.description)}, ${esc(p.category)}. ${payer} ${p.spent_on === today() ? 'היום' : dueLabel(p.spent_on)}`],
    task: [esc(p.title || '…'), `${AREA_LABEL(p.area)}, ${p.due_date ? dueLabel(p.due_date) : 'בלי תאריך'}`],
    chore: [esc(p.title || '…'), `מטלת בית, ${INTERVALS.find(([v]) => v === p.interval_days)?.[1] ?? `כל ${daysHe(p.interval_days)}`}`],
    habit: [esc(p.title || '…'), `הרגל יומי, ${esc(p.area)}`],
    shopping: [esc(p.title || '…'), `רשימת קניות, ${[...new Set((p.items ?? []).map((i) => i.category))].join(' ו') || 'סופר'}`],
  }[p.kind];
  const canSave = p.kind === 'expense' ? p.amount != null : p.kind === 'shopping' ? !!p.items?.length : !!p.title;
  out.innerHTML = `
    <div class="qa-kinds">${QA_KINDS.map(([k, label]) => `<button class="${p.kind === k ? 'on' : ''}" data-action="qa-kind" data-kind="${k}">${label}</button>`).join('')}</div>
    <div class="qa-preview">
      <div class="qa-main">${lines[0]}</div>
      <div class="qa-meta">${lines[1]}</div>
    </div>
    <div class="qa-actions">
      <button class="btn primary" data-action="${canSave ? 'qa-save' : 'qa-edit'}">${canSave ? 'הוספה' : 'להשלמת הפרטים'}</button>
      <button class="btn" data-action="qa-edit">עריכה</button>
    </div>`;
}

async function saveQuick() {
  const p = parsedQuick();
  if (p.kind === 'expense') {
    await forms.expense({ amount: String(p.amount), description: p.description, category: p.category, paid_by: p.paid_by, spent_on: p.spent_on }, null);
  } else if (p.kind === 'chore') {
    const preset = INTERVALS.some(([v]) => v === p.interval_days) ? String(p.interval_days) : 'custom';
    await forms.chore({ title: p.title, preset, custom_days: String(p.interval_days) }, null);
  } else if (p.kind === 'shopping') {
    await addShopping(p.items);
  } else {
    await forms.task({ title: p.title, area: p.area, kind: p.kind, due_date: p.due_date ?? '', repeat: '0' }, null);
  }
  closeSheet();
  await refresh();
  toast({ expense: `נוספה הוצאה ${money(p.amount)}`, chore: 'נוספה מטלת בית חוזרת', task: 'נוספה משימה', habit: 'נוסף הרגל', shopping: 'נוסף לרשימת הקניות' }[p.kind] + ' ✓');
}

function editQuick() {
  const p = parsedQuick();
  // Shopping has no form of its own: open the list, with the sentence ready in its add field.
  if (p.kind === 'shopping') {
    closeSheet();
    Object.assign(S, { tab: 'home', homeView: 'shop', room: null });
    render();
    const input = document.querySelector('.shop-add input');
    if (input) { input.value = p.title; input.focus(); }
    return;
  }
  if (p.kind === 'expense') return expenseSheet(null, p);
  if (p.kind === 'chore') return choreSheet(null, p);
  return taskSheet(null, p.kind, p.area, '0', p);
}

// Each recording replaces the previous sentence; the live transcript shows as you speak.
function toggleMic(btn) {
  if (qa.rec) { qa.rec.stop(); return; }
  const shown = document.getElementById('qa-transcript');
  const rec = new SpeechRecognition();
  rec.lang = 'he-IL';
  rec.interimResults = true;
  rec.onresult = (e) => {
    qa.text = [...e.results].map((r) => r[0].transcript).join('');
    qa.kind = null;
    if (shown) shown.textContent = qa.text;
    renderQuickAdd();
  };
  rec.onerror = (e) => {
    if (e.error === 'aborted' || e.error === 'no-speech') return;
    toast(e.error === 'not-allowed' ? 'אין הרשאה למיקרופון. אפשר להקליד במקום' : 'ההקלטה לא הצליחה. אפשר להקליד במקום');
  };
  rec.onend = () => { qa.rec = null; btn.classList.remove('rec'); };
  qa.rec = rec;
  btn.classList.add('rec');
  try { rec.start(); } catch { qa.rec = null; btn.classList.remove('rec'); }
}

// The detailed form for the current tab (what + did before quick add).
function addForm() {
  if (S.tab === 'home') return homeAddSheet();
  if (S.tab === 'expenses') return expenseSheet();
  return taskSheet(null, S.tab === 'personal' && S.personalView === 'habits' ? 'habit' : 'task');
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
// Opens a row's form; a row deleted on the other phone just reloads the list instead.
const openRow = (sheet, table, el) => { const r = find(table, el.dataset.id); return r ? sheet(r) : refresh(); };

const actions = {
  tab: (el) => { S.tab = el.dataset.tab; try { localStorage.setItem('home-app-tab', S.tab); } catch {} render(); window.scrollTo(0, 0); },
  settings: () => settingsSheet(),
  'close-sheet': () => closeSheet(),
  'personal-view': (el) => { S.personalView = el.dataset.view; render(); },
  'exp-view': (el) => { S.expView = el.dataset.view; render(); },
  room: (el) => { S.room = S.room === el.dataset.room ? null : el.dataset.room; S.homeView = 'chores'; render(); },
  'home-view': (el) => { S.homeView = el.dataset.view; render(); },
  'edit-shop': (el) => openRow(shopSheet, 'shopping', el),
  buy: async (el) => {
    const i = find('shopping', el.dataset.id);
    if (!i) return refresh(); // already gone (the partner deleted it)
    await celebrate(i.id);
    await store.update('shopping', i.id, { bought_at: new Date().toISOString(), bought_by: me().id });
    await refresh();
    toast(`"${i.title}" נקנה`, () => store.update('shopping', i.id, { bought_at: null, bought_by: null }));
  },
  'shop-again': async (el) => {
    await store.update('shopping', el.dataset.id, { bought_at: null, bought_by: null });
    await refresh();
  },
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
  add: () => quickAddSheet(),
  'qa-form': () => addForm(),
  'qa-kind': (el) => { qa.kind = el.dataset.kind; renderQuickAdd(); },
  'qa-save': () => saveQuick(),
  'qa-edit': () => editQuick(),
  voice: () => voiceSheet(),
  'qa-mic': (el) => toggleMic(el),
  'qa-to-type': () => { qa.rec?.abort(); quickAddSheet(qa.text); },
  'qa-example': (el) => {
    const box = document.getElementById('qa-text');
    box.value = qa.text = el.dataset.text;
    qa.kind = null;
    renderQuickAdd();
  },
  'edit-chore': (el) => openRow(choreSheet, 'chores', el),
  'edit-task': (el) => openRow(taskSheet, 'tasks', el),
  'edit-expense': (el) => openRow(expenseSheet, 'expenses', el),
  'done-chore': async (el) => {
    const c = find('chores', el.dataset.id);
    if (!c) return refresh();
    const prev = { last_done_at: c.last_done_at, last_done_by: c.last_done_by };
    await celebrate(c.id);
    const now = new Date().toISOString();
    await store.update('chores', c.id, { last_done_at: now, last_done_by: me().id });
    const log = await store.insert('chore_log', { chore_id: c.id, done_by: me().id, done_at: now });
    store.notify(`${me().name}: בוצע "${c.title}"`);
    await refresh();
    toast(`"${c.title}" בוצע`, async () => {
      await store.update('chores', c.id, prev);
      await store.remove('chore_log', log.id);
    });
  },
  'toggle-task': async (el) => {
    const t = find('tasks', el.dataset.id);
    if (!t) return refresh();
    const undone = { done_at: null, done_by: null };
    if (!t.done_at) await celebrate(t.id);
    await store.update('tasks', t.id, t.done_at ? undone : { done_at: new Date().toISOString(), done_by: me().id });
    if (!t.done_at && t.household_id) store.notify(`${me().name}: בוצע "${t.title}"`);
    await refresh();
    if (!t.done_at) toast(`"${t.title}" בוצע`, () => store.update('tasks', t.id, undone));
  },
  // The dot changes right away and the save follows (a reload already on its way would undo it, so it's dropped).
  'toggle-habit': async (el) => {
    const { id, day } = el.dataset;
    try {
      const existing = S.data.habit_checks.filter((c) => c.task_id === id && c.day === day);
      if (existing.length) {
        S.data.habit_checks = S.data.habit_checks.filter((c) => !existing.includes(c));
        loads++;
        render();
        for (const c of existing) await store.remove('habit_checks', c.id);
      } else {
        await celebrate(id);
        const check = { task_id: id, day };
        S.data.habit_checks.push(check);
        loads++;
        render();
        Object.assign(check, await store.insert('habit_checks', { task_id: id, day }));
      }
    } catch (err) {
      await refresh();
      throw err;
    }
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
  'swipe-done': async (el) => {
    const wrap = el.closest('.swipe');
    closeSwipe();
    await actions[wrap.dataset.swipe](wrap);
  },
  'swipe-delete': async (el) => {
    const { table, id } = el.closest('.swipe').dataset;
    closeSwipe();
    const row = find(table, id);
    if (!row) return refresh();
    // Deleting takes its history along, so undo has to bring that back too.
    const [kidTable, kidKey] = table === 'chores' ? ['chore_log', 'chore_id'] : ['habit_checks', 'task_id'];
    const kids = S.data[kidTable].filter((k) => k[kidKey] === id);
    await store.remove(table, id);
    await refresh();
    toast(`"${row.title}" נמחק`, async () => {
      await store.insert(table, row);
      for (const k of kids) if (!find(kidTable, k.id)) await store.insert(kidTable, k);
    });
  },
  'copy-code': async (el) => {
    try { await navigator.clipboard.writeText(el.dataset.code); toast('הקוד הועתק'); } catch { toast(el.dataset.code); }
  },
  'switch-user': async () => { store.switchUser(); closeSheet(); await reloadSession(); },
  'reset-demo': async () => { if (!confirm('לאפס את כל נתוני ההדגמה?')) return; store.reset(); closeSheet(); await reloadSession(); },
  'enable-push': async () => {
    if ((await Notification.requestPermission()) === 'granted') {
      await subscribePush();
      toast('ההתראות הופעלו');
    }
    settingsSheet();
  },
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
    const days = (f.days ?? []).map(Number).sort((a, b) => a - b);
    const row = { title: f.title.trim(), interval_days, room: f.room || null, days: days.length && days.length < 7 ? days : null };
    if (id) await store.update('chores', id, row);
    else await store.insert('chores', { ...row, last_done_at: null, last_done_by: null });
  },
  task: async (f, id) => {
    // A recurring home task is a chore.
    if (!id && f.kind === 'task' && f.area === HOME_AREA && f.repeat && f.repeat !== '0') {
      const interval_days = Number(f.repeat);
      await store.insert('chores', { title: f.title.trim(), interval_days, last_done_at: null, last_done_by: null });
      toast(`נוספה מטלת בית, ${INTERVALS.find(([v]) => v === interval_days)[1]}`);
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
    if (shared && S.tab !== 'home' && S.tab !== 'today') toast('נוסף ללשונית בית (משותף)');
  },
  shop: async (f) => {
    await addShopping(shoppingItems(f.title));
    await refresh();
    document.querySelector('.shop-add input')?.focus(); // ready for the next item
  },
  'shop-edit': async (f, id) => {
    await store.update('shopping', id, { title: f.title.trim(), category: f.category });
  },
  expense: async (f, id) => {
    // "1,250" and "1,250.50": the comma groups thousands; "12,5": it's the decimal point.
    const amount = Number(String(f.amount).replace(/[^\d.,]/g, '').replace(/,(?=\d{3}(\D|$))/g, '').replace(',', '.'));
    if (!amount || amount <= 0) throw new Error('סכום לא תקין');
    const row = { amount: Math.round(amount * 100) / 100, description: f.description.trim(), category: f.category, paid_by: f.paid_by, spent_on: f.spent_on };
    if (id) await store.update('expenses', id, row);
    else {
      await store.insert('expenses', row);
      store.notify(`${me().name}: הוצאה חדשה, ${row.description} ${money(row.amount)}`);
    }
    S.month = f.spent_on.slice(0, 7);
  },
};

/* ---------------- event wiring ---------------- */

/* ---------------- completion feedback & swipe ---------------- */

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const running = new Set();

// The checkbox fills and its tick draws itself, then the row settles — only then does the data update.
async function celebrate(id) {
  const row = document.querySelector(`.swipe[data-id="${id}"] .row`);
  if (!row || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = row.querySelector('.box');
  if (box) box.innerHTML = icon('check');
  row.classList.add('completing');
  const { done, total } = todayProgress();
  document.querySelectorAll('.room').forEach((r, i) => r.classList.toggle('on', i < roomsLit(done + 1, total)));
  const chore = S.data.chores.find((c) => c.id === id);
  if (chore && waitingIn(roomOf(chore)) === 1) document.querySelector(`.cell[data-room="${roomOf(chore)}"]`)?.classList.add('on');
  navigator.vibrate?.(12);
  await wait(450);
}

// Drag a row sideways to uncover its button. It follows the finger up to the button's width, then
// resists; let go past half of that and it stays open. Vertical moves stay scrolling.
const SWIPE_OPEN = 92;
const SWIPE_START = 14;
let drag = null;
let swallowClick = false;
let openSwipe = null;

function closeSwipe() {
  if (!openSwipe) return;
  openSwipe.classList.remove('open');
  openSwipe.querySelector('.row').style.transform = '';
  openSwipe = null;
}

document.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.swipe-btn')) return;
  const wrap = e.target.closest('.swipe');
  if (openSwipe && openSwipe !== wrap) closeSwipe();
  if (!wrap || e.button > 0) return;
  const row = wrap.querySelector('.row');
  drag = { wrap, row, x: e.clientX, y: e.clientY, base: new DOMMatrix(getComputedStyle(row).transform).m41, dx: 0, on: false, id: e.pointerId };
});

document.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const moved = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  if (!drag.on) {
    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(moved)) { drag = null; return; }
    if (Math.abs(moved) < SWIPE_START) return;
    drag.on = true;
    drag.wrap.classList.add('dragging');
    try { drag.wrap.setPointerCapture(e.pointerId); } catch {}
  }
  const x = drag.base + moved;
  const past = Math.abs(x) - SWIPE_OPEN;
  drag.dx = past > 0 ? Math.sign(x) * (SWIPE_OPEN + past * .2) : x;
  drag.row.style.transform = `translateX(${drag.dx}px)`;
});

document.addEventListener('pointerup', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag;
  drag = null;
  if (!d.on) return;
  swallowClick = true; // the click that follows a drag shouldn't open the row
  setTimeout(() => { swallowClick = false; }, 60);
  d.wrap.classList.remove('dragging');
  if (Math.abs(d.dx) >= SWIPE_OPEN / 2) {
    d.row.style.transform = `translateX(${Math.sign(d.dx) * SWIPE_OPEN}px)`;
    d.wrap.classList.add('open');
    openSwipe = d.wrap;
  } else {
    openSwipe = d.wrap;
    closeSwipe();
  }
});

document.addEventListener('pointercancel', (e) => {
  if (drag && e.pointerId === drag.id) {
    drag.wrap.classList.remove('dragging');
    openSwipe = drag.wrap;
    closeSwipe();
    drag = null;
  }
});

document.addEventListener('click', async (e) => {
  if (swallowClick) { e.preventDefault(); e.stopPropagation(); return; }
  if (openSwipe && !e.target.closest('.swipe-btn')) { closeSwipe(); e.preventDefault(); return; }
  const el = e.target.closest('[data-action]');
  if (!el || el.closest('#toast-root')) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  e.preventDefault();
  // While an action is still saving, tapping it again does nothing, so a double tap can't do it twice.
  const key = [el.dataset.action, el.dataset.id, el.dataset.day].join('|');
  if (running.has(key)) return;
  running.add(key);
  try { await fn(el); } catch (err) { toast('שגיאה: ' + err.message); } finally { running.delete(key); }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheetRoot.classList.contains('open')) closeSheet();
  // Enter in quick add = the primary button (save, or open the form when details are missing).
  if (e.key === 'Enter' && !e.shiftKey && e.target.id === 'qa-text') {
    e.preventDefault();
    document.querySelector('#qa-out .btn.primary')?.click();
  }
});

// Tapping into the text box means "I'd rather type": stop listening.
document.addEventListener('focusin', (e) => {
  if (e.target.id === 'qa-text' && qa.rec) qa.rec.stop();
});

document.addEventListener('input', (e) => {
  if (e.target.id !== 'qa-text') return;
  qa.text = e.target.value;
  qa.kind = null;
  renderQuickAdd();
});

document.addEventListener('change', (e) => {
  const pref = e.target.dataset.pref;
  if (pref) {
    const on = e.target.checked;
    store.updateProfile({ [pref]: on }).then(() => { me()[pref] = on; }).catch((err) => { e.target.checked = !on; toast('שגיאה: ' + err.message); });
  }
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
    const fd = new FormData(form);
    const data = Object.fromEntries(fd);
    if (fd.has('days')) data.days = fd.getAll('days'); // several checkboxes share the name
    await forms[name](data, form.dataset.id || null);
    if (['chore', 'task', 'expense', 'shop-edit'].includes(name)) { closeSheet(); await refresh(); }
  } catch (err) {
    toast('שגיאה: ' + err.message);
  } finally {
    btn.disabled = false;
  }
});

boot();
