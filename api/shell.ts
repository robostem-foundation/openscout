// Vercel serverless function: serves the SPA shell with per-URL meta tags.
//
// vercel.json rewrites every non-/api, non-static path here as
// `/api/shell?__p=<original path>` (static assets never reach us, because the
// filesystem is checked before rewrites). The response is the built
// dist/index.html with its <head> rewritten by server/htmlMeta.ts, so a link to
// an event or a team previews as that event or team instead of the bare logo.

import "dotenv/config";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { injectMeta } from "../server/htmlMeta.js";
import { resolveMetaForPath } from "../server/pageShell.js";
import { SITE_URL } from "../src/lib/page-meta.js";

// Set on the self-fetch fallback so a missing dist/index.html degrades to a
// clear error instead of the function calling itself forever.
const LOOP_HEADER = "x-openscout-shell";

let cachedShell: string | null = null;

async function loadShell(host: string | null): Promise<string | null> {
  if (cachedShell) return cachedShell;

  // Bundled alongside the function via `functions.includeFiles` in vercel.json,
  // and present at the same place for `npm run preview`.
  for (const candidate of [
    path.join(process.cwd(), "dist", "index.html"),
    path.join(process.cwd(), "index.html"),
  ]) {
    try {
      cachedShell = await readFile(candidate, "utf8");
      return cachedShell;
    } catch {
      // Try the next candidate.
    }
  }

  // Last resort: ask the CDN for the static shell it is already serving.
  if (!host) return null;
  try {
    const res = await fetch(`https://${host}/index.html`, { headers: { [LOOP_HEADER]: "1" } });
    if (!res.ok) return null;
    cachedShell = await res.text();
    return cachedShell;
  } catch {
    return null;
  }
}

function requestedPath(req: IncomingMessage): string {
  const url = new URL(req.url ?? "/", "http://localhost");
  const fromRewrite = url.searchParams.get("__p");
  if (fromRewrite) return fromRewrite.startsWith("/") ? fromRewrite : `/${fromRewrite}`;
  return url.pathname === "/api/shell" ? "/" : url.pathname;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.headers[LOOP_HEADER]) {
    res.statusCode = 508;
    res.end("Shell fetch loop");
    return;
  }

  const host = (req.headers["x-forwarded-host"] ?? req.headers.host) as string | undefined;
  const shell = await loadShell(host ?? null);
  if (!shell) {
    res.statusCode = 500;
    res.setHeader("content-type", "text/plain");
    res.end("Missing application shell");
    return;
  }

  const pathname = requestedPath(req);
  const meta = await resolveMetaForPath(pathname);
  const canonical = meta.noindex ? null : `${SITE_URL}${pathname === "/" ? "/" : pathname}`;
  const html = injectMeta(shell, meta, canonical);

  res.statusCode = 200;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", `public, s-maxage=${meta.sMaxAge}, stale-while-revalidate=604800`);
  res.end(req.method === "HEAD" ? undefined : html);
}
