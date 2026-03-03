# FantasyGolfV2 — Riganti Fantasy Golf League 2026

## Project Overview
Private fantasy golf web app for a 10-person league. Members pick 5 golfers per tournament within a budget. Admin manually manages tournaments and uploads player/earnings CSVs. All league members are visible on the leaderboard regardless of whether they've submitted picks.

## Tech Stack
- **Vite + React 18** — fast dev server, ES modules
- **Firebase 10** (modular SDK) — Auth (Email/Password + Google), Firestore, Storage
- **Tailwind CSS v3** — mobile-first utility styling, dark theme (`gray-950` base)
- **React Router v6** — client-side routing
- **react-papaparse** — CSV drag-and-drop parsing for admin player/earnings upload

## Key Commands
```bash
npm install        # install dependencies
npm run dev        # start dev server (localhost:5173)
npm run build      # production build
```

## Firebase Setup Requirements
1. Enable Auth → Email/Password + Google providers in Firebase console
2. Enable Firebase Storage (for tournament cover images and user avatars)
3. Create Firestore database (start in test mode, then deploy firestore.rules)
4. Register web app → copy config to `.env.local`
5. Note admin UID → add to `.env.local` as `VITE_ADMIN_UID`
6. Users set their own display name on first login (no need to set it in Firebase console)

## Environment Variables (`.env.local` — gitignored)
```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_ADMIN_UID=
```

## Data Model

### `tournaments/{slug}`
```js
{ name: string, budget: number, status: "open" | "locked", location: string, startDate: Timestamp, lockDate: Timestamp, imageUrl: string }
```
Slug is human-readable (e.g. `masters-2026`). Used as doc ID.

### `tournaments/{slug}/players/{golferName}`
```js
{ price: number, earnings: number }
```
Golfer name is the doc ID. Price is a plain number (e.g. 9500). Earnings uploaded via CSV after tournament.

### `picks/{tournamentId}--{userId}`
```js
{ golfer_ids: string[], total_spent: number, tournamentId: string, userId: string, timestamp: Date }
```
Separator is `--` (double dash) to avoid collisions with underscores in IDs.

### `users/{uid}`
```js
{ displayName: string, teamName: string, photoUrl: string }
```
Written on first login. Users update via Settings page. `teamName` is their fantasy team nickname shown prominently on the leaderboard. `photoUrl` points to Firebase Storage (`user-avatars/{uid}`).

## Architecture Decisions

### Auth State
- `onAuthStateChanged` → state starts as `undefined` (loading), not `null` (logged out)
- This prevents the login-redirect flash on page load
- `isAdmin` = `user?.uid === import.meta.env.VITE_ADMIN_UID`
- Google sign-in: auto-saves `firebaseUser.displayName` to Firestore, skips `/setup`
- Email sign-in: `needsSetup = true` until user completes `/setup` (enters display name)

### First-Login Flow
- `AuthContext` exposes `needsSetup` boolean
- `ProtectedRoute` and `AdminRoute` both redirect to `/setup` when `needsSetup` is true
- `SetupName.jsx` — single-field form, calls `saveDisplayName()`, redirects to `/`

### Picks Document ID
- Format: `{tournamentId}--{userId}` (double dash separator)
- `setDoc` overwrites on submit (no separate create/update logic)

### Tournament Locking
- Admin manually toggles `status` field via Admin page
- No automatic lock — manual toggle only
- Frontend enforces lock: hides pick UI, shows read-only view

### Leaderboard
- Loads all users from `users/` collection, cross-references with picks
- Users without picks shown at bottom with "Picks not submitted yet"
- When open: submission count shown, golfer names hidden ("5 golfers selected · revealed at lock")
- When locked: ranked by earnings, golfer breakdown with headshots shown
- Rank badges: gold/silver/bronze medals for top 3

### Player Data
- 150 ESPN headshots in `public/headshots/` — named `First_Last.png` (spaces → underscores)
- Static nationality dataset in `src/data/players.js` — `{ country, flag }` keyed by name
- `getHeadshotUrl(name)` — `/headshots/${name.replace(/ /g, '_')}.png`
- `getPlayerMeta(name)` — returns `{ country, flag }` with empty-string fallback

### CSV Upload
- Players CSV: columns `Name`, `Price` (plain number, e.g. `9500`). Uses `writeBatch`.
- Earnings CSV: columns `Name`, `Earnings`. Uses `writeBatch` with `{ merge: true }` to update only earnings.
- Both strip `$` and commas, then `parseFloat()`
- Full golf field (~156 players) is well within the 500-op batch limit

### Firebase Storage
- Tournament covers: `tournament-covers/{slug}`
- User avatars: `user-avatars/{uid}`

## File Structure
```
FantasyGolfV2/
├── index.html
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── package.json
├── .env.local              (gitignored)
├── .env.example            (committed — shows required var names)
├── firestore.rules
├── public/
│   └── headshots/          (150 ESPN PGA player headshots, First_Last.png)
└── src/
    ├── main.jsx
    ├── index.css            (includes toast-enter animation)
    ├── App.jsx
    ├── lib/
    │   └── firebase.js      (exports auth, db, storage)
    ├── data/
    │   └── players.js       (150-player nationality dataset + getHeadshotUrl/getPlayerMeta)
    ├── context/
    │   └── AuthContext.jsx  (user, displayName, teamName, photoUrl, isAdmin, needsSetup, saveDisplayName, saveProfile)
    ├── components/
    │   ├── ProtectedRoute.jsx
    │   ├── AdminRoute.jsx
    │   ├── Avatar.jsx       (shared: photo with initials fallback, sizes sm/md/lg)
    │   ├── PlayerCard.jsx
    │   ├── BudgetBar.jsx
    │   └── Cart.jsx
    └── pages/
        ├── Login.jsx        (Email/Password + Google sign-in)
        ├── SetupName.jsx    (first-login display name entry)
        ├── Home.jsx         (tournament list: This Week / Upcoming / Previous + countdown)
        ├── Tournament.jsx   (pick 5 golfers within budget; locked = read-only earnings view)
        ├── LeaderboardHub.jsx  (tabbed: This Week / Upcoming / Previous)
        ├── Leaderboard.jsx  (per-tournament: all members, ranked by earnings when locked)
        ├── Settings.jsx     (display name, team nickname, profile photo upload)
        └── Admin.jsx        (create tournaments, upload players CSV, upload earnings CSV)
```

## Current Status
Fully implemented. Ready for Firebase console setup and `.env.local` configuration.
