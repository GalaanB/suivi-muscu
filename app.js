'use strict';
/* Suivi Muscu — toutes les données restent sur le téléphone (localStorage). */

const STORE_KEY = 'suivi-muscu';
const SESS = {
  A1: { name: 'Antérieur 1', side: 'ant' },
  P1: { name: 'Postérieur 1', side: 'post' },
  A2: { name: 'Antérieur 2', side: 'ant' },
  P2: { name: 'Postérieur 2', side: 'post' },
};
const CYCLE = ['A1', 'P1', 'A2', 'P2'];
const TYPES = { charge: 'Charge × reps', reps: 'Reps seules', duree: 'Durée (secondes)' };

/* ---------- Données par défaut ---------- */
function defaultState() {
  const E = (name, type = 'charge', uni = false) => ({ name, type, uni });
  const exercises = {
    chaise: E('Chaise avec élastique', 'duree'),
    chest: E('Chest press couchée'),
    presse: E('Presse à cuisses'),
    presse_uni: E('Presse unilatérale', 'charge', true),
    incline: E('Développé incliné Smith'),
    militaire: E('Développé militaire Smith'),
    lat: E('Élévations latérales poulie (cuff)', 'charge', true),
    marteau: E('Curl marteau poulie (corde)'),
    bayesian: E('Curl bayesian poulie', 'charge', true),
    crunch: E('Crunch à la poulie'),
    releves: E('Relevés de jambes banc incliné', 'reps'),
    row_neutre: E('Rowing machine 50° prise neutre'),
    row_ecarte: E('Rowing machine 50° coudes écartés'),
    legcurl: E('Leg curl assis'),
    tirage_large: E('Tirage vertical prise large'),
    tirage_uni: E('Tirage unilatéral poulie haute', 'charge', true),
    tri_uni: E('Extension triceps unilatérale (cuff)', 'charge', true),
    facepull: E('Face pull'),
    tri_over: E('Extension triceps overhead'),
    lombaires: E('Lombaires', 'reps'),
  };
  // p(exercice, échauffement ?, en pause ?)
  const p = (ex, warmup = false, paused = false) => ({ ex, sets: 2, warmup, paused });
  const program = {
    A1: [p('chaise'), p('chest', true), p('presse', true), p('incline'), p('militaire', true), p('lat'), p('marteau', true), p('crunch')],
    P1: [p('row_neutre', true), p('legcurl', true), p('tirage_large'), p('tri_uni', true), p('facepull'), p('tri_over'), p('lombaires', false, true), p('releves')],
    A2: [p('chaise'), p('incline', true), p('presse_uni', true), p('chest'), p('militaire', true), p('lat'), p('bayesian', true), p('releves')],
    P2: [p('row_ecarte', true), p('legcurl', true), p('tirage_uni'), p('tri_uni', true), p('facepull'), p('tri_over'), p('lombaires', false, true), p('crunch')],
  };
  return { version: 1, exercises, program, nextIndex: 0, sessions: [], current: null, lastBackup: null };
}

/* ---------- État ---------- */
let state = load();
const now = new Date();
const ui = { tab: 'seance', progKey: 'A1', cal: [now.getFullYear(), now.getMonth()], exDetail: null, metric: 'e1', pick: null, form: null, entry: null, confirm: null };

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) { const s = JSON.parse(raw); if (validState(s)) return s; }
  } catch (e) { /* données illisibles : on repart des valeurs par défaut */ }
  return defaultState();
}
function validState(s) {
  return s && typeof s === 'object' && s.exercises && s.program && Array.isArray(s.sessions) && CYCLE.every(k => Array.isArray(s.program[k]));
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { toast('Impossible d\'enregistrer (stockage plein ?)'); }
}

