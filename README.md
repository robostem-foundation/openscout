<p align="center">
  <picture>
    <source srcset=".github/assets/logo-dark.png" media="(prefers-color-scheme: dark)">
    <source srcset=".github/assets/logo-light.png" media="(prefers-color-scheme: light)">
    <img src=".github/assets/logo-light.png" width="360" alt="OpenScout">
  </picture>
</p>

---

<p align="center">Scouting and analytics for VEX Robotics events. Browse every event and team across V5RC, VIQRC, VURC, and VAIRC in one place.</p>

<p align="center">
  <a href="https://openscout.ing"><img alt="Live at openscout.ing" src="https://img.shields.io/badge/live-openscout.ing-0a0a0a?style=flat-square"></a>
  <a href="LICENSE"><img alt="License AGPL-3.0" src="https://img.shields.io/badge/license-AGPL--3.0-blue?style=flat-square"></a>
  <img alt="React 19" src="https://img.shields.io/badge/React-19-149eca?style=flat-square">
  <img alt="TypeScript 5.9" src="https://img.shields.io/badge/TypeScript-5.9-3178c6?style=flat-square">
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-CN.md">简体中文</a><br>
  <a href="https://openscout.ing"><img src=".github/assets/events.png" width="840" alt="OpenScout event browser, showing filters for season, program, grade, region, and event type next to a sorted list of events"></a>
</p>

---

## What OpenScout does

Most of this information is already available on VEX Events. The problem is finding and comparing it.

Looking for nearby events can mean paging through competitions around the world. Scouting another team usually means opening several pages and manually comparing their results. OpenScout organizes that data around the things you actually need before and during a competition.

### Events

Filter events by season, program, grade level, region, and event type. Worlds, Signature Events, and Championship events are labeled automatically.

Smart Sort moves relevant events toward the top based on their location and date, so nearby upcoming events are easier to find.

### Teams

Each team page includes rankings, skills scores, match history, awards, and previous seasons.

The radar chart compares win rate, AWP, consistency, world skills, and experience in one view. It gives you a quick idea of how a team performs before you dig into the full numbers.

### Skills

Browse world skills rankings with driver and programming scores shown separately.

### Jumper

Choose a match and OpenScout finds the correct livestream, then jumps to roughly when that match begins. No more dragging through a six-hour recording trying to find one match.

Jumper currently supports YouTube and BoxCast.

### My Team

Pin your team to keep its information easy to reach. You can check upcoming events, review recent matches, and save scouting notes before you forget them.

### Shared teams

Invite other members of your club and work from the same scouting information. Shared picklists update live across everyone's devices, which is much easier than passing a spreadsheet around the pits.

### Translation

Event names from other regions can be translated automatically. This makes international events, including Chinese Signature Events, much easier to browse.

### Mobile and offline support

OpenScout can be installed as a Progressive Web App on your phone or computer.

Pages you've already loaded remain available when the venue Wi-Fi stops cooperating. The interface also follows your system's light or dark mode setting.

<div align="center">
<img src=".github/assets/team.png" alt="OpenScout team page for team 10B, showing world skills rank, win rate, a radar chart, and win rate and skills trends over the season" width="840">
</div>

## Running OpenScout locally

You'll need Node.js 20 or newer.

```bash
git clone https://github.com/axcdeng/webscout.git
cd webscout
npm install
cp .env.example .env
npm run dev
```

OpenScout will run at:

```text
http://localhost:5175
```

The site and API are served together from one process.

You'll need API keys before event data appears. Without them, the app will still run, but most pages will be empty.

| Setting                                                 | What it enables                                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `ROBOTEVENTS_API_KEY` and `RSE_API_KEY`                 | Events, teams, rankings, matches, team statistics, and TrueSkill ratings (still in development)   |
| `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` | Accounts, notes, shared teams, and picklists                                                      |
| `VITE_DEFAULT_YOUTUBE_API_KEY`                          | Jumper                                                                                            |
| `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` | Rate limiting                                                                                     |

You can skip Upstash while running locally. Rate limiting will simply be disabled.

### RoboSTEM DB

`RSE_API_KEY` is a free RoboSTEM DB API key. Sign in with Google or Discord at:

https://robostem-api.org/dashboard

The RoboSTEM DB provides team statistics and TrueSkill ratings (still in development). Its API documentation is available at:

https://robostem-api.org/redoc

### VEX Events

`ROBOTEVENTS_API_KEY` is a VEX Events API v2 token. You can request one through your account on the VEX Events website.

### Supabase

Supabase powers accounts and anything that saves data, including notes, shared teams, and picklists.

Browsing events and teams still works without Supabase. You'll only lose features that require an account or saved state.

The comments in `.env.example` explain every available variable, whether it should be kept secret, and what stops working when it's missing.

## Other commands

```bash
npm run build    # Build for production
npm test         # Run the test suite
npm run lint     # Check code style
npm run preview  # Serve the production build
```

## Project structure

```text
src/          Front end built with React and Vite
  jumper/     Stream detection and match timestamp calculations
server/       API and VEX Events integrations
api/          The same API handlers packaged as Vercel functions
supabase/     Database schema for accounts, notes, shared teams, and picklists
```

Database changes are stored in `supabase/migrations/`.

Migrations are applied manually and in numerical order through the Supabase SQL editor. Each migration is written to be safe to run more than once, so you can rerun them from the beginning if you aren't sure which ones have already been applied.

## Contributing

Issues and pull requests are welcome.

Before opening a pull request, run:

```bash
npm run lint && npx tsc -b && npm test
```

A couple of things to know before working on the project:

* `src/App.tsx` is currently very large. It's being split into smaller files over time.
* Don't edit an existing migration after it has been committed. Production databases may have already run it. Add a new numbered migration instead.

## Security

Please don't report security vulnerabilities through a public GitHub issue.

Email them privately to:

[contact@robostem.org](mailto:contact@robostem.org)

## License

OpenScout is licensed under the [GNU Affero General Public License v3.0](LICENSE).

You can use it, fork it, modify it, and host your own version. If you modify OpenScout and make that version publicly available as a service, you must publish your changes under the same license.

For commercial licensing or another arrangement, contact:

[contact@robostem.org](mailto:contact@robostem.org)

Geist and Geist Mono are created by Vercel and licensed under the
[SIL Open Font License 1.1](public/fonts/OFL.txt).

OpenScout is not affiliated with or endorsed by VEX Robotics. Competition data is provided through VEX Events.
