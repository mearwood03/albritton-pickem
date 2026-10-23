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
  drafts: {}, draftName: null, saving: false, // unsaved changes, kept until the one Save button
  rawDocs: [], adminEdit: null, // commissioner's pick editor: { uid, picks: {}, tb }
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
  if (S.adminEdit) S.adminEdit = { uid: S.adminEdit.uid, picks: {}, tb: null };
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
    S.rawDocs = snap.docs.map((d) => parseSheet(d.data({ serverTimestamps: 'estimate' })));
    mergeDocs(); render();
  }, (e) => { console.warn('picks', e); });
  // Commissioner's paid / removed marks, one doc per player per week: "<season>-<week>_<uid>".
  statusUnsub = db.collection('status').where('season', '==', S.season).onSnapshot((snap) => {
    S.status = {};
    snap.forEach((d) => { S.status[d.id] = d.data(); });
    mergeDocs(); render();
  }, (e) => { console.warn('status', e); });
}
// Blake's changes live in the status doc (fixPicks = { gameId: team }, fixTb) and always count,
// whatever time he makes them. They sit on top of the player's own picks.
function mergeDocs() {
  const out = S.rawDocs.map((d) => Object.assign({}, d, { picks: Object.assign({}, d.picks) }));
  const byKey = {};
  out.forEach((d) => { byKey[d.week + '_' + d.uid] = d; });
  Object.keys(S.status).forEach((id) => {
    const st = S.status[id];
    const fixes = st.fixPicks || {};
    if (!Object.keys(fixes).length && typeof st.fixTb !== 'number') return;
    const uid = id.slice(id.indexOf('_') + 1), w = st.week;
    let d = byKey[w + '_' + uid];
    if (!d) { d = { uid, week: w, season: st.season, picks: {}, tb: null, tbAt: 0, paid: false }; out.push(d); byKey[w + '_' + uid] = d; }
    Object.keys(fixes).forEach((gid) => { if (fixes[gid]) d.picks[gid] = { team: fixes[gid], at: -Infinity, fixed: true }; });
    if (typeof st.fixTb === 'number') { d.tb = st.fixTb; d.tbAt = -Infinity; d.tbFixed = true; }
  });
  S.docs = out;
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

/* ---------------- picks: edit freely, then one Save ---------------- */
const sheetBase = () => ({ uid: S.user.uid, season: S.season, week: S.week, wk: wkKey(S.week) });
const draft = (w) => S.drafts[w] || (S.drafts[w] = { picks: {}, tb: null, paid: null });
const savedName = () => (S.user && S.players[S.user.uid] && S.players[S.user.uid].name) || '';
function changeCount(w) {
  const d = S.drafts[w];
  let n = S.draftName != null && S.draftName.trim() !== savedName() ? 1 : 0;
  if (d) n += Object.keys(d.picks).length + (d.tb != null ? 1 : 0) + (d.paid != null ? 1 : 0);
  return n;
}
function tapPick(g, team) {
  if (!S.user) return toast('Enter your name and phone number first.');
  if (isRemoved(S.week, S.user.uid)) return toast('Blake removed you from this week. Text him if that’s a mistake.');
  if (weekLocked(S.sb[S.week])) return toast('Week ' + S.week + ' is locked — picks closed at Thursday kickoff.');
  const sh = mySheet(S.week);
  const saved = sh && sh.picks[g.id] && sh.picks[g.id].team;
  const d = draft(S.week);
  if (team === saved) delete d.picks[g.id]; else d.picks[g.id] = team;
  render();
}
async function saveAll() {
  if (!S.user || S.saving) return;
  const w = S.week, d = draft(w), sh = mySheet(w) || {};
  const games = S.sb[w] || [];
  const tbg = tbGame(games);
  const name = (S.draftName != null ? S.draftName : savedName()).trim().replace(/\s+/g, ' ').slice(0, 30);
  if (!name) return toast('Type your name first.');
  if (weekLocked(games)) return toast('Week ' + w + ' is locked — picks closed at Thursday kickoff.');
  if (isRemoved(w, S.user.uid)) return toast('Blake removed you from this week. Text him if that’s a mistake.');
  const paid = d.paid != null ? d.paid : !!sh.paid;
  if (!paid) return toast('Check the “I’ve paid” box before saving.');
  let tb = null;
  if (d.tb != null && String(d.tb).trim() !== '') {
    tb = parseInt(d.tb, 10);
    if (!(tb >= 0 && tb <= 200)) return toast('Tiebreaker: enter total points between 0 and 200.');
  }
  const ref = sheetRef(w);
  const one = (fields) => ref.set(Object.assign(sheetBase(), fields), { merge: true });
  const writes = [];
  let picks = 0, skipped = 0;
  if (name !== savedName()) writes.push(db.collection('players').doc(S.user.uid).set({ name, updatedAt: FV.serverTimestamp() }, { merge: true }));
  if (d.paid != null && d.paid !== !!sh.paid) writes.push(one({ last: 'paid', paid: d.paid, at_paid: FV.serverTimestamp() }));
  Object.keys(d.picks).forEach((gid) => {
    const g = games.find((x) => x.id === gid);
    if (!g) { skipped++; return; }
    writes.push(one({ last: gid, ['g_' + gid]: d.picks[gid], ['at_' + gid]: FV.serverTimestamp() }));
    picks++;
  });
  let tbSaved = false;
  if (tb != null && tb !== sh.tb) {
    writes.push(one({ last: 'tb', tb, at_tb: FV.serverTimestamp() })); tbSaved = true;
  }
  // One change per write (the rules check each one's server time). They're sent together, in order.
  S.saving = true; render();
  try {
    await Promise.all(writes);
    S.drafts[w] = { picks: {}, tb: null, paid: null };
    S.draftName = null;
    toast(writes.length ? 'Saved! ' + (picks ? picks + ' pick' + (picks > 1 ? 's' : '') : '') + (tbSaved ? (picks ? ' + ' : '') + 'tiebreaker' : '') + (!picks && !tbSaved ? 'Your info is up to date' : '') + (skipped ? ' · ' + skipped + ' skipped (game already started)' : '') : 'Nothing new to save.');
  } catch (e) { console.warn(e); toast('Couldn’t save. Try again.' + why(e)); }
  S.saving = false; render();
}
window.addEventListener('beforeunload', (e) => { if (S.ready && S.user && changeCount(S.week)) { e.preventDefault(); e.returnValue = ''; } });

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
    return true;
  } catch (e) { console.warn(e); toast('Couldn’t save that. Are you still signed in as commissioner?' + why(e)); return false; }
}
// Commissioner pick editor: change anyone's picks or tiebreaker for the week shown, any time.
function openEditor(uid) {
  S.adminEdit = uid ? { uid, picks: {}, tb: null } : { uid: '', picks: {}, tb: null };
  render();
  setTimeout(() => { const el = $('pickEditor'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
}
// Commissioner adds someone who has no login (e.g. they texted their picks in).
async function addPerson(raw) {
  const name = String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 30);
  if (!name) return toast('Type their name first.');
  const id = 'c_' + Math.random().toString(36).slice(2, 12);
  try {
    await db.collection('players').doc(id).set({ name, updatedAt: FV.serverTimestamp() });
    S.adminEdit = { uid: id, picks: {}, tb: null };
    toast(name + ' added. Now enter their picks.');
    render();
  } catch (e) { console.warn(e); toast('Couldn’t add them. Are you still signed in as commissioner?' + why(e)); }
}
async function saveEditor() {
  const ed = S.adminEdit;
  if (!ed || !ed.uid || ed.uid === '__new') return toast('Pick a player first.');
  const patch = { fixedAt: FV.serverTimestamp() };
  const n = Object.keys(ed.picks).length;
  if (n) patch.fixPicks = Object.assign({}, ed.picks);
  if (ed.tb != null && String(ed.tb).trim() !== '') {
    const tb = parseInt(ed.tb, 10);
    if (!(tb >= 0 && tb <= 200)) return toast('Tiebreaker: enter total points between 0 and 200.');
    patch.fixTb = tb;
  }
  if (!n && patch.fixTb == null) return toast('No changes to save.');
  if (await setStatus(ed.uid, patch)) {
    toast('Saved ' + nameOf(ed.uid) + '’s changes' + (n ? ' (' + n + ' pick' + (n > 1 ? 's' : '') + (patch.fixTb != null ? ' + tiebreaker' : '') + ')' : ' (tiebreaker)') + '.');
    S.adminEdit = { uid: ed.uid, picks: {}, tb: null };
    render();
  }
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
// The pick'em week: Week 1 starts the Tuesday in config.js (week1Start), and each week turns over the
// next Tuesday (after Monday Night Football). Returns null if that date isn't set for this season.
function weekByDate() {
  const start = Date.parse((CFG.week1Start || '') + 'T06:00:00-04:00'); // early Tuesday, Eastern
  if (!start || (S.season && new Date(start).getFullYear() !== S.season)) return null;
  return Math.max(1, Math.min(WEEKS, Math.floor((Date.now() - start) / (7 * 864e5)) + 1));
}
async function loadCurrent() {
  const d = await fetchJSON(ESPN);
  S.season = (d.season && d.season.year) || (d.leagues && d.leagues[0] && d.leagues[0].season && d.leagues[0].season.year) || new Date().getFullYear();
  const type = d.season && d.season.type;
  const n = (d.week && d.week.number) || 1;
  S.curWeek = weekByDate() || (type === 2 ? Math.min(n, WEEKS) : type === 1 ? 1 : WEEKS);
  if (type === 2) { S.sb[Math.min(n, WEEKS)] = (d.events || []).map(norm).sort(byKick); S.updated = Date.now(); }
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
// The whole week locks at its first kickoff (Thursday night). Picks saved after that don't count.
const weekLock = (games) => (games && games.length ? Math.min(...games.map((g) => g.kick)) : Infinity);
// Weeks up to config.perGameLockThrough were played under the old rule (each game locked at its own
// kickoff), so picks in those weeks count if saved before that game started.
const pickCutoff = (w, games, g) => (w <= (CFG.perGameLockThrough || 0) ? g.kick : weekLock(games));
const counts = (w, games, g, p) => !!p && (p.fixed || p.at < pickCutoff(w, games, g));
const weekLocked = (games) => !!(games && games.length) && (Date.now() >= weekLock(games) || games.some((g) => g.state !== 'pre'));
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
  const cutoff = weekLock(games);
  const rows = S.docs.filter((d) => d.week === w && !isRemoved(w, d.uid) && (Object.keys(d.picks).length || d.tb != null)).map((d) => {
    const r = { uid: d.uid, w: 0, l: 0, live: 0, pend: 0, made: 0, tb: null, diff: null, paid: d.paid, rem: {} };
    Object.keys(d.picks).forEach((gid) => {
      const g = byId[gid]; const p = d.picks[gid];
      if (!g || !counts(w, games, g, p)) return; // a pick saved after the lock doesn't count
      r.made++;
      const win = winnerOf(g);
      if (win == null) { if (!g.void) { r.rem[gid] = p.team; if (isLive(g)) r.live++; else r.pend++; } }
      else if (win === p.team) r.w++;
      else if (win !== 'TIE') r.l++;
    });
    if (d.tb != null && tbg && d.tbAt < (w <= (CFG.perGameLockThrough || 0) ? tbg.kick : cutoff)) {
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
  // Mathematically eliminated: even if every remaining game goes this player's way, someone else
  // still finishes ahead (more right picks, or the same and a closer tiebreaker once MNF is final).
  const tbKnown = !!(tbg && tbg.final);
  rows.forEach((x) => {
    const best = x.w + Object.keys(x.rem).length;
    x.out = rows.some((y) => {
      if (y === x) return false;
      let yb = y.w;
      Object.keys(x.rem).forEach((gid) => { if (y.rem[gid] === x.rem[gid]) yb++; });
      if (yb !== best) return yb > best;
      return tbKnown && (y.diff == null ? Infinity : y.diff) < (x.diff == null ? Infinity : x.diff);
    });
  });
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
  if (S.admin) notes.push('You’re signed in as <b>commissioner</b>. Mark who paid, edit anyone’s picks, or remove people on the Leaderboard tab. <button class="btn sm ghost" data-act="logout">Sign out</button>');
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
    if (g) tapPick(g, a.dataset.t);
  } else if (act === 'save') saveAll();
  else if (act === 'bv') { S.boardView = a.dataset.v; render(); }
  else if (act === 'confirm') setStatus(a.dataset.u, { confirmed: a.dataset.on === '1' });
  else if (act === 'edit') openEditor(a.dataset.u);
  else if (act === 'edclose') { S.adminEdit = null; render(); }
  else if (act === 'edadd') addPerson($('edNewName') && $('edNewName').value);
  else if (act === 'edsave') saveEditor();
  else if (act === 'edpick' && S.adminEdit) {
    const gid = a.dataset.g, team = a.dataset.t;
    const d = S.docs.find((x) => x.uid === S.adminEdit.uid && x.week === S.week);
    const games = S.sb[S.week] || [];
    const g = games.find((x) => x.id === gid);
    const p = d && d.picks[gid];
    const cur = p && g && counts(S.week, games, g, p) ? p.team : null;
    if (team === cur) delete S.adminEdit.picks[gid]; else S.adminEdit.picks[gid] = team;
    render();
  }
  else if (act === 'remove') {
    const on = a.dataset.on === '1';
    if (!on || confirm('Remove ' + nameOf(a.dataset.u) + ' from Week ' + S.week + '? Their picks stop counting and they can’t pick until you restore them.')) setStatus(a.dataset.u, { removed: on });
  }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'edPlayer') { S.adminEdit = { uid: e.target.value, picks: {}, tb: null }; render(); return; }
  if (e.target.id !== 'paidBox' || !S.user) return;
  const sh = mySheet(S.week);
  draft(S.week).paid = e.target.checked === !!(sh && sh.paid) ? null : e.target.checked;
  render();
});
document.addEventListener('input', (e) => {
  const id = e.target.id;
  if (id === 'loginName' || id === 'loginPhone') e.target.dataset.dirty = '1';
  else if (id === 'nameBox') { S.draftName = e.target.value; updateSaveBar(); }
  else if (id === 'edTb' && S.adminEdit) S.adminEdit.tb = e.target.value;
  else if (id === 'tbInput') {
    const sh = mySheet(S.week);
    draft(S.week).tb = e.target.value === String(sh && sh.tb != null ? sh.tb : '') ? null : e.target.value;
    updateSaveBar();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'loginName' || e.target.id === 'loginPhone') playerLogin($('loginName').value, $('loginPhone').value);
  else if (e.target.id === 'tbInput' || e.target.id === 'nameBox') e.target.blur();
});

function teamBtn(g, side, mine, open) {
  const t = g[side];
  const win = winnerOf(g);
  const picked = mine && mine.team === t.abbr;
  const unsaved = picked && mine.draft;
  const cls = ['team'];
  if (picked) { cls.push('picked'); if (win && win !== 'TIE') cls.push(win === t.abbr ? 'right' : 'wrong'); }
  if (win && win !== 'TIE' && win !== t.abbr) cls.push('lost');
  const showScore = g.state !== 'pre' && t.score != null;
  const dis = !open ? ' disabled' : '';
  return '<button class="' + cls.join(' ') + '" data-act="pick" data-g="' + esc(g.id) + '" data-t="' + esc(t.abbr) + '"' + dis + ' aria-pressed="' + picked + '">'
    + (t.logo ? '<img src="' + esc(t.logo) + '" alt="" loading="lazy">' : '')
    + '<span class="tx"><span class="abbr">' + esc(t.full || t.name || t.abbr) + '</span>'
    + '<span class="nm">' + esc(t.record || '') + '</span></span>'
    + (picked ? '<span class="chk">' + (cls.includes('right') ? '✓ Right' : cls.includes('wrong') ? '✗ Wrong' : unsaved ? 'Not saved yet' : 'Your pick') + '</span>' : '')
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

function saveBarHtml() {
  const n = changeCount(S.week);
  return '<button class="btn save" id="saveBtn" data-act="save"' + (S.saving ? ' disabled' : '') + '>' + (S.saving ? 'Saving…' : 'Save my picks') + '</button>'
    + '<div class="savestate' + (n ? ' dirty' : '') + '" id="saveState">' + (n ? n + ' unsaved change' + (n > 1 ? 's' : '') : 'Everything’s saved ✓') + '</div>';
}
function updateSaveBar() {
  const n = changeCount(S.week);
  const st = $('saveState'); if (st) { st.className = 'savestate' + (n ? ' dirty' : ''); st.textContent = n ? n + ' unsaved change' + (n > 1 ? 's' : '') : 'Everything’s saved ✓'; }
  const top = $('topDirty'); if (top) top.hidden = !n;
}
function renderPicks(games) {
  const tbg = tbGame(games);
  const sheet = mySheet(S.week);
  const d = draft(S.week);
  const myPicks = Object.assign({}, (sheet && sheet.picks) || {});
  Object.keys(d.picks).forEach((gid) => { myPicks[gid] = { team: d.picks[gid], at: 0, draft: true }; });
  const paid = d.paid != null ? d.paid : !!(sheet && sheet.paid);
  const removed = S.user && isRemoved(S.week, S.user.uid);
  const open = fbOn && !!S.user && !removed && !weekLocked(games);
  const made = games.filter((g) => myPicks[g.id]).length;
  const locked = weekLocked(games);
  const lockAt = weekLock(games);
  const tbLocked = locked;
  const ln = keep('loginName', ''), lp = keep('loginPhone', '');
  const focus = document.activeElement && document.activeElement.id;
  const nameVal = S.draftName != null ? S.draftName : savedName();
  const tbVal = d.tb != null ? d.tb : sheet && sheet.tb != null ? sheet.tb : '';
  let h = '';
  if (fbOn && !S.user) {
    h += '<div class="card login"><h3>Make your picks</h3>'
      + '<p class="muted">Enter your name and phone number. Use the same phone number any time to come back and change your picks. Your number is never shown on the site.</p>'
      + '<div class="fields"><input id="loginName" maxlength="30" autocomplete="name" placeholder="Your name" value="' + esc(ln.val) + '"' + ln.attr + '>'
      + '<input id="loginPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="Phone number" value="' + esc(lp.val) + '"' + lp.attr + '>'
      + '<button class="btn" data-act="login"' + (S.busy ? ' disabled' : '') + '>' + (S.busy ? 'One sec…' : 'Start picking') + '</button></div></div>';
  } else if (fbOn) {
    h += '<div class="card namecard"><label for="nameBox"><b>Your name</b><span class="muted">Shown on the leaderboard</span></label>'
      + '<div class="nameRow"><input id="nameBox" maxlength="30" autocomplete="name" value="' + esc(nameVal) + '"></div></div>';
    if (removed) h += '<div class="notice">Blake removed you from Week ' + S.week + '. If you’ve paid, text him and he can add you back.</div>';
    h += '<label class="card paidcard' + (paid ? ' on' : '') + '"><input type="checkbox" id="paidBox"' + (paid ? ' checked' : '') + (removed ? ' disabled' : '') + '>'
      + '<span><b>I’ve paid my ' + esc(feeAmt || 'entry') + ' for Week ' + S.week + '</b><span class="muted">Venmo <a href="https://venmo.com/u/' + esc(encodeURIComponent(venmo)) + '" target="_blank" rel="noopener">@' + esc(venmo) + '</a>. Required to save your picks.</span></span></label>';
    h += '<div class="card summary"><div class="progress"><b>' + made + ' of ' + games.length + ' picked</b>'
      + '<div class="muted" style="font-size:12px">' + (locked ? 'Week ' + S.week + ' is locked — picks closed at Thursday kickoff. Everyone’s picks are on the Leaderboard.' : 'Pick every game, then the MNF tiebreaker, then tap Save at the bottom · <b>all picks lock at Thursday kickoff (' + esc(fmtKick(lockAt)) + ')</b>') + '</div>'
      + '<div class="bar"><i style="width:' + Math.round((made / games.length) * 100) + '%"></i></div>'
      + '<div class="topdirty" id="topDirty"' + (changeCount(S.week) ? '' : ' hidden') + '>You have unsaved changes — tap <b>Save my picks</b> at the bottom.</div></div></div>';
  }
  h += '<div class="games">';
  games.forEach((g) => {
    const mine = myPicks[g.id];
    const late = mine && !mine.draft && !counts(S.week, games, g, mine);
    h += '<div class="game' + (g === tbg ? ' tnf' : '') + '"><div class="game-head">' + statusText(g)
      + '<span>' + (g === tbg ? '<span class="tag">MNF · Tiebreaker</span>' : '') + (locked && g.state === 'pre' ? ' 🔒' : '') + '</span></div>'
      + '<div class="teams">' + teamBtn(g, 'away', mine, open) + teamBtn(g, 'home', mine, open) + '</div>'
      + (late ? '<div class="locknote">This pick was saved after Thursday kickoff, so it doesn’t count.</div>' : '')
      + (S.user && locked && !mine ? '<div class="locknote">No pick made — locked.</div>' : '')
      + '</div>';
    // The tiebreaker comes right after the MNF game, so it's the last thing you fill in.
    if (g === tbg && fbOn && S.user) {
      h += '<div class="card tbcard"><label for="tbInput"><b>Tiebreaker: total points in ' + esc(matchup(g)) + '</b>'
        + '<span class="muted">' + (tbLocked ? 'Locked at Thursday kickoff.' : 'Both teams’ points added together. Closest guess wins a tie on picks.') + '</span></label>'
        + '<input id="tbInput" type="number" inputmode="numeric" min="0" max="200" placeholder="pts" value="' + esc(tbVal) + '"' + (tbLocked || !open ? ' disabled' : '') + '></div>';
    }
  });
  h += '</div>';
  if (fbOn && S.user && !removed && !locked) h += '<div class="card savecard">' + saveBarHtml() + '</div>';
  $('tab-picks').innerHTML = h;
  [['loginName', ln], ['loginPhone', lp]].forEach(([id, k]) => { if (k.focus && $(id)) $(id).focus(); });
  if ((focus === 'nameBox' || focus === 'tbInput') && $(focus) && !$(focus).disabled) {
    const el = $(focus); el.focus();
    try { const v = el.value.length; el.setSelectionRange(v, v); } catch (e) { /* number inputs don't support it */ }
  }
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
    + '<button class="btn sm ghost" data-act="edit" data-u="' + esc(r.uid) + '">Edit picks</button> '
    + '<button class="btn sm ghost" data-act="remove" data-u="' + esc(r.uid) + '" data-on="1">Remove</button></td>';
}
// Week spreadsheet: one row per player (sorted by rank), one column per game.
// Green = right, red = wrong, light tint = live game currently winning/losing.
function weekSheetHtml(games, sc) {
  const tbg = sc.tbg;
  const locked = weekLocked(games);
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
    h += '<tr class="' + (me ? 'mine' : '') + (won ? ' won' : '') + (r.out ? ' out' : '') + '"' + (r.out ? ' title="Can’t win this week"' : '') + '><td class="rank">' + (won ? '🏆' : r.rank) + '</td><td class="name">' + esc(nameOf(r.uid)) + '</td>'
      + '<td class="tot w">' + r.w + '</td><td class="tot l">' + r.l + '</td>' + paidCell(S.week, r);
    games.forEach((g) => {
      const p = d && d.picks[g.id];
      if (!p) { h += '<td class="c none">–</td>'; return; }
      if (!me && !locked) { h += '<td class="c hide" title="Hidden until Thursday kickoff">🔒</td>'; return; }
      if (!counts(S.week, games, g, p)) { h += '<td class="c late" title="Saved after Thursday kickoff — doesn’t count">late</td>'; return; }
      const pt = teamBy(g, p.team);
      const win = winnerOf(g);
      let cls = 'open';
      if (win && win !== 'TIE') cls = win === p.team ? 'right' : 'wrong';
      else if (win === 'TIE') cls = 'tie';
      else if (isLive(g) && g.home.score != null && g.home.score !== g.away.score) {
        const lead = g.home.score > g.away.score ? g.home.abbr : g.away.abbr;
        cls = lead === p.team ? 'up' : 'down';
      }
      h += '<td class="c ' + cls + (p.fixed ? ' fixed' : '') + '" title="' + esc(pt ? pt.full : p.team) + (p.fixed ? ' · changed by Blake' : '') + '">' + (pt ? logoImg(pt) : '') + '<span>' + esc(p.team) + '</span>' + (p.fixed ? '<i class="fx">✎</i>' : '') + '</td>';
    });
    const tbShow = r.tb != null && (me || locked || S.admin);
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

function editorHtml(games) {
  const ed = S.adminEdit;
  const ids = Object.keys(S.players).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  let h = '<div class="card editor" id="pickEditor"><h3>✎ Edit picks · Week ' + S.week + '</h3>'
    + '<p class="muted">Commissioner only. Changes here count no matter when you make them, even after the week locks.</p>'
    + '<select id="edPlayer"><option value="">Choose a player…</option>'
    + ids.map((u) => '<option value="' + esc(u) + '"' + (u === ed.uid ? ' selected' : '') + '>' + esc(nameOf(u)) + '</option>').join('')
    + '<option value="__new"' + (ed.uid === '__new' ? ' selected' : '') + '>+ Add a new person…</option></select>';
  if (ed.uid === '__new') {
    h += '<div class="edfoot" style="margin-top:12px"><input id="edNewName" maxlength="30" placeholder="Their name" autocomplete="off">'
      + '<button class="btn" data-act="edadd">Add to the pool</button><button class="btn ghost" data-act="edclose">Close</button></div>'
      + '<p class="muted" style="margin-top:8px">Then enter their picks. Picks you enter are marked ✎ on the leaderboard like your other edits.</p>';
  } else if (ed.uid) {
    const d = S.docs.find((x) => x.uid === ed.uid && x.week === S.week) || { picks: {}, tb: null };
    h += '<div class="edgames">';
    games.forEach((g) => {
      const cur = d.picks[g.id];
      const team = ed.picks[g.id] || (cur && cur.team);
      const b = (t) => '<button class="edt' + (team === t.abbr ? ' on' : '') + (ed.picks[g.id] === t.abbr ? ' changed' : '') + '" data-act="edpick" data-g="' + esc(g.id) + '" data-t="' + esc(t.abbr) + '">' + logoImg(t) + esc(t.abbr) + '</button>';
      h += '<div class="edrow"><span class="edwhen">' + esc(etDay(g.kick)) + '</span>' + b(g.away) + '<span class="at">@</span>' + b(g.home) + '</div>';
    });
    const tbVal = ed.tb != null ? ed.tb : d.tb != null ? d.tb : '';
    const n = Object.keys(ed.picks).length + (ed.tb != null && String(ed.tb) !== String(d.tb != null ? d.tb : '') ? 1 : 0);
    h += '</div><div class="edfoot"><label>MNF tiebreaker <input id="edTb" type="number" inputmode="numeric" min="0" max="200" value="' + esc(tbVal) + '"></label>'
      + '<button class="btn" data-act="edsave">Save ' + esc(nameOf(ed.uid)) + '’s changes</button>'
      + '<button class="btn ghost" data-act="edclose">Close</button></div>'
      + (n ? '<div class="savestate dirty">' + n + ' unsaved change' + (n > 1 ? 's' : '') + '</div>' : '');
  } else h += ' <button class="btn ghost sm" data-act="edclose">Close</button>';
  return h + '</div>';
}
function renderBoard(games) {
  let h = '<div class="subtabs"><button data-act="bv" data-v="week" class="' + (S.boardView === 'week' ? 'on' : '') + '">Week ' + S.week + '</button>'
    + '<button data-act="bv" data-v="season" class="' + (S.boardView === 'season' ? 'on' : '') + '">Season</button></div>';
  if (!fbOn) h += '<div class="empty">Standings show up here once Firebase is set up.</div>';
  else if (S.boardView === 'week') {
    const sc = scoreWeek(S.week);
    const live = games.some(isLive);
    if (S.admin) h += S.adminEdit ? editorHtml(games) : '<div class="edopen"><button class="btn sm" data-act="edit" data-u="">✎ Edit someone’s picks</button></div>';
    h += '<div class="card"><h3>Week ' + S.week + (sc.done ? ' · Final' : live ? ' · Live' : '') + '</h3>';
    if (sc.tbg) h += '<div class="muted" style="font-size:13px;margin-bottom:8px">Tiebreaker (MNF): ' + esc(matchup(sc.tbg)) + ' total points' + (sc.tbTotal != null ? ' — <b style="color:#fff">' + sc.tbTotal + (sc.tbg.final ? ' final' : ' so far') + '</b>' : '') + '</div>';
    if (sc.winners.length) h += '<div class="notice" style="margin-bottom:10px">🏆 Week ' + S.week + ' winner' + (sc.winners.length > 1 ? 's' : '') + ': <b>' + sc.winners.map((u) => esc(nameOf(u))).join(', ') + '</b></div>';
    if (!sc.rows.length) h += '<div class="empty">No picks in yet for this week.</div>';
    else h += weekSheetHtml(games, sc)
      + '<div class="legend"><span><i class="right"></i>Right</span><span><i class="wrong"></i>Wrong</span><span><i class="up"></i>Winning now</span><span><i class="down"></i>Losing now</span><span><i class="out"></i>Can’t win this week</span><span>🔒 hidden until Thursday kickoff</span><span>Paid: ✓ confirmed by Blake · “said” = checked the box</span></div>';
    h += removedHtml() + '</div>';
  } else {
    h += '<div class="card"><h3>' + S.season + ' Season</h3>' + seasonSheetHtml() + '</div>';
  }
  const focusTb = document.activeElement && document.activeElement.id === 'edTb';
  $('tab-board').innerHTML = h;
  if (focusTb && $('edTb')) $('edTb').focus();
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
    S.curWeek = S.curWeek || weekByDate() || 1;
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
