// Closed widget vocabulary of the dashboard. Hermes writes data in this shape; the page renders it. No HTML, no code: unknown types are rejected.
const ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DT = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:?\d{2})?)?$/;
const isStr = (v, max) => typeof v === 'string' && v.length <= max;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isArr = (v, max) => Array.isArray(v) && v.length <= max;

export const TYPES = {
  callout: { span: 4, doc: 'Hinweis. {tone: info|good|warn|urgent, text}' },
  stat: { span: 1, doc: 'Eine Kennzahl. {value: string|number, unit?, label?, delta?: {value:number, label?, good_when?: up|down|none}, spark?: number[<=60]}' },
  todo: { span: 2, doc: 'Aufgaben. {items: [{id, text, done?, due?: YYYY-MM-DD, priority?: high|normal|low, tag?}] <=100}' },
  reminders: { span: 2, doc: 'Erinnerungen. {items: [{id, text, at: ISO-Datum/-Zeit, done?, repeat?}] <=100}' },
  tracker: { span: 2, doc: 'Gewohnheit/Messwert pro Tag. {unit?, target?: number pro Tag, entries: [{date: YYYY-MM-DD, value: number}] <=400}' },
  chart: { span: 2, doc: 'Verlauf. {kind: line|bar, unit?, series: [{label, points: [{x: string, y: number}] <=120}] <=4}' },
  budget: { span: 2, doc: 'Budget je Kategorie. {currency?: EUR, period?, categories: [{name, spent, limit?}] <=20}' },
  accounts: { span: 2, doc: 'Kontostaende/Vermoegen. {currency?: EUR, items: [{name, balance, change?}] <=20}' },
  progress: { span: 2, doc: 'Fortschritt. {items: [{label, value, target, unit?}] <=20}' },
  agenda: { span: 2, doc: 'Termine. {events: [{at: ISO-Datum/-Zeit, title, place?}] <=40}' },
  list: { span: 2, doc: 'Freie Liste. {items: [{text, meta?, value?}] <=60}' },
  text: { span: 2, doc: 'Freitext. {body: string <=2000}' },
};

