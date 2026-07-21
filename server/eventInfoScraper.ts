// Scrapes agenda and webcast info from the events.vex.com event page.
// Uses a 3-strategy race to bypass bot detection (adapted from Jumper's detect-streams.js).
// Imported by both the local Express dev route and the Vercel serverless function.

import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import sanitizeHtml from "sanitize-html";

export interface WebcastLink {
  url: string;
  platform: "youtube" | "vimeo" | "other";
  label: string;
}

export interface EventInfoData {
  // Raw sanitized inner HTML from the Agenda tab — preserves the event organiser's
  // original formatting (bold day headers, bullet lists, external links, etc.)
  agenda: { html: string } | null;
  webcast: { description: string; links: WebcastLink[] } | null;
  sourceUrl: string;
}

const EVENTS_VEX_BASE = process.env.ROBOTEVENTS_ROOT_BASE ?? "https://events.vex.com";

function eventPageUrl(sku: string): string {
  const slug = /VIQC|VIQ/i.test(sku) ? "vex-iq-competition" : "vex-robotics-competition";
  return `${EVENTS_VEX_BASE}/robot-competitions/${slug}/${encodeURIComponent(sku)}.html`;
}

function validateHtml(html: string, source: string): string {
  if (html.length < 500) throw new Error(`${source}: response too short`);
  if (html.includes('id="challenge-running"') || html.includes("Just a moment...")) {
    throw new Error(`${source}: Cloudflare challenge`);
  }
  return html;
}

async function fetchWithStrategy(url: string): Promise<string> {
  const fetchGooglebot = async (): Promise<string> => {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Referer": "https://www.google.com/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(8000),
    });
    return validateHtml(await res.text(), "googlebot");
  };

  const fetchChrome = async (): Promise<string> => {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(8000),
    });
    return validateHtml(await res.text(), "chrome");
  };

  const fetchProxy = async (): Promise<string> => {
    await new Promise((r) => setTimeout(r, 100));
    // NOTE: this fallback relays the request through the third-party corsproxy.io.
    // The only thing disclosed is `url` — a public events.vex.com event page — so
    // there is no sensitive data leak. If corsproxy.io reliability/trust becomes a
    // concern, drop this strategy or self-host a small fetch proxy.
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(15000),
    });
    return validateHtml(await res.text(), "corsproxy");
  };

  return Promise.any([fetchGooglebot(), fetchChrome(), fetchProxy()]);
}

// Accepts one or more tab names as aliases (e.g. "Webcast", "Livestream").
// Returns the first matching section in either the raw Vue template or the hydrated HTML.
function findSection($: cheerio.CheerioAPI, ...names: string[]) {
  for (const name of names) {
    // Raw HTML: Vue <tab name="..."> component
    const vueTab = $(`tab[name="${name}"]`);
    if (vueTab.length) return vueTab.first();
    // Hydrated HTML: .tab-content section identified by its h4 label
    const hydrated = $(".tab-content section")
      .filter((_, el) => $(el).find("h4").first().text().trim() === name)
      .first();
    if (hydrated.length) return hydrated;
  }
  return $("__no_match__"); // empty cheerio selection — callers check .length
}

/** Strip non-breaking spaces and normalise whitespace from a text node. */
function nodeText($el: cheerio.Cheerio<AnyNode>): string {
  return $el.text().replace(/ /g, " ").trim();
}

// Allowlist-based sanitizer for the scraped agenda HTML. Only structural /
// text-formatting tags survive; the sole attribute kept is `href` on <a>, and
// only for safe schemes (http/https/mailto). This replaces a hand-rolled
// attribute-stripper whose `!href.startsWith("javascript:")` blocklist could be
// bypassed with control chars or entity-encoding (e.g. `java\tscript:`).
// Exported so it can be unit-tested directly against known XSS payloads.
export function sanitizeAgendaHtml(dirty: string): string {
  return sanitizeHtml(dirty, {
    allowedTags: [
      "p", "br", "hr", "ul", "ol", "li", "b", "strong", "i", "em", "u",
      "h1", "h2", "h3", "h4", "h5", "h6", "a", "span", "div", "blockquote",
      "code", "pre", "table", "thead", "tbody", "tr", "td", "th",
    ],
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesAppliedToAttributes: ["href"],
    // Drop disallowed tags entirely (their text content is preserved by default).
    // <script>/<style> contents are stripped by sanitize-html regardless.
    disallowedTagsMode: "discard",
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }),
    },
  });
}

function parseAgenda($: cheerio.CheerioAPI): EventInfoData["agenda"] {
  const section = findSection($, "Agenda", "Schedule");
  if (!section.length) return null;

  // Remove the redundant tab-title heading (e.g. <h4>Agenda</h4>)
  section.find("h4").filter((_, el) => {
    const t = $(el).text().trim().toLowerCase();
    return t === "agenda" || t === "schedule";
  }).remove();

  const raw = section.html()?.trim() ?? "";
  if (!raw) return null;

  const html = sanitizeAgendaHtml(raw).trim();
  return html ? { html } : null;
}

function detectPlatform(url: string): WebcastLink["platform"] {
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("vimeo.com")) return "vimeo";
  return "other";
}

function parseWebcast($: cheerio.CheerioAPI): EventInfoData["webcast"] {
  // Accept "Livestream" / "Live Stream" as aliases in case the tab is renamed
  const section = findSection($, "Webcast", "Livestream", "Live Stream");
  if (!section.length) return null;

  // Description: first meaningful paragraph
  const description = nodeText(section.find("p big, p").first());

  const links: WebcastLink[] = [];
  const seen = new Set<string>();

  const addLink = (url: string, label = "") => {
    const clean = url.trim();
    if (!clean || seen.has(clean)) return;
    seen.add(clean);
    links.push({ url: clean, platform: detectPlatform(clean), label: label.trim() });
  };

  // iframes — Firecrawl stores the original tag in data-original-tag; real scrape has plain src
  section.find("iframe, [data-original-tag='iframe']").each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("data-src") || "";
    if (src && (src.includes("youtube") || src.includes("youtu.be") || src.includes("vimeo"))) {
      addLink(src, "Watch Live");
    }
  });

  // Anchor tags
  section.find("a").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    if (href.includes("youtube") || href.includes("youtu.be") || href.includes("vimeo")) {
      addLink(href, nodeText($(el)) || "Watch Live");
    }
  });

  // Regex fallback on raw section HTML — stops at quotes, brackets, and whitespace
  const sectionHtml = section.html() ?? "";
  const urlRe =
    /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|live\/|@|channel\/|c\/)|youtu\.be\/|vimeo\.com\/(?:video\/|event\/)?)[^\s"')<>\]]+/g;
  for (const raw of sectionHtml.match(urlRe) ?? []) {
    // Strip any trailing punctuation that may have been absorbed
    const url = raw.replace(/[.,;!?]+$/, "");
    addLink(url);
  }

  return { description, links };
}

export async function scrapeEventInfo(sku: string): Promise<EventInfoData> {
  const sourceUrl = eventPageUrl(sku);
  try {
    const html = await fetchWithStrategy(sourceUrl);
    const $ = cheerio.load(html);
    return {
      agenda: parseAgenda($),
      webcast: parseWebcast($),
      sourceUrl,
    };
  } catch (err) {
    console.error(`[event-info] scrape failed for ${sku}:`, err);
    return { agenda: null, webcast: null, sourceUrl };
  }
}
