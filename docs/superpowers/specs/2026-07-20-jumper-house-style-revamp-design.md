# Jumper → House-Style Revamp

**Date:** 2026-07-20
**Branch:** feat/jumper-tab
**Goal:** Make the Jumper tab (both "Match Jumper" / Viewer mode and "VEX Worlds" / Worlds mode) visually belong to OpenScout, matching the editorial-minimalist system used by the Events page and Team detail page. Logic is untouched — this is a pure visual-system swap.

## Problem

Jumper was ported from a standalone dark dashboard ("the ported VEX Match Jumper tool"). It uses none of the app's shadcn/Geist system and reads as a foreign design language:

- Nested bordered cards (box-in-box-in-box).
- Four competing toggle idioms (`.seg-toggle`, `rounded-full`, `rounded-lg`, `rounded-md` pills).
- Six+ font sizes including an unreadable `text-[7px]`.
- Saturated `text-red-400/blue-400/green-400` vs the app's scarce pale-badge color.
- Fixed `h-[520px]` scroll panes → empty states float one icon in a large void; populated lists show ~4 tall cards at once.

## Constraints (from user)

- **Keep the major container cards distinct** — Video is a card, right sidebar is a card, event picker is a card, livestreams is a card. Do NOT flatten into a borderless bento grid.
- Individual team/match entries are NOT bound by that — they may be as dense as looks best.
- Merging "Featured Events" + "Search by URL" into one card is approved (my call).

## House-style reference (the target)

Tokens: `--surface #fff`, `--surface-2 #fafafa`, `--surface-3 #f2f2f2`, `--border #eaeaea`, `--accent #0891b2`, `--radius 8px`.
One toggle idiom: `.seg-toggle` (same control as the Team page Season toggle and Events filters).
Pattern: bone canvas, hairline dividers, near-no interior borders, UPPERCASE tracked micro-label + big number, pale semantic badges, airy content-fit density.

## Design

### 1. Shared visual system — new `.jmp-*` classes in `jumper.css`
- **Card**: `--surface` bg, `1px --border`, `--radius`; optional `--surface-2` header bar with 10px uppercase tracked micro-label. Interior sections use hairline dividers (`1px --border`), never nested boxes.
- **Toggles**: standardize on `.seg-toggle` for tab bar, Rankings sort, Matches All/Quals/Elims, Sync scope, day switcher. Remove the pill variants.
- **Type scale**: 10px uppercase micro-label (`--text-muted`), 13px body, 15–18px numeric. Delete `text-[7px]`; seek-button labels drop to tooltips or 10px.
- **Badges**: pale semantic — alliance red → pale-red chip, blue → pale-blue chip; records muted. Color scarce and meaningful.
- **Empty state**: one `.jmp-empty` treatment (24px muted icon + single muted line) reused everywhere.
- Replace raw `✕` glyph with lucide `X`.

### 2. Rankings (Team List) & Matches
- Panels **flex to fill** the column height beside the video (`flex-1 min-h-0` + scroll), no fixed `h-[520px]`. Empty states center in the flexible area.
- **Team List** → slim rows: `#rank · team(mono) · W-L-T · WP/AP/SP inline · jump`. ~2–3× density, still card-styled rows.
- **Matches** → compact rows: name + time, two pale alliance chips w/ scores, jump button.

### 3. Layout fixes carried by the reskin
- Move the playback transport OUT of the "Divisions" card header → slim bar under the player.
- Divisions + day switcher use the seg/chip idiom consistently.
- Sync stays its own card, de-densified to house type scale.
- Floating red "Clear All" blob → quiet labeled control matching the system.

### 4. Default "Match Jumper" (Viewer) mode
- Same treatment; 4 cards preserved. Merge "Featured Events" + "Search by URL" into one **"Load a stream"** card (two divider-separated sections).
- Team sidebar → slim rows. Saturated colors → pale badges. Floating controls restyled.

## Non-goals
- No data/logic/state changes. No routing changes. No new dependencies.
- Not converting container cards into a borderless grid.

## Verification
- Browser preview per phase: empty + populated states in light and dark theme; check no `text-[7px]`, single toggle idiom, pale alliance colors, panels fill height.
