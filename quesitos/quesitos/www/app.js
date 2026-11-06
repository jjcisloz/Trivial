'use strict';
/* Quesitos: el trivial clásico para móvil. Todo funciona sin conexión y guarda los datos en el propio móvil. */

/* ───────────── Constantes ───────────── */
const CATS = [
  { name: 'Geografía',             color: '#2D7BE5', ink: '#FFFFFF' },
  { name: 'Espectáculos',          color: '#E2478F', ink: '#FFFFFF' },
  { name: 'Historia',              color: '#F2C12E', ink: '#2B2200' },
  { name: 'Arte y Literatura',     color: '#8C5A2E', ink: '#FFFFFF' },
  { name: 'Ciencias y Naturaleza', color: '#26A65B', ink: '#FFFFFF' },
  { name: 'Deportes y Ocio',       color: '#F07A1A', ink: '#FFFFFF' },
];
const PLAYER_COLORS = ['#FFFFFF', '#FF5D5D', '#4FE3E8', '#B48CFF', '#D8F36A', '#A8B3D6'];
const EMOJIS = ['🦊','🐼','🐸','🦉','🐙','🦁','🐯','🐨','🐵','🦄','🐢','🐧','🐝','🦖','🐳','🍕','🚀','⚽','🎸','👽'];
const GUEST_EMOJIS = ['🙂','😎','🤓','🥳','😺','🐶'];
const CPU_NAMES = ['Cerebrín', 'Robotina', 'Profe Bit', 'Chispa', 'Byte', 'Doña Lógica'];
const CPU_EMOJIS = ['🤖', '👾', '🧠', '⚙️', '🛸', '💾'];
const LEVELS = {
  facil:      { name: 'Fácil',      p: 0.42, elo: 850,  desc: 'Acierta unas 4 de cada 10' },
  normal:     { name: 'Normal',     p: 0.60, elo: 1050, desc: 'Acierta unas 6 de cada 10' },
  dificil:    { name: 'Difícil',    p: 0.77, elo: 1250, desc: 'Acierta casi 8 de cada 10' },
  experto:    { name: 'Experto',    p: 0.90, elo: 1450, desc: 'Acierta 9 de cada 10' },
  adaptativo: { name: 'Adaptativo', p: null, elo: null, desc: '' },
};
const MODES = { solo: 'Solitario', normal: 'Partida normal', larga: 'Partida larga' };
const ROLL_TIME = 30;

/* ───────────── Utilidades ───────────── */
const $ = (s, r = document) => r.querySelector(s);
const app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rnd = n => Math.floor(Math.random() * n);
const pick = a => a[rnd(a.length)];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const f1 = n => n.toFixed(1);

const Store = {
  get(k, def) { try { const v = localStorage.getItem('quesitos.' + k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem('quesitos.' + k, JSON.stringify(v)); } catch (e) { /* almacenamiento lleno o bloqueado */ } },
  del(k) { try { localStorage.removeItem('quesitos.' + k); } catch (e) { /* nada */ } },
};

let settings = Object.assign({ sound: true, vibrate: true, answerMode: 'options', answerTime: 0 }, Store.get('settings', {}));
let profiles = Store.get('profiles', []);
let activeId = Store.get('active', null);
const saveSettings = () => Store.set('settings', settings);
const saveProfiles = () => Store.set('profiles', profiles);
const activeProfile = () => profiles.find(p => p.id === activeId) || null;
const getProfile = id => profiles.find(p => p.id === id) || null;
function setActive(id) { activeId = id; Store.set('active', id); }

/* ───────────── Banco de preguntas ───────────── */
let BANK = [], BY_CAT = [], BY_ID = {};
function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return 'q' + (h >>> 0).toString(36); }
function buildBank() {
  const base = (window.PREGUNTAS_BASE || []).map(r => ({ c: r[0], d: r[1], q: r[2], a: r[3], w: r.slice(4, 7) }));
  const custom = Store.get('custom', []);
  BANK = []; BY_ID = {}; BY_CAT = CATS.map(() => []);
  for (const q of [...base, ...custom]) {
    q.id = q.id || hash(q.q + '|' + q.a);
    if (BY_ID[q.id] || !BY_CAT[q.c]) continue;
    BY_ID[q.id] = q; BANK.push(q); BY_CAT[q.c].push(q);
  }
}
function normCat(v) {
  if (typeof v === 'number') return v >= 0 && v < 6 ? Math.floor(v) : -1;
  const s = String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/^[0-5]$/.test(s.trim())) return +s.trim();
  if (/geogra/.test(s)) return 0;
  if (/espect|entreten|cine|music|tele|tv|serie/.test(s)) return 1;
  if (/histor/.test(s)) return 2;
  if (/arte|literat|libro/.test(s)) return 3;
  if (/cienc|natural/.test(s)) return 4;
  if (/deport|ocio|juego/.test(s)) return 5;
  return -1;
}
function importPack(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { return { ok: false, msg: 'El texto no es un JSON válido. Revisa comas y comillas.' }; }
  if (data && !Array.isArray(data)) data = data.preguntas || data.questions;
  if (!Array.isArray(data)) return { ok: false, msg: 'El JSON tiene que ser una lista de preguntas.' };
  const custom = Store.get('custom', []);
  const ids = new Set(BANK.map(q => q.id));
  let added = 0, bad = 0;
  for (const it of data) {
    if (!it || typeof it !== 'object') { bad++; continue; }
    const c = normCat(it.categoria ?? it.c);
    const q = String(it.pregunta ?? it.q ?? '').trim();
    const a = String(it.respuesta ?? it.a ?? '').trim();
    const w = (Array.isArray(it.incorrectas ?? it.w) ? (it.incorrectas ?? it.w) : []).map(x => String(x).trim()).filter(Boolean);
    let d = Math.round(+(it.dificultad ?? it.d ?? 2)); if (!(d >= 1 && d <= 3)) d = 2;
    if (c < 0 || !q || !a || w.length < 3) { bad++; continue; }
    const obj = { c, d, q, a, w: w.slice(0, 3), custom: true };
    obj.id = hash(q + '|' + a);
    if (ids.has(obj.id)) continue;
    ids.add(obj.id); custom.push(obj); added++;
  }
  Store.set('custom', custom); buildBank();
  return { ok: true, added, bad };
}

/* ───────────── Perfiles y estadísticas ───────────── */
function newProfile(name, emoji) {
  return {
    id: 'p' + Date.now().toString(36) + rnd(1e4), name, emoji, created: Date.now(),
    cat: CATS.map(() => ({ n: 0, ok: 0 })), diff: { 1: { n: 0, ok: 0 }, 2: { n: 0, ok: 0 }, 3: { n: 0, ok: 0 } },
    games: 0, wins: 0, solo: { games: 0, wins: 0 }, rating: 1000, bias: 0, streak: 0, bestStreak: 0, mem: {},
  };
}
function resetProfileStats(p) { const f = newProfile(p.name, p.emoji); Object.assign(p, f, { id: p.id, name: p.name, emoji: p.emoji, created: p.created }); }
// Acierto estimado por categoría, con un punto de partida neutro para no fiarse de 2 preguntas
function catAcc(p, c) { if (!p) return 0.55; const s = p.cat[c]; return (s.ok + 2.2) / (s.n + 4); }
function totals(p) { let n = 0, ok = 0; p.cat.forEach(s => { n += s.n; ok += s.ok; }); return { n, ok }; }
const targetDiff = acc => (acc < 0.45 ? 1 : acc < 0.7 ? 2 : 3);
function weakestCats(p) { return CATS.map((_, i) => i).sort((a, b) => catAcc(p, a) - catAcc(p, b)); }
function masteredCount(p, cat = null) {
  let m = 0, t = 0;
  for (const q of BANK) { if (cat != null && q.c !== cat) continue; t++; if ((p.mem[q.id]?.box || 0) >= 3) m++; }
  return [m, t];
}
function titleFor(r) { return r < 900 ? 'Novato' : r < 1050 ? 'Aficionado' : r < 1200 ? 'Sabelotodo' : r < 1380 ? 'Erudito' : 'Maestro quesero'; }
function recommendedLevel(p) { const r = p.rating; return r < 950 ? 'facil' : r < 1120 ? 'normal' : r < 1300 ? 'dificil' : 'experto'; }
function adaptiveRate(p) { let s = 0; for (let c = 0; c < 6; c++) s += clamp(catAcc(p, c) + (p?.bias || 0), 0.25, 0.95); return s / 6; }
function record(p, q, ok) {
  const c = p.cat[q.c]; c.n++; if (ok) c.ok++;
  const d = p.diff[q.d] || (p.diff[q.d] = { n: 0, ok: 0 }); d.n++; if (ok) d.ok++;
  if (ok) { p.streak++; p.bestStreak = Math.max(p.bestStreak, p.streak); } else p.streak = 0;
  const m = p.mem[q.id] || (p.mem[q.id] = { n: 0, ok: 0, box: 0, last: 0 });
  m.n++; if (ok) { m.ok++; m.box = Math.min(5, m.box + 1); } else m.box = 0;
  m.last = Date.now();
  saveProfiles();
}
// Elige pregunta: evita repetir en la partida y lo visto hace poco, y si hay objetivo de dificultad se acerca a él
function pickQuestion(cat, { profile = null, target = null, exclude = new Set() } = {}) {
  let pool = BY_CAT[cat].filter(q => !exclude.has(q.id));
  if (!pool.length) pool = BY_CAT[cat].slice();
  const now = Date.now();
  const scored = pool.map(q => {
    let s = Math.random() * 2;
    if (target) s += Math.abs(q.d - target) * 1.6;
    const m = profile?.mem[q.id];
    if (m) { const hrs = (now - m.last) / 36e5; if (hrs < 24) s += 2.5; else if (hrs < 72) s += 1; if (m.box >= 3) s += 0.8; }
    return { s, q };
  });
  scored.sort((a, b) => a.s - b.s);
  return scored[0].q;
}