/* ---------- Outils ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => isoDate(new Date());
const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const num = v => { if (v == null || v === '') return null; const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; };
const fmt = n => (Math.round(n * 100) / 100).toLocaleString('fr-FR');
const fmtDate = s => parseISO(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const fmtDateLong = s => parseISO(s).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const daysAgo = s => Math.round((parseISO(today()) - parseISO(s)) / 86400000);
function ago(s) { const d = daysAgo(s); return d <= 0 ? 'aujourd\'hui' : d === 1 ? 'hier' : `il y a ${d} j`; }
const exOf = id => state.exercises[id] || { name: 'Exercice supprimé', type: 'charge', uni: false };
const e1rm = (kg, reps) => reps <= 1 ? kg : kg * (1 + reps / 30); // formule d'Epley
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

function fmtSet(s) {
  if (s.sec != null) return `${fmt(s.sec)} s`;
  if (s.kg != null) return `${fmt(s.kg)} kg × ${s.reps}`;
  return `${s.reps} reps`;
}
function setValue(type, s) { // valeur chiffrée d'une série terminée, ou null si incomplète
  const kg = num(s.kg), reps = num(s.reps), sec = num(s.sec);
  if (type === 'duree') return sec > 0 ? { sec } : null;
  if (type === 'reps') return reps > 0 ? { reps: Math.round(reps) } : null;
  return kg != null && kg >= 0 && reps > 0 ? { kg, reps: Math.round(reps) } : null;
}

/* ---------- Historique, records ---------- */
function lastPerf(exId) {
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    const it = state.sessions[i].items.find(x => x.ex === exId);
    if (it && it.sets.length) return { date: state.sessions[i].date, sets: it.sets };
  }
  return null;
}
function placeholderFor(last, warm, idx) {
  if (!last) return null;
  const same = last.sets.filter(s => !!s.w === !!warm);
  return same[idx] || same[same.length - 1] || null;
}
function metricOf(type, s, metric) {
  if (type === 'duree') return s.sec != null ? s.sec : null;
  if (type === 'reps') return s.kg == null && s.sec == null ? s.reps : (s.reps != null ? s.reps : null);
  if (s.kg == null || s.reps == null) return null;
  return metric === 'kg' ? s.kg : e1rm(s.kg, s.reps);
}
function series(exId, metric) { // meilleure valeur par séance, dans l'ordre chronologique
  const type = exOf(exId).type, out = [];
  for (const se of state.sessions) {
    let best = null, bestSet = null;
    for (const it of se.items) {
      if (it.ex !== exId) continue;
      for (const s of it.sets) {
        if (s.w) continue;
        const v = metricOf(type, s, metric);
        if (v != null && (best == null || v > best)) { best = v; bestSet = s; }
      }
    }
    if (best != null) out.push({ date: se.date, v: best, set: bestSet });
  }
  return out;
}
function records(exId) {
  const type = exOf(exId).type;
  const main = series(exId, type === 'charge' ? 'e1' : 'x');
  if (!main.length) return null;
  const top = main.reduce((a, b) => (b.v > a.v ? b : a));
  const r = { n: main.length, last: main[main.length - 1], best: top };
  if (type === 'charge') {
    const kgs = series(exId, 'kg');
    r.bestKg = kgs.reduce((a, b) => (b.v > a.v || (b.v === a.v && b.set.reps > a.set.reps) ? b : a));
  }
  return r;
}
function isPR(exId, type, s, rec) {
  if (!rec || s.w || !s.done) return false;
  const v = setValue(type, s);
  if (!v) return false;
  return metricOf(type, v, 'e1') > rec.best.v + 1e-9;
}

/* ---------- Rendu ---------- */
function render() {
  const cur = state.current;
  let html = '', title = 'Suivi Muscu', sub = '';
  if (ui.tab === 'seance') {
    if (cur) { title = SESS[cur.key].name; sub = fmtDateLong(cur.date); html = viewSession(); }
    else html = viewHome();
  } else if (ui.tab === 'progres') {
    if (ui.exDetail) { title = 'Progrès'; html = viewExDetail(); } else { title = 'Progrès'; html = viewProgress(); }
  } else if (ui.tab === 'calendrier') { title = 'Calendrier'; html = viewCalendar(); }
  else { title = 'Programme'; html = viewProgram(); }
  $('#title').textContent = title;
  $('#subtitle').textContent = sub;
  $('#main').innerHTML = html;
  const side = ui.tab === 'seance' ? SESS[cur ? cur.key : CYCLE[state.nextIndex]].side : (ui.tab === 'programme' ? SESS[ui.progKey].side : 'ant');
  document.body.className = side;
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
}

/* --- Accueil --- */
function viewHome() {
  const key = CYCLE[state.nextIndex % CYCLE.length];
  const entries = state.program[key].filter(e => !e.paused);
  const lastS = state.sessions[state.sessions.length - 1];
  let h = `<div class="card hero ${SESS[key].side}">
    <div class="small mut">Prochaine séance</div>
    <h2>${SESS[key].name}</h2>
    <ol>${entries.map(e => `<li>${esc(exOf(e.ex).name)}</li>`).join('')}</ol>
    <button class="btn" data-action="start" data-key="${key}">Commencer</button>
  </div>`;
  h += `<div class="sec">Faire une autre séance</div><div class="chips">` +
    CYCLE.filter(k => k !== key).map(k => `<button class="chip ${SESS[k].side}" data-action="start" data-key="${k}"><i class="dot"></i>${SESS[k].name}</button>`).join('') + `</div>`;
  if (lastS) {
    const week = state.sessions.filter(s => daysAgo(s.date) < 7).length;
    h += `<div class="sec">Résumé</div><div class="stats">
      <div class="stat"><b>${ago(lastS.date)}</b><span>Dernière séance · ${SESS[lastS.key] ? SESS[lastS.key].name : ''}</span></div>
      <div class="stat"><b>${week}</b><span>séance${week > 1 ? 's' : ''} sur 7 jours</span></div>
      <div class="stat"><b>${state.sessions.length}</b><span>au total</span></div></div>`;
    const since = state.lastBackup ? daysAgo(state.lastBackup) : null;
    if ((since == null && state.sessions.length >= 5) || since > 30) {
      h += `<button class="li" data-action="openSettings"><div class="grow"><div class="t">Pense à sauvegarder tes données</div>
        <div class="small mut">${since == null ? 'Aucune sauvegarde pour l\'instant' : 'Dernière sauvegarde ' + ago(state.lastBackup)}</div></div><span class="chev">›</span></button>`;
    }
  } else {
    h += `<div class="empty">Aucune séance enregistrée pour l'instant.<br>Lance ta première séance quand tu es à la salle.</div>`;
  }
  return h;
}

