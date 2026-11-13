'use strict';
/* Quesitos online: cada jugador en su móvil, conectados con Firebase Realtime Database.
   El móvil que crea la sala (anfitrión) ejecuta la partida y publica el estado en salas/CÓDIGO/estado.
   Los demás dibujan ese estado y mandan sus jugadas a salas/CÓDIGO/acciones. */

const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const arr = x => (Array.isArray(x) ? x : x && typeof x === 'object' ? Object.keys(x).sort((a, b) => a - b).map(k => x[k]) : []);
function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar ' + src));
    document.head.appendChild(s);
  });
}
function firebaseCfg() {
  const c = window.FIREBASE_CONFIG;
  return c && c.apiKey && !/PEGA/i.test(c.apiKey) && c.databaseURL && !/PEGA/i.test(c.databaseURL) ? c : null;
}
function netErrorText(e) {
  const m = String(e?.code || e?.message || e);
  if (/sin-config/.test(m)) return 'Falta configurar Firebase en la app.';
  if (/operation-not-allowed|admin-restricted/.test(m)) return 'Activa el acceso «Anónimo» en Firebase (Authentication).';
  if (/PERMISSION_DENIED|permission/i.test(m)) return 'Firebase no deja leer o escribir: revisa las reglas de la base de datos.';
  if (/network|offline|timeout/i.test(m)) return 'No hay conexión a internet.';
  return 'No se ha podido conectar: ' + m;
}
const withTimeout = (p, ms = 12000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

/* Capa fina sobre Firebase (en las pruebas se sustituye por una simulación) */
const Net = {
  ok: false, uid: null, db: null,
  async init() {
    if (Net.ok) return;
    if (window.__NET_MOCK) { Object.assign(Net, window.__NET_MOCK); await Net.init(); return; }
    const cfg = firebaseCfg(); if (!cfg) throw new Error('sin-config');
    for (const f of ['firebase-app-compat.js', 'firebase-auth-compat.js', 'firebase-database-compat.js']) await loadScript('vendor/' + f);
    if (!firebase.apps.length) firebase.initializeApp(cfg);
    const auth = firebase.auth();
    let user = await new Promise(r => { const u = auth.onAuthStateChanged(x => { u(); r(x); }); });
    if (!user) user = (await auth.signInAnonymously()).user;
    Net.uid = user.uid; Net.db = firebase.database(); Net.ok = true;
  },
  async get(p) { return (await Net.db.ref(p).get()).val(); },
  set: (p, v) => Net.db.ref(p).set(v),
  update: (p, v) => Net.db.ref(p).update(v),
  remove: p => Net.db.ref(p).remove(),
  push: (p, v) => Net.db.ref(p).push(v),
  watch(p, cb) { const r = Net.db.ref(p), h = s => cb(s.val()); r.on('value', h); return () => r.off('value', h); },
  onChild(p, cb) { const r = Net.db.ref(p), h = s => cb(s.key, s.val()); r.on('child_added', h); return () => r.off('child_added', h); },
  onDisconnect: (p, v) => Net.db.ref(p).onDisconnect().update(v),
  cancelDisconnect: p => Net.db.ref(p).onDisconnect().cancel(),
  onDisconnectRemove: p => Net.db.ref(p).onDisconnect().remove(),
  onConnected(cb) { const r = Net.db.ref('.info/connected'), h = s => cb(!!s.val()); r.on('value', h); return () => r.off('value', h); },
};

const Online = {
  uid: null, code: null, role: null, room: null, unsubs: [], pub: false, lastState: null,
  seenToast: '', lastQV: null, recorded: new Set(), appliedGame: null, winShown: false, hostLost: false, qIv: null, busy: false,

  async connect() {
    if (this.busy) throw new Error('busy');
    this.busy = true;
    try { if (!Net.ok) toast('Conectando…', 1500); await withTimeout(Net.init()); this.uid = Net.uid; }
    finally { this.busy = false; }
  },
  async create(mode, publica = false) {
    await this.connect();
    let code = '';
    for (let i = 0; i < 8; i++) {
      code = Array.from({ length: 4 }, () => ROOM_CHARS[rnd(ROOM_CHARS.length)]).join('');
      if (!(await withTimeout(Net.get(`salas/${code}/host`)))) break;
    }
    const p = activeProfile();
    await withTimeout(Net.set(`salas/${code}`, {
      host: this.uid, mode, status: 'lobby', created: Date.now(), hostConectado: true, publica,
      jugadores: { [this.uid]: { name: p.name, emoji: p.emoji, orden: 0, conectado: true } },
    }));
    if (publica) {
      await withTimeout(Net.set(`publicas/${code}`, { mode, creado: Date.now(), n: 1, host: this.uid }));
      Net.onDisconnectRemove(`publicas/${code}`);
    }
    this.enter(code, 'host'); go('lobby');
  },
  async join(raw, quiet = false) {
    const say = m => { if (!quiet) toast(m, 3000); return false; };
    const code = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 4) return say('El código tiene 4 letras o números');
    await this.connect();
    const r = await withTimeout(Net.get(`salas/${code}`));
    if (!r) return say(`No hay ninguna sala con el código ${code}`);
    if (r.status === 'cerrada') return say('Esa sala ya está cerrada');
    if (r.host === this.uid) return say('Eras el anfitrión de esa sala y ya no sigue abierta: crea una nueva');
    const me = r.jugadores?.[this.uid];
    if (r.status === 'playing' && !me) return say('Esa partida ya ha empezado');
    if (r.status === 'lobby' && !me && Object.keys(r.jugadores || {}).length + arr(r.cpus).length >= 6) return say('La sala está llena');
    if (quiet && r.hostConectado === false) return false;
    const p = activeProfile();
    await withTimeout(Net.update(`salas/${code}/jugadores/${this.uid}`, { name: p.name, emoji: p.emoji, orden: me?.orden ?? Date.now(), conectado: true }));
    this.enter(code, 'guest'); go('lobby');
    if (me && r.status === 'playing') toast('¡Has vuelto a la partida!');
    return true;
  },
  // Emparejamiento: entra en la sala pública más antigua que tenga sitio, o crea una
  async quickMatch(mode) {
    await this.connect();
    const list = (await withTimeout(Net.get('publicas'))) || {}, now = Date.now();
    const cands = Object.entries(list)
      .filter(([, r]) => r && r.mode === mode && r.host !== this.uid && (r.n || 1) < 6 && now - (r.creado || 0) < 20 * 60e3)
      .sort((a, b) => (a[1].creado || 0) - (b[1].creado || 0));
    for (const [code] of cands) {
      try { if (await this.join(code, true)) { toast('¡Partida encontrada!'); return; } } catch (e) { /* probar la siguiente */ }
    }
    await this.create(mode, true);
    toast('Esperando a que se una alguien…', 2600);
  },
  enter(code, role) {
    this.stopWatching();
    Object.assign(this, { code, role, room: {}, lastState: null, seenToast: '', lastQV: null, winShown: false, hostLost: false });
    const base = `salas/${code}`;
    const presPath = role === 'host' ? base : `${base}/jugadores/${this.uid}`;
    const field = role === 'host' ? 'hostConectado' : 'conectado';
    this.unsubs.push(Net.onConnected(c => {
      if (!c || this.code !== code) return;
      Net.onDisconnect(presPath, { [field]: false });
      Net.update(presPath, { [field]: true });
    }));
    clearInterval(this.lobbyIv);
    this.lobbyIv = setInterval(() => this.lobbyTick(), 500);
    for (const k of ['host', 'mode', 'status', 'cpus', 'jugadores', 'hostConectado', 'publica', 'inicioEn']) {
      this.unsubs.push(Net.watch(`${base}/${k}`, v => { if (this.code !== code) return; this.room[k] = v; this.onRoom(k); }));
    }
    if (role === 'host') this.unsubs.push(Net.onChild(`${base}/acciones`, (key, a) => { Net.remove(`${base}/acciones/${key}`); remoteAction(a); }));
    else this.unsubs.push(Net.watch(`${base}/estado`, s => { if (this.code === code) this.applyState(s); }));
  },
  stopWatching() { this.unsubs.forEach(u => { try { u(); } catch (e) { /* nada */ } }); this.unsubs = []; clearInterval(this.qIv); clearInterval(this.lobbyIv); },
  humansInLobby() { return Object.values(this.room?.jugadores || {}).filter(j => j.conectado !== false).length; },
  // Salas públicas: el anfitrión mantiene la lista al día y la partida empieza sola 20 s después de juntarse 2 personas
  publicBookkeeping() {
    const r = this.room;
    if (this.role !== 'host' || !r.publica || r.status !== 'lobby') return;
    const n = Object.keys(r.jugadores || {}).length + arr(r.cpus).length, humans = this.humansInLobby();
    Net.update(`publicas/${this.code}`, { n }).catch(() => {});
    if (humans >= 2 && !r.inicioEn) Net.update(`salas/${this.code}`, { inicioEn: Date.now() + 20000 });
    else if (humans < 2 && r.inicioEn) Net.update(`salas/${this.code}`, { inicioEn: null });
  },
  lobbyTick() {
    const r = this.room; if (!r || r.status !== 'lobby') return;
    const el = $('#countdown');
    if (el && r.inicioEn) el.textContent = String(clamp(Math.ceil((r.inicioEn - Date.now()) / 1000), 0, 20));
    if (this.role === 'host' && r.publica && r.inicioEn && Date.now() >= r.inicioEn && this.humansInLobby() >= 2 && !this.starting) { this.starting = true; ACT.startOnline(); }
  },
  onRoom(k) {
    const r = this.room;
    if (k === 'status' && this.role === 'guest') {
      if (r.status === 'cerrada') { toast(r.publica ? 'El anfitrión se ha ido. Busca otra partida.' : 'El anfitrión ha cerrado la sala', 2800); this.leave(true); return; }
      if (r.status === 'playing' && this.lastState) this.applyState(this.lastState);
    }
    if (k === 'hostConectado' && this.role === 'guest') this.hostBanner(r.hostConectado === false && r.status === 'playing');
    if (k === 'jugadores' && this.role === 'host' && G?.online && G.phase !== 'over') this.syncPresence();
    if (k === 'jugadores' || k === 'cpus') this.publicBookkeeping();
    if (screen === 'lobby') render();
  },
  hostBanner(show) {
    if (show === this.hostLost) return;
    this.hostLost = show;
    $('#pause').innerHTML = show ? `<div class="sheet-wrap"><div class="sheet"><h3>Sin conexión con el anfitrión</h3>
      <p class="hint">La partida sigue en cuanto vuelva a conectarse. Si ha cerrado la app, la partida se ha perdido.</p>
      <p class="thinking">Esperando…</p><button class="btn ghost danger" data-act="leaveRoom">Salir de la sala</button></div></div>` : '';
  },
  // Anfitrión: quien se desconecta pasa a jugar como CPU hasta que vuelve
  syncPresence() {
    const js = this.room.jugadores || {};
    G.players.forEach((p, i) => {
      if (p.cpu || p.owner === this.uid) return;
      const j = js[p.owner], away = !j || j.conectado === false;
      if (away === !!p.away) return;
      p.away = away;
      gameToast(away ? `${p.name} se ha desconectado: la CPU juega por su ficha hasta que vuelva` : `${p.name} ha vuelto`, 2800);
      renderPlayers(); renderPanel();
      if (away) awayFallback(i);
    });
  },

  /* Anfitrión: publicar el estado (como mucho una escritura por vuelta del bucle de eventos) */
  publish() {
    if (this.pub) return;
    this.pub = true;
    Promise.resolve().then(() => {
      this.pub = false;
      if (!isHost() || G.online.code !== this.code) return;
      Net.set(`salas/${this.code}/estado`, this.snapshot()).catch(e => console.warn('publish', e));
    });
  },
  snapshot() {
    const s = {
      gameId: G.gameId, mode: G.mode, turn: G.turn, phase: G.phase, die: G.die || 0, rollTime: G.rollTime, rollLeft: G.rollLeft || 0,
      waitRoll: !!G.waitRoll, destIds: G.destIds || [], destsOpen: !!G.destsOpen, answerMode: G.answerMode,
      qv: G.qv || null, picker: G.picker || null, toast: G.toast || null, winnerIdx: G.winnerIdx ?? null,
      players: G.players.map(p => ({ name: p.name, emoji: p.emoji, color: p.color, pos: p.pos, wedges: p.wedges, cpu: p.cpu || null, owner: p.owner || null, away: !!p.away, n: p.n, ok: p.ok })),
    };
    return JSON.parse(JSON.stringify(s));
  },

  /* Invitado: dibujar el estado que llega del anfitrión */
  applyState(s) {
    this.lastState = s;
    if (!s || this.role !== 'guest' || this.room?.status !== 'playing') return;
    const newGame = !G || G.gameId !== s.gameId, prevTurn = G?.turn;
    const players = arr(s.players).map(p => ({ ...p, wedges: [0, 1, 2, 3, 4, 5].map(i => !!arr(p.wedges)[i]), profileId: p.owner === this.uid ? activeId : null, n: p.n || 0, ok: p.ok || 0 }));
    G = { ...s, players, destIds: arr(s.destIds), winnerIdx: s.winnerIdx ?? null, online: { role: 'guest', code: this.code }, token: -1 };
    if (G.qv) G.qv.opts = arr(G.qv.opts);
    if (G.picker) G.picker.pickers = arr(G.picker.pickers);
    if (newGame) { this.lastQV = null; this.winShown = false; closeLayer(); }
    if (screen !== 'game') go('game'); else { renderPlayers(); renderTokens(); renderPanel(); renderHL(G.destIds); }
    if (!newGame && prevTurn !== G.turn && isMine(cur())) { toast('¡Te toca!'); buzz([40, 40, 40]); sfx('tap'); }
    const tid = G.toast ? `${G.gameId}:${G.toast.id}` : '';
    if (tid && tid !== this.seenToast) { this.seenToast = tid; if (!(isMine(cur()) && /^Turno de/.test(G.toast.msg))) toast(G.toast.msg, G.toast.ms); }
    this.overlays();
  },
  overlays() {
    if (G.winnerIdx != null) {
      if (!this.winShown) {
        this.winShown = true;
        let ch = [];
        if (this.appliedGame !== G.gameId) { this.appliedGame = G.gameId; ch = applyResults(G.players[G.winnerIdx]); sfx('win'); confetti(); }
        drawWin(ch);
      }
      return;
    }
    this.winShown = false;
    const qv = G.qv, L = this.lastQV;
    if (qv) {
      const changed = !L || L.id !== qv.id || L.state !== qv.state || L.revealed !== qv.revealed || L.pick !== qv.pick || L.bot !== qv.bot;
      if (changed) {
        drawQ(qv);
        if ((!L || L.id !== qv.id) && qv.time && !qv.bot && qv.state === 'asking') this.guestTimer(qv);
        if (qv.state === 'done' && (!L || L.id !== qv.id || L.state !== 'done')) { sfx(qv.ok ? 'ok' : 'ko'); this.recordMine(qv); }
      }
      this.lastQV = { ...qv };
      return;
    }
    this.lastQV = null;
    if (G.picker) { drawPicker(G.picker); return; }
    closeLayer();
  },
  guestTimer(qv) {
    const total = qv.time * 1000, start = Date.now();
    clearInterval(this.qIv);
    this.qIv = setInterval(() => {
      const L = G?.qv;
      if (!L || L.id !== qv.id || L.state !== 'asking' || L.revealed || L.bot) { clearInterval(this.qIv); return; }
      const bar = $('#qbar'); if (bar) bar.style.width = Math.max(0, 100 - ((Date.now() - start) / total) * 100) + '%';
    }, 100);
  },
  recordMine(qv) {
    if (qv.whoIdx == null || qv.bot || this.recorded.has(qv.id)) return;
    const p = G.players[qv.whoIdx]; if (!isMine(p)) return;
    this.recorded.add(qv.id);
    const prof = activeProfile(); if (prof) record(prof, { id: qv.qid, c: qv.c, d: qv.d }, !!qv.ok);
    if (qv.ok) buzz(25); else buzz([60, 40, 60]);
  },
  send(a) {
    if (!this.code) return;
    Net.push(`salas/${this.code}/acciones`, { ...a, uid: this.uid, t: Date.now() }).catch(() => toast('No se ha podido enviar la jugada. ¿Hay conexión?'));
  },

  leave(fromRemote = false) {
    const { code, role, uid } = this, status = this.room?.status;
    this.stopWatching();
    Object.assign(this, { code: null, role: null, room: null, lastState: null, lastQV: null, hostLost: false, starting: false });
    if (code) {
      if (role === 'host') {
        Net.cancelDisconnect(`salas/${code}`).catch(() => {});
        Net.remove(`publicas/${code}`).catch(() => {});
        if (!fromRemote) Net.update(`salas/${code}`, { status: 'cerrada', hostConectado: false }).catch(() => {});
      } else {
        const me = `salas/${code}/jugadores/${uid}`;
        Net.cancelDisconnect(me).catch(() => {});
        (status === 'lobby' ? Net.remove(me) : Net.update(me, { conectado: false })).catch(() => {});
      }
    }
    if (G?.online) { if (role === 'host') abortGame(); else G = null; }
    closeLayer(); $('#pause').innerHTML = '';
    go('home');
  },
};