/* ───────────── Sonido, vibración y avisos ───────────── */
let audioCtx = null;
const SOUNDS = {
  tap: [[520, 0.03]], dice: [[320, 0.04], [380, 0.04], [300, 0.04], [420, 0.05]],
  ok: [[660, 0.09], [990, 0.16]], ko: [[240, 0.16], [170, 0.24]],
  wedge: [[523, 0.09], [659, 0.09], [784, 0.09], [1047, 0.22]], tick: [[1200, 0.035]],
  win: [[523, 0.12], [659, 0.12], [784, 0.12], [1047, 0.12], [784, 0.1], [1047, 0.35]],
};
function sfx(name) {
  if (!settings.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    let t = audioCtx.currentTime;
    for (const [freq, dur] of SOUNDS[name] || []) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'triangle'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t + dur + 0.02); t += dur * 0.9;
    }
  } catch (e) { /* sin audio */ }
}
function buzz(pattern) { if (settings.vibrate && navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) { /* sin vibración */ } } }
let toastTimer;
function toast(msg, ms = 1900) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div'); box.className = 'confetti';
  for (let i = 0; i < 70; i++) {
    const s = document.createElement('i');
    s.style.left = rnd(100) + 'vw'; s.style.background = CATS[i % 6].color;
    s.style.animationDelay = (Math.random() * 0.8).toFixed(2) + 's';
    s.style.animationDuration = (2 + Math.random() * 1.6).toFixed(2) + 's';
    box.appendChild(s);
  }
  document.body.appendChild(box); setTimeout(() => box.remove(), 4800);
}

/* ───────────── Dibujos SVG compartidos ───────────── */
function pie(cx, cy, r, a1, a2) {
  return `M${f1(cx)} ${f1(cy)}L${f1(cx + r * Math.cos(a1))} ${f1(cy + r * Math.sin(a1))}A${r} ${r} 0 0 1 ${f1(cx + r * Math.cos(a2))} ${f1(cy + r * Math.sin(a2))}Z`;
}
function sector(cx, cy, r1, r2, a1, a2) {
  const P = (r, a) => `${f1(cx + r * Math.cos(a))} ${f1(cy + r * Math.sin(a))}`;
  return `M${P(r2, a1)}A${r2} ${r2} 0 0 1 ${P(r2, a2)}L${P(r1, a2)}A${r1} ${r1} 0 0 0 ${P(r1, a1)}Z`;
}
const catAngle = c => -Math.PI / 2 + c * Math.PI / 3;
function queseraSVG() {
  let s = '<svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="58" fill="#1A2350"/>';
  for (let c = 0; c < 6; c++) {
    const a = catAngle(c);
    s += `<path class="wedge-in" style="animation-delay:${(0.12 + c * 0.09).toFixed(2)}s" d="${pie(60 + 2.5 * Math.cos(a), 60 + 2.5 * Math.sin(a), 48, a - Math.PI / 6 + 0.04, a + Math.PI / 6 - 0.04)}" fill="${CATS[c].color}"/>`;
  }
  return s + '</svg>';
}
// Ficha de jugador: aro con su color y los 6 huecos de quesito
function tokenG(p, x, y, r = 10, active = false) {
  let s = `<g transform="translate(${f1(x)} ${f1(y)})">`;
  if (active) s += `<circle r="${r + 4}" fill="none" stroke="${p.color}" stroke-width="2" class="halo"/>`;
  s += `<circle r="${r}" fill="#0E1330" stroke="${p.color}" stroke-width="${f1(r * 0.28)}"/>`;
  const ir = r * 0.66;
  for (let c = 0; c < 6; c++) {
    const a = catAngle(c);
    s += `<path d="${pie(0, 0, ir, a - Math.PI / 6 + 0.06, a + Math.PI / 6 - 0.06)}" fill="${p.wedges[c] ? CATS[c].color : 'rgba(255,255,255,.13)'}"/>`;
  }
  return s + '</g>';
}
const tokenSVG = (p, size = 26) => `<svg class="tok" width="${size}" height="${size}" viewBox="-13 -13 26 26" aria-hidden="true">${tokenG(p, 0, 0, 11)}</svg>`;

/* ───────────── Navegación ───────────── */
const SCREENS = {}, AFTER = {}, ACT = {};
let screen = 'home', screenArg = null, navDepth = 0, ignorePop = false;
function go(name, arg) {
  screen = name; screenArg = arg;
  if (name === 'home') { if (navDepth > 0) { navDepth = 0; ignorePop = true; history.back(); } }
  else if (navDepth === 0) { history.pushState({ q: 1 }, ''); navDepth = 1; }
  render(); window.scrollTo(0, 0);
}
function render() {
  document.body.classList.toggle('in-game', screen === 'game');
  app.innerHTML = SCREENS[screen](screenArg);
  AFTER[screen]?.(screenArg);
}
// Botón «atrás» de Android: en partida abre la pausa en lugar de salir
window.addEventListener('popstate', () => {
  if (ignorePop) { ignorePop = false; return; }
  if (screen === 'game' && G && G.phase !== 'over') { history.pushState({ q: 1 }, ''); if (!paused) openPause(); return; }
  if (screen === 'training' && T) { history.pushState({ q: 1 }, ''); endTraining(); return; }
  if (screen === 'game') { G = null; }
  navDepth = 0; closeLayer(); screen = 'home'; render();
});
const topbar = (title, back = 'home') =>
  `<header class="topbar"><button class="back" data-act="go" data-to="${back}" aria-label="Volver">‹</button><h2>${title}</h2></header>`;

/* ───────────── Inicio ───────────── */
const modeBtn = (mode, c, title, desc) =>
  `<button class="mode" data-act="mode" data-mode="${mode}" style="--c:${CATS[c].color}"><span class="wedge-ico"></span><span class="mode-txt"><b>${title}</b><small>${desc}</small></span></button>`;
SCREENS.home = () => {
  const p = activeProfile(), save = Store.get('save', null);
  return `<main class="screen home">
    <header class="hero">${queseraSVG()}<h1>Quesitos</h1><p class="tagline">El trivial de toda la vida, en el bolsillo.</p></header>
    <button class="profile-chip" data-act="go" data-to="profiles">${p
      ? `<span class="emo">${p.emoji}</span><span><b>${esc(p.name)}</b><small>${titleFor(p.rating)}</small></span>`
      : '<span><b>Crear perfil</b><small>Para guardar tus estadísticas</small></span>'}</button>
    ${save ? `<button class="continue" data-act="resume"><b>Continuar partida</b><small>${MODES[save.mode]} con ${save.players.map(x => esc(x.name)).join(', ')}</small></button>` : ''}
    <nav class="modes" aria-label="Modos de juego">
      ${modeBtn('solo', 0, 'Solitario', 'Contra la CPU, ajustada a tu nivel')}
      ${modeBtn('training', 4, 'Entrenamiento', 'Repasa sin parar lo que peor se te da')}
      ${modeBtn('normal', 1, 'Partida normal', 'Con amigos: 30 segundos para tirar')}
      ${modeBtn('larga', 2, 'Partida larga', 'Con amigos: cada uno tira cuando quiera')}
    </nav>
    <nav class="home-links">
      <button data-act="go" data-to="stats">Estadísticas</button>
      <button data-act="go" data-to="settings">Ajustes</button>
      <button data-act="go" data-to="rules">Reglas</button>
    </nav>
  </main>`;
};
ACT.go = el => { sfx('tap'); go(el.dataset.to); };
ACT.mode = el => {
  const m = el.dataset.mode;
  sfx('tap');
  if ((m === 'solo' || m === 'training') && !activeProfile()) { NP.next = m === 'solo' ? 'solo' : 'trainStart'; toast('Primero crea tu perfil'); go('newProfile'); return; }
  if (m === 'solo') go('solo');
  else if (m === 'training') go('trainStart');
  else { MS = defaultMulti(m); go('multi'); }
};
ACT.resume = () => { const s = Store.get('save', null); if (!s) return; G = s; startGameRuntime(); };

/* ───────────── Perfiles ───────────── */
const NP = { emoji: '🦊', next: null };
SCREENS.profiles = () => `<main class="screen">${topbar('Perfiles')}
  <div class="list">${profiles.map(p => `<div class="prof ${p.id === activeId ? 'on' : ''}">
      <button class="prof-main" data-act="selectProfile" data-id="${p.id}"><span class="emo">${p.emoji}</span><span><b>${esc(p.name)}</b><small>${titleFor(p.rating)}, ${p.games} ${p.games === 1 ? 'partida' : 'partidas'}</small></span></button>
      <button class="icon-btn" data-act="delProfile" data-id="${p.id}" aria-label="Borrar el perfil de ${esc(p.name)}">✕</button>
    </div>`).join('') || '<p class="empty">Todavía no hay perfiles. Crea uno para guardar tus estadísticas.</p>'}</div>
  <p class="hint">Cada persona que juegue en este móvil puede tener su perfil. Toca uno para elegirlo.</p>
  <button class="btn" data-act="go" data-to="newProfile">Crear perfil</button></main>`;
