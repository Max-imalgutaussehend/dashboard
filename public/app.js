// Renders the state from /api/state. Every string goes in via textContent: nothing from the state is ever parsed as HTML.
const NS = 'http://www.w3.org/2000/svg';
const $ = (id) => document.getElementById(id);
const tz = 'Europe/Berlin';
const nf = (n, d = 0) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: d, minimumFractionDigits: d }).format(n);
const nfa = (n, d = 1) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: d }).format(n);
const money = (n, cur = 'EUR', d = 0) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: cur, maximumFractionDigits: d, minimumFractionDigits: d }).format(n);
const iso = (d) => new Intl.DateTimeFormat('sv-SE', { timeZone: tz }).format(d); // YYYY-MM-DD in Berlin
const today = () => iso(new Date());
const dayDiff = (a, b) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 864e5);

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of kids.flat(Infinity)) if (c) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}

// when: "heute 14:30", "morgen", "Mi 19.11.", "überfällig"
function whenLabel(at) {
  const date = at.slice(0, 10), hasTime = at.length > 10;
  const d = dayDiff(date, today());
  const time = hasTime ? new Intl.DateTimeFormat('de-DE', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(at.includes('T') && !/[Z+-]\d{2}:?\d{2}$|Z$/.test(at) ? at : at)) : '';
  const day = d === 0 ? 'heute' : d === 1 ? 'morgen' : d === -1 ? 'gestern' : new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date(date + 'T12:00:00'));
  return { text: [day, time].filter(Boolean).join(' '), late: d < 0 || (d === 0 && hasTime && new Date(at) < new Date()) };
}

const tip = $('tip');
function showTip(e, text) { tip.textContent = text; tip.hidden = false; const r = tip.getBoundingClientRect(); tip.style.left = Math.min(innerWidth - r.width - 8, e.clientX + 14) + 'px'; tip.style.top = Math.max(8, e.clientY - r.height - 12) + 'px'; }
const hideTip = () => { tip.hidden = true; };
const tipOn = (el, text) => { el.addEventListener('pointermove', (e) => showTip(e, text)); el.addEventListener('pointerleave', hideTip); el.addEventListener('click', (e) => { showTip(e, text); setTimeout(hideTip, 2500); }); el.setAttribute('aria-label', text); };

async function toggle(w, it, box) {
  box.disabled = true;
  try { const r = await fetch(`/api/widgets/${w.id}/toggle`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item_id: it.id, done: box.checked }) }); if (!r.ok) throw 0; await load(true); }
  catch { box.checked = !box.checked; box.disabled = false; }
}

function checkRows(w, mk) {
  const items = [...w.items].sort((a, b) => (a.done === true) - (b.done === true) || mk.sort(a, b));
  if (!items.length) return h('p', { class: 'empty', text: 'Nichts offen.' });
  const shown = items.slice(0, mk.limit ?? 12);
  return [h('ul', { class: 'rows' }, shown.map((it) => {
    const box = h('input', { type: 'checkbox', class: 'check', 'aria-label': it.text, checked: it.done === true });
    box.addEventListener('change', () => toggle(w, it, box));
    const meta = mk.meta(it);
    return h('li', { class: 'row' + (it.done ? ' row--done' : '') }, box, h('span', { class: 'row__text', text: it.text }),
      it.priority === 'high' && !it.done && h('span', { class: 'prio', text: 'wichtig' }),
      meta && h('span', { class: 'row__meta' + (meta.late && !it.done ? ' row__meta--late' : ''), text: meta.text }));
  })), items.length > shown.length && h('p', { class: 'more', text: `+ ${items.length - shown.length} weitere` })];
}