/* ───────────── Pantallas ───────────── */
const OS = { mode: 'normal', code: '' };
const webUrl = () => {
  const w = String(window.QUESITOS_WEB || '').trim();
  if (w) return w.endsWith('/') ? w : w + '/';
  if (/^https?:$/.test(location.protocol) && !window.Capacitor && location.hostname !== 'localhost') return location.origin + location.pathname.replace(/[^/]*$/, '');
  return '';
};
SCREENS.online = () => {
  if (!firebaseCfg() && !window.__NET_MOCK) {
    return `<main class="screen">${topbar('Jugar online')}
      <p class="intro">Para jugar cada uno desde su móvil, la app tiene que estar conectada a tu proyecto gratuito de Firebase. Solo hay que hacerlo una vez.</p>
      <p class="plain">Sigue los pasos del archivo <b>LEEME-ONLINE.md</b> del proyecto: crear el proyecto en Firebase, pegar tus datos en <b>www/firebase-config.js</b> y subir el cambio a GitHub.</p>
      <p class="hint">La siguiente versión del APK y de la web ya vendrán preparadas para jugar online.</p></main>`;
  }
  const chips = act => `<div class="chips">${['normal', 'larga'].map(m => `<button class="chip ${OS.mode === m ? 'on' : ''}" data-act="${act}" data-m="${m}">${m === 'normal' ? 'Normal, 30 s para tirar' : 'Larga, sin reloj'}</button>`).join('')}</div>`;
  return `<main class="screen">${topbar('Jugar online')}
    <p class="intro">Cada uno juega desde su móvil, da igual que sea Android o iPhone.</p>
    <p class="label">Con cualquiera</p>
    <p class="plain">Te emparejamos con otras personas que estén buscando partida. Empieza sola en cuanto haya al menos dos.</p>
    ${chips('onlineMode')}
    <button class="btn" data-act="quickMatch">Buscar partida</button>
    <p class="label">Con tus amigos</p>
    <p class="plain">Crea una sala privada y pásales el código o el enlace.</p>
    <button class="btn ghost" data-act="createRoom">Crear sala privada</button>
    <input id="roomCode" class="code-input" maxlength="4" placeholder="CÓDIGO" value="${esc(OS.code)}" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Código de la sala">
    <button class="btn ghost" data-act="joinRoom">Unirse con código</button></main>`;
};
ACT.onlineMode = el => { OS.code = $('#roomCode')?.value || OS.code; OS.mode = el.dataset.m; sfx('tap'); render(); };
const netTry = fn => async () => { try { await fn(); } catch (e) { if (e.message !== 'busy') toast(netErrorText(e), 3500); } };
ACT.quickMatch = netTry(() => Online.quickMatch(OS.mode));
ACT.createRoom = netTry(() => Online.create(OS.mode, false));
ACT.joinRoom = netTry(() => Online.join($('#roomCode')?.value));