SCREENS.newProfile = () => `<main class="screen">${topbar('Nuevo perfil', profiles.length ? 'profiles' : 'home')}
  <label class="field"><span>Nombre</span><input id="npName" maxlength="16" placeholder="¿Cómo te llamas?" autocomplete="off"></label>
  <p class="label">Elige tu ficha</p>
  <div class="emoji-grid">${EMOJIS.map(e => `<button class="emo-btn ${e === NP.emoji ? 'on' : ''}" data-act="pickEmoji" data-e="${e}" aria-label="Ficha ${e}">${e}</button>`).join('')}</div>
  <button class="btn" data-act="createProfile">Crear perfil</button></main>`;
ACT.pickEmoji = el => { NP.emoji = el.dataset.e; document.querySelectorAll('.emo-btn').forEach(b => b.classList.toggle('on', b === el)); sfx('tap'); };
ACT.createProfile = () => {
  const name = ($('#npName')?.value || '').trim();
  if (!name) { toast('Escribe un nombre'); $('#npName')?.focus(); return; }
  if (profiles.some(p => p.name.toLowerCase() === name.toLowerCase())) { toast('Ya hay un perfil con ese nombre'); return; }
  const p = newProfile(name, NP.emoji); profiles.push(p); saveProfiles(); setActive(p.id);
  sfx('ok'); toast(`¡Hola, ${name}!`);
  const next = NP.next; NP.next = null; go(next || 'home');
};
ACT.selectProfile = el => { setActive(el.dataset.id); sfx('tap'); toast(`Perfil activo: ${getProfile(el.dataset.id).name}`); go('home'); };
ACT.delProfile = el => {
  const p = getProfile(el.dataset.id);
  if (!p || !confirm(`¿Borrar el perfil de ${p.name}? Se perderán sus estadísticas.`)) return;
  profiles = profiles.filter(x => x.id !== p.id); saveProfiles();
  if (activeId === p.id) setActive(profiles[0]?.id || null);
  render();
};

/* ───────────── Configurar solitario ───────────── */
const SS = { rivals: 1, level: 'adaptativo' };
SCREENS.solo = () => {
  const p = activeProfile(), rec = recommendedLevel(p);
  const desc = k => k === 'adaptativo'
    ? `Copia tus aciertos por categoría (ahora acierta un ${Math.round(adaptiveRate(p) * 100)} %) y aprieta cuando le ganas`
    : LEVELS[k].desc;
  return `<main class="screen">${topbar('Solitario')}
    <div class="me"><span class="emo big">${p.emoji}</span><div><b>${esc(p.name)}</b><small>${titleFor(p.rating)}, ${p.rating} puntos</small></div></div>
    <p class="label">Rivales</p>
    <div class="chips">${[1, 2, 3].map(n => `<button class="chip ${SS.rivals === n ? 'on' : ''}" data-act="soloRivals" data-n="${n}">${n} ${n === 1 ? 'rival' : 'rivales'}</button>`).join('')}</div>
    <p class="label">Nivel de la CPU</p>
    <div class="levels">${Object.keys(LEVELS).map(k => `<button class="lvl ${SS.level === k ? 'on' : ''}" data-act="soloLevel" data-l="${k}">
        <b>${LEVELS[k].name}${k === rec ? '<em>tu nivel</em>' : ''}</b><small>${desc(k)}</small></button>`).join('')}</div>
    <p class="hint">Las preguntas que te tocan se adaptan a lo que dominas de cada categoría. Ganar o perder cambia tus puntos.</p>
    <button class="btn" data-act="startSolo">Empezar partida</button></main>`;
};
ACT.soloRivals = el => { SS.rivals = +el.dataset.n; sfx('tap'); render(); };
ACT.soloLevel = el => { SS.level = el.dataset.l; sfx('tap'); render(); };
ACT.startSolo = () => {
  if (!confirmOverwrite()) return;
  const p = activeProfile(), names = shuffle(CPU_NAMES), emos = shuffle(CPU_EMOJIS);
  const players = [{ profileId: p.id, name: p.name, emoji: p.emoji, cpu: null }];
  for (let i = 0; i < SS.rivals; i++) players.push({ profileId: null, name: names[i], emoji: emos[i], cpu: SS.level });
  newGame({ mode: 'solo', players, adaptive: true, refId: p.id });
};
function confirmOverwrite() { return !Store.get('save', null) || confirm('Tienes una partida guardada. Si empiezas otra, se perderá. ¿Seguir?'); }

