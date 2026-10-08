/* Albritton's Pick Em's — ESPN scores + Firebase (Google sign-in + Firestore) */
(function () {
'use strict';
const CFG = window.PICKEM_CONFIG || {};
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
const WEEKS = 18; // regular season
const LIVE_MS = 30 * 1000; // refresh while games are on
const IDLE_MS = 5 * 60 * 1000; // refresh otherwise

const S = {
  user: null, players: {}, docs: [], // docs: this season's pick sheets
  season: null, curWeek: null, week: null,
  sb: {}, // week -> games[]
  tab: 'picks', boardView: 'week', updated: 0, ready: false,
};
try { S.tab = localStorage.getItem('ape:tab') === 'board' ? 'board' : 'picks'; } catch (e) {}

/* ---------------- header bits ---------------- */
const venmo = String(CFG.venmo || 'Blakealbritton6').replace(/^@/, '');
$('venmoTag').textContent = '@' + venmo;
$('venmoLink').href = 'https://venmo.com/u/' + encodeURIComponent(venmo);
$('fee').textContent = CFG.entryFee || '';

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
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600);
}

/* ---------------- Firebase ---------------- */
const fbOn = !!(CFG.firebase && CFG.firebase.apiKey && !/PASTE/.test(CFG.firebase.apiKey) && window.firebase);
let auth = null, db = null, FV = null, seasonUnsub = null;
if (fbOn) {
  firebase.initializeApp(CFG.firebase);
  auth = firebase.auth();
  db = firebase.firestore();
  FV = firebase.firestore.FieldValue;
  auth.getRedirectResult().catch(() => {});
  auth.onAuthStateChanged((u) => {
    S.user = u;
    if (u && !(S.players[u.uid] && S.players[u.uid].name)) maybeAskName();
    render();
  });
  db.collection('players').onSnapshot((snap) => {
    S.players = {};
    snap.forEach((d) => { S.players[d.id] = d.data(); });
    if (S.user && !S.players[S.user.uid]) maybeAskName();
    render();
  }, (e) => console.warn('players', e));
}
async function signIn() {
  const p = new firebase.auth.GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'select_account' });
  try { await auth.signInWithPopup(p); }
  catch (e) {
    if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) auth.signInWithRedirect(p);
    else if (e && e.code !== 'auth/popup-closed-by-user') toast('Sign-in didn’t work. Try again.');
  }
}
function subscribeSeason() {
  if (!fbOn || seasonUnsub || !S.season) return;
  seasonUnsub = db.collection('picks').where('season', '==', S.season).onSnapshot((snap) => {
    S.docs = snap.docs.map((d) => parseSheet(d.data({ serverTimestamps: 'estimate' })));
    render();
  }, (e) => { console.warn('picks', e); });
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
  return { uid: d.uid, week: d.week, season: d.season, picks, tb: typeof d.tb === 'number' ? d.tb : null, tbAt: tsMs(d.at_tb) };
}
const tsMs = (t) => (t && t.toMillis ? t.toMillis() : t ? Number(t) : Date.now());
const wkKey = (w) => S.season + '-' + w;
const sheetRef = (w) => db.collection('picks').doc(wkKey(w) + '_' + S.user.uid);
const mySheet = (w) => S.user && S.docs.find((d) => d.uid === S.user.uid && d.week === w);