/* --- Séance en cours --- */
function viewSession() {
  const cur = state.current;
  let total = 0, done = 0;
  cur.items.forEach(it => it.sets.forEach(s => { total++; if (s.done) done++; }));
  let h = `<div class="row small mut" style="margin:0 4px 6px"><span class="grow">${done} / ${total} séries</span></div>
    <div class="progress" id="prog"><i style="width:${total ? Math.round(done / total * 100) : 0}%"></i></div>`;
  h += cur.items.map((_, i) => cardHTML(i)).join('');
  h += `<button class="btn ghost sm" data-action="addToday">+ Ajouter un exercice</button>
    <div style="height:14px"></div>
    <button class="btn" data-action="finish">Terminer la séance</button>
    <button class="link" data-action="abandon">Abandonner la séance</button>`;
  return h;
}
function cardHTML(i) {
  const it = state.current.items[i], ex = exOf(it.ex), type = ex.type;
  const last = lastPerf(it.ex), rec = records(it.ex);
  const counts = { w: 0, n: 0 };
  const rows = it.sets.map((s, si) => {
    const idx = s.w ? counts.w++ : counts.n++;
    const ph = placeholderFor(last, s.w, idx) || {};
    const pr = isPR(it.ex, type, s, rec);
    const inp = (f, mode, unit) => `<label class="fld"><input type="text" inputmode="${mode}" autocomplete="off" enterkeyhint="done" data-i="${i}" data-s="${si}" data-f="${f}" value="${esc(s[f] == null ? '' : s[f])}" placeholder="${ph[f] != null ? esc(fmt(ph[f])) : '–'}"><span>${unit}</span></label>`;
    let fields;
    if (type === 'duree') fields = inp('sec', 'numeric', 'sec');
    else if (type === 'reps') fields = inp('reps', 'numeric', 'reps');
    else fields = inp('kg', 'decimal', 'kg') + '<span class="x">×</span>' + inp('reps', 'numeric', 'reps');
    return `<div class="set ${s.w ? 'warm' : ''} ${s.done ? 'done' : ''} ${pr ? 'isPr' : ''}">
      <span class="lab">${pr ? '★' : s.w ? 'É' : idx + 1}</span>${fields}
      <button class="chk" data-action="check" data-i="${i}" data-s="${si}" aria-label="Valider la série"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></button>
    </div>`;
  }).join('');
  const lastTxt = last
    ? `Dernière fois (${ago(last.date)}) : <b style="color:var(--txt)">${last.sets.filter(s => !s.w).map(fmtSet).join(' · ') || '—'}</b>`
    : 'Première fois sur cet exo';
  const allDone = it.sets.length && it.sets.every(s => s.done);
  return `<div class="card ex ${allDone ? 'alldone' : ''}" id="card-${i}">
    <div class="row"><h3 class="grow">${esc(ex.name)}${ex.uni ? '<span class="tag">par côté</span>' : ''}</h3>
      <button class="iconbtn" data-action="itemMenu" data-i="${i}" aria-label="Options" style="background:var(--card2)"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button></div>
    <div class="last">${lastTxt}</div>${rows}</div>`;
}
function refreshCard(i) {
  const el = document.getElementById('card-' + i);
  if (el) el.outerHTML = cardHTML(i);
  let total = 0, done = 0;
  state.current.items.forEach(it => it.sets.forEach(s => { total++; if (s.done) done++; }));
  const p = $('#prog'); if (p) { p.firstElementChild.style.width = (total ? Math.round(done / total * 100) : 0) + '%'; p.previousElementSibling.firstElementChild.textContent = `${done} / ${total} séries`; }
}
function buildSets(entry) {
  const sets = [];
  if (entry.warmup) sets.push({ w: true, done: false });
  for (let k = 0; k < entry.sets; k++) sets.push({ w: false, done: false });
  return sets;
}

