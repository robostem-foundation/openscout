import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { proxyRequest, type ProxySource } from "./proxy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const app = express();
const port = Number(process.env.PORT ?? 5173);

if (!process.env.RSE_API_KEY) {
  throw new Error("Missing RSE_API_KEY in .env");
}

if (!process.env.ROBOTEVENTS_API_KEY) {
  throw new Error("Missing ROBOTEVENTS_API_KEY in .env");
}

function proxyRoute(source: ProxySource) {
  return async (req: express.Request, res: express.Response) => {
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

app.get("/api/rse/*endpoint", proxyRoute("rse"));
app.get("/api/re/*endpoint", proxyRoute("re"));
app.get("/api/re-root/*endpoint", proxyRoute("re-root"));
app.get("/api/jumper/*endpoint", proxyRoute("jumper"));

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