async function savePick(g, team) {
  if (!S.user) return signIn();
  if (isLocked(g)) return toast('That game has started — picks are locked.');
  const k = String(g.id);
  try {
    await sheetRef(S.week).set({
      uid: S.user.uid, season: S.season, week: S.week, wk: wkKey(S.week), last: k,
      ['g_' + k]: team, ['at_' + k]: FV.serverTimestamp(),
    }, { merge: true });
  } catch (e) { console.warn(e); toast('Couldn’t save that pick. Check your connection and try again.'); }
}
async function saveTb(val) {
  if (!S.user) return signIn();
  const games = S.sb[S.week] || [];
  const tnf = tnfGame(games);
  if (tnf && isLocked(tnf)) return toast('Tiebreaker is locked — TNF has started.');
  const n = parseInt(val, 10);
  if (!(n >= 0 && n <= 200)) return toast('Enter total points between 0 and 200.');
  try {
    await sheetRef(S.week).set({
      uid: S.user.uid, season: S.season, week: S.week, wk: wkKey(S.week), last: 'tb',
      tb: n, at_tb: FV.serverTimestamp(),
    }, { merge: true });
    if ($('tbInput')) $('tbInput').dataset.dirty = '';
    toast('Tiebreaker saved: ' + n + ' points');
  } catch (e) { console.warn(e); toast('Couldn’t save the tiebreaker. Try again.'); }
}

/* ---------------- name ---------------- */
let askedName = false;
function maybeAskName(force) {
  if (!S.user || (!force && askedName)) return;
  askedName = true;
  const cur = (S.players[S.user.uid] && S.players[S.user.uid].name) || S.user.displayName || '';
  $('nameInput').value = cur;
  $('nameModal').hidden = false;
  setTimeout(() => $('nameInput').focus(), 50);
}
$('nameCancel').addEventListener('click', () => { $('nameModal').hidden = true; });
$('nameForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (await saveName($('nameInput').value)) $('nameModal').hidden = true;
});
async function saveName(raw) {
  const name = String(raw || '').trim().slice(0, 30);
  if (!name) { toast('Type your name first.'); return false; }
  if (!S.user) { signIn(); return false; }
  try {
    await db.collection('players').doc(S.user.uid).set({ name, updatedAt: FV.serverTimestamp() });
    if ($('nameBox')) $('nameBox').dataset.dirty = '';
    toast('Name saved: ' + name);
    return true;
  } catch (err) { console.warn(err); toast('Couldn’t save your name. Try again.'); return false; }
}
const nameOf = (uid) => (S.players[uid] && S.players[uid].name) || 'Player';

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
// TNF = the last Thursday kickoff of the week (the night game on Thanksgiving); if there is none, the week's first game.
function tnfGame(games) {
  if (!games || !games.length) return null;
  const thu = games.filter((g) => etDay(g.kick) === 'Thu');
  return thu.length ? thu.reduce((a, b) => (b.kick > a.kick ? b : a)) : games[0];
}
const total = (g) => (g && g.home.score != null && g.away.score != null ? g.home.score + g.away.score : null);

