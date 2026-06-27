# Teams tab: `teams_light` source + parallel VEX lookup

**Date:** 2026-06-27
**Status:** Approved design (pending spec review)

## Goal

Two changes to the Teams tab:

1. Switch the Teams tab's team data source from the RoboSTEM `teams` endpoint to the new
   `teams_light` endpoint.
2. When a user searches the Teams tab for a **complete team number** (`{1–5 digits}{one letter}`),
   also query the official RobotEvents (`events.vex.com`) API in parallel and merge the result, so
   teams that exist in VEX but are not yet in RoboSTEM (e.g. `32K`) still appear.

This is scoped to the **Teams tab** (the `TeamsView`). The global topbar search is out of scope
and keeps its current behavior.

## Background / API findings (verified via curl)

### `teams_light` (RoboSTEM, `/api/v3/teams_light`)

- Returns a **flat JSON array** (NOT paginated — `per_page`/`page` are ignored; the whole matching
  set is returned, sorted alphabetically by team number).
- Record shape: `{ team_id, team_num, team_name, org, program: { id, code, name } }`.
- Missing vs. the current `teams` endpoint: `location` (region), `grade`, `registered`, `robot_name`.
- Supports filters: `id[]`, `number[]`, `program[]`, `grade[]`, `country[]`, `region[]`, plus
  `teamSearch` and `registered` (all verified working server-side):
  - `program[]=1` → 55,325 teams (~9.4 MB in one request).
  - `region[]=California` → 4,243; `region[]=California&region[]=Texas` → 8,450 (multi works).
  - `country[]=United States` → 37,677 (takes the **full country name**).
  - `registered=true` narrows the set (4,243 → 1,257).
  - `teamSearch=paradigm` returns ranked name/number matches.

**Performance motivation:** browsing a whole program currently takes ~220 paginated `teams` calls
via `collectAllPages`; `teams_light` returns the same set in **one** request.

### RobotEvents `teams` (`events.vex.com/api/v2/teams`)

- Paginated `Paginated<Team>` with full fields (location, grade, registered, etc.).
- `32K` → present in VEX (`id: 196921`), absent from `teams_light` (`[]`). This is the exact case
  the feature targets.
- Same numeric `id` as RoboSTEM for shared teams (e.g. `315A` = `70620` in both), so dedup by `id`
  merges cleanly.

## Part 1 — Teams tab data source → `teams_light`

### 1a. API adapter

Add `api.teamsLight(query)` in `src/api.ts`. It calls the rse `teams_light` endpoint, receives the
flat array, and maps each record into the existing `Team` shape so downstream code is unchanged:

| `teams_light` | → `Team` |
|---|---|
| `team_id` | `id` |
| `team_num` | `number` |
| `team_name` | `team_name` |
| `org` | `organization` |
| `program` | `program` |
| *(absent)* | `location: null`, `grade: null`, `registered: undefined`, `robot_name: null` |

Because the endpoint is unpaginated, the adapter wraps the mapped array in a `Paginated<Team>`-shaped
object with synthetic single-page meta (`current_page: 1`, `last_page: 1`, `total: data.length`,
etc.). This keeps `loadCachedTeams`, the natural sort, IndexedDB caching, and the table rendering
working with no shape changes.

Note: the raw `teams_light` array is not the proxy's paginated JSON, but it still flows through the
existing `/api/rse/...` proxy + dedup layer unchanged (the proxy is content-agnostic). The mapping
happens client-side in the new `api.teamsLight` wrapper.

### 1b. Swap call sites in `TeamsView`

In `src/App.tsx` `TeamsView`:

- **Browse (no search):** `loadCachedTeams` currently calls `collectAllPages((page) => api.teams(...))`.
  Change its internal loader to call `api.teamsLight(query)` directly — a single request, no
  `collectAllPages`. The cache key gains the region selection (see 1c).
- **Committed/full search:** replace `collectAllPages((page) => api.teams({ teamSearch, page, per_page }))`
  with the shared `searchTeamsTabTeams(...)` helper (Part 2) built on `api.teamsLight`.
- **Quick search dropdown:** replace the `api.teams({ teamSearch, ... })` call with the same
  `searchTeamsTabTeams(...)` helper.

### 1c. Region filter — server-side

The region filter currently filters **client-side** off `team.location.region`, and the region
option list is partly derived from loaded teams (`kind: "vex-region"`). With `teams_light` there is
no per-team location, so:

