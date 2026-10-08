/* Albritton's Pick Em's — ESPN scores + Firebase (name + phone number, no Google sign-in) */
(function () {
'use strict';
const CFG = window.PICKEM_CONFIG || {};
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
const WEEKS = 18; // regular season
const LIVE_MS = 30 * 1000; // refresh while games are on
const IDLE_MS = 5 * 60 * 1000; // refresh otherwise
// Keep the same in firestore.rules.
const ADMIN_EMAIL = String(CFG.commissioner || 'blakealbritton6@gmail.com').toLowerCase();
// Players log in with name + phone number. Behind the scenes that's a Firebase
// email/password account on this made-up domain (no email is ever sent).
const PLAYER_DOMAIN = 'players.albritton-pickem.app';

const S = {
  user: null, admin: false, players: {}, status: {}, docs: [], // docs: this season's pick sheets
  season: null, curWeek: null, week: null,
  sb: {}, // week -> games[]
  tab: 'picks', boardView: 'week', updated: 0, ready: false, busy: false,
};
try { S.tab = localStorage.getItem('ape:tab') === 'board' ? 'board' : 'picks'; } catch (e) {}

/* ---------------- header bits ---------------- */
const venmo = String(CFG.venmo || 'Blakealbritton6').replace(/^@/, '');
const fee = CFG.entryFee || '';
$('venmoTag').textContent = '@' + venmo;
$('venmoLink').href = 'https://venmo.com/u/' + encodeURIComponent(venmo);
$('fee').textContent = fee;
const feeAmt = (fee.match(/\$\s?\d+(\.\d\d)?/) || [''])[0];

document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
function setTab(t) {
  S.tab = t;
  try { localStorage.setItem('ape:tab', t); } catch (e) {}
  render();
}
$('prevWk').addEventListener('click', () => goWeek(S.week - 1));
$('nextWk').addEventListener('click', () => goWeek(S.week + 1));
async function goWeek(w) {
  if (w < 1 || w > WEEKS) return;
  S.week = w;
  render();
  await loadWeek(w, true);
  render();
}

let toastT;
const why = (e) => (e && e.code ? ' (' + String(e.code).replace(/^(auth|firestore)\//, '') + ')' : '');
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3200);
}

/* ---------------- Firebase ---------------- */
const fbOn = !!(CFG.firebase && CFG.firebase.apiKey && !/PASTE/.test(CFG.firebase.apiKey) && window.firebase);
let auth = null, db = null, FV = null, seasonUnsub = null, statusUnsub = null;
if (fbOn) {
  firebase.initializeApp(CFG.firebase);
  auth = firebase.auth();
  db = firebase.firestore();
  FV = firebase.firestore.FieldValue;
  auth.onAuthStateChanged((u) => {
    const email = u && u.email ? u.email.toLowerCase() : '';
    S.admin = !!(u && email === ADMIN_EMAIL && u.emailVerified);
    S.user = u && email.endsWith('@' + PLAYER_DOMAIN) ? u : null;
    render();
  });
  db.collection('players').onSnapshot((snap) => {
    S.players = {};
    snap.forEach((d) => { S.players[d.id] = d.data(); });
    render();
  }, (e) => console.warn('players', e));
}
function subscribeSeason() {
  if (!fbOn || seasonUnsub || !S.season) return;
  seasonUnsub = db.collection('picks').where('season', '==', S.season).onSnapshot((snap) => {
    S.docs = snap.docs.map((d) => parseSheet(d.data({ serverTimestamps: 'estimate' })));
    render();
  }, (e) => { console.warn('picks', e); });
  // Commissioner's paid / removed marks, one doc per player per week: "<season>-<week>_<uid>".
  statusUnsub = db.collection('status').where('season', '==', S.season).onSnapshot((snap) => {
    S.status = {};
    snap.forEach((d) => { S.status[d.id] = d.data(); });
    render();
  }, (e) => { console.warn('status', e); });
}
// A pick sheet is one doc per player per week: g_<gameId> = team, at_<gameId> = server time of that pick.
function parseSheet(d) {
  const picks = {};
  Object.keys(d).forEach((k) => {
    if (k.startsWith('g_')) {
      const id = k.slice(2);
      picks[id] = { team: d[k], at: tsMs(d['at_' + id]) };
    }
  });
  return { uid: d.uid, week: d.week, season: d.season, picks, tb: typeof d.tb === 'number' ? d.tb : null, tbAt: tsMs(d.at_tb), paid: d.paid === true };
}
const tsMs = (t) => (t && t.toMillis ? t.toMillis() : t ? Number(t) : Date.now());
const wkKey = (w) => S.season + '-' + w;
const sheetRef = (w) => db.collection('picks').doc(wkKey(w) + '_' + S.user.uid);
const mySheet = (w) => S.user && S.docs.find((d) => d.uid === S.user.uid && d.week === w);
const statusOf = (w, uid) => S.status[wkKey(w) + '_' + uid] || {};
const isRemoved = (w, uid) => statusOf(w, uid).removed === true;
const nameOf = (uid) => (S.players[uid] && S.players[uid].name) || 'Player';

/* ---------------- player login: name + phone ---------------- */
const digitsOf = (p) => { let d = String(p || '').replace(/\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1); return d; };
async function playerLogin(name, phone) {
  name = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 30);
  const d = digitsOf(phone);
  if (!name) return toast('Type your name.');
  if (d.length !== 10) return toast('Type your 10-digit phone number.');
  const email = 'p' + d + '@' + PLAYER_DOMAIN;
  const pass = 'ape-' + d + '-pickem';
  S.busy = true; render();
  try {
    try { await auth.signInWithEmailAndPassword(email, pass); }
    catch (e) {
      if (e && (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential' || e.code === 'auth/invalid-login-credentials')) {
        await auth.createUserWithEmailAndPassword(email, pass);
      } else throw e;
    }
    S.user = auth.currentUser;
    if (!S.players[S.user.uid] || S.players[S.user.uid].name !== name) {
      await db.collection('players').doc(S.user.uid).set({ name, updatedAt: FV.serverTimestamp() }, { merge: true });
    }
    toast('You’re in, ' + name + '!');
  } catch (e) {
    console.warn(e);
    if (e && e.code === 'auth/operation-not-allowed') toast('Logins aren’t switched on yet — ask Blake.');
    else if (e && e.code === 'auth/too-many-requests') toast('Too many tries. Wait a minute and try again.');
    else toast('That didn’t work. Check your connection and try again.' + why(e));
  }
  S.busy = false; render();
}
async function logout() { await auth.signOut(); S.user = null; S.admin = false; render(); }

/* ---------------- saving picks ---------------- */
function canPick() {
  if (!S.user) { toast('Enter your name and phone number first.'); return false; }
  if (isRemoved(S.week, S.user.uid)) { toast('Blake removed you from this week. Text him if that’s a mistake.'); return false; }
  const sh = mySheet(S.week);
  if (!(sh && sh.paid)) { toast('Check the “I’ve paid” box first.'); return false; }
  return true;
}
const sheetBase = () => ({ uid: S.user.uid, season: S.season, week: S.week, wk: wkKey(S.week) });
async function savePick(g, team) {
  if (!canPick()) return;
  if (isLocked(g)) return toast('That game has started — picks are locked.');
  const k = String(g.id);
  try {
    await sheetRef(S.week).set(Object.assign(sheetBase(), { last: k, ['g_' + k]: team, ['at_' + k]: FV.serverTimestamp() }), { merge: true });
  } catch (e) { console.warn(e); toast('Couldn’t save that pick. Try again.' + why(e)); }
}
async function saveTb(val) {
  if (!canPick()) return;
  const tbg = tbGame(S.sb[S.week] || []);
  if (tbg && isLocked(tbg)) return toast('Tiebreaker is locked — MNF has started.');
  const n = parseInt(val, 10);
  if (!(n >= 0 && n <= 200)) return toast('Enter total points between 0 and 200.');
  try {
    await sheetRef(S.week).set(Object.assign(sheetBase(), { last: 'tb', tb: n, at_tb: FV.serverTimestamp() }), { merge: true });
    if ($('tbInput')) $('tbInput').dataset.dirty = '';
    toast('Tiebreaker saved: ' + n + ' points');
  } catch (e) { console.warn(e); toast('Couldn’t save the tiebreaker. Try again.' + why(e)); }
}
async function savePaid(on) {
  if (!S.user) return;
  try {
    await sheetRef(S.week).set(Object.assign(sheetBase(), { last: 'paid', paid: !!on, at_paid: FV.serverTimestamp() }), { merge: true });
  } catch (e) { console.warn(e); toast('Couldn’t save that. Try again.' + why(e)); render(); }
}
async function saveName(raw) {
  const name = String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 30);
  if (!name || !S.user) return toast('Type your name first.');
  try {
    await db.collection('players').doc(S.user.uid).set({ name, updatedAt: FV.serverTimestamp() }, { merge: true });
    if ($('nameBox')) $('nameBox').dataset.dirty = '';
    toast('Name saved: ' + name);
  } catch (e) { console.warn(e); toast('Couldn’t save your name. Try again.' + why(e)); }
}

/* ---------------- commissioner ---------------- */
function openAdmin() {
  if (!fbOn) return;
  $('adminEmail').value = ADMIN_EMAIL; $('adminPass').value = ''; $('adminMsg').textContent = '';
  $('adminModal').hidden = false; setTimeout(() => $('adminPass').focus(), 50);
}
$('adminCancel').addEventListener('click', () => { $('adminModal').hidden = true; });
async function adminAuth(create) {
  const email = $('adminEmail').value.trim().toLowerCase(), pass = $('adminPass').value;
  const msg = $('adminMsg');
  if (email !== ADMIN_EMAIL) { msg.textContent = 'Only ' + ADMIN_EMAIL + ' can be the commissioner.'; return; }
  if (pass.length < 6) { msg.textContent = 'Password must be at least 6 characters.'; return; }
  msg.textContent = 'One sec…';
  try {
    const cred = create ? await auth.createUserWithEmailAndPassword(email, pass) : await auth.signInWithEmailAndPassword(email, pass);
    await cred.user.reload();
    if (!auth.currentUser.emailVerified) {
      await auth.currentUser.sendEmailVerification();
      msg.textContent = 'We emailed a link to ' + email + '. Click it, then come back and sign in.';
      await auth.signOut();
      return;
    }
    S.admin = true; $('adminModal').hidden = true; toast('Commissioner tools are on (Leaderboard tab).'); render();
  } catch (e) {
    console.warn(e);
    msg.textContent = e && e.code === 'auth/email-already-in-use' ? 'That account already exists — just sign in.'
      : e && (e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found' || e.code === 'auth/invalid-login-credentials') ? 'Wrong password, or the account isn’t created yet (tap “First time?”).'
      : e && e.code === 'auth/operation-not-allowed' ? 'Turn on Email/Password sign-in in Firebase first.'
      : 'That didn’t work. Try again.';
  }
}
$('adminForm').addEventListener('submit', (e) => { e.preventDefault(); adminAuth(false); });
$('adminCreate').addEventListener('click', () => adminAuth(true));
$('adminReset').addEventListener('click', async () => {
  try { await auth.sendPasswordResetEmail(ADMIN_EMAIL); $('adminMsg').textContent = 'Password reset email sent to ' + ADMIN_EMAIL + '.'; }
  catch (e) { console.warn(e); $('adminMsg').textContent = 'Couldn’t send the reset email.'; }
});
async function setStatus(uid, patch) {
  try {
    await db.collection('status').doc(wkKey(S.week) + '_' + uid).set(Object.assign({ season: S.season, week: S.week }, patch), { merge: true });
  } catch (e) { console.warn(e); toast('Couldn’t save that. Are you still signed in as commissioner?' + why(e)); }
}


/* ---------------- ESPN ---------------- */
function norm(e) {
  const c = (e.competitions || [])[0] || {};
  const st = (e.status && e.status.type) || (c.status && c.status.type) || {};
  const team = (t) => {
    t = t || {}; const tm = t.team || {};
    return {
      abbr: tm.abbreviation || '?', name: tm.shortDisplayName || tm.name || '', full: tm.displayName || '',
      city: tm.location || '',
      logo: tm.logo || (tm.logos && tm.logos[0] && tm.logos[0].href) || (tm.abbreviation ? 'https://a.espncdn.com/i/teamlogos/nfl/500/' + tm.abbreviation.toLowerCase() + '.png' : ''), color: tm.color ? '#' + tm.color : '#5b6b80',
      score: t.score != null && t.score !== '' ? Number(t.score) : null,
      winner: t.winner === true, record: (t.records && t.records[0] && t.records[0].summary) || '',
    };
  };
  const comps = c.competitors || [];
  const home = team(comps.find((x) => x.homeAway === 'home'));
  const away = team(comps.find((x) => x.homeAway === 'away'));
  const o = (c.odds || [])[0];
  const sit = c.situation || {};
  const prob = sit.lastPlay && sit.lastPlay.probability;
  const name = String(st.name || '');
  return {
    id: String(e.id), kick: Date.parse(e.date), state: st.state || 'pre',
    detail: st.shortDetail || st.detail || '',
    final: st.completed === true || st.state === 'post',
    void: /POSTPONED|CANCELED|CANCELLED|SUSPENDED/.test(name),
    home, away,
    odds: o ? {
      details: o.details || '', ou: o.overUnder,
      hml: o.homeTeamOdds && o.homeTeamOdds.moneyLine, aml: o.awayTeamOdds && o.awayTeamOdds.moneyLine,
      provider: (o.provider && o.provider.name) || '',
    } : null,
    prob: prob && prob.homeWinPercentage != null ? { home: prob.homeWinPercentage, away: prob.awayWinPercentage } : null,
    down: sit.downDistanceText || '',
    tv: ((c.broadcasts || [])[0] && c.broadcasts[0].names || []).join('/'),
  };
}
async function fetchJSON(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('ESPN ' + r.status);
  return r.json();
}
async function loadCurrent() {
  const d = await fetchJSON(ESPN);
  S.season = (d.season && d.season.year) || (d.leagues && d.leagues[0] && d.leagues[0].season && d.leagues[0].season.year) || new Date().getFullYear();
  const type = d.season && d.season.type;
  const n = (d.week && d.week.number) || 1;
  S.curWeek = type === 2 ? Math.min(n, WEEKS) : type === 1 ? 1 : WEEKS;
  if (type === 2) { S.sb[S.curWeek] = (d.events || []).map(norm).sort(byKick); S.updated = Date.now(); }
}
const byKick = (a, b) => a.kick - b.kick || a.id.localeCompare(b.id);
const cacheKey = (w) => 'ape:sb2:' + S.season + ':' + w;
async function loadWeek(w, force) {
  if (!force && S.sb[w]) return S.sb[w];
  if (!S.sb[w]) {
    try { const c = JSON.parse(localStorage.getItem(cacheKey(w)) || 'null'); if (c) { S.sb[w] = c; if (!force) return c; } } catch (e) {}
  }
  try {
    const d = await fetchJSON(ESPN + '?seasontype=2&week=' + w + '&dates=' + S.season);
    const games = (d.events || []).map(norm).sort(byKick);
    S.sb[w] = games;
    if (w === S.week || w === S.curWeek) S.updated = Date.now();
    // Finished weeks never change, so keep them for the season standings.
    if (games.length && games.every((g) => g.final || g.void)) {
      try { localStorage.setItem(cacheKey(w), JSON.stringify(games)); } catch (e) {}
    }
  } catch (e) { console.warn(e); if (!S.sb[w]) S.sb[w] = null; }
  return S.sb[w];
}
const isLocked = (g) => Date.now() >= g.kick || g.state !== 'pre';
const isLive = (g) => g.state === 'in';
function winnerOf(g) {
  if (!g.final || g.void) return null;
  if (g.home.winner) return g.home.abbr;
  if (g.away.winner) return g.away.abbr;
  if (g.home.score != null && g.away.score != null && g.home.score !== g.away.score) return g.home.score > g.away.score ? g.home.abbr : g.away.abbr;
  return 'TIE';
}
const etDay = (ms) => new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/New_York' }).format(new Date(ms));
// Tiebreaker = the week's last game (Monday Night Football; the later one if there are two).
function tbGame(games) {
  if (!games || !games.length) return null;
  return games.reduce((a, b) => (b.kick >= a.kick ? b : a));
}
const total = (g) => (g && g.home.score != null && g.away.score != null ? g.home.score + g.away.score : null);

/* ---------------- scoring ---------------- */
function scoreWeek(w) {
  const games = S.sb[w] || [];
  const byId = {}; games.forEach((g) => { byId[g.id] = g; });
  const tbg = tbGame(games);
  const tbTotal = tbg && (tbg.final || isLive(tbg)) ? total(tbg) : null;
  const done = games.length > 0 && games.every((g) => g.final || g.void);
  const rows = S.docs.filter((d) => d.week === w && !isRemoved(w, d.uid) && (Object.keys(d.picks).length || d.tb != null)).map((d) => {
    const r = { uid: d.uid, w: 0, l: 0, live: 0, pend: 0, made: 0, tb: null, diff: null, paid: d.paid };
    Object.keys(d.picks).forEach((gid) => {
      const g = byId[gid]; const p = d.picks[gid];
      if (!g || p.at >= g.kick) return; // a pick saved after kickoff doesn't count
      r.made++;
      const win = winnerOf(g);
      if (win == null) { if (!g.void) { if (isLive(g)) r.live++; else r.pend++; } }
      else if (win === p.team) r.w++;
      else if (win !== 'TIE') r.l++;
    });
    if (d.tb != null && tbg && d.tbAt < tbg.kick) {
      r.tb = d.tb;
      if (tbTotal != null) r.diff = Math.abs(tbTotal - d.tb);
    }
    r.max = r.w + r.live + r.pend;
    return r;
  });
  rows.sort((a, b) => b.w - a.w || (a.diff == null) - (b.diff == null) || (a.diff || 0) - (b.diff || 0) || b.max - a.max || nameOf(a.uid).localeCompare(nameOf(b.uid)));
  let winners = [];
  if (done && rows.length && tbg && tbg.final) {
    const top = rows[0];
    winners = rows.filter((r) => r.w === top.w && r.diff === top.diff).map((r) => r.uid);
  }
  rows.forEach((r, i) => { r.rank = i && rows[i - 1].w === r.w && rows[i - 1].diff === r.diff ? rows[i - 1].rank : i + 1; });
  return { rows, winners, done, tbg, tbTotal, games };
}
function scoreSeason() {
  const tot = {};
  const weeks = [...new Set(S.docs.map((d) => d.week))].sort((a, b) => a - b);
  weeks.forEach((w) => {
    if (!S.sb[w]) return;
    const s = scoreWeek(w);
    s.rows.forEach((r) => {
      const t = tot[r.uid] || (tot[r.uid] = { uid: r.uid, w: 0, l: 0, weeks: 0, won: 0 });
      t.w += r.w; t.l += r.l; t.weeks++;
      if (s.winners.includes(r.uid)) t.won++;
    });
  });
  const rows = Object.values(tot).sort((a, b) => b.w - a.w || b.won - a.won || a.l - b.l || nameOf(a.uid).localeCompare(nameOf(b.uid)));
  rows.forEach((r, i) => { r.rank = i && rows[i - 1].w === r.w ? rows[i - 1].rank : i + 1; });
  return rows;
}

/* ---------------- render ---------------- */
const fmtKick = (ms) => new Date(ms).toLocaleString([], { weekday: 'short', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const matchup = (g) => g.away.name + ' @ ' + g.home.name;

function render() {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
  ['picks', 'board'].forEach((t) => { $('tab-' + t).hidden = t !== S.tab; });
  renderWho();
  if (!S.ready) { $('tab-' + S.tab).innerHTML = '<div class="empty">Loading this week’s games…</div>'; return; }
  $('wkLabel').textContent = 'Week ' + S.week;
  const games = S.sb[S.week];
  $('wkSub').textContent = S.season + ' season' + (S.week === S.curWeek ? ' · this week' : '');
  $('prevWk').disabled = S.week <= 1;
  $('nextWk').disabled = S.week >= WEEKS;
  const notes = [];
  if (!fbOn) notes.push('Picks aren’t switched on yet — paste the Firebase settings into <b>config.js</b> (see README). Scores below are live.');
  if (S.admin) notes.push('You’re signed in as <b>commissioner</b>. Mark who paid or remove people on the Leaderboard tab. <button class="btn sm ghost" data-act="logout">Sign out</button>');
  $('notice').innerHTML = notes.join('<br>');
  $('notice').hidden = !notes.length;
  if (games === null) { $('tab-' + S.tab).innerHTML = '<div class="empty">Couldn’t reach ESPN for this week. It will try again shortly.</div>'; return; }
  if (!games || !games.length) { $('tab-' + S.tab).innerHTML = '<div class="empty">No games found for this week yet.</div>'; return; }
  if (S.tab === 'picks') renderPicks(games);
  else renderBoard(games);
  $('updated').textContent = S.updated ? '· last update ' + new Date(S.updated).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '';
}
function renderWho() {
  const el = $('who');
  if (!fbOn || !S.user) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="me">' + esc(nameOf(S.user.uid)) + '<br><button data-act="logout">Not you? Switch</button></div>';
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-act]'); if (!a) return;
  const act = a.dataset.act;
  if (act === 'login') playerLogin($('loginName').value, $('loginPhone').value);
  else if (act === 'logout') logout();
  else if (act === 'admin') openAdmin();
  else if (act === 'pick') {
    const g = (S.sb[S.week] || []).find((x) => x.id === a.dataset.g);
    if (g) savePick(g, a.dataset.t);
  } else if (act === 'tb') saveTb($('tbInput').value);
  else if (act === 'savename') saveName($('nameBox').value);
  else if (act === 'bv') { S.boardView = a.dataset.v; render(); }
  else if (act === 'confirm') setStatus(a.dataset.u, { confirmed: a.dataset.on === '1' });
  else if (act === 'remove') {
    const on = a.dataset.on === '1';
    if (!on || confirm('Remove ' + nameOf(a.dataset.u) + ' from Week ' + S.week + '? Their picks stop counting and they can’t pick until you restore them.')) setStatus(a.dataset.u, { removed: on });
  }
});
document.addEventListener('change', (e) => { if (e.target.id === 'paidBox') savePaid(e.target.checked); });
document.addEventListener('input', (e) => {
  if (['tbInput', 'nameBox', 'loginName', 'loginPhone'].includes(e.target.id)) e.target.dataset.dirty = '1';
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'tbInput') saveTb(e.target.value);
  else if (e.target.id === 'nameBox') saveName(e.target.value);
  else if (e.target.id === 'loginName' || e.target.id === 'loginPhone') playerLogin($('loginName').value, $('loginPhone').value);
});

function teamBtn(g, side, mine, open) {
  const t = g[side];
  const win = winnerOf(g);
  const picked = mine && mine.team === t.abbr;
  const cls = ['team'];
  if (picked) { cls.push('picked'); if (win && win !== 'TIE') cls.push(win === t.abbr ? 'right' : 'wrong'); }
  if (win && win !== 'TIE' && win !== t.abbr) cls.push('lost');
  const showScore = g.state !== 'pre' && t.score != null;
  const dis = !open || isLocked(g) ? ' disabled' : '';
  return '<button class="' + cls.join(' ') + '" data-act="pick" data-g="' + esc(g.id) + '" data-t="' + esc(t.abbr) + '"' + dis + ' aria-pressed="' + picked + '">'
    + (t.logo ? '<img src="' + esc(t.logo) + '" alt="" loading="lazy">' : '')
    + '<span class="tx"><span class="abbr">' + esc(t.full || t.name || t.abbr) + '</span>'
    + '<span class="nm">' + esc(t.record || '') + '</span></span>'
    + (picked ? '<span class="chk">' + (cls.includes('right') ? '✓ Right' : cls.includes('wrong') ? '✗ Wrong' : 'Your pick') + '</span>' : '')
    + (showScore ? '<span class="score">' + t.score + '</span>' : '') + '</button>';
}
function statusText(g) {
  if (g.void) return '<span class="status">' + esc(g.detail || 'Postponed') + '</span>';
  if (g.state === 'pre') return '<span class="status">' + esc(fmtKick(g.kick)) + (g.tv ? ' · ' + esc(g.tv) : '') + '</span>';
  return '<span class="status' + (isLive(g) ? ' live' : '') + '">' + esc(g.detail) + '</span>';
}
// Keep half-typed text (and focus) across the automatic refreshes.
function keep(id, fallback) {
  const el = $(id);
  const typing = el && el.dataset.dirty === '1' && !el.disabled;
  return { val: typing ? el.value : fallback, attr: typing ? ' data-dirty="1"' : '', focus: el && document.activeElement === el };
}

function renderPicks(games) {
  const tbg = tbGame(games);
  const sheet = mySheet(S.week);
  const myPicks = (sheet && sheet.picks) || {};
  const paid = !!(sheet && sheet.paid);
  const removed = S.user && isRemoved(S.week, S.user.uid);
  const open = fbOn && !!S.user && paid && !removed;
  const made = games.filter((g) => myPicks[g.id]).length;
  const nextLock = games.filter((g) => !isLocked(g)).map((g) => g.kick)[0];
  const tbLocked = tbg && isLocked(tbg);
  const ln = keep('loginName', ''), lp = keep('loginPhone', '');
  const nb = keep('nameBox', S.user ? (S.players[S.user.uid] && S.players[S.user.uid].name) || '' : '');
  const tb = keep('tbInput', sheet && sheet.tb != null ? sheet.tb : '');
  let h = '';
  if (fbOn && !S.user) {
    h += '<div class="card login"><h3>Make your picks</h3>'
      + '<p class="muted">Enter your name and phone number. Use the same phone number any time to come back and change your picks. Your number is never shown on the site.</p>'
      + '<div class="fields"><input id="loginName" maxlength="30" autocomplete="name" placeholder="Your name" value="' + esc(ln.val) + '"' + ln.attr + '>'
      + '<input id="loginPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="Phone number" value="' + esc(lp.val) + '"' + lp.attr + '>'
      + '<button class="btn" data-act="login"' + (S.busy ? ' disabled' : '') + '>' + (S.busy ? 'One sec…' : 'Start picking') + '</button></div></div>';
  } else if (fbOn) {
    h += '<div class="card namecard"><label for="nameBox"><b>Your name</b><span class="muted">Shown on the leaderboard</span></label>'
      + '<div class="nameRow"><input id="nameBox" maxlength="30" autocomplete="name" value="' + esc(nb.val) + '"' + nb.attr + '>'
      + '<button class="btn sm" data-act="savename">Save</button></div></div>';
    if (removed) h += '<div class="notice">Blake removed you from Week ' + S.week + '. If you’ve paid, text him and he can add you back.</div>';
    h += '<label class="card paidcard' + (paid ? ' on' : '') + '"><input type="checkbox" id="paidBox"' + (paid ? ' checked' : '') + (removed ? ' disabled' : '') + '>'
      + '<span><b>I’ve paid my ' + esc(feeAmt || 'entry') + ' for Week ' + S.week + '</b><span class="muted">Venmo <a href="https://venmo.com/u/' + esc(encodeURIComponent(venmo)) + '" target="_blank" rel="noopener">@' + esc(venmo) + '</a>. Required before you can pick.</span></span></label>';
    h += '<div class="card summary"><div class="progress"><b>' + made + ' of ' + games.length + ' picked</b>'
      + '<div class="muted" style="font-size:12px">' + (nextLock ? 'Picks save as you tap · each game locks at kickoff · next lock ' + esc(fmtKick(nextLock)) : 'All games are locked for this week') + '</div>'
      + '<div class="bar"><i style="width:' + Math.round((made / games.length) * 100) + '%"></i></div></div>'
      + '<div class="tb"><span class="lbl">Tiebreaker (MNF): total points in<br><b>' + (tbg ? esc(matchup(tbg)) : 'MNF') + '</b></span>'
      + '<input id="tbInput" type="number" inputmode="numeric" min="0" max="200" placeholder="pts" value="' + esc(tb.val) + '"' + tb.attr + (tbLocked || !open ? ' disabled' : '') + '>'
      + (tbLocked ? '<span class="muted" style="font-size:12px">Locked</span>' : '<button class="btn sm" data-act="tb"' + (open ? '' : ' disabled') + '>Save</button>') + '</div></div>';
  }
  h += '<div class="games">';
  games.forEach((g) => {
    const mine = myPicks[g.id];
    const late = mine && mine.at >= g.kick;
    h += '<div class="game' + (g === tbg ? ' tnf' : '') + '"><div class="game-head">' + statusText(g)
      + '<span>' + (g === tbg ? '<span class="tag">Tiebreaker</span>' : '') + (isLocked(g) && g.state === 'pre' ? ' 🔒' : '') + '</span></div>'
      + '<div class="teams">' + teamBtn(g, 'away', mine, open) + teamBtn(g, 'home', mine, open) + '</div>'
      + (late ? '<div class="locknote">This pick was saved after kickoff, so it doesn’t count.</div>' : '')
      + (open && isLocked(g) && !mine ? '<div class="locknote">No pick made — locked.</div>' : '')
      + '</div>';
  });
  h += '</div>';
  $('tab-picks').innerHTML = h;
  [['loginName', ln], ['loginPhone', lp], ['nameBox', nb], ['tbInput', tb]].forEach(([id, k]) => { if (k.focus && $(id) && !$(id).disabled) $(id).focus(); });
}

const logoImg = (t, cls) => (t.logo ? '<img class="' + (cls || 'lg') + '" src="' + esc(t.logo) + '" alt="" loading="lazy">' : '');
const teamBy = (g, abbr) => (g.home.abbr === abbr ? g.home : g.away.abbr === abbr ? g.away : null);
const isMe = (uid) => !!(S.user && uid === S.user.uid);
function paidCell(w, r) {
  const st = statusOf(w, r.uid);
  if (st.confirmed) return '<td class="tot paid ok" title="Blake confirmed">✓</td>';
  return '<td class="tot paid' + (r.paid ? '' : ' no') + '" title="' + (r.paid ? 'Says they paid — not confirmed yet' : 'Hasn’t checked the paid box') + '">' + (r.paid ? 'said' : '✗') + '</td>';
}
function adminCell(r) {
  const st = statusOf(S.week, r.uid);
  return '<td class="adm"><button class="btn sm' + (st.confirmed ? '' : ' ghost') + '" data-act="confirm" data-u="' + esc(r.uid) + '" data-on="' + (st.confirmed ? '0' : '1') + '">' + (st.confirmed ? 'Paid ✓' : 'Mark paid') + '</button> '
    + '<button class="btn sm ghost" data-act="remove" data-u="' + esc(r.uid) + '" data-on="1">Remove</button></td>';
}
// Week spreadsheet: one row per player (sorted by rank), one column per game.
// Green = right, red = wrong, light tint = live game currently winning/losing.
function weekSheetHtml(games, sc) {
  const tbg = sc.tbg;
  const tbLocked = tbg && isLocked(tbg);
  let h = '<div class="tablewrap"><table class="sheet"><thead><tr><th class="rank">#</th><th class="name">Player</th><th class="tot">W</th><th class="tot">L</th><th class="tot">Paid</th>';
  // Column headers double as the scoreboard: each team's score, winner in bold, filled in as games finish.
  games.forEach((g) => {
    const win = winnerOf(g);
    const started = g.state !== 'pre' && g.away.score != null;
    const line = (t) => '<span class="sl' + (win && win !== 'TIE' ? (win === t.abbr ? ' won' : ' lost') : '') + '">' + logoImg(t) + '<span class="ab">' + esc(t.abbr) + '</span>'
      + '<span class="pts">' + (started ? t.score : '') + '</span></span>';
    const st = g.void ? (g.detail || 'Postponed') : g.final ? 'Final' : isLive(g) ? g.detail : etDay(g.kick) + ' ' + new Date(g.kick).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    h += '<th class="gh' + (g === tbg ? ' tbcol' : '') + '">' + line(g.away) + line(g.home)
      + '<small class="st' + (isLive(g) ? ' live' : g.final ? ' fin' : '') + '">' + esc(st) + (g === tbg ? ' · TB' : '') + '</small></th>';
  });
  h += '<th class="tot">TB</th><th class="tot">Off</th>' + (S.admin ? '<th>Commissioner</th>' : '') + '</tr></thead><tbody>';
  sc.rows.forEach((r) => {
    const d = S.docs.find((x) => x.uid === r.uid && x.week === S.week);
    const me = isMe(r.uid);
    const won = sc.winners.includes(r.uid);
    h += '<tr class="' + (me ? 'mine' : '') + (won ? ' won' : '') + '"><td class="rank">' + (won ? '🏆' : r.rank) + '</td><td class="name">' + esc(nameOf(r.uid)) + '</td>'
      + '<td class="tot w">' + r.w + '</td><td class="tot l">' + r.l + '</td>' + paidCell(S.week, r);
    games.forEach((g) => {
      const p = d && d.picks[g.id];
      if (!p) { h += '<td class="c none">–</td>'; return; }
      if (!me && !isLocked(g)) { h += '<td class="c hide" title="Hidden until kickoff">🔒</td>'; return; }
      if (p.at >= g.kick) { h += '<td class="c late" title="Saved after kickoff — doesn’t count">late</td>'; return; }
      const pt = teamBy(g, p.team);
      const win = winnerOf(g);
      let cls = 'open';
      if (win && win !== 'TIE') cls = win === p.team ? 'right' : 'wrong';
      else if (win === 'TIE') cls = 'tie';
      else if (isLive(g) && g.home.score != null && g.home.score !== g.away.score) {
        const lead = g.home.score > g.away.score ? g.home.abbr : g.away.abbr;
        cls = lead === p.team ? 'up' : 'down';
      }
      h += '<td class="c ' + cls + '" title="' + esc(pt ? pt.full : p.team) + '">' + (pt ? logoImg(pt) : '') + '<span>' + esc(p.team) + '</span></td>';
    });
    const tbShow = r.tb != null && (me || tbLocked || S.admin);
    h += '<td class="tot">' + (r.tb == null ? '–' : tbShow ? r.tb : '🔒') + '</td><td class="tot">' + (r.diff == null ? '–' : r.diff) + '</td>' + (S.admin ? adminCell(r) : '') + '</tr>';
  });
  h += '</tbody></table></div>';
  return h;
}
function removedHtml() {
  const out = S.docs.filter((d) => d.week === S.week && isRemoved(S.week, d.uid));
  if (!S.admin || !out.length) return '';
  return '<div class="removed"><b>Removed this week:</b> ' + out.map((d) => esc(nameOf(d.uid)) + ' <button class="btn sm ghost" data-act="remove" data-u="' + esc(d.uid) + '" data-on="0">Restore</button>').join(' · ') + '</div>';
}
// Season spreadsheet: one row per player, a column of right picks for each week.
function seasonSheetHtml() {
  const rows = scoreSeason();
  if (!rows.length) return '<div class="empty">No picks yet this season.</div>';
  const weeks = [...new Set(S.docs.map((d) => d.week))].filter((w) => S.sb[w]).sort((a, b) => a - b);
  const per = {};
  weeks.forEach((w) => { per[w] = scoreWeek(w); });
  let h = '<div class="tablewrap"><table class="sheet"><thead><tr><th class="rank">#</th><th class="name">Player</th><th class="tot">W</th><th class="tot">L</th><th class="tot">Pct</th><th class="tot">🏆</th>';
  weeks.forEach((w) => { h += '<th class="tot">Wk ' + w + '</th>'; });
  h += '</tr></thead><tbody>';
  rows.forEach((r) => {
    const me = isMe(r.uid);
    const pct = r.w + r.l ? (r.w / (r.w + r.l)).toFixed(3).replace(/^0/, '') : '–';
    h += '<tr class="' + (me ? 'mine' : '') + '"><td class="rank">' + r.rank + '</td><td class="name">' + esc(nameOf(r.uid)) + '</td>'
      + '<td class="tot w">' + r.w + '</td><td class="tot l">' + r.l + '</td><td class="tot">' + pct + '</td><td class="tot">' + (r.won || '–') + '</td>';
    weeks.forEach((w) => {
      const wr = per[w].rows.find((x) => x.uid === r.uid);
      if (!wr) { h += '<td class="c none">–</td>'; return; }
      const won = per[w].winners.includes(r.uid);
      const best = per[w].rows.length && wr.w === per[w].rows[0].w;
      h += '<td class="c ' + (won ? 'right' : per[w].done ? (best ? 'up' : '') : 'open') + '" title="' + wr.w + '-' + wr.l + '">' + wr.w + '-' + wr.l + (won ? ' 🏆' : '') + '</td>';
    });
    h += '</tr>';
  });
  h += '</tbody></table></div>';
  return h;
}

function renderBoard(games) {
  let h = '<div class="subtabs"><button data-act="bv" data-v="week" class="' + (S.boardView === 'week' ? 'on' : '') + '">Week ' + S.week + '</button>'
    + '<button data-act="bv" data-v="season" class="' + (S.boardView === 'season' ? 'on' : '') + '">Season</button></div>';
  if (!fbOn) h += '<div class="empty">Standings show up here once Firebase is set up.</div>';
  else if (S.boardView === 'week') {
    const sc = scoreWeek(S.week);
    const live = games.some(isLive);
    h += '<div class="card"><h3>Week ' + S.week + (sc.done ? ' · Final' : live ? ' · Live' : '') + '</h3>';
    if (sc.tbg) h += '<div class="muted" style="font-size:13px;margin-bottom:8px">Tiebreaker (MNF): ' + esc(matchup(sc.tbg)) + ' total points' + (sc.tbTotal != null ? ' — <b style="color:#fff">' + sc.tbTotal + (sc.tbg.final ? ' final' : ' so far') + '</b>' : '') + '</div>';
    if (sc.winners.length) h += '<div class="notice" style="margin-bottom:10px">🏆 Week ' + S.week + ' winner' + (sc.winners.length > 1 ? 's' : '') + ': <b>' + sc.winners.map((u) => esc(nameOf(u))).join(', ') + '</b></div>';
    if (!sc.rows.length) h += '<div class="empty">No picks in yet for this week.</div>';
    else h += weekSheetHtml(games, sc)
      + '<div class="legend"><span><i class="right"></i>Right</span><span><i class="wrong"></i>Wrong</span><span><i class="up"></i>Winning now</span><span><i class="down"></i>Losing now</span><span>🔒 hidden until kickoff</span><span>Paid: ✓ confirmed by Blake · “said” = checked the box</span></div>';
    h += removedHtml() + '</div>';
  } else {
    h += '<div class="card"><h3>' + S.season + ' Season</h3>' + seasonSheetHtml() + '</div>';
  }
  $('tab-board').innerHTML = h;
}

/* ---------------- refresh loop ---------------- */
let timer;
function schedule() {
  clearTimeout(timer);
  const games = S.sb[S.week] || [];
  const soon = games.some((g) => isLive(g) || (g.state === 'pre' && g.kick - Date.now() < 15 * 60 * 1000 && g.kick - Date.now() > -3 * 3600 * 1000));
  timer = setTimeout(tick, soon ? LIVE_MS : IDLE_MS);
}
async function tick() {
  if (document.hidden) { schedule(); return; }
  await loadWeek(S.week, true);
  if (S.curWeek !== S.week && S.docs.some((d) => d.week === S.curWeek)) await loadWeek(S.curWeek, true);
  render();
  schedule();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.ready) tick(); });
// Re-render each minute so games lock on time even between ESPN refreshes.
setInterval(() => { if (S.ready) render(); }, 60 * 1000);
// Season standings need every week someone picked in.
async function loadPickedWeeks() {
  const weeks = [...new Set(S.docs.map((d) => d.week))].filter((w) => !S.sb[w]);
  for (const w of weeks) await loadWeek(w);
  if (weeks.length) render();
}
setInterval(() => { if (S.ready) loadPickedWeeks(); }, 20 * 1000);

(async function start() {
  render();
  try { await loadCurrent(); }
  catch (e) {
    console.warn(e);
    S.season = S.season || new Date().getFullYear();
    S.curWeek = S.curWeek || 1;
  }
  S.week = S.curWeek;
  if (!S.sb[S.week]) await loadWeek(S.week, true);
  S.ready = true;
  subscribeSeason();
  render();
  loadPickedWeeks();
  schedule();
})();
})();
