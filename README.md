# Albritton's Pick Em's

Weekly NFL pick'em: pick the winner of every game, and guess the total points of
Thursday Night Football as the tiebreaker. In Broncos colors, with a Venmo button
for **@Blakealbritton6** ($21 entry).

- **My Picks** — type your name (it's what the leaderboard shows), then tap a team
  to pick it (saves right away). Games run top to bottom with each team's logo,
  name and record. Each game locks at its own kickoff; the TNF tiebreaker locks
  when TNF kicks off.
- **Leaderboard** — a spreadsheet of every player, auto-sorted by rank, with a column
  per game: green cell = right, red = wrong, light green/red = winning/losing live.
  Other people's picks stay hidden until that game kicks off. Includes W/L totals and
  the tiebreaker; a Season view shows each player's record week by week. Live
  scores sit underneath.

Scores, logos, records and team names come from ESPN's public NFL feed and refresh
automatically: every 30 seconds while games are on, every 5 minutes otherwise.
Picks update live for everyone the moment they're saved.

## Rules the site uses
- Most correct picks wins the week.
- Tie on picks → closest to the actual TNF total points (over or under) wins.
  On Thanksgiving week the tiebreaker is the Thursday **night** game.
- A tied NFL game, or a postponed one, counts for nobody.
- Every pick is stamped with Google's server clock. A pick saved after kickoff
  shows as "late" and doesn't count, even if someone tampers with their phone's clock.

## Publishing it (Firebase + Vercel, about 20 minutes, all free)

Firebase stores the picks and handles Google sign-in. Vercel hosts the website.

### Part 1: Firebase
1. Go to https://console.firebase.google.com, sign in with your Google account and click
   **Create a project**. Name it `albritton-pickem`. Google Analytics can stay off.
   Click **Create project**, then **Continue**.
2. **Turn on Google sign-in:** in the left menu, **Build → Authentication → Get started**.
   Under **Sign-in method**, click **Google** → switch **Enable** on → pick your email as the
   support email → **Save**.
3. **Create the database:** **Build → Firestore Database → Create database**. Pick a
   US location (e.g. `nam5`) → **Next** → **Start in production mode** → **Create**.
4. **Lock it down:** in Firestore, open the **Rules** tab, delete what's there, paste
   everything from `firestore.rules`, and click **Publish**.
5. **Get your site keys:** click the gear (top left) → **Project settings**. Under
   **Your apps**, click the **</>** (Web) icon, name it `pickem`, leave "Firebase Hosting"
   unchecked, click **Register app**. Firebase shows a block like
   `const firebaseConfig = { apiKey: "...", authDomain: "...", ... }`.
6. Open `config.js` and paste each value over the matching `PASTE...` placeholder
   (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId). Save and commit.
   These keys are safe to have in public code. The rules from step 4 are what protect the data.

### Part 2: Vercel
1. Go to https://vercel.com and **Sign up with GitHub** (the free Hobby plan is fine).
2. Click **Add New… → Project**. Find `albritton-pickem` and click **Import**.
   If it isn't listed, click **Adjust GitHub App Permissions** and give Vercel access to it.
3. On the setup screen:
   - **Project Name:** `albritton-pickem` (this becomes `albritton-pickem.vercel.app`)
   - **Framework Preset:** `Other`
   - **Root Directory:** leave as `./`
   - Leave Build and Output settings empty.
4. Click **Deploy**. When it finishes, copy your site address (e.g. `albritton-pickem.vercel.app`).
5. From then on, every push to the `main` branch redeploys the site automatically
   within about a minute.

### Part 3: Connect the two (sign-in won't work until you do this)
1. Back in Firebase: **Authentication → Settings → Authorized domains → Add domain**.
2. Paste your Vercel address **without** `https://` (e.g. `albritton-pickem.vercel.app`) → **Add**.
3. If you add a custom domain in Vercel later, add that domain here too.

### Part 4: Test it, then send the link
1. Open your Vercel address. You should see this week's games with logos and records.
2. Click **Sign in**, choose your Google account, and type your name in the **Your name** box.
3. Make a pick, then open the **Leaderboard** tab and check that your row shows up.
4. Send the link to the group. Everyone signs in with Google, adds their name, and picks.

### If something goes wrong
- **"Picks aren't switched on yet" banner:** `config.js` still has a `PASTE` value in it.
- **Sign-in pop-up closes with an error (`auth/unauthorized-domain`):** the Vercel address
  is missing from Firebase's Authorized domains (Part 3).
- **Picks won't save:** the Firestore rules weren't published (Part 1, step 4).
- **Old version showing:** make sure your latest change is on the `main` branch.

## Changing things
- Venmo tag or entry fee text: `config.js`.
- Fixing a player's name or removing a test player: Firebase console → Firestore →
  `players` (names) and `picks` (one doc per player per week).

## Files
- `index.html`, `style.css`, `app.js` — the site
- `config.js` — Firebase keys, Venmo tag, entry fee
- `firestore.rules` — who can change what (each player only their own picks)