/* --- Progrès --- */
function recordLine(exId, rec) {
  const type = exOf(exId).type;
  if (type === 'charge') return `Record ${fmtSet(rec.bestKg.set)} · max estimé ${fmt(Math.round(rec.best.v * 10) / 10)} kg`;
  return `Record ${fmtSet(rec.best.set)}`;
}
function viewProgress() {
  const ids = Object.keys(state.exercises);
  const withData = [], inProgram = new Set();
  CYCLE.forEach(k => state.program[k].forEach(e => inProgram.add(e.ex)));
  ids.forEach(id => { const r = records(id); if (r) withData.push({ id, r }); });
  withData.sort((a, b) => (a.r.last.date < b.r.last.date ? 1 : a.r.last.date > b.r.last.date ? -1 : exOf(a.id).name.localeCompare(exOf(b.id).name)));
  if (!withData.length) return `<div class="empty">Tes records et tes graphiques apparaîtront ici après ta première séance.</div>`;
  return `<div class="sec">Records par exercice</div>` + withData.map(({ id, r }) =>
    `<button class="li" data-action="exDetail" data-id="${esc(id)}"><div class="grow"><div class="t">${esc(exOf(id).name)}</div>
      <div class="small mut">${recordLine(id, r)}</div></div><span class="chev">›</span></button>`).join('');
}
function viewExDetail() {
  const id = ui.exDetail, ex = exOf(id), rec = records(id);
  let h = `<button class="chip" data-action="exBack" style="margin-bottom:12px">‹ Retour</button>
    <h2 style="font-size:22px;margin:0 4px 12px">${esc(ex.name)}${ex.uni ? '<span class="tag">par côté</span>' : ''}</h2>`;
  if (!rec) return h + `<div class="empty">Pas encore de données sur cet exercice.</div>`;
  if (ex.type === 'charge') {
    h += `<div class="stats"><div class="stat"><b>${fmtSet(rec.bestKg.set)}</b><span>Charge record · ${fmtDate(rec.bestKg.date)}</span></div>
      <div class="stat"><b>${fmt(Math.round(rec.best.v * 10) / 10)} kg</b><span>Max estimé · ${fmtDate(rec.best.date)}</span></div></div>
      <div class="chips" style="margin-bottom:10px">
        <button class="chip ${ui.metric === 'e1' ? 'on' : ''}" data-action="metric" data-m="e1">Max estimé</button>
        <button class="chip ${ui.metric === 'kg' ? 'on' : ''}" data-action="metric" data-m="kg">Charge max</button></div>`;
  } else {
    h += `<div class="stats"><div class="stat"><b>${fmtSet(rec.best.set)}</b><span>Record · ${fmtDate(rec.best.date)}</span></div>
      <div class="stat"><b>${rec.n}</b><span>séance${rec.n > 1 ? 's' : ''}</span></div></div>`;
  }
  const metric = ex.type === 'charge' ? ui.metric : 'x';
  const unit = ex.type === 'charge' ? 'kg' : ex.type === 'duree' ? 's' : 'reps';
  h += `<div class="card">${chartSVG(series(id, metric), unit)}</div>`;
  if (ex.type === 'charge') h += `<p class="tiny mut" style="margin:-4px 4px 10px">Le max estimé combine charge et reps (formule d'Epley) pour comparer deux séances même si le nombre de reps change.</p>`;
  h += `<div class="sec">Historique</div><div class="card" style="padding-top:4px">`;
  const rows = [];
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    const se = state.sessions[i];
    se.items.filter(it => it.ex === id).forEach(it => rows.push(`<div class="hist"><span class="d">${fmtDate(se.date)}</span><span>${it.sets.map(s => (s.w ? '<span class="mut">É ' + fmtSet(s) + '</span>' : fmtSet(s))).join(' · ')}</span></div>`));
  }
  return h + rows.join('').replace('class="hist"', 'class="hist" style="border-top:0"') + `</div>`;
}
function chartSVG(pts, unit) {
  if (!pts.length) return '<div class="empty">Pas de données</div>';
  const W = 340, H = 180, L = 40, R = 14, T = 22, B = 26;
  let min = Math.min(...pts.map(p => p.v)), max = Math.max(...pts.map(p => p.v));
  if (min === max) { min -= 1; max += 1; }
  const padv = (max - min) * 0.12; min -= padv; max += padv;
  const x = i => pts.length === 1 ? (L + W - R) / 2 : L + (W - L - R) * i / (pts.length - 1);
  const y = v => T + (H - T - B) * (1 - (v - min) / (max - min));
  let g = '';
  for (let k = 0; k <= 2; k++) {
    const v = min + (max - min) * k / 2, yy = y(v);
    g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="#2b2f38" stroke-width="1"/><text x="${L - 6}" y="${yy + 4}" text-anchor="end" font-size="11" fill="#9aa0aa">${fmt(Math.round(v))}</text>`;
  }
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const dots = pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="${i === pts.length - 1 ? 5 : 3.5}" fill="${i === pts.length - 1 ? '#ff9142' : '#17191e'}" stroke="#ff9142" stroke-width="2"/>`).join('');
  const lastP = pts[pts.length - 1], lx = Math.min(x(pts.length - 1), W - R - 4);
  const labels = `<text x="${L}" y="${H - 6}" font-size="11" fill="#9aa0aa">${fmtDate(pts[0].date)}</text>` +
    (pts.length > 1 ? `<text x="${W - R}" y="${H - 6}" text-anchor="end" font-size="11" fill="#9aa0aa">${fmtDate(lastP.date)}</text>` : '') +
    `<text x="${lx}" y="${Math.max(12, y(lastP.v) - 10)}" text-anchor="end" font-size="13" font-weight="700" fill="#f2f3f5">${fmt(Math.round(lastP.v * 10) / 10)} ${unit}</text>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Graphique de progression">${g}${pts.length > 1 ? `<polyline points="${line}" fill="none" stroke="#ff9142" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>` : ''}${dots}${labels}</svg>`;
}

