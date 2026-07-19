---
name: geist-ui
description: Use when building or restyling any UI in this repo — new pages, components, panels, tabs, or visual tweaks. Ensures new UI follows the Geist design system and stays consistent with the existing pages.
---

# Geist UI for BlueallianceVEX

## Overview

All UI work in this repo follows the Geist design system (Vercel's design language) and must stay visually consistent with the app's existing pages. Consistency with what already exists beats novelty.

## Required sub-skills

Invoke these skills (via the Skill tool) before writing UI code:

1. **frontend-design:frontend-design** — production-grade frontend quality
2. **minimalist-ui** — clean editorial style: flat surfaces, typographic contrast, no gradients or heavy shadows
3. **web-design-guidelines** — Vercel Web Interface Guidelines compliance (accessibility, UX best practices)

## Design system: Geist

Follow Vercel's Geist design system: https://vercel.com/geist/introduction

Key Geist principles to apply:
- Restrained, mostly-monochrome palette; color used sparingly for meaning (status, emphasis)
- Subtle 1px borders over shadows; flat surfaces
- Clear typographic hierarchy; system/geometric sans; tabular numbers for data
- Generous whitespace, tight and consistent spacing scale
- Quiet, purposeful interactions — no flashy animation

## Match the existing app first

Before designing anything, read the relevant existing UI and reuse its patterns:

- **Main pages** live in [src/App.tsx](../../../src/App.tsx): `EventsPage`, `TeamsPage`, `WorldSkillsPage`, `InsightsPage`, `SettingsPage`, `OrgWorkspacePage`, `MyTeamPage`
- **Global styles / tokens**: [src/styles.css](../../../src/styles.css) and [src/index.css](../../../src/index.css) — use existing CSS variables and classes; do not invent new colors or spacing values when one exists
- **Components**: shadcn/ui primitives in `src/components/ui/` — reuse these instead of hand-rolling new primitives
- **Theming**: [src/theme.ts](../../../src/theme.ts) — respect light/dark themes

Checklist before shipping UI:
- [ ] Reuses existing CSS variables, spacing, and shadcn components
- [ ] Looks native next to at least two existing pages (compare against EventsPage/TeamsPage)
- [ ] Follows Geist: flat, bordered, monochrome-first, quiet
- [ ] Works in both light and dark themes
