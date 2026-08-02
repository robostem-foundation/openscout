import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// index.html carries two inline <script> blocks (the pre-paint theme switch and
// the JSON-LD site graph). Both CSPs pin them by hash, so editing either script
// silently breaks it in production unless the hashes are updated too. This test
// is the thing that notices.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (match[1].includes("src=")) continue;
    hashes.push(`sha256-${createHash("sha256").update(match[2]).digest("base64")}`);
  }
  return hashes;
}

describe("inline script CSP hashes", () => {
  const hashes = inlineScriptHashes(read("index.html"));

  it("finds both inline scripts", () => {
    expect(hashes).toHaveLength(2);
  });

  it.each(["vercel.json", "server/index.ts"])("%s allows every inline script", (file) => {
    const source = read(file);
    for (const hash of hashes) expect(source).toContain(hash);
  });
});
