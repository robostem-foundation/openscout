// Keeps <head> in sync with the route on the client.
//
// The server already ships correct tags for the first paint (api/shell.ts), so
// this exists for everything after it: SPA navigations, where the tab title,
// the bookmark name, and the history entry all come from document.title.
//
// Ordering matters. Entity pages know their real title only once data lands, so
// a route's generic meta is applied on navigation and then *refined* in place;
// a refinement recorded for the current path is never overwritten by the
// generic pass (React runs child effects before the parent's).

import { useEffect } from "react";
import { SITE_URL, fullTitle, metaForPath, normalisePath, type SiteMeta } from "./lib/page-meta";

let currentPath = "";
let refined = false;

function setMetaTag(selector: string, attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setCanonical(href: string | null) {
  const existing = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!href) {
    existing?.remove();
    return;
  }
  const el = existing ?? document.head.appendChild(Object.assign(document.createElement("link"), { rel: "canonical" }));
  el.href = href;
}

export function applyDocumentMeta(meta: SiteMeta, path: string) {
  const title = fullTitle(meta.title);
  const canonical = meta.noindex ? null : `${SITE_URL}${path}`;

  document.title = title;
  setMetaTag('meta[name="description"]', "name", "description", meta.description);
  setMetaTag('meta[property="og:title"]', "property", "og:title", title);
  setMetaTag('meta[property="og:description"]', "property", "og:description", meta.description);
  setMetaTag('meta[name="twitter:title"]', "name", "twitter:title", title);
  setMetaTag('meta[name="twitter:description"]', "name", "twitter:description", meta.description);

  const robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (meta.noindex) setMetaTag('meta[name="robots"]', "name", "robots", "noindex, nofollow");
  else robots?.remove();

  if (canonical) setMetaTag('meta[property="og:url"]', "property", "og:url", canonical);
  else document.head.querySelector('meta[property="og:url"]')?.remove();
  setCanonical(canonical);
}

let firstRoute = true;

/** Apply the route's data-free meta. Called by App on every navigation. */
export function applyRouteMeta(path: string) {
  const p = normalisePath(path);
  const first = firstRoute;
  firstRoute = false;

  // On the first route of a visit the server has already put better tags in the
  // document than metaForPath can produce (it looked the entity up), so leave
  // them alone. Without the marker the shell was served static, and the generic
  // copy is still an improvement on it.
  if (first && document.head.querySelector('meta[name="openscout:meta"]')) {
    currentPath = p;
    refined = true;
    return;
  }

  if (p === currentPath && refined) return;
  if (p !== currentPath) refined = false;
  currentPath = p;
  applyDocumentMeta(metaForPath(p), p);
}

/**
 * Refine the current page's meta once its data has loaded. Pass null while the
 * page is still loading, or when there is nothing better to say than the
 * route's generic copy.
 */
export function usePageMeta(meta: SiteMeta | null) {
  const title = meta?.title;
  const description = meta?.description;
  const noindex = meta?.noindex;
  useEffect(() => {
    if (!title || !description) return;
    const p = normalisePath(window.location.pathname);
    currentPath = p;
    refined = true;
    applyDocumentMeta({ title, description, noindex }, p);
  }, [title, description, noindex]);
}
