import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { clientIpFromForwardedFor, guardProxyRequest, proxyRequest, type ProxySource } from "./proxy.js";
import { scrapeEventInfo } from "./eventInfoScraper.js";
import { resolveEventGrades } from "./eventGrades.js";
import { currentSeasonByProgram, isTopSkillsGrade, isTopSkillsProgram, programRunsGrade, resolveTopSkills } from "./topSkills.js";
import { resolveSpotlightEvents } from "./spotlightEvents.js";
import { parseSkuParam } from "../api/event-grades.js";
import { resolveTranslations } from "./translate.js";
import { parseTranslateBody } from "../api/translate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const app = express();
const port = Number(process.env.PORT ?? 5175);

if (!process.env.RSE_API_KEY) {
  throw new Error("Missing RSE_API_KEY in .env");
}

if (!process.env.ROBOTEVENTS_API_KEY) {
  throw new Error("Missing ROBOTEVENTS_API_KEY in .env");
}

/**
 * Apply the shared abuse guard to a feature endpoint. Returns false when the
 * request has already been answered and the handler should stop.
 *
 * The feature endpoints below were previously unguarded, which left the metered
 * cors.sh quota (event-grades, spotlight-events) and the multi-MB skills board
 * (top-skills) open to unthrottled use.
 */
async function passesGuard(req: express.Request, res: express.Response): Promise<boolean> {
  const guard = await guardProxyRequest({
    origin: req.headers.origin ?? null,
    referer: req.headers.referer ?? null,
    ip: clientIpFromForwardedFor(req.headers["x-forwarded-for"], req.socket.remoteAddress ?? "unknown"),
  });
  if (guard.ok) return true;
  if (guard.retryAfter) res.setHeader("retry-after", String(guard.retryAfter));
  res.status(guard.status).json({ message: guard.message });
  return false;
}

function proxyRoute(source: ProxySource) {
  return async (req: express.Request, res: express.Response) => {
    // Abuse guard (no-op locally unless APP_ORIGIN / Upstash are configured).
    const guard = await guardProxyRequest({
      origin: req.headers.origin ?? null,
      referer: req.headers.referer ?? null,
      ip: clientIpFromForwardedFor(req.headers["x-forwarded-for"], req.socket.remoteAddress ?? "unknown"),
    });
    if (!guard.ok) {
      if (guard.retryAfter) res.setHeader("retry-after", String(guard.retryAfter));
      res.status(guard.status).json({ message: guard.message });
      return;
    }

    const endpoint = Array.isArray(req.params.endpoint) ? req.params.endpoint.join("/") : (req.params.endpoint ?? "");
    const queryIndex = req.originalUrl.indexOf("?");
    const query = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : "";
    const accept = source === "rse" ? req.accepts(["text/csv", "application/json"]) || "application/json" : "application/json";

    try {
      const result = await proxyRequest(source, endpoint, query, accept);
      res.status(result.status);
      res.setHeader("content-type", result.contentType);
      res.setHeader("cache-control", result.cacheControl);
      res.send(result.body);
    } catch (error) {
      console.error(`${source} proxy failed`, error);
      res.status(502).json({ message: "Upstream API request failed" });
    }
  };
}

// Event info scraper — must come before the /api/re-root catch-all
app.get("/api/event-info", async (req: express.Request, res: express.Response) => {
  if (!(await passesGuard(req, res))) return;
  const sku = req.query.sku as string | undefined;
  if (!sku) {
    res.status(400).json({ error: "sku query param is required" });
    return;
  }
  try {
    const data = await scrapeEventInfo(sku);
    res.setHeader("cache-control", "s-maxage=3600, stale-while-revalidate=86400");
    res.json(data);
  } catch (err) {
    console.error("[event-info] handler error:", err);
    res.status(500).json({ error: "Failed to fetch event info" });
  }
});

// Event grade-level lookup (cache-first scrape) — also before the catch-alls.
app.get("/api/event-grades", async (req: express.Request, res: express.Response) => {
  if (!(await passesGuard(req, res))) return;
  const requests = parseSkuParam(typeof req.query.sku === "string" ? req.query.sku : "");
  if (!requests.length) {
    res.status(400).json({ error: "sku query param is required (comma-separated SKU:programId)" });
    return;
  }
  try {
    const grades = await resolveEventGrades(requests);
    res.setHeader("cache-control", "public, s-maxage=86400, stale-while-revalidate=604800");
    res.json({ grades });
  } catch (err) {
    console.error("[event-grades] handler error:", err);
    res.status(500).json({ error: "Failed to resolve event grades" });
  }
});