/* ---------------- scoring ---------------- */
function scoreWeek(w) {
  const games = S.sb[w] || [];
  const byId = {}; games.forEach((g) => { byId[g.id] = g; });
  const tnf = tnfGame(games);
  const tnfTotal = tnf && (tnf.final || isLive(tnf)) ? total(tnf) : null;
  const done = games.length > 0 && games.every((g) => g.final || g.void);
  const rows = S.docs.filter((d) => d.week === w).map((d) => {
    const r = { uid: d.uid, w: 0, l: 0, live: 0, pend: 0, made: 0, tb: null, diff: null };
    Object.keys(d.picks).forEach((gid) => {
      const g = byId[gid]; const p = d.picks[gid];
      if (!g || p.at >= g.kick) return; // a pick saved after kickoff doesn't count
      r.made++;
      const win = winnerOf(g);
      if (win == null) { if (!g.void) { if (isLive(g)) r.live++; else r.pend++; } }
      else if (win === p.team) r.w++;
      else if (win !== 'TIE') r.l++;
    });
    if (d.tb != null && tnf && d.tbAt < tnf.kick) {
      r.tb = d.tb;
      if (tnfTotal != null) r.diff = Math.abs(tnfTotal - d.tb);
    }
    r.max = r.w + r.live + r.pend;
    return r;
  });
  rows.sort((a, b) => b.w - a.w || (a.diff == null) - (b.diff == null) || (a.diff || 0) - (b.diff || 0) || b.max - a.max || nameOf(a.uid).localeCompare(nameOf(b.uid)));
  let winners = [];
  if (done && rows.length && tnf && tnf.final) {
    const top = rows[0];
    winners = rows.filter((r) => r.w === top.w && r.diff === top.diff).map((r) => r.uid);
  }
  rows.forEach((r, i) => { r.rank = i && rows[i - 1].w === r.w && rows[i - 1].diff === r.diff ? rows[i - 1].rank : i + 1; });
  return { rows, winners, done, tnf, tnfTotal, games };
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
  else if (!S.user && S.tab === 'picks') notes.push('Sign in with Google to make your picks. <button class="btn sm" data-act="signin">Sign in</button>');
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
  if (!fbOn) { el.innerHTML = ''; return; }
  if (!S.user) { el.innerHTML = '<button class="btn sm" data-act="signin">Sign in</button>'; return; }
  el.innerHTML = '<div class="me">' + esc(nameOf(S.user.uid)) + '<br><button data-act="rename">Change name</button> · <button data-act="signout">Sign out</button></div>';
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-act]'); if (!a) return;
  const act = a.dataset.act;
  if (act === 'signin') signIn();
  else if (act === 'signout') auth.signOut();
  else if (act === 'rename') maybeAskName(true);
  else if (act === 'pick') {
    const g = (S.sb[S.week] || []).find((x) => x.id === a.dataset.g);
    if (g) savePick(g, a.dataset.t);
  } else if (act === 'tb') saveTb($('tbInput').value);
  else if (act === 'savename') saveName($('nameBox').value);
  else if (act === 'bv') { S.boardView = a.dataset.v; render(); }
});
document.addEventListener('input', (e) => { if (e.target.id === 'tbInput' || e.target.id === 'nameBox') e.target.dataset.dirty = '1'; });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'tbInput') saveTb(e.target.value);
  else if (e.target.id === 'nameBox') saveName(e.target.value);
});

