import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist",
      "server-dist",
      // Live git worktrees (see `git worktree list`) are whole extra checkouts of
      // this repo, excluded from git via .git/info/exclude. Linting them lints a
      // second copy of every source file — and their built bundles.
      "**/worktrees",
      // Local-only design mockups (gitignored), not shipped code.
      "mockups",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/exhaustive-deps": "off",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  // Plain JS (src/jumper/services/**, public/sw.js) had no languageOptions at all,
  // so every `console`, `localStorage` and `fetch` in it was a no-undef error. Same
  // globals as the TS block; the react-hooks rules stay TS-only.
  //
  // Deliberately not `**/*.jsx`: flat config lints .js/.mjs/.cjs by default but not
  // .jsx, so src/jumper/**/*.jsx has never been linted. Adding it here would pull
  // ~60 pre-existing errors (dead vars in JumperPage/Worlds) into this pass —
  // worth doing, but as its own change.
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  // Service workers run off-window: no `window`/`document`, but `self`, `caches`,
  // `clients` and the fetch primitives instead.
  {
    files: ["**/sw.js"],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
      },
    },
  },
);
