import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
// Publishable key (`sb_publishable_…`): safe to ship in the bundle — access is
// governed by RLS via the `anon`/`authenticated` Postgres roles, exactly as the
// key it replaced was.
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// When the env vars are absent (e.g. before the Supabase project is wired up)
// the client is null and the whole accounts layer no-ops — the signed-out
// experience stays byte-for-byte identical to today.
export const isSupabaseConfigured = Boolean(url && publishableKey);

// PKCE + detectSessionInUrl handles the OAuth redirect that lands back on the
// SPA with a `?code=` param: supabase-js exchanges it for a session and strips
// it from the URL via history.replaceState, so the pushState router is unaffected.
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, publishableKey as string, {
      auth: {
        flowType: "pkce",
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;
