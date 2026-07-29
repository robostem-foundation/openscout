// Google sign-in that Google attributes to OUR origin, not Supabase's.
//
// `supabase.auth.signInWithOAuth({ provider: "google" })` sends the browser to
// the project's GoTrue endpoint, which stamps its own hostname into the
// `redirect_uri` it hands Google — so Google's account chooser reads "Sign in to
// <project-ref>.supabase.co". Nothing in this repo can override that; the only
// supported fix is Supabase's paid custom-domain add-on.
//
// So we run the OpenID Connect implicit flow ourselves: a top-level navigation
// to Google with `redirect_uri` on our own domain, which is what the chooser
// names. Google posts an ID token back in the URL fragment and Supabase turns it
// into a session via `signInWithIdToken` — same user row, same `sub`, so
// accounts created through the old redirect flow keep working.
//
// This deliberately does NOT use Google Identity Services. GIS renders a button
// we can't style; overlaying it invisibly under ours gets silently refused by
// Chrome's FedCM button flow, which won't show a chooser for a transparent or
// obscured button. A plain top-level navigation has no such rule and can't be
// popup-blocked either.
import { supabase } from "./supabase";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
// Handoff across the redirect. sessionStorage (not local) so it dies with the
// tab and can't be replayed later.
const HANDOFF_KEY = "openscout:google-signin";

export const isGoogleIdentityConfigured = Boolean(CLIENT_ID);

// Google matches redirect_uri by exact string, so this has to be registered
// verbatim under the client's "Authorized redirect URIs" — one per origin.
const redirectUri = () => `${window.location.origin}/`;

const hex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");

function randomHex(bytes = 32) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return hex(buf.buffer);
}

const sha256Hex = async (value: string) =>
  hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));

// The redirect flow we started with. Still the fallback whenever the direct
// flow can't run, and still what Discord uses.
async function supabaseRedirectSignIn(redirectTo?: string) {
  if (!supabase) return;
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: redirectTo ?? window.location.origin },
  });
}

/**
 * Leaves the page for Google's account chooser. `returnTo` is the path to land
 * back on — Google only ever redirects to the registered origin root, so we
 * restore the deep link ourselves in completeGoogleSignIn.
 */
export async function startGoogleSignIn(returnTo?: string) {
  if (!supabase) return;
  const target = returnTo ?? window.location.pathname + window.location.search;
  if (!CLIENT_ID) return supabaseRedirectSignIn(window.location.origin + target);

  // Google signs the HASHED nonce into the token; Supabase re-hashes the raw one
  // we hand it and compares. `state` is the CSRF guard on the return leg.
  const nonce = randomHex();
  const state = randomHex(16);
  sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({ nonce, state, returnTo: target }));

  const url = new URL(AUTH_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: "id_token",
    response_mode: "fragment",
    scope: "openid email profile",
    nonce: await sha256Hex(nonce),
    state,
    prompt: "select_account",
  }).toString();
  window.location.assign(url.toString());
}

/**
 * Consumes the `#id_token=…` Google leaves on the URL and trades it for a
 * Supabase session. Safe to call on every load; resolves immediately when the
 * fragment isn't ours. Call it BEFORE rendering, so the router never sees the
 * fragment and the app boots already signed in.
 */
export async function completeGoogleSignIn() {
  const raw = window.location.hash.slice(1);
  if (!raw.includes("id_token=") && !raw.includes("error=")) return;

  const params = new URLSearchParams(raw);
  const stored = sessionStorage.getItem(HANDOFF_KEY);
  sessionStorage.removeItem(HANDOFF_KEY);

  let handoff: { nonce?: string; state?: string; returnTo?: string } = {};
  try {
    handoff = stored ? JSON.parse(stored) : {};
  } catch {
    /* malformed handoff is treated as absent */
  }

  // Strip the token from the URL (and history) before anything else can read it,
  // then put the user back where they started.
  window.history.replaceState(null, "", handoff.returnTo || window.location.pathname);

  const token = params.get("id_token");
  if (!token) {
    console.warn("[auth] Google returned an error:", params.get("error"));
    return;
  }
  // An id_token arriving without matching state is either a stale tab or a
  // forced-login attempt. Drop it.
  if (!handoff.state || handoff.state !== params.get("state")) {
    console.warn("[auth] Discarding Google ID token: state mismatch");
    return;
  }
  if (!supabase) return;

  const { error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token,
    nonce: handoff.nonce,
  });
  if (error) {
    // Most likely the client ID isn't listed under the Supabase Google provider.
    console.warn("[auth] Google ID token rejected, falling back to redirect:", error.message);
    await supabaseRedirectSignIn();
  }
}
