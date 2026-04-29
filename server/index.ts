import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const app = express();
const port = Number(process.env.PORT ?? 5173);
const apiBase = (process.env.ROBOSTEM_API_BASE ?? "https://robostem-api.org").replace(/\/$/, "");
const robotEventsApiBase = (process.env.ROBOTEVENTS_API_BASE ?? "https://www.robotevents.com/api/v2").replace(/\/$/, "");
const apiKey = process.env.RSE_API_KEY;
const robotEventsApiKey = process.env.ROBOTEVENTS_API_KEY;

if (!apiKey) {
  throw new Error("Missing RSE_API_KEY in .env");
}

if (!robotEventsApiKey) {
  throw new Error("Missing ROBOTEVENTS_API_KEY in .env");
}

app.get("/api/rse/*endpoint", async (req, res) => {
  const endpoint = Array.isArray(req.params.endpoint)
    ? req.params.endpoint.join("/")
    : req.params.endpoint;
  const queryIndex = req.originalUrl.indexOf("?");
  const query = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : "";
  const url = `${apiBase}/api/v3/${endpoint}${query}`;

  try {
    const accept = req.accepts(["text/csv", "application/json"]) || "application/json";
    const upstream = await fetch(url, {
      headers: {
        "X-API-Key": apiKey,
        Accept: accept,
      },
    });

    const contentType = upstream.headers.get("content-type") ?? "application/json";
    const body = await upstream.text();

    res.status(upstream.status);
    res.setHeader("content-type", contentType);
    res.setHeader("cache-control", "private, max-age=45");
    res.send(body);
  } catch (error) {
    console.error("RoboStem proxy failed", error);
    res.status(502).json({ message: "RoboStem API request failed" });
  }
});

app.get("/api/re/*endpoint", async (req, res) => {
  const endpoint = Array.isArray(req.params.endpoint)
    ? req.params.endpoint.join("/")
    : req.params.endpoint;
  const queryIndex = req.originalUrl.indexOf("?");
  const query = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : "";
  const url = `${robotEventsApiBase}/${endpoint}${query}`;

  try {
    const upstream = await fetch(url, {
      headers: {
        Authorization: `Bearer ${robotEventsApiKey}`,
        Accept: "application/json",
      },
    });

    const contentType = upstream.headers.get("content-type") ?? "application/json";
    const body = await upstream.text();

    res.status(upstream.status);
    res.setHeader("content-type", contentType);
    res.setHeader("cache-control", "private, max-age=60");
    res.send(body);
  } catch (error) {
    console.error("RobotEvents proxy failed", error);
    res.status(502).json({ message: "RobotEvents API request failed" });
  }
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(root, "dist")));
  app.get("*", (_req, res) => {
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
  console.log(`VEX Alliance running at http://localhost:${port}`);
});
