// Google sign-in that Google attributes to OUR origin, not Supabase's.
//
// `supabase.auth.signInWithOAuth({ provider: "google" })` sends the browser to
// the project's GoTrue endpoint, which stamps its own hostname into the
// `redirect_uri` it hands Google — so Google's account chooser reads "Sign in to
// <project-ref>.supabase.co". Nothing in this repo can override that; the only
// supported fix is Supabase's paid custom-domain add-on.
//
// Google Identity Services (GIS) sidesteps it: the browser talks to Google
// directly from openscout.ing, Google attributes the prompt to the authorized
// JavaScript origin, and we exchange the resulting ID token for a Supabase
// session via `signInWithIdToken`. Same user row, same `sub` — accounts created
// through the old redirect flow keep working.
//
// Every failure path (script blocked, GIS unavailable, exchange rejected) falls
// back to the original redirect flow, so the worst case is today's behavior.
import { supabase } from "./supabase";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const SRC = "https://accounts.google.com/gsi/client";

// GIS button width is clamped by Google to 200–400px.
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

type CredentialResponse = { credential?: string };

type GoogleIdentity = {
  accounts: {
    id: {
      initialize: (config: Record<string, unknown>) => void;
      renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

export const isGoogleIdentityConfigured = Boolean(CLIENT_ID);

// The redirect flow we started with — also the fallback whenever GIS can't
// finish the job.
export async function googleRedirectSignIn(redirectTo?: string) {
  if (!supabase) return;
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: redirectTo ?? window.location.origin },
  });
}

function loadScript(): Promise<GoogleIdentity> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`);
    const el = existing ?? document.createElement("script");
    el.addEventListener("load", () => {
      if (window.google?.accounts?.id) resolve(window.google);
      else reject(new Error("GIS loaded without accounts.id"));
    });
    el.addEventListener("error", () => reject(new Error("GIS script blocked")));
    if (!existing) {
      el.src = SRC;
      el.async = true;
      el.defer = true;
      document.head.appendChild(el);
    }
  });
}

const hex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");

// Replay guard: Google signs the HASHED nonce into the ID token, Supabase
// re-hashes the raw one we pass it and compares. One nonce per page load is
// enough — it only has to be unpredictable and single-origin.
async function makeNonce() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const raw = hex(bytes.buffer);
  const hashed = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)));
  return { raw, hashed };
}

// Where to send the user if the token exchange fails and we have to fall back
// mid-flight. Set by whichever button was mounted last.
let fallbackRedirectTo: string | undefined;
let rawNonce = "";

async function exchange(response: CredentialResponse) {
  if (!supabase || !response.credential) return;
  const { error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: response.credential,
    nonce: rawNonce,
  });
  if (!error) return;
  // Most likely cause: the Google client ID isn't listed under the Supabase
  // Google provider yet. Don't strand the user on a dead click — finish the
  // sign-in the old way.
  console.warn("[auth] Google ID token exchange failed, falling back to redirect:", error.message);
  void googleRedirectSignIn(fallbackRedirectTo);
}

let initPromise: Promise<GoogleIdentity> | null = null;

function init(): Promise<GoogleIdentity> {
  if (!initPromise) {
    initPromise = (async () => {
      const [google, nonce] = await Promise.all([loadScript(), makeNonce()]);
      rawNonce = nonce.raw;
      google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: exchange,
        nonce: nonce.hashed,
        auto_select: false,
        itp_support: true,
        use_fedcm_for_prompt: true,
        ux_mode: "popup",
      });
      return google;
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

/**
 * Renders an invisible GIS button filling `host`, so a real click on the
 * app-styled button underneath lands on Google's iframe instead. When this
 * never resolves (script blocked, no client ID) the host stays empty and the
 * click falls through to the styled button's own redirect handler.
 *
 * Returns a cleanup function.
 */
export function mountGoogleButton(host: HTMLElement, options: { redirectTo?: string } = {}) {
  fallbackRedirectTo = options.redirectTo;
  if (!CLIENT_ID || !supabase) return () => {};

  let cancelled = false;
  let lastWidth = 0;

  const draw = (google: GoogleIdentity) => {
    const width = Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, host.clientWidth || MIN_WIDTH)));
    if (cancelled || width === lastWidth) return;
    lastWidth = width;
    host.replaceChildren();
    google.accounts.id.renderButton(host, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "signin_with",
      shape: "rectangular",
      logo_alignment: "left",
      width,
    });
  };

  let observer: ResizeObserver | undefined;
  init()
    .then((google) => {
      if (cancelled) return;
      draw(google);
      // The header dropdown and the home panel size differently; keep the hit
      // area matched to whatever the styled button actually measures.
      observer = new ResizeObserver(() => draw(google));
      observer.observe(host);
    })
    .catch((err) => {
      console.warn("[auth] Google Identity Services unavailable, using redirect sign-in:", err);
    });

  return () => {
    cancelled = true;
    observer?.disconnect();
    host.replaceChildren();
  };
}