export function validateWidget(w, path = 'widget') {
  const e = [];
  const bad = (m) => e.push(`${path}: ${m}`);
  if (!w || typeof w !== 'object' || Array.isArray(w)) return [`${path}: must be an object`];
  if (!ID.test(w.id ?? '')) bad('id must match [a-z0-9][a-z0-9_-]{0,39}');
  if (!TYPES[w.type]) return [...e, `${path}: unknown type "${w.type}" (allowed: ${Object.keys(TYPES).join(', ')})`];
  if (w.title !== undefined && !isStr(w.title, 80)) bad('title must be a string <= 80');
  if (w.section !== undefined && !isStr(w.section, 60)) bad('section must be a string <= 60');
  if (w.span !== undefined && ![1, 2, 3, 4].includes(w.span)) bad('span must be 1..4');
  if (w.note !== undefined && !isStr(w.note, 200)) bad('note must be a string <= 200');
  const items = (key, max, fn) => {
    if (!isArr(w[key], max)) return bad(`${key} must be an array with <= ${max} entries`);
    w[key].forEach((it, i) => { if (!it || typeof it !== 'object') bad(`${key}[${i}] must be an object`); else fn(it, `${key}[${i}]`); });
  };
  const need = (cond, m) => { if (!cond) bad(m); };
  switch (w.type) {
    case 'callout':
      need(['info', 'good', 'warn', 'urgent'].includes(w.tone ?? 'info'), 'tone must be info|good|warn|urgent');
      need(isStr(w.text, 600) && w.text, 'text required (<= 600)');
      break;
    case 'stat':
      need(isStr(w.value, 40) || isNum(w.value), 'value must be a string or number');
      if (w.unit !== undefined) need(isStr(w.unit, 12), 'unit <= 12');
      if (w.label !== undefined) need(isStr(w.label, 80), 'label <= 80');
      if (w.delta !== undefined) need(w.delta && isNum(w.delta.value), 'delta.value must be a number');
      if (w.spark !== undefined) need(isArr(w.spark, 60) && w.spark.every(isNum), 'spark must be <= 60 numbers');
      break;
    case 'todo':
      items('items', 100, (it, p) => {
        need(ID.test(it.id ?? ''), `${p}.id invalid`); need(isStr(it.text, 200) && it.text, `${p}.text required`);
        if (it.due !== undefined) need(DATE.test(it.due), `${p}.due must be YYYY-MM-DD`);
        if (it.priority !== undefined) need(['high', 'normal', 'low'].includes(it.priority), `${p}.priority invalid`);
      });
      break;
    case 'reminders':
      items('items', 100, (it, p) => {
        need(ID.test(it.id ?? ''), `${p}.id invalid`); need(isStr(it.text, 200) && it.text, `${p}.text required`);
        need(DT.test(it.at ?? ''), `${p}.at must be an ISO date or datetime`);
      });
      break;
    case 'tracker':
      items('entries', 400, (it, p) => { need(DATE.test(it.date ?? ''), `${p}.date must be YYYY-MM-DD`); need(isNum(it.value), `${p}.value must be a number`); });
      if (w.target !== undefined) need(isNum(w.target) && w.target > 0, 'target must be a positive number');
      break;
    case 'chart':
      need(['line', 'bar'].includes(w.kind ?? 'line'), 'kind must be line|bar');
      need(isArr(w.series, 4) && w.series.length > 0, 'series: 1..4 entries');
      (w.series ?? []).forEach((s, i) => {
        need(s && isStr(s.label, 40), `series[${i}].label required`);
        need(s && isArr(s.points, 120) && s.points.every((q) => q && isStr(q.x, 30) && isNum(q.y)), `series[${i}].points: <= 120 of {x: string, y: number}`);
      });
      break;
    case 'budget':
      items('categories', 20, (it, p) => { need(isStr(it.name, 40) && it.name, `${p}.name required`); need(isNum(it.spent), `${p}.spent number`); if (it.limit !== undefined) need(isNum(it.limit) && it.limit > 0, `${p}.limit positive number`); });
      break;
    case 'accounts':
      items('items', 20, (it, p) => { need(isStr(it.name, 40) && it.name, `${p}.name required`); need(isNum(it.balance), `${p}.balance number`); if (it.change !== undefined) need(isNum(it.change), `${p}.change number`); });
      break;
    case 'progress':
      items('items', 20, (it, p) => { need(isStr(it.label, 60) && it.label, `${p}.label required`); need(isNum(it.value) && isNum(it.target) && it.target > 0, `${p}.value/target numbers (target > 0)`); });
      break;
    case 'agenda':
      items('events', 40, (it, p) => { need(DT.test(it.at ?? ''), `${p}.at ISO date/datetime`); need(isStr(it.title, 120) && it.title, `${p}.title required`); });
      break;
    case 'list':
      items('items', 60, (it, p) => { need(isStr(it.text, 160) && it.text, `${p}.text required`); });
      break;
    case 'text':
      need(isStr(w.body, 2000), 'body must be a string <= 2000');
      break;
  }
  return e;
}

export function validateState(s) {
  const e = [];
  if (!s || typeof s !== 'object' || Array.isArray(s)) return ['state must be an object'];
  if (s.title !== undefined && !isStr(s.title, 80)) e.push('title must be a string <= 80');
  if (s.subtitle !== undefined && !isStr(s.subtitle, 160)) e.push('subtitle must be a string <= 160');
  if (s.briefing !== undefined && !isStr(s.briefing, 800)) e.push('briefing must be a string <= 800');
  if (!isArr(s.widgets, 60)) return [...e, 'widgets must be an array with <= 60 entries'];
  const seen = new Set();
  s.widgets.forEach((w, i) => {
    e.push(...validateWidget(w, `widgets[${i}]`));
    if (w && seen.has(w.id)) e.push(`widgets[${i}]: duplicate id "${w.id}"`);
    if (w) seen.add(w.id);
  });
  return e;
}

export const schemaDoc = () => ({
  state: '{title?, subtitle?, briefing? (Hermes-Zusammenfassung des Tages, <=800), widgets: Widget[<=60]}',
  widget: 'Gemeinsam: {id (a-z0-9_-, <=40), type, title?, span? 1..4, section? (aufeinanderfolgende Widgets mit gleicher section werden gruppiert), note?}. Die Reihenfolge im Array ist die Reihenfolge auf der Seite.',
  types: Object.fromEntries(Object.entries(TYPES).map(([k, v]) => [k, v.doc])),
});
