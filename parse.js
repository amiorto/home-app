// Rule-based Hebrew parser for quick add: turns one free sentence (typed or dictated) into
// an expense, a recurring home chore, a habit or a task. Runs on the phone, no network, no AI.
//   "הוצאתי 400 שקל על צבע טמבור"   → expense ₪400 · "צבע טמבור" · כללי · paid by me
//   "להשקות עציצים כל יום"           → home chore every 1 day
//   "לקבוע תור לרופא מחר"            → personal task (health) due tomorrow
import { localDate } from './store.js';

const CATEGORY_WORDS = {
  'סופר': ['סופר', 'סופרמרקט', 'שופרסל', 'רמי לוי', 'ויקטורי', 'יוחננוף', 'אושר עד', 'טיב טעם', 'חצי חינם', 'יינות ביתן', 'מגה', 'מכולת', 'מעדניה', 'ירקות', 'פירות', 'ירקן', 'קצב', 'מאפייה', 'לחם', 'חלב', 'קניות', 'am:pm'],
  'חשבונות': ['חשבון', 'חשבונות', 'חשמל', 'מים', 'ארנונה', 'גז', 'אינטרנט', 'סלולר', 'פלאפון', 'טלפון', 'ועד', 'ועד בית', 'שכירות', 'שכר דירה', 'משכנתא', 'ביטוח', 'נטפליקס', 'ספוטיפיי', 'מנוי', 'יס', 'הוט', 'פרטנר', 'סלקום', 'בזק'],
  'אוכל בחוץ ובילויים': ['מסעדה', 'מסעדת', 'קפה', 'בית קפה', 'פיצה', 'סושי', 'המבורגר', 'שווארמה', 'פלאפל', 'וולט', 'wolt', 'תן ביס', 'משלוח', 'סרט', 'קולנוע', 'הופעה', 'הצגה', 'בר', 'פאב', 'בילוי', 'בילויים', 'ארוחה', 'ארוחת', 'גלידה', 'טיול', 'מסיבה'],
};

const AREA_WORDS = {
  'בית': ['לנקות', 'ניקיון', 'לשטוף', 'שטיפה', 'כביסה', 'כביסות', 'לקפל', 'כלים', 'מדיח', 'זבל', 'אשפה', 'פח', 'לשאוב', 'שואב', 'לאבק', 'אבק', 'מצעים', 'מקרר', 'תנור', 'כיריים', 'עציצים', 'עציץ', 'להשקות', 'צמחים', 'מטבח', 'סלון', 'שירותים', 'אמבטיה', 'מקלחת', 'חדר', 'בית', 'דירה', 'מזגן', 'טכנאי', 'אינסטלטור', 'חשמלאי', 'לתקן', 'תיקון', 'לתלות', 'מדף', 'נורה', 'נורות', 'ספה', 'רהיט', 'רהיטים', 'גינה', 'מרפסת', 'חלון', 'חלונות', 'ארון', 'ברז', 'דוד', 'לצבוע', 'צבע', 'רצפה', 'לסדר'],
  'התפתחות אישית': ['לקרוא', 'ספר', 'קורס', 'ללמוד', 'לימוד', 'לימודים', 'שיעור', 'מדיטציה', 'לכתוב', 'יומן', 'אנגלית', 'פודקאסט', 'להתאמן בנגינה', 'גיטרה', 'פסנתר', 'שפה'],
  'בריאות וספורט': ['אימון', 'להתאמן', 'ריצה', 'לרוץ', 'הליכה', 'ללכת', 'כושר', 'חדר כושר', 'יוגה', 'פילאטיס', 'שחייה', 'לשחות', 'רופא', 'רופאה', 'רופא שיניים', 'תור', 'בדיקה', 'בדיקות', 'ויטמין', 'ויטמינים', 'תרופה', 'תרופות', 'לישון', 'שינה', 'תזונה', 'דיאטה', 'לשתות'],
  'עבודה': ['עבודה', 'מייל', 'מיילים', 'פגישה', 'לקוח', 'לקוחות', 'פרויקט', 'דוח', 'מצגת', 'משרד', 'קורות חיים', 'ראיון', 'ראיון עבודה', 'הצעת מחיר', 'חשבונית'],
};