function teamBtn(g, side, mine) {
  const t = g[side];
  const win = winnerOf(g);
  const picked = mine && mine.team === t.abbr;
  const cls = ['team'];
  if (picked) { cls.push('picked'); if (win && win !== 'TIE') cls.push(win === t.abbr ? 'right' : 'wrong'); }
  if (win && win !== 'TIE' && win !== t.abbr) cls.push('lost');
  const showScore = g.state !== 'pre' && t.score != null;
  const dis = !fbOn || isLocked(g) ? ' disabled' : '';
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

function renderPicks(games) {
  const tnf = tnfGame(games);
  const sheet = mySheet(S.week);
  const myPicks = (sheet && sheet.picks) || {};
  const made = games.filter((g) => myPicks[g.id]).length;
  const nextLock = games.filter((g) => !isLocked(g)).map((g) => g.kick)[0];
  const tbLocked = tnf && isLocked(tnf);
  // Keep a half-typed tiebreaker (and focus) across the automatic refreshes.
  const old = $('tbInput');
  const typing = old && old.dataset.dirty === '1' && !old.disabled;
  const hadFocus = old && document.activeElement === old;
  const tbVal = typing ? old.value : sheet && sheet.tb != null ? sheet.tb : '';
  let h = '';
  const oldN = $('nameBox');
  const typingN = oldN && oldN.dataset.dirty === '1';
  const focusN = oldN && document.activeElement === oldN;
  if (fbOn) {
    const saved = S.user && S.players[S.user.uid] && S.players[S.user.uid].name;
    const nVal = typingN ? oldN.value : saved || '';
    h += '<div class="card namecard' + (S.user && !saved ? ' need' : '') + '"><label for="nameBox"><b>Your name</b>'
      + '<span class="muted">' + (S.user ? (saved ? 'Shown on the leaderboard' : 'Add your name so everyone knows whose picks are whose') : 'Sign in with Google to save your name and picks') + '</span></label>'
      + '<div class="nameRow"><input id="nameBox" maxlength="30" autocomplete="nickname" placeholder="First & last name" value="' + esc(nVal) + '"' + (typingN ? ' data-dirty="1"' : '') + '>'
      + (S.user ? '<button class="btn sm" data-act="savename">Save</button>' : '<button class="btn sm" data-act="signin">Sign in</button>') + '</div></div>';
  }
  if (fbOn && S.user) {
    h += '<div class="card summary"><div class="progress"><b>' + made + ' of ' + games.length + ' picked</b>'
      + '<div class="muted" style="font-size:12px">' + (nextLock ? 'Each game locks at kickoff · next lock ' + esc(fmtKick(nextLock)) : 'All games are locked for this week') + '</div>'
      + '<div class="bar"><i style="width:' + Math.round((made / games.length) * 100) + '%"></i></div></div>'
      + '<div class="tb"><span class="lbl">Tiebreaker: total points in<br><b>' + (tnf ? esc(tnf.away.name + ' @ ' + tnf.home.name) : 'TNF') + '</b>'
      + '</span>'
      + '<input id="tbInput" type="number" inputmode="numeric" min="0" max="200" placeholder="pts" value="' + esc(tbVal) + '"' + (typing ? ' data-dirty="1"' : '') + (tbLocked ? ' disabled' : '') + '>'
      + (tbLocked ? '<span class="muted" style="font-size:12px">Locked</span>' : '<button class="btn sm" data-act="tb">Save</button>') + '</div></div>';
  }
  h += '<div class="games">';
  games.forEach((g) => {
    const mine = myPicks[g.id];
    const late = mine && mine.at >= g.kick;
    h += '<div class="game' + (g === tnf ? ' tnf' : '') + '"><div class="game-head">' + statusText(g)
      + '<span>' + (g === tnf ? '<span class="tag">Tiebreaker</span>' : '') + (isLocked(g) && g.state === 'pre' ? ' 🔒' : '') + '</span></div>'
      + '<div class="teams">' + teamBtn(g, 'away', mine) + teamBtn(g, 'home', mine) + '</div>'
      + (late ? '<div class="locknote">This pick was saved after kickoff, so it doesn’t count.</div>' : '')
      + (fbOn && S.user && isLocked(g) && !mine ? '<div class="locknote">No pick made — locked.</div>' : '')
      + '</div>';
  });
  h += '</div>';
  $('tab-picks').innerHTML = h;
  const inp = $('tbInput');
  if (inp && hadFocus && !inp.disabled) inp.focus();
  if (focusN && $('nameBox')) $('nameBox').focus();
}

const logoImg = (t, cls) => (t.logo ? '<img class="' + (cls || 'lg') + '" src="' + esc(t.logo) + '" alt="" loading="lazy">' : '');
const teamBy = (g, abbr) => (g.home.abbr === abbr ? g.home : g.away.abbr === abbr ? g.away : null);
// Week spreadsheet: one row per player (sorted by rank), one column per game.
// Green = right, red = wrong, light tint = live game currently winning/losing.
function weekSheetHtml(games, sc) {
  const sheets = S.docs.filter((d) => d.week === S.week);
  const tnf = sc.tnf;
  const tnfLocked = tnf && isLocked(tnf);
  let h = '<div class="tablewrap"><table class="sheet"><thead><tr><th class="rank">#</th><th class="name">Player</th><th class="tot">W</th><th class="tot">L</th>';
  games.forEach((g) => {
    const sc2 = g.state !== 'pre' && g.away.score != null ? g.away.score + '-' + g.home.score : '';
    h += '<th class="gh' + (g === tnf ? ' tbcol' : '') + '"><span class="ghl">' + logoImg(g.away) + '<span>@</span>' + logoImg(g.home) + '</span>'
      + esc(g.away.abbr) + ' @ ' + esc(g.home.abbr)
      + '<small class="' + (isLive(g) ? 'live' : '') + '">' + esc(sc2 ? (g.final ? 'F ' : '') + sc2 : etDay(g.kick)) + '</small></th>';
  });
  h += '<th class="tot">TB</th><th class="tot">Off</th></tr></thead><tbody>';
  sc.rows.forEach((r) => {
    const d = sheets.find((x) => x.uid === r.uid);
    const me = S.user && r.uid === S.user.uid;
    const won = sc.winners.includes(r.uid);
    h += '<tr class="' + (me ? 'mine' : '') + (won ? ' won' : '') + '"><td class="rank">' + (won ? '🏆' : r.rank) + '</td><td class="name">' + esc(nameOf(r.uid)) + '</td>'
      + '<td class="tot w">' + r.w + '</td><td class="tot l">' + r.l + '</td>';
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
    const tbShow = r.tb != null && (me || tnfLocked);
    h += '<td class="tot">' + (r.tb == null ? '–' : tbShow ? r.tb : '🔒') + '</td><td class="tot">' + (r.diff == null ? '–' : r.diff) + '</td></tr>';
  });
  h += '</tbody></table></div>';
  return h;
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
    const me = S.user && r.uid === S.user.uid;
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

function miniScore(g) {
  const win = winnerOf(g);
  const line = (t) => '<div class="ln' + (win && win !== 'TIE' && win !== t.abbr ? ' lost' : '') + '"><span>' + (t.logo ? '<img src="' + esc(t.logo) + '" alt="">' : '') + esc(t.name || t.abbr) + '</span><b>' + (g.state !== 'pre' && t.score != null ? t.score : '') + '</b></div>';
  const right = isLive(g) && g.prob ? esc(g.prob.home >= 0.5 ? g.home.abbr + ' ' + Math.round(g.prob.home * 100) : g.away.abbr + ' ' + Math.round(g.prob.away * 100)) + '% to win' : '';
  return '<div class="mini">' + line(g.away) + line(g.home) + '<div class="st' + (isLive(g) ? ' live' : '') + '"><span>' + esc(g.state === 'pre' ? fmtKick(g.kick) : g.detail) + '</span><span>' + right + '</span></div></div>';
}
function renderBoard(games) {
  let h = '<div class="subtabs"><button data-act="bv" data-v="week" class="' + (S.boardView === 'week' ? 'on' : '') + '">Week ' + S.week + '</button>'
    + '<button data-act="bv" data-v="season" class="' + (S.boardView === 'season' ? 'on' : '') + '">Season</button></div>';
  if (!fbOn) h += '<div class="empty">Standings show up here once Firebase is set up.</div>';
  else if (S.boardView === 'week') {
    const sc = scoreWeek(S.week);
    const live = games.some(isLive);
    h += '<div class="card"><h3>Week ' + S.week + (sc.done ? ' · Final' : live ? ' · Live' : '') + '</h3>';
    if (sc.tnf) h += '<div class="muted" style="font-size:13px;margin-bottom:8px">Tiebreaker: ' + esc(sc.tnf.away.name + ' @ ' + sc.tnf.home.name) + ' total points' + (sc.tnfTotal != null ? ' — <b style="color:#fff">' + sc.tnfTotal + (sc.tnf.final ? ' final' : ' so far') + '</b>' : '') + '</div>';
    if (sc.winners.length) h += '<div class="notice" style="margin-bottom:10px">🏆 Week ' + S.week + ' winner' + (sc.winners.length > 1 ? 's' : '') + ': <b>' + sc.winners.map((u) => esc(nameOf(u))).join(', ') + '</b></div>';
    if (!sc.rows.length) h += '<div class="empty">No picks in yet for this week.</div>';
    else h += weekSheetHtml(games, sc)
      + '<div class="legend"><span><i class="right"></i>Right</span><span><i class="wrong"></i>Wrong</span><span><i class="up"></i>Winning now</span><span><i class="down"></i>Losing now</span><span>🔒 hidden until kickoff</span></div>';
    h += '</div>';
  } else {
    h += '<div class="card"><h3>' + S.season + ' Season</h3>' + seasonSheetHtml() + '</div>';
  }
  h += '<div class="card"><h3>Scores · Week ' + S.week + '</h3><div class="scores">' + games.map(miniScore).join('') + '</div></div>';
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