/* --- Calendrier --- */
function viewCalendar() {
  const [y, m] = ui.cal;
  const first = new Date(y, m, 1), offset = (first.getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
  const by = {};
  state.sessions.forEach(s => (by[s.date] = by[s.date] || []).push(s));
  const prefix = `${y}-${pad(m + 1)}-`, td = today();
  let cells = ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => `<div class="wd">${d}</div>`).join('') + '<div></div>'.repeat(offset);
  let count = 0;
  for (let d = 1; d <= days; d++) {
    const date = prefix + pad(d), ss = by[date] || [];
    const a = ss.some(s => SESS[s.key] && SESS[s.key].side === 'ant'), p = ss.some(s => !SESS[s.key] || SESS[s.key].side === 'post');
    count += ss.length;
    const cls = (a && p ? 'ap' : a ? 'a' : p ? 'p' : '') + (date === td ? ' today' : '');
    cells += ss.length ? `<button class="day ${cls}" data-action="day" data-date="${date}">${d}</button>` : `<div class="day ${cls}">${d}</div>`;
  }
  const monthSessions = state.sessions.filter(s => s.date.startsWith(prefix)).reverse();
  return `<div class="card"><div class="calhead">
      <button class="iconbtn" data-action="calMove" data-d="-1" aria-label="Mois précédent" style="background:var(--card2)">‹</button>
      <h2>${first.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</h2>
      <button class="iconbtn" data-action="calMove" data-d="1" aria-label="Mois suivant" style="background:var(--card2)">›</button></div>
    <div class="grid">${cells}</div>
    <div class="legend"><span><i class="dot" style="background:var(--ant)"></i>Antérieur</span><span><i class="dot" style="background:var(--post)"></i>Postérieur</span></div></div>
    <div class="sec">${count} séance${count > 1 ? 's' : ''} ce mois-ci</div>` +
    monthSessions.map(s => `<button class="li ${SESS[s.key] ? SESS[s.key].side : ''}" data-action="day" data-date="${s.date}"><i class="dot"></i><div class="grow"><div class="t">${SESS[s.key] ? SESS[s.key].name : 'Séance'}</div><div class="small mut">${fmtDateLong(s.date)}</div></div><span class="chev">›</span></button>`).join('');
}
function daySheet(date) {
  const ss = state.sessions.filter(s => s.date === date);
  if (!ss.length) return closeSheet();
  openSheet(`<div class="small mut" style="text-transform:capitalize">${fmtDateLong(date)}</div>` + ss.map(s => {
    const mins = s.start && s.end ? Math.round((s.end - s.start) / 60000) : null;
    return `<div class="${SESS[s.key] ? SESS[s.key].side : ''}"><h2 style="color:var(--acc);margin-top:6px">${SESS[s.key] ? SESS[s.key].name : 'Séance'}${mins ? `<span class="tag">${mins >= 60 ? Math.floor(mins / 60) + ' h ' + pad(mins % 60) : mins + ' min'}</span>` : ''}</h2>` +
      s.items.map(it => `<div class="hist" style="display:block"><div style="font-weight:600">${esc(exOf(it.ex).name)}</div><div class="small mut">${it.sets.map(x => (x.w ? 'É ' : '') + fmtSet(x)).join(' · ')}</div></div>`).join('') +
      `<button class="btn danger sm" data-action="delSession" data-id="${esc(s.id)}">Supprimer cette séance</button></div>`;
  }).join('<div style="height:10px"></div>') + `<button class="btn ghost sm" data-action="closeSheet">Fermer</button>`);
}

/* --- Programme --- */
function viewProgram() {
  const key = ui.progKey, list = state.program[key];
  let h = `<div class="chips" style="margin-bottom:14px">` + CYCLE.map(k => `<button class="chip ${SESS[k].side} ${k === key ? 'on' : ''}" data-action="progKey" data-key="${k}">${SESS[k].name.replace('Antérieur', 'Ant.').replace('Postérieur', 'Post.')}</button>`).join('') + `</div>`;
  h += list.map((e, idx) => {
    const ex = exOf(e.ex);
    return `<div class="li ${e.paused ? 'paused' : ''}" style="padding:10px 10px 10px 14px">
      <button class="grow" data-action="entry" data-idx="${idx}" style="text-align:left"><div class="t">${esc(ex.name)}</div>
        <div class="small mut">${e.paused ? 'En pause' : `${e.sets} série${e.sets > 1 ? 's' : ''}${e.warmup ? ' + échauffement' : ''}${ex.uni ? ' · par côté' : ''}`}</div></button>
      <div class="mv"><button data-action="move" data-idx="${idx}" data-d="-1" ${idx === 0 ? 'disabled' : ''} aria-label="Monter"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg></button>
        <button data-action="move" data-idx="${idx}" data-d="1" ${idx === list.length - 1 ? 'disabled' : ''} aria-label="Descendre"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button></div></div>`;
  }).join('');
  h += `<button class="btn ghost sm" data-action="addProg">+ Ajouter un exercice</button>
    <p class="tiny mut" style="margin:14px 4px">Touche un exercice pour changer ses séries, le remplacer, le mettre en pause ou le supprimer. Les changements s'appliquent à partir de la prochaine séance.</p>`;
  return h;
}
function entrySheet() {
  const { key, idx } = ui.entry, e = state.program[key][idx];
  if (!e) return closeSheet();
  const ex = exOf(e.ex);
  openSheet(`<h2>${esc(ex.name)}</h2><div class="small mut">${SESS[key].name} · ${TYPES[ex.type]}${ex.uni ? ' · par côté' : ''}</div>
    <div class="field"><span>Séries de travail</span><div class="stepper"><button data-action="entrySets" data-d="-1">−</button><b>${e.sets}</b><button data-action="entrySets" data-d="1">+</button></div></div>
    <button class="toggle ${e.warmup ? 'on' : ''}" data-action="entryToggle" data-f="warmup">Série d'échauffement<i></i></button>
    <button class="toggle ${e.paused ? 'on' : ''}" data-action="entryToggle" data-f="paused">En pause (sauté pour l'instant)<i></i></button>
    <button class="btn ghost sm" data-action="entrySwap">Remplacer par un autre exercice</button>
    <button class="btn ghost sm" data-action="editEx" data-id="${esc(e.ex)}">Modifier le nom ou le type</button>
    <button class="btn danger sm" data-action="entryDelete">Supprimer de cette séance</button>
    <button class="btn sm" data-action="closeSheet">OK</button>`);
}

