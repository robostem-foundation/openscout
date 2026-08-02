import { describe, expect, it } from "vitest";
import { injectMeta } from "./htmlMeta.js";

const SHELL = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="description" content="OpenScout — scouting and analytics for VEX Robotics." />
    <meta property="og:title" content="OpenScout" />
    <meta property="og:description" content="Scouting and analytics for VEX Robotics." />
    <meta name="twitter:card" content="summary" />
    <title>OpenScout</title>
    <script>var t = 1;</script>
  </head>
  <body><div id="root"></div></body>
</html>`;

const meta = { title: "Events", description: "Browse VEX Robotics events." };

describe("injectMeta", () => {
  it("replaces the shell's defaults rather than duplicating them", () => {
    const html = injectMeta(SHELL, meta, "https://openscout.ing/events");
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html.match(/name="description"/g)).toHaveLength(1);
    expect(html.match(/property="og:title"/g)).toHaveLength(1);
    expect(html).toContain("<title>Events | OpenScout</title>");
    expect(html).toContain('<meta property="og:title" content="Events | OpenScout" />');
    expect(html).toContain('<link rel="canonical" href="https://openscout.ing/events" />');
    expect(html).not.toContain("Scouting and analytics for VEX Robotics.");
  });

  it("leaves the rest of the shell alone", () => {
    const html = injectMeta(SHELL, meta, null);
    expect(html).toContain('<meta charset="UTF-8" />');
    expect(html).toContain("<script>var t = 1;</script>");
    expect(html).toContain('<div id="root"></div>');
  });

  it("is idempotent", () => {
    const once = injectMeta(SHELL, meta, "https://openscout.ing/events");
    expect(injectMeta(once, meta, "https://openscout.ing/events")).toBe(once);
  });

  it("adds robots and drops the canonical link on a noindex page", () => {
    const html = injectMeta(SHELL, { ...meta, noindex: true }, null);
    expect(html).toContain('<meta name="robots" content="noindex, nofollow" />');
    expect(html).not.toContain('rel="canonical"');
    expect(html).not.toContain('property="og:url"');
  });

  it("escapes text that would otherwise break out of the attribute", () => {
    const html = injectMeta(SHELL, { title: 'A "B" & <C>', description: "x" }, null);
    expect(html).toContain('<title>A &quot;B&quot; &amp; &lt;C&gt; | OpenScout</title>');
    expect(html).not.toMatch(/content="A "B"/);
  });
});
