// PostgREST access shared by the server-side caches (event grades, translations).
//
// Extracted from server/eventGrades.ts so the two caches cannot drift on the key
// handling below, which is the part that is easy to get wrong.

// Reads only need SELECT and both cache tables have a public read policy, so the
// publishable key is enough and a cache stays useful even before the secret key
// is configured. Writes bypass RLS and require the secret key.
const warnedNoWrites = new Set<string>();

export function supabaseConfig(mode: "read" | "write", label: string) {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const key = mode === "write" ? secretKey : (secretKey ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY);
  if (!url || !key) {
    if (mode === "write" && !warnedNoWrites.has(label)) {
      warnedNoWrites.add(label);
      // Worth shouting about: with no write path every visitor re-fetches the
      // same values against a metered upstream quota.
      console.warn(`[${label}] no SUPABASE_SECRET_KEY — results will be refetched, not persisted`);
    }
    return null;
  }
  return { url: url.replace(/\/$/, ""), key };
}

// `sb_publishable_…`/`sb_secret_…` keys are not JWTs, and Supabase only accepts
// them in the `apikey` header — so send Authorization only for a JWT key.
export function supabaseHeaders(key: string): Record<string, string> {
  const isJwt = key.startsWith("ey");
  return { apikey: key, ...(isJwt ? { Authorization: `Bearer ${key}` } : {}) };
}
