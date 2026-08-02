// The Jumper tab is a faithful port of the standalone VEX Match Jumper tool,
// kept as untyped .jsx to avoid rewriting ~5k lines into TS. This shim lets the
// TS boundary in App.tsx import the .jsx entry; Vite/esbuild bundles the real
// files. Scoped to the jumper subtree.
declare module "*/jumper/JumperPage.jsx" {
  import type { FC } from "react";
  const Component: FC;
  export default Component;
}

// The Worlds match video path reaches into the same port: BoxCast broadcast
// resolution plus the HLS player, both reused verbatim by the match video modal.
declare module "*/jumper/components/WorldsHlsPlayer.jsx" {
  import type { FC, RefObject } from "react";
  const Component: FC<{
    src: string;
    seekRequest?: { time: number; nonce: number } | null;
    mediaRef?: RefObject<HTMLVideoElement | null>;
  }>;
  export default Component;
}

declare module "*/jumper/services/worldsMatchVideo.js" {
  import type { Event, Match, MatchTimestamp } from "./types";
  export type WorldsProgram = { program: string; year: string; config: { channelId: string; divisions: string[] } };
  export function resolveWorldsProgram(event: Event): WorldsProgram | null;
  export function worldsMatchTimestamps(event: Event, matches: Match[], resolved: WorldsProgram): Promise<MatchTimestamp[]>;
  export function worldsDivisionName(event: Event, resolved: WorldsProgram, divisionId: number | null): string | null;
}

declare module "*/jumper/services/boxcast.js" {
  export function fetchBroadcastPlaylist(broadcastId: string, channelId: string): Promise<{ playlist?: string }>;
}