- **Remove** the `vex-region` (team-derived) region options. Keep the canonical `country` and
  `subdivision` options sourced from the RobotEvents countries/regions API (unchanged).
- **Translate** the selected region options into `teams_light` query params, applied server-side on
  both browse and search queries:
  - `country` option → `country[]` = its `countryName` (full country name, e.g. "United States").
  - `subdivision` option → `region[]` = its `regionName` (e.g. "California"), and `country[]` =
    its `countryName`.
  - Collect unique `region[]` and `country[]` across all selected options (multi-select supported).
- **Remove** the client-side `teamMatchesRegionOptions(...)` filtering in the Teams tab browse and
  quick/committed search paths (the server already filtered; `teams_light` has no location to filter
  on locally).
- Include the selected region/country params in `cachedTeamsKey` so browse results cache per
  (program, registered, region selection) and refetch when the selection changes.

Trade-off accepted: changing the region selection now triggers a refetch instead of instant
client-side filtering. Each fetch is one `teams_light` request and is edge-cached.

### 1d. Accepted degradations ("for now")

`teams_light` doesn't return grade or registered status, so in the Teams tab table:

- **Grade** badge renders blank/empty.
- **Registered/Inactive** column shows blank/"Inactive" (no registered data). The `registered`
  *filter control* still works because it's passed server-side to `teams_light`.
- **Organization** still works (`org`).

Columns stay in the layout; they're just unpopulated until location/grade/registered data is
available again.

## Part 2 — Parallel VEX lookup on complete team numbers

### Trigger

A search query that matches the complete-team-number pattern:

```
/^\d{1,5}[a-z]$/i      // 1–5 digits followed by exactly one letter, e.g. 32K, 315A, 99999Z
```

### Shared helper

Add `searchTeamsTabTeams(query, baseQuery)` (in `App.tsx`, near the other team helpers) used by both
the quick-search dropdown and the committed/full search:

```
async function searchTeamsTabTeams(query, baseQuery) {
  const isCompleteNumber = /^\d{1,5}[a-z]$/i.test(query.trim());
  const [rse, vex] = await Promise.all([
    api.teamsLight({ ...baseQuery, teamSearch: query }),
    isCompleteNumber
      ? api.robotEventsTeams({ number: query, "program[]": vexProgramIds, per_page: 20 })
      : Promise.resolve(null),
  ]);
  const merged = uniqueTeams([...(vex?.data ?? []), ...rse.data]);
  return { ...rse, data: rankTeamsForSearch(merged, query) };
}
```

- VEX results are listed first into `uniqueTeams` so a VEX-only team (e.g. `32K`) is preserved, and
  a team present in both dedups by shared `id` (VEX copy wins, giving the table its full
  location/grade/registered fields when available).
- `rankTeamsForSearch` reorders by relevance to the query (existing behavior).
- Reuses existing `vexProgramIds` (`[1, 4, 41, 57]`), `api.robotEventsTeams`, `uniqueTeams`,
  `rankTeamsForSearch`.

### Application points

- **Quick search dropdown** (`debouncedQuickSearch` effect): replace its `api.teams(...)` call with
  `searchTeamsTabTeams(needle, baseQuery)`; set the returned `data` as `quickData`.
- **Committed/full search** (`loadTeams` when `isSearchingTeams`): replace the
  `collectAllPages(api.teams(...))` call with `searchTeamsTabTeams(committedSearch, baseQuery)`.

The existing `localQuickResults` (matches drawn from the cached browse set) continues to merge with
`quickData` in `quickResults`, so cached + freshly-fetched + VEX results all surface in the dropdown.

## Out of scope

- Global topbar search (keeps current `api.teams` + exact VEX lookup behavior).
- Re-adding grade/registered/location to the Teams tab (a later change when data is available).
- Any change to team detail pages, compare, rankings, etc.

## Testing / verification

- Browse V5RC with no search → table populates from one `teams_light` request; org column filled,
  grade/registered blank; sort and pagination of the rendered table behave as before.
- Region filter: select California → results narrow server-side; select California + Texas → union.
- Search `paradigm` → ranked name matches (no VEX call, not a complete number).
- Search `32K` → appears via VEX even though absent from `teams_light`.
- Search `315A` → single row (deduped across RSE + VEX).
- Type-check (`tsc`) and lint pass; manual smoke test in the running app.
