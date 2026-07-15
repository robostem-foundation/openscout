# Breadcrumbs on detail pages — design

## Goal

Add a subtle, Geist-styled breadcrumb trail to the app's detail pages so users
always see where they are in the hierarchy and can step back up one level. The
trail's final segment reflects the currently active sub-tab and updates live as
the user switches tabs.

## Scope

Breadcrumbs appear on **detail pages only** — pages that sit below a top-level
section. Top-level pages (`/events`, `/teams`, `/skills`, `/my-team`,
`/insights`, `/settings`, `/`) get **no** breadcrumb: the top nav already marks
where you are, and a "Home / Events" crumb would just duplicate it.

In scope:

| Page (route) | Component | Trail |
|---|---|---|
| `/event/{sku}` | `EventDetail` | **Events** → `/events` · **{event.name}** → event root · **{active tab}** |
| `/team/{PROGRAM}/{number}` | `TeamDetail` | **Teams** → `/teams` · **{team.number}** → team root · **{active tab}** |
| `/org/{id}` | `OrgWorkspacePage` | **{org.name}** → `/org/{id}` · **{active tab}** |

Out of scope (unchanged): `/compare/*`, `/join/*`, `NotFound`, and all
top-level pages. These are flows or listings, not entity-detail views.

Notes on the trail shape:

- The **entity crumb** (event name / team number / org name) is a link back to
  the entity's base URL, which resets to its default tab. It is never the last
  segment.
- The **last crumb** is the active tab, rendered as non-interactive text with
  `aria-current="page"`.
- The org page has no parent "Organizations" listing in the app, so the org
  name itself is the root crumb (it links to the org's own base URL rather than
  up to a nonexistent list). This is intentional and the only two-segment trail.

## Component

A single co-located `Breadcrumbs` component in `src/App.tsx` (the app is a
single-file component tree; new UI lives here alongside its peers).

```tsx
type Crumb = { label: string; href?: string };

function Breadcrumbs({ items }: { items: Crumb[] }) { … }
```

- Renders `<nav aria-label="Breadcrumb" className="breadcrumbs"><ol>…</ol></nav>`.
- Each item is an `<li>`. Items with `href` render via the existing `Link`
  component; the item without `href` (always the last) renders as a `<span>`
  with `aria-current="page"`.
- Between items, a decorative `ChevronRight` (lucide, size ~13, `aria-hidden`)
  separator.
- The consuming page always passes a fully-built `items` array. `Breadcrumbs`
  itself holds no page knowledge — it just renders the trail it's given. If
  `items` has fewer than 2 entries it renders nothing (defensive; not expected
  in practice).

### Tab-label maps

The live tab bars carry counts and dynamic text (e.g. `Teams 42`,
`{focusTeam.number}'s Matches`) that must not leak into a crumb. Each page
builds its active-tab label from a clean, static map:

- **Event** (`EVENT_DETAIL_TABS`): `info`→Info, `matches`→Results,
  `rankings`→Rankings, `skills`→Skills, `awards`→Awards, `teams`→Teams,
  `picklist`→Picklist, `team-matches`→Team Matches.
- **Team** (`TEAM_DETAIL_TABS`): `about`→About, `events`→Events,
  `rankings`→Rankings, `skills`→Skills, `awards`→Awards.
- **Org**: reuse the existing `ORG_WORKSPACE_NAV` array's `value`→`label`
  mapping (Dashboard, Favorites, Notes, Picklists, Activity, Export, Settings).

New small `Record<Tab, string>` maps are added for event and team next to their
existing `*_DETAIL_TABS` constants; org reuses `ORG_WORKSPACE_NAV`.

### Live tab updates

Each detail component already keeps its active tab in local `tab` state (synced
to the URL hash). `Breadcrumbs` is rendered inside the component using that
`tab` value, so switching tabs re-renders the crumb with the new label. No new
state, context, or global is introduced.

## Placement

The breadcrumb renders as the first child inside each page's root, above the
existing header:

- `EventDetail` — inside `<section className="page">`, immediately before
  `<div className="profile-header">` (~App.tsx:6043).
- `TeamDetail` — inside `<section className="page">`, immediately before
  `<div className="profile-header">` (~App.tsx:7471).
- `OrgWorkspacePage` — immediately before `<PageTitle … title={org?.name}>`
  (~App.tsx:13126).

## Styling

A new `.breadcrumbs` block in `src/styles.css`, using existing Geist tokens
only — no new colors, no gradients, no shadows:

- Font size ~12.5px; single line; small bottom margin to separate from the
  header below.
- Crumb links: `--text-muted`, hover → `--text-2` (quiet, no underline unless
  hovered, matching the app's link idiom).
- Current crumb: `--text-2`, not a link.
- Separator chevrons: `--text-faint`.
- The entity crumb has `max-width` + `text-overflow: ellipsis` + `white-space:
  nowrap` so long event names never wrap or push the trail wide.
- Light/dark are handled automatically because every value is a token that
  already flips per theme.

### Mobile

Hidden on mobile via `@media (max-width: 560px) { .breadcrumbs { display: none } }`
— the same breakpoint at which the top nav collapses into the drawer/bottom
bar. Small screens stay uncluttered; the mobile bottom-bar already conveys the
active section.

## Accessibility

- Wrapping `<nav aria-label="Breadcrumb">` with an ordered list conveys
  structure and order to assistive tech.
- The current page's crumb carries `aria-current="page"`.
- Separators are `aria-hidden` so they aren't announced.
- Interactive crumbs reuse `Link`, inheriting its existing focus handling.

## Testing / verification

Manual verification in the running app (this is presentational UI wired to
existing state):

1. `/event/{sku}` — trail shows `Events / {name} / Results`; switching tabs
   (Rankings, Teams, Picklist, focus-team matches) updates the last segment;
   clicking **Events** navigates to `/events`; clicking the event name resets
   to the default tab.
2. `/team/{PROGRAM}/{number}` — trail shows `Teams / {number} / About`; tab
   switches update the tail; **Teams** and the team-number crumb navigate
   correctly.
3. `/org/{id}` — trail shows `{org name} / {tab}`; tabs update the tail.
4. Long event name truncates with an ellipsis and keeps the trail on one line.
5. Light and dark themes both read as quiet/muted.
6. Below 560px, the breadcrumb is absent.
7. Top-level pages (`/events`, `/teams`, `/skills`, home) show no breadcrumb.

## Out of scope / non-goals

- No breadcrumbs on top-level pages, compare, join, or NotFound.
- No router refactor — the existing custom `useRoute`/`navigate` model stays.
- No new global state or context for tab tracking.
