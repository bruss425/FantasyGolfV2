# FantasyGolfV2 — The Loop Links League

## Project Overview
Private fantasy golf web app for a 10-person league. Members pick 5 golfers per tournament within a budget. Admin manually manages tournaments and uploads player CSVs.

## Tech Stack
- **Vite + React 18** — fast dev server, ES modules
- **Firebase 10** (modular SDK) — Auth (Email/Password) + Firestore
- **Tailwind CSS v3** — mobile-first utility styling
- **React Router v6** — client-side routing
- **react-papaparse** — CSV drag-and-drop parsing for admin player upload

## Key Commands
```bash
npm install        # install dependencies
npm run dev        # start dev server (localhost:5173)
npm run build      # production build
```

## Firebase Setup Requirements
1. Enable Auth → Email/Password provider in Firebase console
2. Create Firestore database (start in test mode, then deploy firestore.rules)
3. Register web app → copy config to `.env.local`
4. Manually create all 10 user accounts with email + **displayName** set in Auth console
5. Note admin UID → add to `.env.local` as `VITE_ADMIN_UID`

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
{ name: string, budget: number, status: "open" | "locked" }
```
Slug is human-readable (e.g. `masters-2026`). Used as doc ID.

### `tournaments/{slug}/players/{golferName}`
```js
{ price: number, earnings: number }
```
Golfer name is the doc ID. Price is a plain number (e.g. 9500).

### `picks/{tournamentId}--{userId}`
```js
{ golfer_ids: string[], total_spent: number, tournamentId: string, userId: string, timestamp: Date }
```
Separator is `--` (double dash) to avoid collisions with underscores in IDs.

### `users/{uid}`
```js
{ displayName: string }
```
Written on first login from `auth.currentUser.displayName`.

## Architecture Decisions

### Auth State
- `onAuthStateChanged` → state starts as `undefined` (loading), not `null` (logged out)
- This prevents the login-redirect flash on page load
- `isAdmin` = `user?.uid === import.meta.env.VITE_ADMIN_UID`

### Picks Document ID
- Format: `{tournamentId}--{userId}` (double dash separator)
- `setDoc` overwrites on submit (no separate create/update logic)

### Tournament Locking
- Admin manually toggles `status` field via Admin page
- MVP: no automatic Thursday 7 AM lock (manual toggle only)
- Frontend enforces lock: hides pick UI, shows read-only view

### Leaderboard Privacy
- When tournament is `open`: show that picks exist, but golfer names show as `"Pick Hidden"`
- When `locked`: show actual golfer names
- Enforced in frontend only (not in Firestore rules)

### CSV Upload
- Columns: `Name`, `Price` (price as plain number, e.g. `9500`)
- Strips `$` and commas, then `parseFloat()`
- Uses `writeBatch` from `firebase/firestore`
- Full golf field (~156 players) is well within the 500-op batch limit

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
└── src/
    ├── main.jsx
    ├── index.css
    ├── App.jsx
    ├── lib/
    │   └── firebase.js
    ├── context/
    │   └── AuthContext.jsx
    ├── components/
    │   ├── ProtectedRoute.jsx
    │   ├── AdminRoute.jsx
    │   ├── PlayerCard.jsx
    │   ├── BudgetBar.jsx
    │   └── Cart.jsx
    └── pages/
        ├── Login.jsx
        ├── Home.jsx
        ├── Tournament.jsx
        ├── Leaderboard.jsx
        └── Admin.jsx
```

## Current Status
MVP fully implemented. All steps 0–10 complete. Ready for Firebase console setup and `.env.local` configuration.
