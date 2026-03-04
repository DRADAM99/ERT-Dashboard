# AGENTS.md

## Cursor Cloud specific instructions

This is a **Next.js 15 PWA** (Emergency Response Team management dashboard) with Firebase backend. The active app uses the Next.js App Router in `app/`; the `src/` directory contains a legacy/unused Vite-based app.

### Quick reference

| Action | Command |
|--------|---------|
| Dev server | `npm run dev` (port 3000) |
| Build | `npm run build` |
| Lint | `npm run lint` |
| Type check | `npm run type-check` |

### Key caveats

- **Firebase config is hardcoded** in `/workspace/firebase.js` — no `.env` file is needed for the client SDK to initialize. The project connects to a live Firebase project (`emergency-dashboard-a3842`).
- **Firebase Auth (Google OAuth)** is required for the main dashboard (`/`). Without authenticating, the dashboard renders but some data-dependent features (task management, residents) will show empty states. Demo pages (`/new-leads-demo`, `/candidates-test`) work without auth.
- **`/page-fullcalendar-demo`** has a pre-existing runtime error (`Cannot read properties of undefined (reading '0')` in `FullCalendarDemo.js` line 161) — this is a known codebase bug, not an environment issue.
- **Cloud Functions** (`functions/`) have their own `package.json` and require a separate `npm install`. They target Node 18 but install fine under Node 22 for local development. Functions are optional for running the main Next.js app.
- **ESLint** is configured via flat config (`eslint.config.mjs`). The codebase has many pre-existing lint warnings/errors. Lint is disabled during production builds (`eslint.ignoreDuringBuilds: true` in `next.config.mjs`).
- The project uses **Hebrew RTL** interface throughout.