// Top world-skills row per program + grade (server-trimmed) — also before the
// catch-alls so it isn't swallowed by the /api/re-root proxy.
app.get("/api/top-skills", async (req: express.Request, res: express.Response) => {
  if (!(await passesGuard(req, res))) return;
  const program = typeof req.query.program === "string" ? req.query.program : null;
  const grade = typeof req.query.grade === "string" ? req.query.grade : null;
  if (!isTopSkillsProgram(program) || !isTopSkillsGrade(grade) || !programRunsGrade(program, grade)) {
    res.status(400).json({ error: "program must be v5rc|viqrc and grade a level that program runs (hs|ms|es)" });
    return;
  }
  try {
    const result = await resolveTopSkills(program, grade);
    res.setHeader("cache-control", "public, s-maxage=600, stale-while-revalidate=3600");
    res.json(result);
  } catch (err) {
    console.error("[top-skills] handler error:", err);
    res.status(502).json({ error: "Failed to load world skills leaderboard" });
  }
});

// Spotlight-tier event SKUs (see server/spotlightEvents.ts) — before the catch-alls.
app.get("/api/spotlight-events", async (req: express.Request, res: express.Response) => {
  if (!(await passesGuard(req, res))) return;
  try {
    const result = await resolveSpotlightEvents(await currentSeasonByProgram());
    res.setHeader("cache-control", "public, s-maxage=21600, stale-while-revalidate=86400");
    res.json(result);
  } catch (err) {
    console.error("[spotlight-events] handler error:", err);
    res.status(502).json({ error: "Failed to resolve Spotlight events" });
  }
});

// Translation lookup (cache-first MyMemory) — also before the catch-alls.
// `express.json` is mounted on this route alone rather than app-wide, so the
// existing GET proxy routes keep their current body handling.
app.post("/api/translate", express.json({ limit: "64kb" }), async (req: express.Request, res: express.Response) => {
  const guard = await guardProxyRequest({
    origin: req.headers.origin ?? null,
    referer: req.headers.referer ?? null,
    ip: clientIpFromForwardedFor(req.headers["x-forwarded-for"], req.socket.remoteAddress ?? "unknown"),
  });
  if (!guard.ok) {
    if (guard.retryAfter) res.setHeader("retry-after", String(guard.retryAfter));
    res.status(guard.status).json({ message: guard.message });
    return;
  }

  const items = parseTranslateBody(req.body);
  if (!items.length) {
    res.status(400).json({ error: "items array is required ({ text, sourceLang })" });
    return;
  }
  try {
    const translations = await resolveTranslations(items);
    res.setHeader("cache-control", "public, s-maxage=86400, stale-while-revalidate=604800");
    res.json({ translations });
  } catch (err) {
    console.error("[translate] handler error:", err);
    res.status(500).json({ error: "Failed to resolve translations" });
  }
});

app.get("/api/rse/*endpoint", proxyRoute("rse"));
app.get("/api/re/*endpoint", proxyRoute("re"));
app.get("/api/re-root/*endpoint", proxyRoute("re-root"));
app.get("/api/jumper/*endpoint", proxyRoute("jumper"));

if (process.env.NODE_ENV === "production") {
  // Security headers for the self-hosted/`npm run preview` path. Kept in sync with
  // the `headers` block in vercel.json (production on Vercel uses that instead).
  // Applied only in production so Vite's dev server (which needs unsafe-eval/inline
  // for HMR) is not broken in development.
  const CSP =
    "default-src 'self'; script-src 'self' https://va.vercel-scripts.com https://www.youtube.com; " +
    "style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; " +
    "media-src 'self' https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co " +
    "https://www.googleapis.com https://api.boxcast.com https://*.boxcast.com https://vitals.vercel-insights.com; " +
    "frame-src https://www.youtube.com https://www.youtube-nocookie.com; " +
    "object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
  app.use((_req, res, next) => {
    res.setHeader("Content-Security-Policy", CSP);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    res.setHeader("X-Frame-Options", "DENY");
    next();
  });
  app.use(express.static(path.join(root, "dist")));
  // SPA fallback. Express 5 (path-to-regexp v8) rejects a bare "*" path string,
  // so use a path-less middleware as the catch-all instead.
  app.use((_req, res) => {
    res.sendFile(path.join(root, "dist", "index.html"));
  });
} else {
  const vite = await createViteServer({
    root,
    server: { middlewareMode: true },
    appType: "spa",
  });

  app.use(vite.middlewares);
}

app.listen(port, () => {
  console.log(`OpenScout running at http://localhost:${port}`);
});