const EXPENSE_VERBS = ['הוצאתי', 'הוצאנו', 'הוצאה', 'שילמתי', 'שילמנו', 'שילם', 'שילמה', 'שלמתי', 'שלמנו', 'קניתי', 'קנינו', 'קנה', 'קנתה', 'עלה', 'עלתה', 'עלו', 'תשלום', 'שולם'];
const CURRENCY_RE = /₪|ש["״'׳]?ח|שקלים|שקל|nis/i;
const AMOUNT_RE = /(\d{1,3}(?:,\d{3})+|\d+(?:\.\d{1,2})?)/;
const NUMBER_WORDS = { 'חמישים': 50, 'מאה': 100, 'מאתיים': 200, 'שלוש מאות': 300, 'ארבע מאות': 400, 'חמש מאות': 500, 'שש מאות': 600, 'שבע מאות': 700, 'שמונה מאות': 800, 'תשע מאות': 900, 'אלף': 1000, 'אלפיים': 2000 };

const INTERVALS = [
  [/כל יומיים|פעם ביומיים/, () => 2],
  [/כל (\d+) ימים|פעם ב-?(\d+) ימים/, (m) => Number(m[1] || m[2])],
  [/כל יום|כל בוקר|כל ערב|פעם ביום|יומיומי|יום יום/, () => 1],
  [/כל שבועיים|פעם בשבועיים/, () => 14],
  [/כל שבוע|פעם בשבוע|שבועי/, () => 7],
  [/כל חודש|פעם בחודש|חודשי/, () => 30],
];

const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

// Words that are just "please add this" noise in a dictated sentence.
const FILLERS = [/^(תזכיר|תזכירי|להזכיר) לי( ש)?/, /^תזכורת:?/, /^(אני )?(צריך|צריכה|צריכים|חייב|חייבת|חייבים) /, /^לא לשכוח( ש)?/, /^(תוסיף|תוסיפי|להוסיף)( משימה)?:? ?/, /^משימה:? ?/, /^הרגל:? ?/];

const PREFIXES = ['ו', 'ב', 'ל', 'ה', 'מ', 'ש', 'כ'];
const tokens = (s) => s.split(/[^֐-׿a-zA-Z0-9:]+/).filter(Boolean);
// "והסופר" → also try "הסופר", "סופר" (Hebrew prefix letters).
function forms(t) {
  const out = [t];
  let s = t;
  for (let i = 0; i < 2 && s.length > 3 && PREFIXES.includes(s[0]); i++) { s = s.slice(1); out.push(s); }
  return out;
}
function matchWords(text, words) {
  const toks = tokens(text).flatMap(forms);
  return words.filter((w) => (w.includes(' ') ? text.includes(w) : toks.includes(w)));
}
const has = (text, words) => matchWords(text, words).length > 0;
// Collapse punctuation to spaces, but keep the "." and "," inside numbers (512.40, 1,200).
const tidy = (s) => s
  .replace(/(\d)\.(?=\d)/g, '$1⁣').replace(/(\d),(?=\d)/g, '$1⁤')
  .replace(/[\s,.;:!?\-–]+/g, ' ').replace(/\s+/g, ' ').trim()
  .replace(/⁣/g, '.').replace(/⁤/g, ',');

function addDays(base, n) { const d = new Date(base); d.setDate(d.getDate() + n); return localDate(d); }

// Returns { date, text } with the date phrase removed, or date null.
function takeDate(text, now = new Date()) {
  const rules = [
    [/מחרתיים/, () => addDays(now, 2)],
    [/מחר/, () => addDays(now, 1)],
    [/שלשום/, () => addDays(now, -2)],
    [/אתמול/, () => addDays(now, -1)],
    [/היום|הבוקר|הערב|הלילה/, () => localDate(now)],
    [/בעוד יומיים/, () => addDays(now, 2)],
    [/בעוד (\d+) ימים/, (m) => addDays(now, Number(m[1]))],
    [/בעוד שבוע|בשבוע הבא/, () => addDays(now, 7)],
    [/בסוף השבוע|בסופ"?ש|בסופ״ש/, () => addDays(now, ((5 - now.getDay() + 7) % 7) || 7)],
    [new RegExp(`(?:ביום |ב)(${WEEKDAYS.join('|')})(?=\\s|$)`), (m) => {
      const target = WEEKDAYS.indexOf(m[1]);
      return addDays(now, ((target - now.getDay() + 7) % 7) || 7);
    }],
  ];
  for (const [re, fn] of rules) {
    const m = text.match(re);
    if (m) return { date: fn(m), text: text.replace(m[0], ' ') };
  }
  return { date: null, text };
}

function takeInterval(text) {
  for (const [re, fn] of INTERVALS) {
    const m = text.match(re);
    if (m) return { interval: fn(m), text: text.replace(m[0], ' ') };
  }
  return { interval: null, text };
}

function takeAmount(text) {
  const m = text.match(AMOUNT_RE);
  if (m) return { amount: Number(m[1].replace(/,/g, '')), text: text.replace(m[0], ' ') };
  for (const [w, n] of Object.entries(NUMBER_WORDS).sort((a, b) => b[0].length - a[0].length)) {
    if (text.includes(w)) return { amount: n, text: text.replace(w, ' ') };
  }
  return { amount: null, text };
}

function areaFor(text) {
  // Home first: it decides sharing. Then the more specific personal areas.
  for (const area of ['בית', 'בריאות וספורט', 'התפתחות אישית', 'עבודה']) if (has(text, AREA_WORDS[area])) return area;
  return 'אישי';
}

function categoryFor(text) {
  for (const [cat, words] of Object.entries(CATEGORY_WORDS)) if (has(text, words)) return cat;
  return 'כללי';
}

function cleanTitle(text) {
  let s = tidy(text);
  for (const re of FILLERS) s = tidy(s.replace(re, ''));
  return s;
}

/**
 * @param {string} input   the sentence
 * @param {{members: {id,name}[], meId: string}} ctx
 * @param {string|null} forceKind  user override: 'task' | 'chore' | 'expense' | 'habit'
 */
export function parseQuick(input, { members, meId }, forceKind = null) {
  const raw = tidy(input);
  const result = { kind: 'task', title: '', area: 'אישי', due_date: null, interval_days: null, amount: null, description: '', category: 'כללי', paid_by: meId, spent_on: localDate() };
  if (!raw) return result;

  // Who paid: another member named in the sentence ("אלה שילמה 120 על פיצה").
  let text = raw;
  for (const m of members) {
    if (m.id !== meId && m.name && text.includes(m.name)) { result.paid_by = m.id; text = text.replace(m.name, ' '); }
  }

  const amt = takeAmount(text);
  // An amount plus any money cue, or a clear "I paid / I spent" even when the amount is missing.
  const isExpense = (amt.amount != null && (has(raw, EXPENSE_VERBS) || CURRENCY_RE.test(raw))) || has(raw, ['הוצאתי', 'הוצאנו', 'שילמתי', 'שילמנו', 'שילם', 'שילמה']);
  const kind = forceKind ?? (isExpense ? 'expense' : null);

  if (kind === 'expense') {
    let t = amt.text.replace(new RegExp(CURRENCY_RE.source, 'gi'), ' ');
    const d = takeDate(t);
    if (d.date && d.date <= localDate()) result.spent_on = d.date;
    t = d.text;
    for (const v of EXPENSE_VERBS) t = t.replace(new RegExp(`(^|\\s)${v}(?=\\s|$)`, 'g'), ' ');
    t = tidy(t).replace(/^(על|עבור|בשביל|ב|ל|של)\s+/, '').replace(/\s+(ב|על)$/, '');
    // "בסופר" alone → "סופר" when stripping the prefix lands on a known word.
    if (!t.includes(' ') && t.length > 3 && PREFIXES.includes(t[0]) && has(t.slice(1), Object.values(CATEGORY_WORDS).flat())) t = t.slice(1);
    Object.assign(result, { kind: 'expense', amount: amt.amount, description: t || categoryFor(raw), category: categoryFor(raw) });
    return result;
  }

  const iv = takeInterval(raw);
  const dt = takeDate(iv.text);
  const title = cleanTitle(dt.text);
  const area = areaFor(raw);
  Object.assign(result, { title, area });

  if (kind === 'chore' || (!kind && iv.interval && area === 'בית')) {
    Object.assign(result, { kind: 'chore', area: 'בית', interval_days: iv.interval ?? 7 });
  } else if (kind === 'habit' || (!kind && (/^הרגל/.test(raw) || iv.interval === 1))) {
    Object.assign(result, { kind: 'habit', area: area === 'בית' ? 'אישי' : area });
  } else {
    // One-off task. Personal tasks default to today so they show up on the Today screen.
    Object.assign(result, { kind: 'task', due_date: dt.date ?? (area === 'בית' ? null : localDate()) });
    if (kind === 'task' && amt.amount != null && !title) result.title = raw;
  }
  return result;
}
