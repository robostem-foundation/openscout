// Rewrites the <head> of the built SPA shell so each URL ships its own title,
// description, and Open Graph tags.
//
// The client swaps document.title on navigation too (see src/document-meta.ts),
// but scrapers (Discord, iMessage, Slack, Twitter) never run the bundle, so the
// only tags they will ever see are the ones baked in here.

import { SITE_NAME, SITE_URL, fullTitle, type SiteMeta } from "../src/lib/page-meta.js";

const OG_IMAGE = `${SITE_URL}/openscout-mark.png`;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// The tags this module owns. Any pre-existing copy in index.html is dropped
// first so the shell can keep its static defaults for anyone bypassing us.
// The trailing match is `[ \t]*\n?` rather than `\s*\n?` so removing a tag
// takes its own line and nothing else: a greedy \s* would swallow the next
// line's indentation too.
const MANAGED_TAG =
  /[ \t]*<meta\s+(?:name|property)=["'](?:description|robots|openscout:meta|og:title|og:description|og:type|og:image|og:url|og:site_name|twitter:card|twitter:title|twitter:description|twitter:image)["'][^>]*>[ \t]*\n?/gi;
const TITLE_TAG = /[ \t]*<title>[\s\S]*?<\/title>[ \t]*\n?/i;

/**
 * @param canonicalUrl absolute URL for this page, or null to omit og:url and
 *   the canonical link (used for pages that should not be indexed anyway).
 */
export function injectMeta(html: string, meta: SiteMeta, canonicalUrl: string | null): string {
  const title = escapeHtml(fullTitle(meta.title));
  const description = escapeHtml(meta.description);
  const url = canonicalUrl ? escapeHtml(canonicalUrl) : null;

  const tags = [
    // Tells the client these tags were resolved per URL, so its first-paint pass
    // leaves them alone (src/document-meta.ts).
    `<meta name="openscout:meta" content="server" />`,
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    meta.noindex ? `<meta name="robots" content="noindex, nofollow" />` : null,
    url ? `<link rel="canonical" href="${url}" />` : null,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    url ? `<meta property="og:url" content="${url}" />` : null,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${OG_IMAGE}" />`,
  ]
    .filter(Boolean)
    .map((tag) => `    ${tag}`)
    .join("\n");

  // Drop an existing canonical link as well, so re-running this is idempotent.
  const stripped = html
    .replace(TITLE_TAG, "")
    .replace(MANAGED_TAG, "")
    .replace(/[ \t]*<link\s+rel=["']canonical["'][^>]*>[ \t]*\n?/gi, "");

  return stripped.includes("</head>")
    ? stripped.replace("</head>", `${tags}\n  </head>`)
    : `${tags}\n${stripped}`;
}