/* --- Choix / création d'exercice --- */
function pickerSheet() {
  const ids = Object.keys(state.exercises).sort((a, b) => exOf(a).name.localeCompare(exOf(b).name, 'fr'));
  openSheet(`<h2>Choisir un exercice</h2>
    <button class="btn sm" data-action="newEx">+ Créer un nouvel exercice</button><div style="height:12px"></div>` +
    ids.map(id => `<button class="li" data-action="pick" data-id="${esc(id)}"><div class="grow"><div class="t">${esc(exOf(id).name)}</div></div>${exOf(id).uni ? '<span class="tag">par côté</span>' : ''}</button>`).join(''));
}
function formSheet() {
  const f = ui.form;
  openSheet(`<h2>${f.id ? 'Modifier l\'exercice' : 'Nouvel exercice'}</h2>
    <label class="field"><span>Nom</span><input type="text" id="exName" value="${esc(f.name)}" placeholder="Ex : Hack squat" autocomplete="off"></label>
    <div class="field"><span>Ce que tu notes</span><div class="chips">` +
    Object.keys(TYPES).map(t => `<button class="chip ${f.type === t ? 'on' : ''}" data-action="formType" data-t="${t}">${TYPES[t]}</button>`).join('') + `</div></div>
    <button class="toggle ${f.uni ? 'on' : ''}" data-action="formUni">Exercice unilatéral (par côté)<i></i></button>
    <button class="btn" data-action="formSave">Enregistrer</button>
    <button class="btn ghost sm" data-action="closeSheet">Annuler</button>`);
}
function applyPick(id) {
  const p = ui.pick; ui.pick = null;
  if (!p) return closeSheet();
  if (p.mode === 'swapToday') {
    const it = state.current.items[p.i];
    it.ex = id; it.sets.forEach(s => { s.done = false; delete s.kg; delete s.reps; delete s.sec; });
  } else if (p.mode === 'addToday') {
    state.current.items.push({ ex: id, sets: buildSets({ sets: 2, warmup: false }) });
  } else if (p.mode === 'swapProg') {
    state.program[p.key][p.idx].ex = id;
  } else if (p.mode === 'addProg') {
    state.program[p.key].push({ ex: id, sets: 2, warmup: false, paused: false });
  }
  save(); closeSheet(); render();
}

