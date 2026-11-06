(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const SVGNS = 'http://www.w3.org/2000/svg';
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const el = (tag, attrs = {}, kids = []) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); kids.forEach(c => e.appendChild(c)); return e; };
  const txt = (s, attrs) => { const t = el('text', attrs); t.textContent = s; return t; };
  const rupee = n => '₹' + Math.round(n).toLocaleString('en-IN');
  const compact = n => n >= 100000 ? '₹' + (n / 100000).toFixed(n >= 1000000 ? 0 : 1).replace(/\.0$/, '') + 'L' : n >= 1000 ? '₹' + (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'K' : '₹' + Math.round(n);
  const num = n => Math.round(n).toLocaleString('en-IN');
  const WD = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /* ---------- date helpers (UTC, date strings only) ---------- */
  const toMs = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const fromMs = ms => new Date(ms).toISOString().slice(0, 10);
  const DAY = 86400000;
  const wdOf = s => (new Date(toMs(s)).getUTCDay() + 6) % 7; // Monday = 0
  const nice = s => { const d = new Date(toMs(s)); return `${WD[wdOf(s)].slice(0, 3)} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
  const niceLong = s => `${nice(s)} ${new Date(toMs(s)).getUTCFullYear()}`;
  const hourLbl = h => String(h).padStart(2, '0') + ':00';

  /* ---------- CSV ---------- */
  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(r => r.some(x => x.trim() !== ''));
  }
  function loadRows(text) {
    const raw = parseCSV(text);
    if (raw.length < 2) throw new Error('The file has no data rows.');
    const head = raw[0].map(h => h.trim().toLowerCase());
    const ix = n => head.indexOf(n);
    const need = ['date', 'item', 'qty', 'unit_price'].filter(n => ix(n) < 0);
    if (need.length) throw new Error(`Missing column${need.length > 1 ? 's' : ''}: ${need.join(', ')}. Found: ${head.join(', ') || 'none'}.`);
    if (raw.length > 100001) throw new Error('That file has more than 100,000 rows. Please upload a smaller one.');
    const iD = ix('date'), iI = ix('item'), iQ = ix('qty'), iP = ix('unit_price'), iC = ix('category'), iH = ix('hour');
    const out = [], errs = [];
    for (let r = 1; r < raw.length; r++) {
      const x = raw[r], line = r + 1, date = (x[iD] || '').trim();
      const qty = Number(x[iQ]), price = Number(x[iP]), item = (x[iI] || '').trim();
      const hour = iH >= 0 && (x[iH] || '').trim() !== '' ? Number(x[iH]) : null;
      let bad = null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(toMs(date))) bad = `date "${date}" is not YYYY-MM-DD`;
      else if (fromMs(toMs(date)) !== date) bad = `date "${date}" does not exist`;
      else if (!item) bad = 'item is empty';
      else if (!isFinite(qty) || qty <= 0) bad = `qty "${x[iQ]}" must be a positive number`;
      else if (!isFinite(price) || price < 0) bad = `unit_price "${x[iP]}" must be a number, 0 or more`;
      else if (hour !== null && !(Number.isInteger(hour) && hour >= 0 && hour <= 23)) bad = `hour "${x[iH]}" must be a whole number from 0 to 23`;
      if (bad) { if (errs.length < 3) errs.push(`line ${line}: ${bad}`); errs.count = (errs.count || 0) + 1; continue; }
      out.push({ date, hour, item, cat: (iC >= 0 && (x[iC] || '').trim()) || 'Uncategorised', qty, price, rev: qty * price });
    }
    if (errs.count) throw new Error(`${errs.count} row${errs.count > 1 ? 's' : ''} could not be read. First problems: ${errs.join('; ')}.`);
    if (!out.length) throw new Error('No usable rows found.');
    return { rows: out, hasHour: iH >= 0 };
  }

  /* ---------- state ---------- */
  const state = { all: [], hasHour: true, isSample: true, days: 30, cat: '', min: '', max: '', catOrder: [], filtered: [], from: '', to: '' };
  let rafId = 0;

  function setData(rows, hasHour, isSample, label) {
    state.all = rows; state.hasHour = hasHour; state.isSample = isSample;
    const ds = rows.map(r => r.date).sort(); state.min = ds[0]; state.max = ds[ds.length - 1];
    const tot = {}; rows.forEach(r => tot[r.cat] = (tot[r.cat] || 0) + r.rev);
    state.catOrder = Object.keys(tot).sort((a, b) => tot[b] - tot[a] || a.localeCompare(b));
    state.cat = ''; const span = (toMs(state.max) - toMs(state.min)) / DAY + 1;
    if (state.days && state.days > span) state.days = 0;
    const sel = $('#catSel'); sel.innerHTML = '<option value="">All categories</option>';
    state.catOrder.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; sel.appendChild(o); });
    $('#badge').textContent = isSample ? 'Sample data' : 'Your data'; $('#badge').classList.toggle('user', !isSample);
    $('#resetBtn').hidden = isSample;
    $$('#range button').forEach(b => { const d = Number(b.dataset.days); b.hidden = d !== 0 && d > span; });
    state.label = label;
  }
  const catColor = c => { const i = state.catOrder.indexOf(c); return i >= 0 && i < 5 ? `var(--s${i + 1})` : 'var(--other)'; };
  const lumOf = hex => { const [r, g, b] = hex.replace('#', '').match(/../g).map(x => { const v = parseInt(x, 16) / 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
  // pick whichever of white / near-black gives the higher contrast on the fill
  const inkOn = hex => { const L = lumOf(hex); return (1.05 / (L + .05)) >= ((L + .05) / (lumOf('#0b0b0b') + .05)) ? '#ffffff' : '#0b0b0b'; };
  const catInk = c => inkOn(css(state.catOrder.indexOf(c) < 5 && state.catOrder.indexOf(c) >= 0 ? `--s${state.catOrder.indexOf(c) + 1}` : '--other'));
  const catGroup = c => { const i = state.catOrder.indexOf(c); return i >= 0 && i < 5 ? c : 'Other'; };

  function slice() {
    const to = state.max; const from = state.days ? fromMs(toMs(to) - (state.days - 1) * DAY) : state.min;
    state.from = from < state.min ? state.min : from; state.to = to;
    const f = r => (!state.cat || r.cat === state.cat);
    state.filtered = state.all.filter(r => f(r) && r.date >= state.from && r.date <= state.to);
    const n = (toMs(state.to) - toMs(state.from)) / DAY + 1;
    const pTo = fromMs(toMs(state.from) - DAY), pFrom = fromMs(toMs(state.from) - n * DAY);
    state.prev = state.days && pFrom >= state.min ? state.all.filter(r => f(r) && r.date >= pFrom && r.date <= pTo) : null;
    state.n = n;
    state.series = state.all.filter(f);
  }
  const sum = (rows, k) => rows.reduce((a, r) => a + r[k], 0);

  /* ---------- tooltip ---------- */
  const tip = $('#tip');
  function showTip(lines, x, y) {
    tip.textContent = '';
    lines.forEach(l => {
      const d = document.createElement('div');
      if (l.strong) { const s = document.createElement('strong'); s.textContent = l.strong; d.appendChild(s); }
      else { d.className = 'row'; if (l.key) { const k = document.createElement('span'); k.className = 'key'; k.style.background = l.key; d.appendChild(k); } const s = document.createElement('span'); s.textContent = l.text; if (l.sec) s.className = 'sec'; d.appendChild(s); }
      tip.appendChild(d);
    });
    tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let left = x + 14, top = y - h - 12; if (left + w > innerWidth - 8) left = x - w - 14; if (left < 8) left = 8; if (top < 8) top = y + 18;
    tip.style.left = left + 'px'; tip.style.top = top + 'px';
  }
  const hideTip = () => { tip.hidden = true; };
  const ptr = (target, fn) => {
    target.addEventListener('pointermove', e => fn(e.clientX, e.clientY, e));
    target.addEventListener('pointerleave', hideTip);
    target.addEventListener('focus', () => { const r = target.getBoundingClientRect(); fn(r.left + r.width / 2, r.top, null); });
    target.addEventListener('blur', hideTip);
  };

  /* ---------- helpers for charts ---------- */
  const niceMax = v => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; };
  const trunc = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
  const width = box => Math.max(280, Math.floor(box.clientWidth || 600));
  function setEmpty(box, msg) { box.textContent = ''; const p = document.createElement('p'); p.className = 'empty'; p.textContent = msg; box.appendChild(p); }
  function mountSVG(box, w, h, label) { box.textContent = ''; const s = el('svg', { viewBox: `0 0 ${w} ${h}`, role: 'group', 'aria-label': label }); box.appendChild(s); return s; }
  function bar(x, y, w, h, r, dir) { // rounded data-end, square baseline
    r = Math.min(r, w / 2, h / 2);
    if (dir === 'right') return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }

  /* ---------- aggregations ---------- */
  function dailySeries() {
    const byDay = {}; state.series.forEach(r => byDay[r.date] = (byDay[r.date] || 0) + r.rev);
    const days = []; for (let t = toMs(state.min); t <= toMs(state.max); t += DAY) days.push(fromMs(t));
    const vals = days.map(d => byDay[d] || 0);
    const ma = vals.map((_, i) => { const s = Math.max(0, i - 6); const w = vals.slice(s, i + 1); return w.reduce((a, b) => a + b, 0) / w.length; });
    const i0 = days.indexOf(state.from);
    return { days: days.slice(i0), vals: vals.slice(i0), ma: ma.slice(i0) };
  }

  /* ---------- charts ---------- */
  const tables = {};
  function renderKPIs() {
    const rows = state.filtered, rev = sum(rows, 'rev'), qty = sum(rows, 'qty'), avg = rev / state.n, price = qty ? rev / qty : 0;
    $('#kRev').textContent = rupee(rev); $('#kQty').textContent = num(qty); $('#kAvg').textContent = rupee(avg); $('#kPrice').textContent = rupee(price);
    const d = (id, cur, prev) => {
      const e = $(id); e.textContent = '';
      if (prev == null || !prev) { e.textContent = state.days ? '' : 'Full period'; return; }
      const p = (cur - prev) / prev * 100, up = p >= 0;
      const s = document.createElement('span'); s.className = up ? 'up' : 'down'; s.textContent = `${up ? '▲' : '▼'} ${Math.abs(p).toFixed(1)}%`;
      e.appendChild(s); e.appendChild(document.createTextNode(` vs previous ${state.n} days`));
    };
    const pr = state.prev; const pRev = pr ? sum(pr, 'rev') : null, pQty = pr ? sum(pr, 'qty') : null;
    d('#dRev', rev, pRev); d('#dQty', qty, pQty); d('#dAvg', avg, pr ? pRev / state.n : null); d('#dPrice', price, pr && pQty ? pRev / pQty : null);
    $('#metaLine').textContent = `${niceLong(state.from)} to ${niceLong(state.to)} · ${state.cat || 'all categories'} · ${num(rows.length)} sales lines${state.isSample ? ' · generated sample data' : ' · ' + state.label}`;
  }

  function renderLine() {
    const box = $('#pLine'), { days, vals, ma } = dailySeries();
    if (!state.filtered.length) { setEmpty(box, 'No sales in this view.'); $('#iLine').textContent = ''; $('#lgLine').textContent = ''; tables.line = null; return; }
    const w = width(box), small = w < 520, h = small ? 260 : 320, m = { l: 48, r: 16, t: 12, b: 28 }, iw = w - m.l - m.r, ih = h - m.t - m.b;
    const top = niceMax(Math.max(...vals)), X = i => m.l + (days.length > 1 ? i / (days.length - 1) * iw : iw / 2), Y = v => m.t + ih - v / top * ih;
    const svg = mountSVG(box, w, h, 'Line chart of daily revenue and its 7-day average. Use the table view for exact values.'); svg.setAttribute('tabindex', '0');
    const g = el('g', { class: 'grid' }); for (let i = 0; i <= 4; i++) { const v = top / 4 * i, y = Y(v); g.appendChild(el('line', { x1: m.l, x2: w - m.r, y1: y, y2: y, class: i ? '' : 'axis' })); svg.appendChild(txt(compact(v), { x: m.l - 8, y: y + 4, 'text-anchor': 'end' })); }
    svg.insertBefore(g, svg.firstChild);
    const step = Math.max(1, Math.ceil(days.length / (small ? 3 : 8)));
    days.forEach((d, i) => { if (i % step === 0) svg.appendChild(txt(nice(d), { x: X(i), y: h - 6, 'text-anchor': i === 0 ? 'start' : 'middle' })); });
    const path = a => a.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
    svg.appendChild(el('path', { d: path(vals), fill: 'none', stroke: 'var(--daily)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    svg.appendChild(el('path', { d: path(ma), fill: 'none', stroke: 'var(--avg)', 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    const cross = el('line', { y1: m.t, y2: m.t + ih, stroke: 'var(--ink3)', 'stroke-width': 1, visibility: 'hidden' }), d1 = el('circle', { r: 4, fill: 'var(--daily)', stroke: 'var(--surface)', 'stroke-width': 2, visibility: 'hidden' }), d2 = el('circle', { r: 4.5, fill: 'var(--avg)', stroke: 'var(--surface)', 'stroke-width': 2, visibility: 'hidden' });
    [cross, d1, d2].forEach(n => svg.appendChild(n));
    const at = (i, cx, cy) => {
      i = Math.max(0, Math.min(days.length - 1, i)); const x = X(i);
      cross.setAttribute('x1', x); cross.setAttribute('x2', x); d1.setAttribute('cx', x); d1.setAttribute('cy', Y(vals[i])); d2.setAttribute('cx', x); d2.setAttribute('cy', Y(ma[i]));
      [cross, d1, d2].forEach(n => n.setAttribute('visibility', 'visible'));
      if (cx == null) { const r = svg.getBoundingClientRect(); cx = r.left + x / w * r.width; cy = r.top + Y(vals[i]) / h * r.height; }
      showTip([{ strong: nice(days[i]) }, { key: 'var(--daily)', text: `Daily ${rupee(vals[i])}` }, { key: 'var(--avg)', text: `7-day average ${rupee(ma[i])}` }], cx, cy); state._li = i;
    };
    const off = () => { [cross, d1, d2].forEach(n => n.setAttribute('visibility', 'hidden')); hideTip(); };
    svg.addEventListener('pointermove', e => { const r = svg.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * w; at(Math.round((px - m.l) / iw * (days.length - 1)), e.clientX, e.clientY); });
    svg.addEventListener('pointerleave', off); svg.addEventListener('blur', off);
    svg.addEventListener('focus', () => at(days.length - 1)); state._li = days.length - 1;
    svg.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') { e.preventDefault(); at(state._li - 1); } else if (e.key === 'ArrowRight') { e.preventDefault(); at(state._li + 1); } else if (e.key === 'Home') { e.preventDefault(); at(0); } else if (e.key === 'End') { e.preventDefault(); at(days.length - 1); } else if (e.key === 'Escape') off(); });
    const pk = vals.indexOf(Math.max(...vals)); $('#iLine').textContent = `Best day: ${nice(days[pk])} at ${rupee(vals[pk])}. The 7-day average ends at ${rupee(ma[ma.length - 1])}.`;
    const lg = $('#lgLine'); lg.textContent = ''; [['var(--daily)', 'Daily revenue'], ['var(--avg)', '7-day average']].forEach(([c, t]) => { const s = document.createElement('span'), i = document.createElement('i'); i.style.background = c; s.appendChild(i); s.appendChild(document.createTextNode(t)); lg.appendChild(s); });
    tables.line = { cap: 'Revenue per day', head: ['Date', 'Daily revenue', '7-day average'], rows: days.map((d, i) => [niceLong(d), rupee(vals[i]), rupee(ma[i])]).reverse() };
  }

  function renderItems() {
    const box = $('#pItems'), by = {}; state.filtered.forEach(r => by[r.item] = (by[r.item] || 0) + r.rev);
    const all = Object.entries(by).sort((a, b) => b[1] - a[1]), list = all.slice(0, 8), tot = all.reduce((a, b) => a + b[1], 0);
    if (!list.length) { setEmpty(box, 'No sales in this view.'); $('#iItems').textContent = ''; tables.items = null; return; }
    const w = width(box), rowH = 36, h = list.length * rowH + 8, lm = w < 420 ? 108 : 140, rm = 64, bw = w - lm - rm, max = list[0][1];
    const svg = mountSVG(box, w, h, 'Bar chart of top items by revenue');
    list.forEach(([name, v], i) => {
      const y = 4 + i * rowH, bh = 22, len = Math.max(4, v / max * bw);
      svg.appendChild(txt(trunc(name, w < 420 ? 14 : 18), { x: lm - 10, y: y + 15, 'text-anchor': 'end', style: 'fill:var(--ink)' }));
      const p = el('path', { d: bar(lm, y, len, bh, 4, 'right'), fill: 'var(--bar)', 'data-m': 1, tabindex: 0, role: 'img', 'aria-label': `${name}: ${rupee(v)}, ${(v / tot * 100).toFixed(1)} percent of revenue` });
      ptr(p, (cx, cy) => showTip([{ strong: name }, { text: `${rupee(v)} · ${(v / tot * 100).toFixed(1)}% of revenue` }], cx, cy));
      svg.appendChild(p); svg.appendChild(txt(compact(v), { x: lm + len + 8, y: y + 15, class: 'val' }));
    });
    svg.insertBefore(el('line', { x1: lm, x2: lm, y1: 0, y2: h, class: 'axis' }), svg.firstChild);
    $('#iItems').textContent = `${list[0][0]} brings in ${(list[0][1] / tot * 100).toFixed(0)}% of revenue in this view.`;
    tables.items = { cap: 'Revenue by item', head: ['Item', 'Revenue', 'Share'], rows: all.map(([n, v]) => [n, rupee(v), (v / tot * 100).toFixed(1) + '%']) };
  }

  function weekdayStats() {
    const rev = Array(7).fill(0), days = Array(7).fill(0), byDate = {};
    state.filtered.forEach(r => { rev[wdOf(r.date)] += r.rev; });
    for (let t = toMs(state.from); t <= toMs(state.to); t += DAY) days[wdOf(fromMs(t))]++;
    return rev.map((v, i) => days[i] ? v / days[i] : 0);
  }
  function renderWeekday() {
    const box = $('#pWd'); if (!state.filtered.length) { setEmpty(box, 'No sales in this view.'); $('#iWd').textContent = ''; tables.wd = null; return; }
    const v = weekdayStats(), w = width(box), h = 260, m = { l: 48, r: 8, t: 22, b: 28 }, iw = w - m.l - m.r, ih = h - m.t - m.b, top = niceMax(Math.max(...v)), band = iw / 7, bw = Math.min(24, band * .6);
    const svg = mountSVG(box, w, h, 'Column chart of average revenue by weekday'); const g = el('g', { class: 'grid' }); svg.appendChild(g);
    for (let i = 0; i <= 4; i++) { const val = top / 4 * i, y = m.t + ih - val / top * ih; g.appendChild(el('line', { x1: m.l, x2: w - m.r, y1: y, y2: y, class: i ? '' : 'axis' })); svg.appendChild(txt(compact(val), { x: m.l - 8, y: y + 4, 'text-anchor': 'end' })); }
    const hi = v.indexOf(Math.max(...v)), lo = v.indexOf(Math.min(...v));
    v.forEach((val, i) => {
      const cx = m.l + band * i + band / 2, bh = Math.max(2, val / top * ih), y = m.t + ih - bh;
      const p = el('path', { d: bar(cx - bw / 2, y, bw, bh, 4, 'up'), fill: 'var(--bar)', 'data-m': 1, tabindex: 0, role: 'img', 'aria-label': `${WD[i]}: ${rupee(val)} on average` });
      ptr(p, (px, py) => showTip([{ strong: WD[i] }, { text: `${rupee(val)} average per day` }], px, py)); svg.appendChild(p);
      svg.appendChild(txt(WD[i].slice(0, 3), { x: cx, y: h - 8, 'text-anchor': 'middle' }));
      if (i === hi || i === lo) svg.appendChild(txt(compact(val), { x: cx, y: y - 6, 'text-anchor': 'middle', class: 'val' }));
    });
    $('#iWd').textContent = `${WD[hi]} is strongest (${rupee(v[hi])} a day) and ${WD[lo]} the quietest (${rupee(v[lo])}).`;
    tables.wd = { cap: 'Average revenue per day, by weekday', head: ['Weekday', 'Average revenue'], rows: v.map((x, i) => [WD[i], rupee(x)]) };
  }

  function renderHeat() {
    const card = $('#cardHeat'), box = $('#pHeat'); card.hidden = !state.hasHour; if (!state.hasHour) return;
    const rows = state.filtered; if (!rows.length) { setEmpty(box, 'No sales in this view.'); $('#iHeat').textContent = ''; $('#scaleHeat').textContent = ''; tables.heat = null; return; }
    const hrs = rows.map(r => r.hour).filter(h => h !== null), h0 = Math.min(...hrs), h1 = Math.max(...hrs), nh = h1 - h0 + 1;
    const days = Array(7).fill(0); for (let t = toMs(state.from); t <= toMs(state.to); t += DAY) days[wdOf(fromMs(t))]++;
    const cell = Array.from({ length: 7 }, () => Array(nh).fill(0)); rows.forEach(r => { if (r.hour !== null) cell[wdOf(r.date)][r.hour - h0] += r.qty; });
    const avg = cell.map((row, d) => row.map(v => days[d] ? v / days[d] : 0)), max = Math.max(...avg.flat(), .0001);
    const w = width(box), lm = 40, gap = 2, cw = (w - lm) / nh, ch = 30, h = 7 * (ch + gap) + 22;
    const svg = mountSVG(box, w, h, 'Heat map of average items sold per hour for each weekday. Use the table view for exact values.');
    const lerp = t => { const stops = ['--h0', '--h3', '--h6'].map(css); return t < .5 ? mix(stops[0], stops[1], t * 2) : mix(stops[1], stops[2], (t - .5) * 2); };
    avg.forEach((row, d) => {
      svg.appendChild(txt(WD[d].slice(0, 3), { x: lm - 8, y: d * (ch + gap) + ch / 2 + 4, 'text-anchor': 'end' }));
      row.forEach((v, k) => {
        const r = el('rect', { x: lm + k * cw + gap / 2, y: d * (ch + gap), width: Math.max(2, cw - gap), height: ch, rx: 4, fill: v ? lerp(v / max) : 'var(--surface2)', 'data-m': 1 });
        r.addEventListener('pointermove', e => showTip([{ strong: `${WD[d]} ${hourLbl(h0 + k)}` }, { text: `${v.toFixed(1)} items an hour on average` }], e.clientX, e.clientY)); r.addEventListener('pointerleave', hideTip); svg.appendChild(r);
      });
    });
    const st = Math.ceil(nh / (w < 520 ? 4 : 8)); for (let k = 0; k < nh; k += st) svg.appendChild(txt(hourLbl(h0 + k), { x: lm + k * cw + cw / 2, y: h - 4, 'text-anchor': 'middle' }));
    let bd = 0, bk = 0, bv = -1; avg.forEach((row, d) => row.forEach((v, k) => { if (v > bv) { bv = v; bd = d; bk = k; } }));
    $('#iHeat').textContent = `Busiest: ${WD[bd]} ${hourLbl(h0 + bk)} to ${hourLbl(h0 + bk + 1)}, about ${Math.round(bv)} items an hour.`;
    const sc = $('#scaleHeat'); sc.textContent = ''; sc.appendChild(document.createTextNode('Fewer items')); sc.appendChild(document.createElement('b')); sc.appendChild(document.createTextNode(`More (up to ${bv.toFixed(1)} an hour)`));
    const head = ['Weekday']; for (let k = 0; k < nh; k++) head.push(hourLbl(h0 + k));
    tables.heat = { cap: 'Average items sold per hour', head, rows: avg.map((row, d) => [WD[d], ...row.map(v => v.toFixed(1))]) };
  }
  function mix(a, b, t) { const p = s => s.replace('#', '').match(/../g).map(x => parseInt(x, 16)); const A = p(a), B = p(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); }

  function renderMix() {
    const box = $('#pMix'), lg = $('#lgMix'); lg.textContent = '';
    const by = {}; state.filtered.forEach(r => { const g = catGroup(r.cat); by[g] = (by[g] || 0) + r.rev; });
    const order = [...state.catOrder.slice(0, 5), 'Other'].filter(c => by[c]), tot = order.reduce((a, c) => a + by[c], 0);
    if (!order.length) { setEmpty(box, 'No sales in this view.'); $('#iMix').textContent = ''; tables.mix = null; return; }
    const w = width(box), h = 36, gap = 2; let x = 0;
    const svg = mountSVG(box, w, h, 'Segmented bar of revenue share by category');
    order.forEach(c => {
      const v = by[c], seg = v / tot * (w - gap * (order.length - 1)), fill = c === 'Other' ? 'var(--other)' : catColor(c), pct = v / tot * 100;
      const r = el('rect', { x, y: 4, width: Math.max(1, seg), height: 28, rx: 4, fill, 'data-m': 1, tabindex: 0, role: 'img', 'aria-label': `${c}: ${rupee(v)}, ${pct.toFixed(1)} percent` });
      ptr(r, (cx, cy) => showTip([{ strong: c }, { text: `${rupee(v)} · ${pct.toFixed(1)}%` }], cx, cy)); svg.appendChild(r);
      const label = pct.toFixed(0) + '%'; if (seg > 46) svg.appendChild(txt(label, { x: x + 8, y: 23, style: `fill:${c === 'Other' ? inkOn(css('--other')) : catInk(c)};font-weight:700;font-size:13px`, 'pointer-events': 'none' }));
      x += seg + gap;
      const s = document.createElement('span'), i = document.createElement('i'); i.className = 'box'; i.style.background = fill; s.appendChild(i); s.appendChild(document.createTextNode(c)); lg.appendChild(s);
    });
    const top = order[0]; const big = order.reduce((a, c) => by[c] > by[a] ? c : a, order[0]);
    $('#iMix').textContent = `${big} is ${(by[big] / tot * 100).toFixed(0)}% of revenue (${rupee(by[big])}).`;
    tables.mix = { cap: 'Revenue by category', head: ['Category', 'Revenue', 'Share'], rows: order.map(c => [c, rupee(by[c]), (by[c] / tot * 100).toFixed(1) + '%']) };
  }

  function renderTables() {
    $$('.card').forEach(card => {
      const t = tables[card.dataset.card], v = $('.tview', card), btn = $('.tbl', card);
      v.textContent = '';
      if (!t) return;
      const tb = document.createElement('table'), cap = document.createElement('caption'); cap.textContent = t.cap; tb.appendChild(cap);
      const th = document.createElement('thead'), tr = document.createElement('tr'); t.head.forEach(h => { const c = document.createElement('th'); c.scope = 'col'; c.textContent = h; tr.appendChild(c); }); th.appendChild(tr); tb.appendChild(th);
      const body = document.createElement('tbody'); t.rows.forEach(r => { const tr2 = document.createElement('tr'); r.forEach((x, i) => { const c = document.createElement(i ? 'td' : 'th'); if (!i) c.scope = 'row'; c.textContent = x; tr2.appendChild(c); }); body.appendChild(tr2); }); tb.appendChild(body); v.appendChild(tb);
    });
  }

  function render() {
    hideTip(); slice(); renderKPIs(); renderLine(); renderItems(); renderWeekday(); renderHeat(); renderMix(); renderTables();
    $$('#range button').forEach(b => b.setAttribute('aria-checked', Number(b.dataset.days) === state.days));
  }
  const rerender = () => { cancelAnimationFrame(rafId); rafId = requestAnimationFrame(render); };

  /* ---------- notices ---------- */
  function notice(msg, err) { const n = $('#notice'); n.textContent = msg; n.classList.toggle('err', !!err); n.hidden = !msg; }

  /* ---------- events ---------- */
  $('#range').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; state.days = Number(b.dataset.days); rerender(); });
  $('#range').addEventListener('keydown', e => {
    if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return; const bs = $$('#range button:not([hidden])'), i = bs.indexOf(document.activeElement); if (i < 0) return;
    e.preventDefault(); const n = bs[(i + (e.key === 'ArrowRight' ? 1 : -1) + bs.length) % bs.length]; n.focus(); n.click();
  });
  $('#catSel').addEventListener('change', e => { state.cat = e.target.value; rerender(); });
  $$('.tbl').forEach(b => b.addEventListener('click', () => {
    const card = b.closest('.card'), on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on);
    b.textContent = on ? 'Chart' : 'Table'; $('.tview', card).hidden = !on; $$('.plot,.legend,.scale', card).forEach(n => n.hidden = on); hideTip(); if (!on) rerender();
  }));
  $('#fileIn').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      if (f.size > 8e6) throw new Error('That file is larger than 8 MB.');
      const { rows, hasHour } = loadRows(await f.text()); setData(rows, hasHour, false, f.name); state.days = 0;
      notice(`Loaded ${num(rows.length)} rows from ${f.name}. It stays in your browser.`, false); render();
    } catch (err) { notice(err.message, true); }
    e.target.value = '';
  });
  $('#resetBtn').addEventListener('click', () => { const s = loadRows(window.SAMPLE_CSV); setData(s.rows, s.hasHour, true, ''); state.days = 30; notice('Back to the sample data.', false); render(); });
  $('#dlBtn').addEventListener('click', () => {
    const q = v => /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    const lines = ['date,hour,item,category,qty,unit_price', ...state.filtered.map(r => [r.date, r.hour === null ? '' : r.hour, q(r.item), q(r.cat), r.qty, r.price].join(','))];
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lines.join('\n') + '\n'], { type: 'text/csv' })); a.download = `sales-${state.from}-to-${state.to}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#themeBtn').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'), next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next; try { localStorage.setItem('chai.theme', next); } catch (e) { } rerender();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', rerender);
  let lastW = innerWidth; addEventListener('resize', () => { if (innerWidth !== lastW) { lastW = innerWidth; rerender(); } });

  /* ---------- go ---------- */
  const s = loadRows(window.SAMPLE_CSV); setData(s.rows, s.hasHour, true, '');
  window.__dash = { state, loadRows };
  render();
})();