SCREENS.lobby = () => {
  const r = Online.room || {}, host = Online.role === 'host';
  const js = Object.entries(r.jugadores || {}).map(([uid, j]) => ({ uid, ...j })).sort((a, b) => (a.orden || 0) - (b.orden || 0));
  const cpus = arr(r.cpus), n = js.length + cpus.length;
  const hostName = r.jugadores?.[r.host]?.name || 'el anfitrión';
  const tags = j => [j.uid === r.host ? 'anfitrión' : '', j.uid === Online.uid ? 'tú' : '', j.conectado === false ? 'desconectado' : ''].filter(Boolean).join(', ');
  return `<main class="screen">
    <header class="topbar"><button class="back" data-act="leaveRoom" aria-label="Salir de la sala">‹</button><h2>Sala online</h2></header>
    ${r.publica
      ? `<div class="room-code public"><small>Partida pública</small>${r.inicioEn
          ? `<b class="count"><span id="countdown">${clamp(Math.ceil((r.inicioEn - Date.now()) / 1000), 0, 20)}</span></b><small>segundos para empezar</small>`
          : '<b class="count searching">…</b><small>Buscando más jugadores</small>'}</div>
         <p class="hint center">${r.inicioEn ? 'Si entra alguien más antes de que acabe la cuenta, también jugará.' : 'En cuanto se una otra persona, la partida empezará sola.'}</p>`
      : `<div class="room-code"><small>Código de la sala</small><b>${Online.code || ''}</b>${host ? '<button class="chip" data-act="shareCode">Invitar</button>' : ''}</div>
         ${host ? '<p class="hint center">Tus amigos pueden abrir el enlace de la invitación o escribir este código en «Jugar online».</p>' : ''}`}
    <p class="label">Modo</p>
    ${host && !r.publica ? `<div class="chips">${['normal', 'larga'].map(m => `<button class="chip ${r.mode === m ? 'on' : ''}" data-act="roomMode" data-m="${m}">${MODES[m]}</button>`).join('')}</div>`
           : `<p class="plain">${MODES[r.mode] || ''}${r.mode === 'normal' ? ': 30 segundos para tirar el dado' : r.mode === 'larga' ? ': sin reloj' : ''}</p>`}
    <p class="label">Jugadores (${n} de 6)</p>
    <div class="lobby-list">
      ${js.map(j => `<div class="lob-row ${j.conectado === false ? 'off' : ''}"><span class="emo">${j.emoji}</span><b>${esc(j.name)}</b><small>${tags(j)}</small></div>`).join('')}
      ${cpus.map((l, i) => `<div class="lob-row"><span class="emo">🤖</span><b>CPU ${(LEVELS[l]?.name || '').toLowerCase()}</b>${host ? `<button class="icon-btn" data-act="removeCpu" data-i="${i}" aria-label="Quitar CPU">✕</button>` : ''}</div>`).join('')}
    </div>
    ${host && n < 6 ? `<p class="label">Añadir CPU</p><div class="chips">${['facil', 'normal', 'dificil', 'experto'].map(l => `<button class="chip" data-act="addCpu" data-l="${l}">${LEVELS[l].name}</button>`).join('')}</div>` : ''}
    ${host ? `<button class="btn" data-act="startOnline" ${n < 2 ? 'disabled' : ''}>${n < 2 ? 'Esperando jugadores…' : r.publica ? 'Empezar ya' : 'Empezar partida'}</button>`
           : `<p class="waiting thinking">${r.publica ? 'La partida empezará sola en unos segundos…' : `Esperando a que ${esc(hostName)} empiece la partida…`}</p>`}
  </main>`;
};
ACT.leaveRoom = () => {
  if (Online.role === 'host' && G?.online && G.phase !== 'over' && !confirm('¿Cerrar la sala? La partida terminará para todos.')) return;
  Online.leave();
};
ACT.roomMode = el => { if (Online.role === 'host') Net.update(`salas/${Online.code}`, { mode: el.dataset.m }); };
ACT.addCpu = el => {
  const r = Online.room || {}, cpus = arr(r.cpus);
  if (Object.keys(r.jugadores || {}).length + cpus.length >= 6) return;
  Net.set(`salas/${Online.code}/cpus`, [...cpus, el.dataset.l]); sfx('tap');
};
ACT.removeCpu = el => { const cpus = arr(Online.room?.cpus); cpus.splice(+el.dataset.i, 1); Net.set(`salas/${Online.code}/cpus`, cpus.length ? cpus : null); };
ACT.shareCode = () => {
  const web = webUrl();
  const text = web
    ? `¡Juega conmigo a Quesitos! Entra aquí (Android o iPhone): ${web}?sala=${Online.code}  o escribe el código ${Online.code} en «Online»`
    : `¡Juega conmigo a Quesitos! Entra en «Online» y escribe el código ${Online.code}`;
  if (navigator.share) navigator.share({ text }).catch(() => {});
  else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast('Mensaje copiado: pégalo en WhatsApp'), () => toast(`El código es ${Online.code}`));
  else toast(`El código es ${Online.code}`);
};
ACT.startOnline = () => {
  const r = Online.room || {};
  const js = Object.entries(r.jugadores || {}).map(([uid, j]) => ({ uid, ...j })).filter(j => j.conectado !== false).sort((a, b) => (a.orden || 0) - (b.orden || 0));
  const cpus = arr(r.cpus);
  if (js.length + cpus.length < 2) { toast('Hacen falta al menos 2 jugadores'); return; }
  const names = shuffle(CPU_NAMES), emos = shuffle(CPU_EMOJIS);
  const players = [
    ...js.map(j => ({ owner: j.uid, name: j.name, emoji: j.emoji, cpu: null, profileId: j.uid === Online.uid ? activeId : null })),
    ...cpus.map((l, i) => ({ owner: Online.uid, name: names[i], emoji: emos[i], cpu: l, profileId: null })),
  ];
  Net.update(`salas/${Online.code}`, { status: 'playing', inicioEn: null });
  Net.remove(`publicas/${Online.code}`).catch(() => {});
  newGame({ mode: r.mode || 'normal', players, adaptive: false, online: { role: 'host', code: Online.code } });
};