// ---- chart pieces ----------------------------------------------------------------------------------------------------------
function niceMax(v) { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); const f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
function sparkline(vals) {
  const w = 104, hh = 38, min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const pts = vals.map((v, i) => [(i / Math.max(1, vals.length - 1)) * w, hh - 4 - ((v - min) / span) * (hh - 8)]);
  const last = pts[pts.length - 1];
  return s('svg', { class: 'spark', viewBox: `0 0 ${w} ${hh}`, preserveAspectRatio: 'xMinYMid meet', 'aria-hidden': 'true' },
    s('polyline', { points: pts.map((p) => p.join(',')).join(' '), fill: 'none', stroke: 'var(--s1)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }),
    s('circle', { cx: last[0], cy: last[1], r: 4, fill: 'var(--s1)', stroke: 'var(--surface)', 'stroke-width': 2 }));
}
const COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)'];
function chartView(w) {
  const W = 560, H = 230, m = { l: 44, r: 12, t: 12, b: 28 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
  const xs = [...new Set(w.series.flatMap((x) => x.points.map((p) => p.x)))];
  const all = w.series.flatMap((x) => x.points.map((p) => p.y));
  const lo = Math.min(...all), mx = Math.max(...all);
  let y0, hi;
  if (w.kind === 'bar') { y0 = Math.min(0, lo); hi = niceMax(Math.max(mx, 0.0001)); }
  else { const pad = ((mx - lo) || Math.abs(mx) || 1) * 0.18; y0 = lo - pad; hi = mx + pad; }
  const sy = (v) => m.t + ih - ((v - y0) / (hi - y0 || 1)) * ih;
  const sx = (i) => m.l + (xs.length === 1 ? iw / 2 : (i / (xs.length - 1)) * iw);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': w.title || 'Diagramm' });
  const grid = s('g', { class: 'grid' }), axis = s('g', { class: 'axis' });
  for (let i = 0; i <= 4; i++) { const v = y0 + ((hi - y0) * i) / 4, y = sy(v); grid.append(s('line', { x1: m.l, x2: W - m.r, y1: y, y2: y })); axis.append(s('text', { x: m.l - 8, y: y + 4, 'text-anchor': 'end' }, nfa(v, hi - y0 < 8 ? 1 : 0))); }
  const step = Math.ceil(xs.length / 6);
  xs.forEach((x, i) => { if (i % step === 0 || i === xs.length - 1) axis.append(s('text', { x: w.kind === 'bar' ? m.l + (iw / xs.length) * (i + 0.5) : sx(i), y: H - 8, 'text-anchor': 'middle' }, x)); });
  svg.append(grid, axis);
  const u = w.unit ? ' ' + w.unit : '';
  const at = (ser, x) => ser.points.find((p) => p.x === x);
  if (w.kind === 'bar') {
    const band = iw / xs.length, bw = Math.max(4, Math.min(28, (band - 6) / w.series.length)); const base = sy(Math.max(0, y0));
    xs.forEach((x, i) => {
      const cx = m.l + band * (i + 0.5), g = s('g'); const tipText = `${x}: ` + w.series.map((q) => at(q, x) && `${q.label} ${nfa(at(q, x).y, 1)}${u}`).filter(Boolean).join(' · ');
      g.append(s('rect', { x: m.l + band * i, y: m.t, width: band, height: ih, fill: 'transparent' }));
      w.series.forEach((ser, k) => { const p = at(ser, x); if (!p) return; const bx = cx - (bw * w.series.length) / 2 + k * bw, top = sy(p.y), bh = Math.abs(base - top); g.append(s('rect', { x: bx + 1, y: Math.min(top, base), width: Math.max(2, bw - 2), height: Math.max(1, bh), rx: 4, fill: COLORS[k] })); });
      tipOn(g, tipText); svg.append(g);
    });
  } else {
    w.series.forEach((ser, k) => {
      const pts = ser.points.map((p) => [sx(xs.indexOf(p.x)), sy(p.y)]);
      svg.append(s('polyline', { points: pts.map((p) => p.join(',')).join(' '), fill: 'none', stroke: COLORS[k], 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      const l = pts[pts.length - 1]; svg.append(s('circle', { cx: l[0], cy: l[1], r: 4.5, fill: COLORS[k], stroke: 'var(--surface)', 'stroke-width': 2 }));
    });
    const cross = s('line', { y1: m.t, y2: m.t + ih, stroke: 'var(--ink-3)', 'stroke-width': 1, 'stroke-dasharray': '3 3', visibility: 'hidden' }); svg.append(cross);
    const hit = s('rect', { x: m.l, y: m.t, width: iw, height: ih, fill: 'transparent' }); svg.append(hit);
    hit.addEventListener('pointermove', (e) => {
      const r = svg.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * W; const i = Math.max(0, Math.min(xs.length - 1, Math.round(((px - m.l) / iw) * (xs.length - 1))));
      cross.setAttribute('x1', sx(i)); cross.setAttribute('x2', sx(i)); cross.setAttribute('visibility', 'visible');
      showTip(e, `${xs[i]}: ` + w.series.map((q) => at(q, xs[i]) && `${q.label} ${nfa(at(q, xs[i]).y, 1)}${u}`).filter(Boolean).join(' · '));
    });
    hit.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); hideTip(); });
  }
  const table = h('details', { class: 'table' }, h('summary', { text: 'Tabelle' }), h('table', {},
    h('tr', {}, h('th', { text: '' }), w.series.map((q) => h('th', { text: q.label }))),
    xs.map((x) => h('tr', {}, h('td', { text: x }), w.series.map((q) => h('td', { text: at(q, x) ? nfa(at(q, x).y, 1) + u : '–' }))))));
  return [h('div', { class: 'chart' }, svg),
    w.series.length > 1 && h('ul', { class: 'legend' }, w.series.map((q, k) => h('li', {}, h('i', { style: `background:${COLORS[k]}` }), q.label))), table];
}

// ---- widget renderers ------------------------------------------------------------------------------------------------------
const R = {
  callout: (w) => { const t = w.tone || 'info'; const tag = { info: 'Hinweis', good: 'Gut', warn: 'Achtung', urgent: 'Dringend' }[t]; const ic = { info: 'i', good: '✓', warn: '!', urgent: '‼' }[t];
    return h('div', { class: `callout callout--${t}` }, h('span', { class: 'callout__tag', text: `${ic} ${tag}` }), h('p', { text: w.text })); },
  stat: (w) => { const d = w.delta; const good = d && (d.good_when === 'up' ? d.value >= 0 : d.good_when === 'down' ? d.value <= 0 : null);
    return [h('div', { class: 'stat__row' }, h('div', {}, h('span', { class: 'stat__value', text: typeof w.value === 'number' ? nfa(w.value, 2) : w.value }), w.unit && h('span', { class: 'stat__unit', text: w.unit })), w.spark?.length > 1 && sparkline(w.spark)),
      d && h('div', { class: 'delta' + (good === true ? ' delta--good' : good === false ? ' delta--bad' : '') }, `${d.value > 0 ? '▲' : d.value < 0 ? '▼' : '■'} ${nfa(Math.abs(d.value), 1)}${w.unit && w.unit.length < 3 ? '\u202f' + w.unit : ''} ${d.label || ''}`.trim())]; },
  todo: (w) => checkRows(w, { sort: (a, b) => (a.due ?? '9') < (b.due ?? '9') ? -1 : 1, meta: (it) => it.due ? { ...whenLabel(it.due) } : it.tag ? { text: it.tag } : null }),
  reminders: (w) => checkRows(w, { sort: (a, b) => (a.at < b.at ? -1 : 1), meta: (it) => whenLabel(it.at) }),
  tracker: (w) => {
    const map = new Map(w.entries.map((e) => [e.date, (map0(e.date, w.entries))])); const t = today(); const days = Array.from({ length: 28 }, (_, i) => iso(new Date(Date.now() - (27 - i) * 864e5)));
    const target = w.target ?? Math.max(...w.entries.map((e) => e.value), 1); const val = (d) => map.get(d) ?? 0;
    let streak = 0; for (let i = days.length - 1; i >= 0; i--) { if (val(days[i]) >= (w.target ?? 0.0001) && val(days[i]) > 0) streak++; else if (days[i] === t) continue; else break; }
    const last7 = days.slice(-7).map(val), avg = last7.reduce((a, b) => a + b, 0) / 7, u = w.unit ? ' ' + w.unit : '';
    const lvl = (v) => (v <= 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((v / target) * 4))));
    const first = new Date(days[0] + 'T12:00:00').getDay(); const pad = (first + 6) % 7; // Monday-first grid
    return [h('div', { class: 'facts' }, h('div', { class: 'fact' }, h('b', { text: String(streak) }), h('span', { text: 'Tage in Folge' })), h('div', { class: 'fact' }, h('b', { text: nfa(avg, 1) }), h('span', { text: `Ø 7 Tage${u}` }))),
      h('div', { class: 'track', role: 'img', 'aria-label': `Letzte 28 Tage, ${streak} Tage in Folge` }, Array.from({ length: pad }, () => h('span')), days.map((d) => { const c = h('span', { class: 'cell' + (d === t ? ' cell--today' : ''), 'data-l': lvl(val(d)) }); tipOn(c, `${new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date(d + 'T12:00:00'))}: ${nf(val(d), 1)}${u}`); return c; }))];
  },
  chart: (w) => { w = { ...w, kind: w.kind || 'line' }; return chartView(w); },
  budget: (w) => { const cur = w.currency || 'EUR'; const sp = w.categories.reduce((a, c) => a + c.spent, 0), lim = w.categories.reduce((a, c) => a + (c.limit || 0), 0);
    return [w.categories.map((c) => { const over = c.limit && c.spent > c.limit; const pct = c.limit ? Math.min(100, (c.spent / c.limit) * 100) : 100;
      return h('div', { class: 'bar' + (over ? ' bar--over' : '') }, h('div', { class: 'bar__top' }, h('span', { text: c.name }), h('span', { class: 'bar__num' }, h('b', { text: money(c.spent, cur) }), c.limit ? ` von ${money(c.limit, cur)}` : '', over && h('span', { class: 'over', text: ' ▲ drüber' }))),
        c.limit && h('div', { class: 'bar__track' }, h('div', { class: 'bar__fill', style: `width:${pct}%` }))); }),
      h('div', { class: 'total' }, h('span', { text: w.period || 'Gesamt' }), h('b', { text: lim ? `${money(sp, cur)} von ${money(lim, cur)}` : money(sp, cur) }))]; },
  accounts: (w) => { const cur = w.currency || 'EUR'; const sum = w.items.reduce((a, b) => a + b.balance, 0);
    return [h('p', { class: 'net', text: money(sum, cur) }), h('ul', { class: 'rows' }, w.items.map((a) => h('li', { class: 'row' }, h('span', { class: 'row__text', text: a.name }),
      a.change != null && h('span', { class: 'row__meta', text: `${a.change >= 0 ? '▲' : '▼'} ${money(Math.abs(a.change), cur)}` }), h('span', { text: money(a.balance, cur) }))))]; },
  progress: (w) => w.items.map((p) => { const pct = Math.max(0, Math.min(100, (p.value / p.target) * 100)); const u = p.unit ? ' ' + p.unit : '';
    return h('div', { class: 'bar' }, h('div', { class: 'bar__top' }, h('span', { text: p.label }), h('span', { class: 'bar__num' }, h('b', { text: nfa(p.value, 1) + u }), ` von ${nfa(p.target, 1)}${u}`)), h('div', { class: 'bar__track' }, h('div', { class: 'bar__fill', style: `width:${pct}%` }))); }),
  agenda: (w) => w.events.length ? h('ul', { class: 'rows' }, [...w.events].sort((a, b) => (a.at < b.at ? -1 : 1)).map((e) => { const wl = whenLabel(e.at); return h('li', { class: 'row' }, h('span', { class: 'when', text: wl.text }), h('span', { class: 'row__text', text: e.title }), e.place && h('span', { class: 'where', text: e.place })); })) : h('p', { class: 'empty', text: 'Keine Termine.' }),
  list: (w) => h('ul', { class: 'rows' }, w.items.map((it) => h('li', { class: 'row' }, h('span', { class: 'row__text', text: it.text }), it.meta && h('span', { class: 'row__meta', text: it.meta }), it.value && h('span', { text: it.value })))),
  text: (w) => h('p', { class: 'body', text: w.body }),
};
const map0 = (d, entries) => entries.filter((e) => e.date === d).reduce((a, e) => a + e.value, 0);