/* ───────────── Configurar partida con amigos ───────────── */
let MS = null;
function defaultMulti(mode) {
  const p = activeProfile();
  return { mode, adaptive: false, players: [p ? { type: 'human', profileId: p.id, name: '' } : { type: 'human', profileId: '', name: '' }, { type: 'human', profileId: '', name: '' }] };
}
function multiRow(pl, i) {
  const val = pl.type === 'cpu' ? 'cpu:' + pl.level : 'human';
  const opts = [['human', 'Persona'], ...['facil', 'normal', 'dificil', 'experto'].map(l => ['cpu:' + l, 'CPU ' + LEVELS[l].name.toLowerCase()])];
  return `<div class="prow" style="--pc:${PLAYER_COLORS[i]}"><span class="pdot"></span><div class="prow-fields">
    <select data-ch="ptype" data-i="${i}" aria-label="Tipo de jugador ${i + 1}">${opts.map(([v, t]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${t}</option>`).join('')}</select>
    ${pl.type === 'human'
      ? `<select data-ch="pprof" data-i="${i}" aria-label="Perfil del jugador ${i + 1}"><option value="">Invitado (sin estadísticas)</option>${profiles.map(p => `<option value="${p.id}" ${pl.profileId === p.id ? 'selected' : ''}>${p.emoji} ${esc(p.name)}</option>`).join('')}</select>
         ${pl.profileId ? '' : `<input data-in="pname" data-i="${i}" value="${esc(pl.name)}" placeholder="Nombre del jugador ${i + 1}" maxlength="14" autocomplete="off">`}`
      : '<span class="cpu-name">Juega la máquina</span>'}
  </div>${MS.players.length > 2 ? `<button class="icon-btn" data-act="removePlayer" data-i="${i}" aria-label="Quitar jugador ${i + 1}">✕</button>` : ''}</div>`;
}
SCREENS.multi = () => `<main class="screen">${topbar(MODES[MS.mode])}
  <p class="intro">${MS.mode === 'normal'
    ? 'Cada jugador tiene 30 segundos para tirar el dado. Si se le pasa, pierde el turno.'
    : 'Sin reloj: cada uno tira cuando quiera. La partida se guarda sola para seguirla otro día.'} Os vais pasando el móvil en cada turno.</p>
  <p class="label">Jugadores (${MS.players.length} de 6)</p>
  <div class="plist">${MS.players.map(multiRow).join('')}</div>
  ${MS.players.length < 6 ? '<button class="btn ghost" data-act="addPlayer">Añadir jugador</button>' : ''}
  <label class="switch-row"><span><b>Preguntas a la medida de cada uno</b><small>Quien tiene perfil y acierta mucho recibe preguntas más difíciles</small></span><input type="checkbox" data-ch="madapt" ${MS.adaptive ? 'checked' : ''}></label>
  <button class="btn" data-act="startMulti">Empezar partida</button></main>`;
ACT.addPlayer = () => { if (MS.players.length < 6) { MS.players.push({ type: 'human', profileId: '', name: '' }); render(); } };
ACT.removePlayer = el => { MS.players.splice(+el.dataset.i, 1); render(); };
ACT.startMulti = () => {
  const list = MS.players;
  if (!list.some(p => p.type === 'human')) { toast('Tiene que jugar al menos una persona'); return; }
  const used = list.filter(p => p.type === 'human' && p.profileId).map(p => p.profileId);
  if (new Set(used).size !== used.length) { toast('Un mismo perfil no puede jugar dos veces'); return; }
  if (!confirmOverwrite()) return;
  const names = shuffle(CPU_NAMES), emos = shuffle(CPU_EMOJIS); let ci = 0;
  const players = list.map((pl, i) => {
    if (pl.type === 'cpu') { const r = { profileId: null, name: names[ci], emoji: emos[ci], cpu: pl.level }; ci++; return r; }
    const prof = getProfile(pl.profileId);
    return prof ? { profileId: prof.id, name: prof.name, emoji: prof.emoji, cpu: null }
                : { profileId: null, name: pl.name.trim() || `Jugador ${i + 1}`, emoji: GUEST_EMOJIS[i], cpu: null };
  });
  newGame({ mode: MS.mode, players, adaptive: MS.adaptive, refId: null });
};

/* ───────────── Estadísticas ───────────── */
const kpi = (v, l) => `<div class="kpi"><b>${v}</b><small>${l}</small></div>`;
SCREENS.stats = () => {
  const p = activeProfile();
  if (!p) return `<main class="screen">${topbar('Estadísticas')}<p class="empty">Crea un perfil para empezar a guardar tus estadísticas.</p><button class="btn" data-act="go" data-to="newProfile">Crear perfil</button></main>`;
  const { n, ok } = totals(p), [m, t] = masteredCount(p), weak = weakestCats(p)[0];
  const diffNames = { 1: 'Fáciles', 2: 'Medias', 3: 'Difíciles' };
  return `<main class="screen">${topbar('Estadísticas')}
    <div class="me"><span class="emo big">${p.emoji}</span><div><b>${esc(p.name)}</b><small>${titleFor(p.rating)}, ${p.rating} puntos</small></div></div>
    <div class="kpis">${kpi(p.games, 'partidas')}${kpi(p.wins, 'victorias')}${kpi(n ? pct(ok, n) + ' %' : '–', 'aciertos')}${kpi(p.bestStreak, 'mejor racha')}</div>
    ${n >= 10 ? `<div class="tip" style="--c:${CATS[weak].color}">Tu punto flojo ahora mismo es <b>${CATS[weak].name}</b>.</div>
      <button class="btn" data-act="trainWeak">Entrenar mis puntos débiles</button>` : '<p class="hint">Responde unas cuantas preguntas y aquí verás tus puntos fuertes y flojos.</p>'}
    <p class="label">Por categoría</p>
    <div class="bars">${CATS.map((c, i) => { const s = p.cat[i]; return `<div class="barrow"><span class="bname">${c.name}</span><span class="bval">${s.n ? pct(s.ok, s.n) + ' %' : 'sin datos'}</span>
      <div class="bar"><i style="width:${s.n ? pct(s.ok, s.n) : 0}%;background:${c.color}"></i></div><small>${s.ok} de ${s.n} acertadas</small></div>`; }).join('')}</div>
    <p class="label">Por dificultad</p>
    <div class="bars">${[1, 2, 3].map(d => { const s = p.diff[d]; return `<div class="barrow"><span class="bname">${diffNames[d]}</span><span class="bval">${s.n ? pct(s.ok, s.n) + ' %' : 'sin datos'}</span>
      <div class="bar"><i style="width:${s.n ? pct(s.ok, s.n) : 0}%"></i></div></div>`; }).join('')}</div>
    <p class="label">Solitario</p>
    <p class="plain">${p.solo.wins} victorias en ${p.solo.games} partidas. La CPU adaptativa acierta ahora un ${Math.round(adaptiveRate(p) * 100)} % de media contigo.</p>
    <p class="label">Entrenamiento</p>
    <p class="plain">Dominas ${m} de ${t} preguntas (las aciertas tres veces seguidas).</p>
  </main>`;
};
ACT.trainWeak = () => startTraining('weak');

/* ───────────── Ajustes ───────────── */
const sw = (k, title, sub) => `<label class="switch-row"><span><b>${title}</b><small>${sub}</small></span><input type="checkbox" data-ch="setting" data-k="${k}" ${settings[k] ? 'checked' : ''}></label>`;
const optChip = (k, v, label) => `<button class="chip ${settings[k] === v ? 'on' : ''}" data-act="setOpt" data-k="${k}" data-v="${v}">${label}</button>`;
SCREENS.settings = () => {
  const nc = Store.get('custom', []).length;
  return `<main class="screen">${topbar('Ajustes')}
    ${sw('sound', 'Sonido', 'Efectos al tirar el dado y al responder')}
    ${sw('vibrate', 'Vibración', 'Vibra al acertar, fallar y ganar quesitos')}
    <p class="label">Forma de responder</p>
    <div class="chips">${optChip('answerMode', 'options', 'Elegir entre 4 opciones')}${optChip('answerMode', 'classic', 'Clásica, en voz alta')}</div>
    <p class="hint">En la clásica ves la pregunta sin opciones, dices la respuesta en voz alta y después la destapas para comprobarla.</p>
    <p class="label">Tiempo para responder</p>
    <div class="chips">${[0, 15, 30].map(v => optChip('answerTime', v, v ? v + ' segundos' : 'Sin límite')).join('')}</div>
    <p class="label">Preguntas</p>
    <p class="plain">${BANK.length} preguntas en total, ${nc} añadidas por ti.</p>
    <label class="field"><span>Añadir un pack de preguntas (JSON)</span>
      <textarea id="packText" rows="4" placeholder='[{"categoria":"historia","dificultad":2,"pregunta":"…","respuesta":"…","incorrectas":["…","…","…"]}]'></textarea></label>
    <div class="row2"><button class="btn" data-act="importText">Añadir preguntas</button>
      <label class="btn ghost file">Abrir archivo<input type="file" accept=".json,application/json,text/plain" data-ch="packFile" hidden></label></div>
    ${nc ? '<button class="btn ghost danger" data-act="clearCustom">Borrar las preguntas añadidas</button>' : ''}
    <p class="label">Copia de seguridad</p>
    <p class="hint">Sirve para pasar perfiles, estadísticas y preguntas añadidas a otro móvil.</p>
    <div class="row2"><button class="btn ghost" data-act="exportBackup">Crear copia</button><button class="btn ghost" data-act="importBackup">Restaurar copia</button></div>
    <textarea id="backupText" rows="4" placeholder="Aquí aparece la copia para que la copies, o pega una para restaurarla"></textarea>
    ${activeProfile() ? `<button class="btn ghost danger" data-act="resetStats">Borrar estadísticas de ${esc(activeProfile().name)}</button>` : ''}
    <p class="hint version">Quesitos 1.0</p></main>`;
};
ACT.setOpt = el => { const k = el.dataset.k; settings[k] = k === 'answerTime' ? +el.dataset.v : el.dataset.v; saveSettings(); sfx('tap'); render(); };
function showImport(res) { toast(res.ok ? `Añadidas ${res.added} preguntas${res.bad ? `; ${res.bad} no eran válidas` : ''}` : res.msg, 3200); }
ACT.importText = () => { const t = $('#packText')?.value.trim(); if (!t) { toast('Pega primero el texto del pack'); return; } const r = importPack(t); showImport(r); if (r.ok) render(); };
ACT.clearCustom = () => { if (!confirm('¿Borrar todas las preguntas que has añadido?')) return; Store.set('custom', []); buildBank(); render(); toast('Preguntas añadidas borradas'); };
ACT.exportBackup = () => {
  const data = JSON.stringify({ app: 'quesitos', v: 1, profiles, active: activeId, custom: Store.get('custom', []), settings });
  const ta = $('#backupText'); ta.value = data; ta.focus(); ta.select();
  if (navigator.clipboard) navigator.clipboard.writeText(data).then(() => toast('Copia creada y copiada al portapapeles'), () => toast('Copia creada: selecciona el texto y cópialo'));
  else toast('Copia creada: selecciona el texto y cópialo');
};
ACT.importBackup = () => {
  const t = $('#backupText')?.value.trim();
  if (!t) { toast('Pega primero una copia en el cuadro de texto'); return; }
  let d; try { d = JSON.parse(t); } catch (e) { toast('Ese texto no es una copia válida'); return; }
  if (d?.app !== 'quesitos' || !Array.isArray(d.profiles)) { toast('Ese texto no es una copia de Quesitos'); return; }
  if (!confirm('Se sustituirán los perfiles y estadísticas de este móvil. ¿Seguir?')) return;
  profiles = d.profiles; saveProfiles(); setActive(d.active || profiles[0]?.id || null);
  Store.set('custom', Array.isArray(d.custom) ? d.custom : []);
  if (d.settings) { settings = Object.assign(settings, d.settings); saveSettings(); }
  buildBank(); toast('Copia restaurada'); render();
};
ACT.resetStats = () => {
  const p = activeProfile(); if (!p || !confirm(`¿Borrar todas las estadísticas de ${p.name}?`)) return;
  resetProfileStats(p); saveProfiles(); toast('Estadísticas borradas'); render();
};

/* ───────────── Reglas ───────────── */
SCREENS.rules = () => `<main class="screen rules">${topbar('Reglas')}
  <h3>Objetivo</h3>
  <p>Consigue los seis quesitos, uno de cada categoría, vuelve al centro del tablero y acierta la pregunta final.</p>
  <h3>Tu turno</h3>
  <p>Tira el dado y mueve exactamente esos pasos en la dirección que quieras, por el anillo o por los radios. No puedes dar marcha atrás en mitad de una jugada. Si aciertas, vuelves a tirar; si fallas, le toca al siguiente.</p>
  <h3>Las casillas</h3>
  <p>Cada color es una categoría: azul Geografía, rosa Espectáculos, amarillo Historia, marrón Arte y Literatura, verde Ciencias y Naturaleza y naranja Deportes y Ocio.</p>
  <p>Las casillas grandes del anillo, marcadas con un quesito, son las de quesito: si aciertas allí, te lo llevas. Las casillas con un dado te dejan volver a tirar sin pregunta. Si caes en el centro antes de tiempo, eliges tú la categoría.</p>
  <h3>La pregunta final</h3>
  <p>Con los seis quesitos, entra en el centro con la tirada exacta. Los rivales eligen la categoría (si son la CPU, te pondrán la que peor se te da). Si aciertas, ganas. Si fallas, sales en tu siguiente turno y vuelves a intentarlo.</p>
  <h3>Modos</h3>
  <p><b>Solitario:</b> contra 1, 2 o 3 rivales de la CPU. El nivel adaptativo copia tus aciertos por categoría y se endurece cuando le ganas.</p>
  <p><b>Entrenamiento:</b> preguntas sin fin de lo que peor se te da. Las que fallas vuelven al poco rato hasta que las aciertas tres veces seguidas.</p>
  <p><b>Partida normal:</b> de 2 a 6 jugadores en el mismo móvil, con 30 segundos para tirar el dado.</p>
  <p><b>Partida larga:</b> igual, pero sin reloj. Se guarda sola para continuar otro día.</p>