/* ───────────── Enlaces de invitación y web instalable (iPhone y Android) ───────────── */
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; if (screen === 'home') render(); });
function installHint() {
  if (window.Capacitor || Store.get('hideInstall', false) || !/^https?:$/.test(location.protocol)) return '';
  if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) return '';
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) return `<div class="install"><p><b>Tenla como una app:</b> en Safari pulsa el botón Compartir (el cuadrado con la flecha) y luego «Añadir a pantalla de inicio».</p><button class="icon-btn" data-act="hideInstall" aria-label="Cerrar aviso">✕</button></div>`;
  if (deferredInstall) return `<div class="install"><p><b>Instala Quesitos</b> para abrirla como una app más.</p><button class="chip on" data-act="doInstall">Instalar</button><button class="icon-btn" data-act="hideInstall" aria-label="Cerrar aviso">✕</button></div>`;
  return '';
}
ACT.hideInstall = () => { Store.set('hideInstall', true); render(); };
ACT.doInstall = async () => { if (!deferredInstall) return; deferredInstall.prompt(); try { await deferredInstall.userChoice; } catch (e) { /* nada */ } deferredInstall = null; render(); };
(function () {
  const m = /[?&]sala=([A-Za-z0-9]{4})/.exec(location.search);
  if (m) { OS.code = m[1].toUpperCase(); try { history.replaceState(null, '', location.pathname); } catch (e) { /* nada */ } }
  window.addEventListener('DOMContentLoaded', () => {
    if (!OS.code) return;
    if (activeProfile()) { go('online'); toast(`Pulsa «Unirse con código» para entrar en la sala ${OS.code}`, 3500); }
    else NP.next = 'online';
  });
  if ('serviceWorker' in navigator && !window.Capacitor && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