function render(state) {
  document.title = state.title || 'Dashboard';
  $('title').textContent = state.title || 'Dashboard';
  $('date').textContent = new Intl.DateTimeFormat('de-DE', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  const b = $('briefing'); b.hidden = !state.briefing; b.textContent = state.briefing || '';
  const m = state.meta || {};
  $('stamp').textContent = m.updated_at ? `Zuletzt aktualisiert von ${m.updated_by === 'hermes' ? 'Hermes' : 'dir'} · ${new Intl.DateTimeFormat('de-DE', { timeZone: tz, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(m.updated_at))}` : '';
  const board = $('board'); board.replaceChildren(); let section = null, i = 0;
  for (const w of state.widgets) {
    if (w.section && w.section !== section) board.append(h('h2', { class: 'section', text: w.section }));
    section = w.section ?? null;
    let body; try { body = R[w.type](w); } catch { body = h('p', { class: 'err', text: `Widget „${w.id}“ konnte nicht dargestellt werden.` }); }
    const span = w.span ?? (w.type === 'callout' ? 4 : { stat: 1 }[w.type] ?? 2);
    board.append(h('section', { class: `w w--${w.type}`, style: `--span:${span};--i:${i++}` },
      w.title && w.type !== 'callout' && h('div', { class: 'w__head' }, h('h3', { class: 'label', text: w.title })), body, w.note && h('p', { class: 'w__note', text: w.note })));
  }
}

let rev = -1;
async function load(force) {
  try { const r = await fetch('/api/state', { cache: 'no-store' }); if (!r.ok) throw 0; const st = await r.json(); if (force || st.meta?.rev !== rev) { rev = st.meta?.rev ?? 0; render(st); } }
  catch { if (rev < 0) $('board').replaceChildren(h('p', { class: 'err', text: 'Dashboard-Daten nicht erreichbar.' })); }
}
const themeBtn = $('theme');
const modes = ['auto', 'light', 'dark'];
const cur = () => document.documentElement.dataset.theme || 'auto';
const label = () => { themeBtn.textContent = { auto: 'Auto', light: 'Hell', dark: 'Dunkel' }[cur()]; };
themeBtn.addEventListener('click', () => { const n = modes[(modes.indexOf(cur()) + 1) % 3]; if (n === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = n; try { localStorage.setItem('theme', n); } catch {} label(); });
label();
load(true); setInterval(load, 30000); document.addEventListener('visibilitychange', () => !document.hidden && load());
