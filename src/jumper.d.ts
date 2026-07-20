// The Jumper tab is a faithful port of the standalone VEX Match Jumper tool,
// kept as untyped .jsx to avoid rewriting ~5k lines into TS. This shim lets the
// TS boundary in App.tsx import the .jsx entry; Vite/esbuild bundles the real
// files. Scoped to the jumper subtree.
declare module "*/jumper/JumperPage.jsx" {
  import type { FC } from "react";
  const Component: FC;
  export default Component;
}
