# Albritton's Pick Em's

Weekly NFL pick'em: pick the winner of every game, and guess the total points of
Monday Night Football as the tiebreaker. In Broncos colors, with a Venmo button
for **@Blakealbritton6** ($21 entry).

- **My Picks** — type your name and phone number (no Google sign-in), check
  "I've paid my $21", then tap a team in each game. Picks save as you tap and each
  game locks at its own kickoff; the MNF tiebreaker locks when MNF kicks off. Come
  back from any phone with the same number to change picks. Phone numbers are
  never shown on the site.
- **Leaderboard** — a spreadsheet of every player, auto-sorted by rank, with a column
  per game: green cell = right, red = wrong, light green/red = winning/losing live.
  Other people's picks stay hidden until that game kicks off. Shows W/L, paid status
  and the tiebreaker; a Season view shows each player's record week by week.

Scores, logos, records and team names come from ESPN's public NFL feed and refresh
automatically: every 30 seconds while games are on, every 5 minutes otherwise.

## Rules the site uses
- Most correct picks wins the week.
- Tie on picks → closest to the actual total points of the week's last game
  (Monday Night Football; the later one if there are two) wins.
- A tied NFL game, or a postponed one, counts for nobody.
- Every pick is stamped with Google's server clock. A pick saved after kickoff
  shows as "late" and doesn't count.
- Players must check "I've paid" before they can pick.

## Commissioner (Blake)
Tap **Commissioner** at the bottom of the site and log in with
blakealbritton6@gmail.com.
- **First time:** type a password and tap **First time? Create the account**. Firebase
  emails a link to that address. Click it, come back and **Sign in**.
- On the **Leaderboard** tab each player gets **Mark paid** (shows a green ✓ in the
  Paid column) and **Remove** (their picks stop counting that week and they can't
  pick). Removed players are listed under the table with a **Restore** button.
- "said" in the Paid column means the player checked the box but Blake hasn't
  confirmed it yet.
- Logging in as commissioner logs that phone out of its player picks. Tap **Sign out**
  and enter your name + phone again to pick.

## Setup (Firebase + Vercel)

### Firebase
1. **Turn on logins:** Firebase console → **Security → Authentication → Sign-in method**
   → **Email/Password** → switch **Enable** on (leave "Email link" off) → **Save**.
   (Players never see email or passwords — the site uses their phone number behind the
   scenes. Google sign-in isn't used and can stay off.)
2. **Database:** **Databases & Storage → Firestore Database → Create database** (production
   mode, US location).
3. **Rules:** Firestore → **Rules** tab → replace everything with `firestore.rules` →
   **Publish**. Publish again any time this file changes.
4. The Firebase keys are already in `config.js`.

### Vercel
1. https://vercel.com → **Add New… → Project** → **Import** `albritton-pickem`.
2. **Framework Preset:** `Other`. **Root Directory:** `./`. Leave build settings empty →
   **Deploy**.
3. Every push to `main` redeploys within about a minute.
4. Optional: add your `.vercel.app` address in Firebase under **Authentication →
   Settings → Authorized domains** (needed only if you ever turn Google sign-in on).

### If something goes wrong
- **"Logins aren't switched on yet":** Email/Password isn't enabled (Firebase step 1).
- **Picks won't save:** the rules aren't published (Firebase step 3), or Blake removed
  that player for the week.
- **Commissioner buttons don't show:** Blake hasn't clicked the verification email yet.
- **Someone changed phones/numbers:** they just enter the new number — it starts a fresh
  entry. Blake can remove the old one.

## Changing things
- Venmo tag or entry fee text: `config.js`.
- Fixing a player's name or deleting a test player: Firebase console → Firestore →
  `players` (names), `picks` (one doc per player per week), `status` (Blake's paid /
  removed marks).

## Files
- `index.html`, `style.css`, `app.js` — the site
- `config.js` — Firebase keys, Venmo tag, entry fee, commissioner email
- `firestore.rules` — who can change what (each player only their own picks; only Blake marks paid / removes)
