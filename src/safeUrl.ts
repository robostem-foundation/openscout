// Shared guard for rendering remote/user-derived URLs as clickable links.
// Only http(s) URLs are safe as an <a href>; everything else (javascript:,
// data:, vbscript:, blank, malformed) should be shown as inert text instead.
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