/* --- Sauvegarde --- */
function settingsSheet() {
  openSheet(`<h2>Sauvegarde</h2>
    <p class="small mut">Tes données sont stockées uniquement sur ce téléphone. Fais une sauvegarde de temps en temps : si l'app est supprimée ou si tu changes de téléphone, tu pourras tout récupérer.</p>
    <div class="stats" style="margin-top:12px"><div class="stat"><b>${state.sessions.length}</b><span>séance${state.sessions.length > 1 ? 's' : ''} enregistrée${state.sessions.length > 1 ? 's' : ''}</span></div>
      <div class="stat"><b>${state.lastBackup ? ago(state.lastBackup) : 'jamais'}</b><span>Dernière sauvegarde</span></div></div>
    <button class="btn" data-action="backup">Sauvegarder mes données</button>
    <button class="btn ghost" data-action="restore">Restaurer une sauvegarde</button>
    <button class="btn ghost sm" data-action="closeSheet">Fermer</button>`);
}
async function backup() {
  const name = `suivi-muscu-${today()}.json`;
  const json = JSON.stringify(Object.assign({}, state, { current: null, exportedAt: new Date().toISOString() }), null, 1);
  const done = () => { state.lastBackup = today(); save(); closeSheet(); render(); toast('Sauvegarde créée'); };
  for (const type of ['application/json', 'text/plain']) {
    try {
      const file = new File([json], name, { type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Sauvegarde Suivi Muscu' });
        return done();
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return; // partage annulé
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  done();
}
function restoreFile(file) {
  const r = new FileReader();
  r.onload = () => {
    let data;
    try { data = JSON.parse(r.result); } catch (e) { data = null; }
    if (!validState(data)) return toast('Ce fichier n\'est pas une sauvegarde valide');
    askConfirm(`Remplacer les données actuelles par cette sauvegarde (${data.sessions.length} séance${data.sessions.length > 1 ? 's' : ''}) ?`, 'Restaurer', () => {
      delete data.exportedAt; data.current = null;
      if (typeof data.nextIndex !== 'number') data.nextIndex = 0;
      state = data; save(); render(); toast('Données restaurées');
    });
  };
  r.readAsText(file);
}

/* ---------- Feuille, confirmation, toast ---------- */
function openSheet(html) { $('#sheetBody').innerHTML = html; $('#sheet').classList.add('on'); }
function closeSheet() { $('#sheet').classList.remove('on'); $('#sheetBody').innerHTML = ''; ui.confirm = null; }
function askConfirm(msg, yes, cb, danger) {
  ui.confirm = cb;
  openSheet(`<h2>Confirmer</h2><p class="mut" style="margin:6px 0 8px">${esc(msg)}</p>
    <button class="btn ${danger ? 'danger' : ''}" data-action="confirmYes">${esc(yes)}</button>
    <button class="btn ghost sm" data-action="closeSheet">Annuler</button>`);
}
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2400); }

/* ---------- Actions ---------- */
const actions = {
  tab(el) { ui.tab = el.dataset.tab; if (ui.tab !== 'progres') ui.exDetail = null; render(); window.scrollTo(0, 0); },
  closeSheet() { closeSheet(); },
  confirmYes() { const cb = ui.confirm; closeSheet(); if (cb) cb(); },
  openSettings() { settingsSheet(); },
  backup() { backup(); },
  restore() { $('#file').value = ''; $('#file').click(); },

  start(el) {
    const key = el.dataset.key;
    const items = state.program[key].filter(e => !e.paused).map(e => ({ ex: e.ex, sets: buildSets(e) }));
    if (!items.length) return toast('Cette séance ne contient aucun exercice');
    state.current = { key, date: today(), start: Date.now(), items };
    save(); render(); window.scrollTo(0, 0);
  },
  check(el) {
    const i = +el.dataset.i, si = +el.dataset.s, it = state.current.items[i], s = it.sets[si], type = exOf(it.ex).type;
    if (s.done) { s.done = false; save(); return refreshCard(i); }
    // champs vides : on reprend les valeurs de la dernière fois (celles affichées en gris)
    const idx = it.sets.slice(0, si).filter(x => !!x.w === !!s.w).length;
    const ph = placeholderFor(lastPerf(it.ex), s.w, idx) || {};
    ['kg', 'reps', 'sec'].forEach(f => { if ((s[f] == null || s[f] === '') && ph[f] != null) s[f] = String(ph[f]).replace('.', ','); });
    if (!setValue(type, s)) { save(); refreshCard(i); return toast(type === 'charge' ? 'Indique la charge et les reps' : type === 'reps' ? 'Indique le nombre de reps' : 'Indique la durée'); }
    s.done = true; save();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    refreshCard(i);
    if (isPR(it.ex, type, s, records(it.ex))) toast('★ Nouveau record !');
  },
  itemMenu(el) {
    const i = +el.dataset.i, it = state.current.items[i], hasW = it.sets.some(s => s.w);
    openSheet(`<h2>${esc(exOf(it.ex).name)}</h2><div class="small mut">Pour la séance d'aujourd'hui uniquement</div>
      <button class="btn ghost sm" data-action="itemAddSet" data-i="${i}">+ Ajouter une série</button>
      <button class="btn ghost sm" data-action="itemDelSet" data-i="${i}">− Retirer la dernière série</button>
      <button class="btn ghost sm" data-action="itemWarm" data-i="${i}">${hasW ? 'Retirer l\'échauffement' : 'Ajouter un échauffement'}</button>
      <button class="btn ghost sm" data-action="itemSwap" data-i="${i}">Remplacer par un autre exercice</button>
      <button class="btn danger sm" data-action="itemRemove" data-i="${i}">Retirer de la séance</button>
      <button class="btn sm" data-action="closeSheet">Fermer</button>`);
  },
  itemAddSet(el) { state.current.items[+el.dataset.i].sets.push({ w: false, done: false }); save(); closeSheet(); render(); },
  itemDelSet(el) { const it = state.current.items[+el.dataset.i]; if (it.sets.length > 1) it.sets.pop(); save(); closeSheet(); render(); },
  itemWarm(el) {
    const it = state.current.items[+el.dataset.i];
    if (it.sets.some(s => s.w)) it.sets = it.sets.filter(s => !s.w); else it.sets.unshift({ w: true, done: false });
    save(); closeSheet(); render();
  },
  itemSwap(el) { ui.pick = { mode: 'swapToday', i: +el.dataset.i }; pickerSheet(); },
  itemRemove(el) { state.current.items.splice(+el.dataset.i, 1); save(); closeSheet(); render(); },
  addToday() { ui.pick = { mode: 'addToday' }; pickerSheet(); },
  finish() {
    const cur = state.current, items = [];
    let prs = 0;
    cur.items.forEach(it => {
      const type = exOf(it.ex).type, rec = records(it.ex), sets = [];
      it.sets.forEach(s => {
        const v = setValue(type, s);
        if (!v) return;
        if (isPR(it.ex, type, Object.assign({}, s, { done: true }), rec)) prs++;
        if (s.w) v.w = true;
        sets.push(v);
      });
      if (sets.length) items.push({ ex: it.ex, sets });
    });
    if (!items.length) return toast('Aucune série remplie pour l\'instant');
    const missing = cur.items.reduce((n, it) => n + it.sets.filter(s => !setValue(exOf(it.ex).type, s)).length, 0);
    const go = () => {
      state.sessions.push({ id: uid(), key: cur.key, date: cur.date, start: cur.start, end: Date.now(), items });
      state.sessions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.end || 0) - (b.end || 0)));
      state.nextIndex = (CYCLE.indexOf(cur.key) + 1) % CYCLE.length;
      state.current = null; save(); render(); window.scrollTo(0, 0);
      toast(prs ? `Séance enregistrée · ${prs} record${prs > 1 ? 's' : ''} ★` : 'Séance enregistrée');
    };
    if (missing) askConfirm(`${missing} série${missing > 1 ? 's ne sont pas remplies' : ' n\'est pas remplie'}. Terminer quand même ?`, 'Terminer la séance', go); else go();
  },
  abandon() { askConfirm('Abandonner cette séance ? Les séries saisies ne seront pas enregistrées.', 'Abandonner', () => { state.current = null; save(); render(); }, true); },

  exDetail(el) { ui.exDetail = el.dataset.id; render(); window.scrollTo(0, 0); },
  exBack() { ui.exDetail = null; render(); },
  metric(el) { ui.metric = el.dataset.m; render(); },

  calMove(el) { let [y, m] = ui.cal; m += +el.dataset.d; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } ui.cal = [y, m]; render(); },
  day(el) { daySheet(el.dataset.date); },
  delSession(el) {
    const id = el.dataset.id;
    askConfirm('Supprimer définitivement cette séance ?', 'Supprimer', () => { state.sessions = state.sessions.filter(s => s.id !== id); save(); render(); toast('Séance supprimée'); }, true);
  },

  progKey(el) { ui.progKey = el.dataset.key; render(); },
  move(el) {
    const list = state.program[ui.progKey], i = +el.dataset.idx, j = i + (+el.dataset.d);
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]]; save(); render();
  },
  entry(el) { ui.entry = { key: ui.progKey, idx: +el.dataset.idx }; entrySheet(); },
  entrySets(el) { const e = state.program[ui.entry.key][ui.entry.idx]; e.sets = Math.max(1, Math.min(8, e.sets + (+el.dataset.d))); save(); render(); entrySheet(); },
  entryToggle(el) { const e = state.program[ui.entry.key][ui.entry.idx]; e[el.dataset.f] = !e[el.dataset.f]; save(); render(); entrySheet(); },
  entrySwap() { ui.pick = { mode: 'swapProg', key: ui.entry.key, idx: ui.entry.idx }; pickerSheet(); },
  entryDelete() {
    const { key, idx } = ui.entry;
    askConfirm(`Supprimer « ${exOf(state.program[key][idx].ex).name} » de ${SESS[key].name} ? Ton historique sur cet exercice est conservé.`, 'Supprimer', () => { state.program[key].splice(idx, 1); save(); render(); }, true);
  },
  addProg() { ui.pick = { mode: 'addProg', key: ui.progKey }; pickerSheet(); },
  pick(el) { applyPick(el.dataset.id); },
  newEx() { ui.form = { id: null, name: '', type: 'charge', uni: false }; formSheet(); },
  editEx(el) { const ex = exOf(el.dataset.id); ui.form = { id: el.dataset.id, name: ex.name, type: ex.type, uni: !!ex.uni }; formSheet(); },
  formType(el) { ui.form.name = $('#exName').value; ui.form.type = el.dataset.t; formSheet(); },
  formUni() { ui.form.name = $('#exName').value; ui.form.uni = !ui.form.uni; formSheet(); },
  formSave() {
    const f = ui.form, name = $('#exName').value.trim();
    if (!name) return toast('Donne un nom à l\'exercice');
    if (f.id) {
      Object.assign(state.exercises[f.id], { name, type: f.type, uni: f.uni });
      ui.form = null; save(); render();
      if (ui.entry && ui.tab === 'programme') entrySheet(); else closeSheet();
    } else {
      const id = 'x' + uid();
      state.exercises[id] = { name, type: f.type, uni: f.uni };
      ui.form = null; save();
      if (ui.pick) applyPick(id); else { closeSheet(); render(); }
    }
  },
};

document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  if (fn) fn(el);
});
document.addEventListener('input', ev => {
  const el = ev.target;
  if (!el.dataset || el.dataset.f == null || !state.current) return;
  const it = state.current.items[+el.dataset.i];
  if (!it) return;
  it.sets[+el.dataset.s][el.dataset.f] = el.value;
  save();
});
document.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.tagName === 'INPUT') ev.target.blur(); });
$('#file').addEventListener('change', ev => { const f = ev.target.files[0]; if (f) restoreFile(f); });

render();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