</main>`;

/* ───────────── Tablero ─────────────
   Anillo de 42 casillas (6 de quesito), 6 radios de 5 casillas y el centro. Total 73. */
const RING = 42, HUB = 72, NODES = [];
(function buildBoard() {
  const step = (2 * Math.PI) / RING;
  const pattern = ['c', 'R', 'c', 'c', 'R', 'c'];   // entre dos casillas de quesito
  const colorSlot = [0, null, 1, 2, null, 3];
  for (let i = 0; i < RING; i++) {
    const k = Math.floor(i / 7), off = i % 7, a = -Math.PI / 2 + i * step;
    let kind, cat = null;
    if (off === 0) { kind = 'hq'; cat = k; }
    else if (pattern[off - 1] === 'R') kind = 'roll';
    else { kind = 'cat'; cat = (k + 2 + colorSlot[off - 1]) % 6; }
    NODES.push({ id: i, kind, cat, a, x: 200 + 174 * Math.cos(a), y: 200 + 174 * Math.sin(a), adj: [(i + 1) % RING, (i + RING - 1) % RING] });
  }
  const spokeCats = [3, 1, 4, 2, 5], radii = [134, 112, 90, 68, 46];
  for (let s = 0; s < 6; s++) {
    const a = catAngle(s);
    for (let p = 0; p < 5; p++) {
      const id = 42 + s * 5 + p;
      NODES[id] = { id, kind: 'cat', cat: (s + spokeCats[p]) % 6, a, x: 200 + radii[p] * Math.cos(a), y: 200 + radii[p] * Math.sin(a), adj: [] };
    }
  }
  NODES[HUB] = { id: HUB, kind: 'hub', cat: null, a: 0, x: 200, y: 200, adj: [] };
  const link = (a, b) => { NODES[a].adj.push(b); NODES[b].adj.push(a); };
  for (let s = 0; s < 6; s++) {
    for (let p = 0; p < 5; p++) { const id = 42 + s * 5 + p; link(id, p === 0 ? s * 7 : id - 1); }
    link(42 + s * 5 + 4, HUB);
  }
})();
const DIST = NODES.map((_, src) => {
  const d = Array(NODES.length).fill(99); d[src] = 0; const q = [src];
  while (q.length) { const u = q.shift(); for (const v of NODES[u].adj) if (d[v] === 99) { d[v] = d[u] + 1; q.push(v); } }
  return d;
});
// Casillas a las que se llega con exactamente `steps` pasos sin volver sobre los propios pasos
function destinations(from, steps) {
  const res = new Map(), path = [from];
  (function dfs(node, left) {
    if (left === 0) { if (!res.has(node)) res.set(node, path.slice()); return; }
    for (const nb of NODES[node].adj) { if (path.includes(nb)) continue; path.push(nb); dfs(nb, left - 1); path.pop(); }
  })(from, steps);
  return res;
}
let BOARD_STATIC = '';
function boardStatic() {
  let s = '<circle cx="200" cy="200" r="203" fill="#0A0F2C"/><circle cx="200" cy="200" r="199" fill="#1A2350"/>';
  for (let k = 0; k < 6; k++) {
    const a = catAngle(k);
    s += `<line x1="200" y1="200" x2="${f1(200 + 150 * Math.cos(a))}" y2="${f1(200 + 150 * Math.sin(a))}" stroke="#26316B" stroke-width="30" stroke-linecap="round"/>`;
  }
  const step = (2 * Math.PI) / RING, half = step / 2 - 0.012;
  for (let i = 0; i < RING; i++) {
    const n = NODES[i]; if (n.kind === 'hq') continue;
    s += `<path d="${sector(200, 200, 160, 190, n.a - half, n.a + half)}" fill="${n.kind === 'roll' ? '#E7EAF4' : CATS[n.cat].color}"/>`;
    if (n.kind === 'roll') {
      s += `<g transform="translate(${f1(n.x)} ${f1(n.y)}) rotate(${f1((n.a * 180) / Math.PI + 90)})"><rect x="-6" y="-6" width="12" height="12" rx="3" fill="#fff" stroke="#8C95B8"/><circle cx="-2.6" cy="-2.6" r="1.4" fill="#1A2350"/><circle cx="2.6" cy="2.6" r="1.4" fill="#1A2350"/></g>`;
    }
  }
  for (let k = 0; k < 6; k++) {
    const n = NODES[k * 7];
    s += `<path d="${sector(200, 200, 151, 199, n.a - half - 0.02, n.a + half + 0.02)}" fill="${CATS[k].color}" stroke="#0A0F2C" stroke-width="2"/>`;
    const ax = 200 + 165 * Math.cos(n.a), ay = 200 + 165 * Math.sin(n.a);
    s += `<path d="${pie(ax, ay, 22, n.a - 0.34, n.a + 0.34)}" fill="#fff" fill-opacity=".9"/>`;
  }
  for (let id = 42; id < 72; id++) {
    const n = NODES[id];
    s += `<rect x="-10" y="-10" width="20" height="20" rx="5" transform="translate(${f1(n.x)} ${f1(n.y)}) rotate(${f1((n.a * 180) / Math.PI)})" fill="${CATS[n.cat].color}" stroke="#0A0F2C" stroke-width="1.5"/>`;
  }
  for (let k = 0; k < 6; k++) {
    const a = catAngle(k), P = an => `${f1(200 + 38 * Math.cos(an))} ${f1(200 + 38 * Math.sin(an))}`;
    s += `<path d="M200 200L${P(a - Math.PI / 6)}L${P(a + Math.PI / 6)}Z" fill="${CATS[k].color}" stroke="#0A0F2C" stroke-width="1.5"/>`;
  }
  return s + '<circle cx="200" cy="200" r="9" fill="#0A0F2C"/>';
}

/* ───────────── Motor de partida ───────────── */
let G = null, TOKEN = 0, paused = false, PICK = null;
const cur = () => G.players[G.turn];
const alive = tok => !!G && G.token === tok;
async function wait(ms, tok) { await sleep(ms); while (paused && alive(tok)) await sleep(150); return alive(tok); }

function newGame(setup) {
  const players = setup.players.map((s, i) => ({ ...s, color: PLAYER_COLORS[i], pos: HUB, wedges: [false, false, false, false, false, false], n: 0, ok: 0 }));
  G = {
    mode: setup.mode, setup: JSON.parse(JSON.stringify(setup)), players, turn: rnd(players.length), used: [],
    rollTime: setup.mode === 'normal' ? ROLL_TIME : 0, answerTime: settings.answerTime, answerMode: settings.answerMode,
    adaptive: !!setup.adaptive, refId: setup.refId || null, die: null, phase: 'roll', started: Date.now(),
  };
  startGameRuntime();
}
function startGameRuntime() {
  paused = false; $('#pause').innerHTML = ''; closeLayer();
  G.token = ++TOKEN; G.pending = null;
  go('game');
  toast(`Empieza ${cur().emoji} ${cur().name}`);
  runTurn();
}
function saveGame() {
  if (!G || G.phase === 'over') return;
  const { token, pending, rollIv, dests, ...rest } = G;
  Store.set('save', { ...rest, phase: 'roll' });
}
function abortGame() {
  if (!G) return;
  clearInterval(G.rollIv);
  const pend = G.pending; G.pending = null; G.token = -1;
  if (pend) pend.res(null);
  abortQuestion(); closeLayer(); paused = false; $('#pause').innerHTML = '';
  G = null;
}

SCREENS.game = () => `<main class="screen game">
  <div class="game-top"><button class="icon-btn light" data-act="pause" aria-label="Pausa"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor"/><rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor"/></svg></button>
    <div class="players" id="players"></div></div>
  <div class="board-wrap"><svg id="board" viewBox="-6 -6 412 412" role="img" aria-label="Tablero">${BOARD_STATIC}<g id="hl"></g><g id="tokens"></g></svg></div>
  <div class="turn-panel" id="panel"></div></main>`;
AFTER.game = () => { renderPlayers(); renderTokens(); renderPanel(); if (G.dests && G.pending?.kind === 'dest') renderHL(G.dests.keys(), true); };

function renderPlayers() {
  const el = $('#players'); if (!el || !G) return;
  el.innerHTML = G.players.map((p, i) => `<div class="pchip ${i === G.turn ? 'on' : ''}" style="--pc:${p.color}">${tokenSVG(p, 26)}<span>${p.emoji} ${esc(p.name)}</span><b>${p.wedges.filter(Boolean).length}</b></div>`).join('');
  el.querySelector('.on')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
}
function renderTokens() {
  const g = $('#tokens'); if (!g || !G) return;
  const groups = {};
  G.players.forEach((p, i) => (groups[p.pos] = groups[p.pos] || []).push(i));
  let back = '', front = '';
  for (const [pos, arr] of Object.entries(groups)) {
    const n = NODES[pos], k = arr.length, r = k > 2 ? 8 : 10, off = k === 1 ? 0 : k === 2 ? 8 : 11;
    arr.forEach((pi, j) => {
      const ang = (j / k) * 2 * Math.PI - Math.PI / 2;
      const svg = tokenG(G.players[pi], n.x + off * Math.cos(ang), n.y + off * Math.sin(ang), r, pi === G.turn);
      if (pi === G.turn) front += svg; else back += svg;
    });
  }
  g.innerHTML = back + front;
}
function renderHL(ids, interactive) {
  const g = $('#hl'); if (!g) return;
  g.innerHTML = [...ids].map(id => { const n = NODES[id];
    return `<g class="dest ${interactive ? '' : 'passive'}" ${interactive ? `data-act="dest" data-node="${id}"` : ''}><circle cx="${f1(n.x)}" cy="${f1(n.y)}" r="21" fill="transparent"/><circle class="dest-ring" cx="${f1(n.x)}" cy="${f1(n.y)}" r="15"/></g>`; }).join('');
}
const PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
const dieFace = v => `<svg class="face" viewBox="-12 -12 24 24" aria-hidden="true">${(PIPS[v] || []).map(([x, y]) => `<circle cx="${x * 6}" cy="${y * 6}" r="2.3"/>`).join('')}</svg>`;
function renderPanel() {
  const el = $('#panel'); if (!el || !G) return;
  const p = cur(), canRoll = G.phase === 'roll' && !p.cpu && G.pending?.kind === 'roll';
  let hint = '';
  if (G.phase === 'roll') hint = p.cpu ? 'Va a tirar el dado…' : G.rollTime ? 'Tira antes de que se acabe el tiempo' : 'Toca el dado para tirar';
  else if (G.phase === 'move') hint = p.cpu ? `Ha sacado un ${G.die}` : `Has sacado un ${G.die}: toca una casilla iluminada`;
  else if (G.phase === 'question') hint = 'Pregunta en juego';
  const timed = G.rollTime && canRoll;
  el.innerHTML = `<div class="turn-who"><span class="turn-emo">${p.emoji}</span><div><b style="color:${p.color}">${esc(p.name)}</b><small id="hint">${hint}</small></div></div>
    <button class="die ${canRoll ? 'ready' : ''}" data-act="roll" ${canRoll ? '' : 'disabled'} aria-label="Tirar el dado">
      ${timed ? '<svg class="ring" viewBox="0 0 96 96" aria-hidden="true"><rect x="3" y="3" width="90" height="90" rx="27" pathLength="100" id="ringRect"/></svg>' : ''}
      <span id="dieFace">${dieFace(G.die || 5)}</span>${timed ? `<span class="secs" id="secs">${G.rollLeft}</span>` : ''}</button>`;
  paintRing();
}
function paintRing() {
  const r = $('#ringRect'); if (r) { r.style.strokeDashoffset = String(100 - (G.rollLeft / G.rollTime) * 100); r.classList.toggle('low', G.rollLeft <= 5); }
  const s = $('#secs'); if (s) s.textContent = G.rollLeft;
}

function humanRoll(tok) {
  return new Promise(res => {
    G.pending = { kind: 'roll', res }; G.rollLeft = G.rollTime; renderPanel();
    if (!G.rollTime) return;
    let last = Date.now(), acc = 0;
    clearInterval(G.rollIv);
    G.rollIv = setInterval(() => {
      if (!alive(tok) || G.pending?.kind !== 'roll') { clearInterval(G.rollIv); return; }
      const now = Date.now(); if (!paused) acc += now - last; last = now;
      if (acc < 1000) return;
      acc -= 1000; G.rollLeft--; paintRing();
      if (G.rollLeft <= 5 && G.rollLeft > 0) sfx('tick');
      if (G.rollLeft <= 0) { clearInterval(G.rollIv); const r = G.pending.res; G.pending = null; r(false); }
    }, 100);
  });
}
ACT.roll = () => { if (!G || G.pending?.kind !== 'roll' || paused) return; clearInterval(G.rollIv); const r = G.pending.res; G.pending = null; r(true); };
function pickDest(dests) { return new Promise(res => { G.pending = { kind: 'dest', res }; G.dests = dests; renderHL(dests.keys(), true); }); }
ACT.dest = el => {
  if (!G || G.pending?.kind !== 'dest' || paused) return;
  const id = +el.dataset.node; if (!G.dests?.has(id)) return;
  const r = G.pending.res; G.pending = null; r(id);
};
async function rollAnim(tok) {
  sfx('dice'); const box = $('.die'); box?.classList.add('rolling');
  for (let i = 0; i < 9; i++) { G.die = 1 + rnd(6); const f = $('#dieFace'); if (f) f.innerHTML = dieFace(G.die); if (!await wait(55 + i * 10, tok)) return null; }
  box?.classList.remove('rolling'); buzz(15);
  if (!await wait(250, tok)) return null;
  return G.die;
}
async function moveAlong(p, path, tok) {
  for (let i = 1; i < path.length; i++) { p.pos = path[i]; renderTokens(); sfx('tap'); if (!await wait(150, tok)) return false; }
  return true;
}
function nextPlayer() {
  G.turn = (G.turn + 1) % G.players.length;
  const np = cur();
  if (!np.cpu && G.players.filter(x => !x.cpu).length > 1) toast(`Turno de ${np.emoji} ${np.name}: pásale el móvil`, 2200);
}

async function runTurn() {
  const tok = G.token;
  while (alive(tok)) {
    const p = cur();
    G.phase = 'roll'; G.dests = null; saveGame();
    renderPlayers(); renderTokens(); renderHL([], false);
    let rolled;
    if (p.cpu) { G.pending = null; renderPanel(); if (!await wait(900, tok)) return; rolled = true; }
    else rolled = await humanRoll(tok);
    if (rolled === null || !alive(tok)) return;
    if (rolled === false) {
      sfx('ko'); buzz([60, 40, 60]); toast(`${p.name} no ha tirado a tiempo y pierde el turno`, 2400);
      if (!await wait(1300, tok)) return;
      nextPlayer(); continue;
    }
    renderPanel();
    const val = await rollAnim(tok); if (val == null) return;
    const dests = destinations(p.pos, val);
    G.phase = 'move'; renderPanel();
    let target;
    if (p.cpu) { renderHL(dests.keys(), false); if (!await wait(850, tok)) return; target = cpuChoose(p, dests); }
    else if (dests.size === 1) { renderHL(dests.keys(), false); if (!await wait(450, tok)) return; target = [...dests.keys()][0]; }
    else { target = await pickDest(dests); if (target == null || !alive(tok)) return; }
    G.dests = null; renderHL([], false);
    if (!await moveAlong(p, dests.get(target), tok)) return;
    const res = await land(p, tok);
    if (res == null) return;
    if (res === 'win') { finishGame(p); return; }
    if (res === 'pass') { nextPlayer(); saveGame(); if (!await wait(300, tok)) return; }
    else saveGame();
  }
}
async function land(p, tok) {
  const n = NODES[p.pos];
  if (n.kind === 'roll') { saveGame(); sfx('dice'); toast('¡Vuelve a tirar!'); return (await wait(900, tok)) ? 'again' : null; }
  const ctx = { hq: n.kind === 'hq', final: false };
  let cat;
  if (n.kind === 'hub') {
    if (p.wedges.every(Boolean)) { ctx.final = true; cat = await finalCategory(p, tok); }
    else cat = await ownCategory(p, tok);
    if (cat == null || !alive(tok)) return null;
  } else cat = n.cat;
  G.phase = 'question'; renderPanel();
  const ok = await askQuestion(p, cat, ctx, tok);
  if (ok == null || !alive(tok)) return null;
  if (!ok) return 'pass';
  if (ctx.final) return 'win';
  if (ctx.hq && !p.wedges[cat]) {
    p.wedges[cat] = true; saveGame(); sfx('wedge'); buzz([30, 40, 30]);
    toast(`${p.emoji} ${p.name} gana el quesito de ${CATS[cat].name}`, 2400);
    renderPlayers(); renderTokens();
    if (!await wait(1000, tok)) return null;
  }
  return 'again';
}

/* CPU */
function cpuSkill(p, c) {
  if (p.cpu === 'adaptativo') { const ref = getProfile(G.refId); return clamp(catAcc(ref, c) + (ref?.bias || 0), 0.25, 0.95); }
  return LEVELS[p.cpu]?.p ?? 0.6;
}
const cpuProb = (p, q) => clamp(cpuSkill(p, q.c) + (2 - q.d) * 0.07, 0.08, 0.97);
function cpuChoose(p, dests) {
  const missing = [0, 1, 2, 3, 4, 5].filter(c => !p.wedges[c]);
  const goals = missing.length ? missing.map(c => c * 7) : [HUB];
  let best = null, bs = -Infinity;
  for (const id of dests.keys()) {
    const n = NODES[id]; let s = Math.random() * 4;
    if (!missing.length && id === HUB) s += 1000;
    if (n.kind === 'hq' && !p.wedges[n.cat]) s += 400;
    if (n.kind === 'roll') s += 35;
    if (n.cat != null) s += cpuSkill(p, n.cat) * 30;
    s -= Math.min(...goals.map(g => DIST[id][g])) * 6;
    if (s > bs) { bs = s; best = id; }
  }
  return best;
}

/* Elegir categoría (centro del tablero) */
function choosePicker(title, sub) {
  return new Promise(res => {
    PICK = { res };
    $('#layer').innerHTML = `<div class="qmodal center"><div class="qcard picker"><div class="qbody"><h3>${title}</h3><p class="hint">${sub}</p>
      <div class="cat-grid">${CATS.map((c, i) => `<button class="cat-btn" style="--cc:${c.color};--ci:${c.ink}" data-act="pickCat" data-c="${i}">${c.name}</button>`).join('')}</div></div></div></div>`;
  });
}
ACT.pickCat = el => { if (!PICK || paused) return; const r = PICK.res; PICK = null; closeLayer(); sfx('tap'); r(+el.dataset.c); };
async function ownCategory(p, tok) {
  if (p.cpu) {
    let best = 0, bv = -1;
    for (let c = 0; c < 6; c++) { const v = cpuSkill(p, c) + Math.random() * 0.05; if (v > bv) { bv = v; best = c; } }
    toast(`${p.name} elige ${CATS[best].name}`); if (!await wait(1000, tok)) return null;
    return best;
  }
  return choosePicker('Elige categoría', `${p.emoji} ${esc(p.name)}, estás en el centro: decides tú.`);
}
async function finalCategory(p, tok) {
  const humanRivals = G.players.filter(x => x !== p && !x.cpu);
  if (humanRivals.length) {
    sfx('wedge');
    return choosePicker('Pregunta final', `${p.emoji} ${esc(p.name)} tiene los seis quesitos. Rivales: ${humanRivals.map(x => esc(x.name)).join(', ')}, elegid la categoría.`);
  }
  const prof = p.profileId ? getProfile(p.profileId) : null;
  const cat = prof ? weakestCats(prof)[0] : rnd(6);
  toast(`La CPU elige ${CATS[cat].name} para la pregunta final`, 2400);
  if (!await wait(1400, tok)) return null;
  return cat;
}
async function askQuestion(p, cat, ctx, tok) {
  const prof = !p.cpu && p.profileId ? getProfile(p.profileId) : null;
  const target = prof && G.adaptive ? targetDiff(catAcc(prof, cat)) : null;
  const q = pickQuestion(cat, { profile: prof, target, exclude: new Set(G.used) });
  G.used.push(q.id);
  const label = ctx.final ? 'Pregunta final' : ctx.hq ? (p.wedges[cat] ? 'Casilla de quesito' : 'Te juegas el quesito') : '';
  return poseQuestion({
    q, who: p, label, cpu: p.cpu ? cpuProb(p, q) : null, time: G.answerTime, mode: G.answerMode, host: $('#layer'),
    onSettle: ok => { p.n++; if (ok) p.ok++; if (prof) record(prof, q, ok); },
  });
}

/* Pausa y final de partida */
function openPause() {
  paused = true;
  $('#pause').innerHTML = `<div class="sheet-wrap"><div class="sheet"><h3>Partida en pausa</h3>
    <button class="btn" data-act="unpause">Seguir jugando</button>
    <button class="btn ghost" data-act="saveExit">Guardar y salir</button>
    <button class="btn ghost danger" data-act="abandon">Abandonar partida</button></div></div>`;
}
ACT.pause = () => { if (G && G.phase !== 'over') openPause(); };
ACT.unpause = () => { paused = false; $('#pause').innerHTML = ''; };
ACT.saveExit = () => { abortGame(); toast('Partida guardada. La tienes en «Continuar partida».', 2600); go('home'); };
ACT.abandon = () => { if (!confirm('¿Abandonar? La partida se perderá.')) return; Store.del('save'); abortGame(); go('home'); };
function applyResults(winner) {
  const changes = [];
  for (const p of G.players) {
    if (p.cpu || !p.profileId) continue;
    const prof = getProfile(p.profileId); if (!prof) continue;
    const won = p === winner; prof.games++; if (won) prof.wins++;
    if (G.mode !== 'solo') continue;
    prof.solo.games++; if (won) prof.solo.wins++;
    const before = prof.rating, cpus = G.players.filter(x => x.cpu);
    let delta = 0;
    for (const c of cpus) {
      const opp = c.cpu === 'adaptativo' ? prof.rating + prof.bias * 600 : LEVELS[c.cpu].elo;
      delta += (32 * ((won ? 1 : 0) - 1 / (1 + 10 ** ((opp - prof.rating) / 400)))) / cpus.length;
    }
    prof.rating = Math.round(prof.rating + delta);
    if (cpus.some(c => c.cpu === 'adaptativo')) prof.bias = clamp(prof.bias + (won ? 0.05 : -0.05), -0.25, 0.3);
    changes.push({ prof, before, after: prof.rating });
  }
  saveProfiles();
  return changes;
}
function finishGame(w) {
  G.phase = 'over'; Store.del('save');
  const changes = applyResults(w);
  sfx('win'); buzz([80, 60, 80, 60, 200]); confetti(); renderPlayers(); renderTokens(); renderPanel();
  const rows = G.players.map(p => `<div class="res-row">${tokenSVG(p, 30)}<b>${p.emoji} ${esc(p.name)}</b><small>${p.wedges.filter(Boolean).length} quesitos${p.n ? `, ${pct(p.ok, p.n)} % aciertos` : ''}</small></div>`).join('');
  const ch = changes.map(c => `<p class="rating-change">${c.prof.emoji} ${esc(c.prof.name)}: ${c.after} puntos (${c.after >= c.before ? '+' : ''}${c.after - c.before})</p>`).join('');
  $('#layer').innerHTML = `<div class="qmodal center"><div class="qcard win"><div class="qbody"><div class="win-emo">${w.emoji}</div>
    <h3>¡Gana ${esc(w.name)}!</h3>${rows}${ch}
    <div class="row2"><button class="btn" data-act="rematch">Revancha</button><button class="btn ghost" data-act="goHome">Inicio</button></div></div></div></div>`;
}
ACT.rematch = () => { const setup = G.setup; closeLayer(); G = null; newGame(setup); };
ACT.goHome = () => { closeLayer(); G = null; go('home'); };
function closeLayer() { const l = $('#layer'); if (l) l.innerHTML = ''; }

/* ───────────── Preguntas (partida y entrenamiento) ───────────── */
let QS = null;
function poseQuestion(o) {
  return new Promise(resolve => {
    const opts = shuffle([o.q.a, ...o.q.w]);
    QS = { o, opts, ci: opts.indexOf(o.q.a), resolve, done: false, iv: null, revealed: false };
    drawQuestion();
    if (o.cpu != null) cpuAnswer(QS);
    else if (o.time) startQTimer(QS);
  });
}
function drawQuestion() {
  const { o, opts } = QS, C = CATS[o.q.c], isCpu = o.cpu != null, classic = o.mode === 'classic' && !isCpu;
  const who = o.who ? `<p class="qwho">${o.who.emoji} ${isCpu ? `Responde ${esc(o.who.name)}` : `Te toca, ${esc(o.who.name)}`}</p>` : '';
  const card = `<div class="qcard ${o.inline ? 'inline' : ''}" style="--cc:${C.color};--ci:${C.ink}">
    <header class="qhead"><span>${C.name}</span>${o.label ? `<span class="qctx">${esc(o.label)}</span>` : ''}</header>
    <div class="qbody">${who}<p class="qtext">${esc(o.q.q)}</p>
      ${o.time && !isCpu ? '<div class="qtimer"><i id="qbar"></i></div>' : ''}
      <div class="qopts" id="qopts">${classic
        ? '<button class="btn reveal" data-act="reveal">Ver respuesta</button>'
        : opts.map((t, i) => `<button class="opt" data-act="answer" data-i="${i}" ${isCpu ? 'disabled' : ''}>${esc(t)}</button>`).join('')}</div>
      <div class="qfoot" id="qfoot">${isCpu ? `<p class="thinking">${esc(o.who.name)} está pensando…</p>` : ''}</div></div></div>`;
  o.host.innerHTML = o.inline ? card : `<div class="qmodal">${card}</div>`;
}
function startQTimer(S) {
  const total = S.o.time * 1000; let left = total, last = Date.now();
  S.iv = setInterval(() => {
    if (QS !== S || S.done || S.revealed) { clearInterval(S.iv); return; }
    const now = Date.now(); if (!paused) left -= now - last; last = now;
    const bar = $('#qbar'); if (bar) bar.style.width = Math.max(0, (left / total) * 100) + '%';
    if (left <= 0) { clearInterval(S.iv); settle(false, -1, '¡Se acabó el tiempo!'); }
  }, 100);
}
async function cpuAnswer(S) {
  await sleep(1300 + rnd(900)); while (paused) await sleep(150);
  if (QS !== S) return;
  const ok = Math.random() < S.o.cpu;
  const idx = ok ? S.ci : pick([0, 1, 2, 3].filter(i => i !== S.ci));
  document.querySelectorAll('#qopts .opt')[idx]?.classList.add('pick');
  await sleep(650); while (paused) await sleep(150);
  if (QS === S) settle(ok, idx);
}
ACT.answer = el => { if (!QS || QS.done || QS.o.cpu != null || paused) return; const i = +el.dataset.i; settle(i === QS.ci, i); };
ACT.reveal = () => {
  if (!QS || QS.done) return;
  QS.revealed = true; clearInterval(QS.iv);
  $('#qopts').innerHTML = `<div class="reveal-box"><small>La respuesta es</small><b>${esc(QS.o.q.a)}</b></div>
    <p class="hint">¿Lo habías dicho bien?</p>
    <div class="row2"><button class="btn ok" data-act="selfJudge" data-v="1">Acerté</button><button class="btn ko" data-act="selfJudge" data-v="0">Fallé</button></div>`;
};
ACT.selfJudge = el => { if (QS && !QS.done) settle(el.dataset.v === '1', null); };
function settle(ok, idx, msg) {
  const S = QS; if (!S || S.done) return;
  S.done = true; S.ok = ok; clearInterval(S.iv);
  document.querySelectorAll('#qopts .opt').forEach((b, i) => { b.disabled = true; b.classList.add(i === S.ci ? 'ok' : i === idx ? 'ko' : 'dim'); });
  if (S.revealed) $('#qopts').innerHTML = `<div class="reveal-box"><small>La respuesta es</small><b>${esc(S.o.q.a)}</b></div>`;
  sfx(ok ? 'ok' : 'ko'); buzz(ok ? 25 : [60, 40, 60]);
  S.o.onSettle?.(ok);
  const isCpu = S.o.cpu != null, name = S.o.who?.name;
  const text = msg || (ok ? (isCpu ? `${name} acierta` : pick(['¡Correcto!', '¡Muy bien!', '¡Exacto!', '¡Eso es!'])) : (isCpu ? `${name} falla` : 'Has fallado'));
  const foot = $('#qfoot');
  if (foot) foot.innerHTML = `<p class="verdict ${ok ? 'good' : 'bad'}">${esc(text)}</p>
    ${!ok && !S.revealed ? `<p class="answer-was">La respuesta correcta era <b>${esc(S.o.q.a)}</b>.</p>` : ''}
    ${isCpu ? '' : `<button class="btn" data-act="qnext">${S.o.cont || 'Continuar'}</button>`}`;
  if (isCpu) (async () => { await sleep(1900); while (paused) await sleep(150); if (QS === S) finishQ(); })();
}
ACT.qnext = () => { if (QS?.done && !paused) finishQ(); };
function finishQ() { const S = QS; QS = null; if (!S.o.inline) S.o.host.innerHTML = ''; S.resolve(S.ok); }
function abortQuestion() {
  if (QS) { clearInterval(QS.iv); const r = QS.resolve; QS = null; r(null); }
  if (PICK) { const r = PICK.res; PICK = null; r(null); }
}

/* ───────────── Entrenamiento ───────────── */
let T = null;
SCREENS.trainStart = () => {
  const p = activeProfile(), order = weakestCats(p), { n } = totals(p);
  return `<main class="screen">${topbar('Entrenamiento')}
    <p class="intro">Te pregunto sin parar lo que peor se te da. Lo que fallas vuelve a salir al poco rato; cuando aciertas una pregunta tres veces seguidas, queda dominada.</p>
    <button class="focus main" data-act="trainFocus" data-f="weak"><b>Mis puntos débiles</b><small>${n >= 10 ? `Sobre todo ${CATS[order[0]].name} y ${CATS[order[1]].name}` : 'Mezcla de todo hasta saber qué se te resiste'}</small></button>
    <p class="label">O elige una categoría</p>
    <div class="focus-grid">${CATS.map((c, i) => { const [m, t] = masteredCount(p, i), s = p.cat[i];
      return `<button class="focus" data-act="trainFocus" data-f="${i}" style="--c:${c.color}"><span class="wedge-ico"></span><b>${c.name}</b><small>${m} de ${t} dominadas${s.n ? `, ${pct(s.ok, s.n)} % de aciertos` : ''}</small></button>`; }).join('')}</div></main>`;
};
ACT.trainFocus = el => startTraining(el.dataset.f === 'weak' ? 'weak' : +el.dataset.f);
function startTraining(focus) {
  if (!activeProfile()) { go('newProfile'); return; }
  T = { focus, t: 0, queue: [], n: 0, ok: 0, streak: 0, newly: 0, lastId: null, token: ++TOKEN };
  go('training'); trainingLoop();
}
SCREENS.training = () => `<main class="screen training">
  <header class="topbar"><button class="back" data-act="trainEnd" aria-label="Terminar">‹</button><h2>Entrenamiento</h2><button class="link" data-act="trainEnd">Terminar</button></header>
  <div id="tstats"></div><div id="tq"></div></main>`;
function renderTStats() {
  const el = $('#tstats'); if (!el || !T) return;
  const p = activeProfile(), [m, t] = masteredCount(p, T.focus === 'weak' ? null : T.focus);
  el.innerHTML = `<div class="tprog"><div class="tprog-top"><b>${m} de ${t} dominadas</b><span>${T.focus === 'weak' ? 'Puntos débiles' : CATS[T.focus].name}</span></div>
    <div class="bar"><i style="width:${pct(m, t)}%"></i></div></div>
    <div class="tnums"><span><b>${T.n}</b> respondidas</span><span><b>${T.n ? pct(T.ok, T.n) : 0} %</b> aciertos</span><span><b>${T.streak}</b> de racha</span></div>`;
}
function weightedCat(p) {
  const w = CATS.map((_, c) => { const [m, t] = masteredCount(p, c); return (1 - catAcc(p, c)) ** 2 + 0.04 + (t ? (1 - m / t) * 0.15 : 0); });
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let c = 0; c < 6; c++) { r -= w[c]; if (r <= 0) return c; }
  return 5;
}
function nextTrainQ(p) {
  T.t++;
  const qi = T.queue.findIndex(x => x.due <= T.t && x.id !== T.lastId && BY_ID[x.id]);
  if (qi >= 0) { const it = T.queue.splice(qi, 1)[0]; return { q: BY_ID[it.id], kind: 'repaso' }; }
  const cat = T.focus === 'weak' ? weightedCat(p) : T.focus;
  const pool = BY_CAT[cat].filter(q => q.id !== T.lastId && !T.queue.some(x => x.id === q.id));
  const scored = pool.map(q => { const m = p.mem[q.id]; let s = Math.random() * 1.5;
    if (!m) s += 1; else if (m.box >= 3) s += 6 + m.box; else if (m.box > 0) s += 1.5 + m.box; return { s, q }; });
  scored.sort((a, b) => a.s - b.s);
  const q = scored[0]?.q || pick(BY_CAT[cat]), m = p.mem[q.id];
  return { q, kind: !m ? 'nueva' : m.box === 0 ? 'fallada' : m.box >= 3 ? 'dominada' : 'aprendiendo' };
}
const TRAIN_LABELS = { repaso: 'Vuelve una que fallaste', nueva: 'Pregunta nueva', fallada: 'Se te resistió', aprendiendo: 'Ya casi la dominas', dominada: 'Repaso de una dominada' };
async function trainingLoop() {
  const tok = T.token, p = activeProfile();
  while (T && T.token === tok) {
    const { q, kind } = nextTrainQ(p); T.lastId = q.id; renderTStats();
    const before = p.mem[q.id]?.box || 0;
    const ok = await poseQuestion({
      q, who: null, label: TRAIN_LABELS[kind], cpu: null, time: settings.answerTime, mode: settings.answerMode, host: $('#tq'), inline: true, cont: 'Siguiente',
      onSettle: good => {
        record(p, q, good); T.n++;
        if (good) { T.ok++; T.streak++; } else T.streak = 0;
        const after = p.mem[q.id].box;
        if (before < 3 && after >= 3) { T.newly++; toast('¡Pregunta dominada!'); }
        if (!good) T.queue.push({ id: q.id, due: T.t + 3 });
        else if (after < 3 && (kind === 'repaso' || kind === 'fallada')) T.queue.push({ id: q.id, due: T.t + 6 + rnd(3) });
        renderTStats();
      },
    });
    if (ok == null || !T || T.token !== tok) return;
  }
}
function endTraining() {
  if (!T) return;
  const sum = { focus: T.focus, n: T.n, ok: T.ok, newly: T.newly };
  T.token = -1; abortQuestion(); T = null;
  go('trainSummary', sum);
}
ACT.trainEnd = () => endTraining();
SCREENS.trainSummary = s => {
  const p = activeProfile(), [m, t] = masteredCount(p), weak = weakestCats(p).slice(0, 2);
  return `<main class="screen">${topbar('Buen entrenamiento')}
    <div class="kpis three">${kpi(s.n, 'respondidas')}${kpi(s.n ? pct(s.ok, s.n) + ' %' : '–', 'aciertos')}${kpi(s.newly, 'nuevas dominadas')}</div>
    <p class="plain">En total dominas ${m} de ${t} preguntas. Lo que más se te resiste ahora: ${CATS[weak[0]].name} y ${CATS[weak[1]].name}.</p>
    <button class="btn" data-act="trainAgain" data-f="${s.focus}">Seguir entrenando</button>
    <button class="btn ghost" data-act="go" data-to="home">Volver al inicio</button></main>`;
};
ACT.trainAgain = el => startTraining(el.dataset.f === 'weak' ? 'weak' : +el.dataset.f);

/* ───────────── Arranque ───────────── */
function onClick(e) { const el = e.target.closest('[data-act]'); if (!el || el.disabled) return; ACT[el.dataset.act]?.(el, e); }
function onChange(e) {
  const el = e.target, k = el.dataset.ch; if (!k) return;
  if (k === 'setting') { settings[el.dataset.k] = el.checked; saveSettings(); if (el.checked && el.dataset.k === 'vibrate') buzz(30); if (el.checked && el.dataset.k === 'sound') sfx('ok'); }
  else if (k === 'ptype') { const i = +el.dataset.i; MS.players[i] = el.value === 'human' ? { type: 'human', profileId: '', name: '' } : { type: 'cpu', level: el.value.split(':')[1] }; render(); }
  else if (k === 'pprof') { MS.players[+el.dataset.i].profileId = el.value; render(); }
  else if (k === 'madapt') MS.adaptive = el.checked;
  else if (k === 'packFile') {
    const file = el.files?.[0]; if (!file) return;
    const r = new FileReader(); r.onload = () => { const res = importPack(String(r.result)); showImport(res); if (res.ok) render(); }; r.readAsText(file);
  }
}
function onInput(e) { const el = e.target; if (el.dataset.in === 'pname' && MS) MS.players[+el.dataset.i].name = el.value; }
function init() {
  buildBank(); BOARD_STATIC = boardStatic();
  document.addEventListener('click', onClick); document.addEventListener('change', onChange); document.addEventListener('input', onInput);
  if (!profiles.length) screen = 'newProfile';
  if (activeId && !getProfile(activeId)) setActive(profiles[0]?.id || null);
  render();
}
init();
