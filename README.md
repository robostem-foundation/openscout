<div align="center">

<img src="public/openscout-mark.png" alt="OpenScout" width="88">

# OpenScout

**Scouting and analytics for VEX Robotics events.**

Browse every event and team across V5RC, VIQRC, VURC, and VAIRC — with the rankings,
skills scores, match history, and awards your team actually scouts on, in one place.

[![Live](https://img.shields.io/badge/live-openscout.ing-0a0a0a)](https://openscout.ing)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![Built with React](https://img.shields.io/badge/React-19-149eca)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6)](https://www.typescriptlang.org)

<img src=".github/assets/events.png" alt="OpenScout event browser, showing filters for season, program, grade, region, and event tier alongside a sorted event list" width="820">

</div>

---

## What it does

OpenScout sits on top of the official RobotEvents data and adds the parts scouting
actually needs: tiering, filtering, cross-team comparison, and a place to keep notes.

| | |
| --- | --- |
| **Events** | Filter 1,600+ events by season, program, grade level, region, and tier — Worlds, Signature, Spotlight, Championship. Smart Sort surfaces what is near you and near today. |
| **Teams** | Full team profiles: rankings, skills, match records, awards, and season-over-season history. A radar profile scores win rate, AWP, consistency, world skills, and experience at a glance. |
| **Skills** | World skills leaderboards by program and grade, with driver and programming splits. |
| **Jumper** | Jump straight to a specific match inside an event's recorded livestream. Matches YouTube and BoxCast streams against the match schedule and seeks to the right timestamp. |
| **My Team** | Pin your team, track its events and recent matches, and keep per-match notes. |
| **Shared teams** | Invite your club with role-based access, then build an alliance-selection picklist together that syncs live across everyone's devices. |
| **Auto-translate** | Event names from non-English regions are translated on demand and cached server-side. |

Installable as a PWA, works offline for already-visited pages, and follows your system
light/dark theme.

<div align="center">
<img src=".github/assets/team.png" alt="OpenScout team profile for 2775V, showing world skills rank, win rate, a radar team profile chart, and win rate and skills score trends over time" width="820">
</div>

## Running it locally

Requires Node 20 or newer.

```bash
git clone https://github.com/axcdeng/webscout.git
cd webscout
npm install
cp .env.example .env
npm run dev
```

The app comes up on <http://localhost:5175>. A single Express process serves both the
API routes and the Vite dev server, so there is nothing else to start.

**You will need at least one API key.** OpenScout reads competition data from
RobotEvents, and that requires a token — the app will render but stay empty without
one. [.env.example](.env.example) documents every variable, what it is for, whether it
is a real secret, and what happens when it is missing. The short version:

| Variable | Needed for |
| --- | --- |
| `ROBOTEVENTS_API_KEY` / `RSE_API_KEY` | All event, team, ranking, and match data |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` | Accounts, notes, shared teams, picklists |
| `VITE_DEFAULT_YOUTUBE_API_KEY` | Jumper stream lookup |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Proxy rate limiting (no-op when unset) |

Accounts are optional for local development — browsing works without Supabase
configured; only the account-backed features go dark.

### Other commands

```bash
npm run build    # tsc -b && vite build
npm test         # vitest
npm run lint     # eslint
npm run preview  # serve the production build
```

## How it fits together

```
src/          React 19 + Vite front end (Tailwind v4, Radix, Geist)
  jumper/     Match-video sync: stream detection, seek math, BoxCast/YouTube
server/       Express app — the upstream proxy, scrapers, translate, auth
api/          The same handlers as Vercel serverless functions
supabase/     SQL migrations for accounts, shared teams, notes, picklists
```

Upstream API keys never reach the browser. Every request to RobotEvents goes through
the server-side proxy in [server/proxy.ts](server/proxy.ts), which attaches the key and
guards the route with an origin allowlist plus per-user rate limiting — otherwise a
public deployment is a free relay for anyone who finds the URL. Native clients that
cannot send an `Origin` header authenticate with a Supabase bearer token instead
([server/appAuth.ts](server/appAuth.ts)).

The Supabase migrations in `supabase/migrations/` are applied by hand, in order, in the
SQL editor — each one is idempotent and transactional. Access to shared-team data is
enforced by row-level security rather than in application code.

## Contributing

Issues and pull requests are welcome. Before opening a PR, please run:

```bash
npm run lint && npx tsc -b && npm test
```

Two things worth knowing: `src/App.tsx` is large and is being decomposed gradually, and
schema changes need a new numbered, idempotent migration rather than an edit to an
existing one.

## Security

Found a vulnerability? Please report it privately to
[contact@robostem.org](mailto:contact@robostem.org) rather than opening a public issue.

## License

Licensed under the [GNU Affero General Public License v3.0](LICENSE).

You are free to use, modify, and self-host OpenScout. The AGPL's key condition is that
if you run a modified version as a network service, you must make your source available
to its users under the same license. Contact [contact@robostem.org](mailto:contact@robostem.org)
if you need different terms.

The bundled Geist and Geist Mono fonts are © Vercel, licensed separately under the
[SIL Open Font License 1.1](public/fonts/OFL.txt).

OpenScout is an independent project. It is not affiliated with, endorsed by, or
sponsored by the REC Foundation or VEX Robotics. Competition data is sourced from
RobotEvents.
