// Bearer-token authentication for API clients that cannot present an Origin.
//
// The origin allowlist in proxy.ts works because a browser always sends either
// `Origin` or `Referer`. A native client sends neither — `URLSession` has no
// concept of an origin — so every proxied call from the iOS app hits the final
// `return false` in isAllowedOrigin() and 403s. Relaxing that check is not an
// option: it would turn the proxy into an open relay for the shared RobotEvents
// key, which is the whole reason the proxy exists.
//
// So the app presents a Supabase access token instead. Anonymous sign-in means
// browsing still needs no account: every install gets a JWT, the proxy verifies
// the signature, and the rate limiter keys on the user id rather than the IP.
// That last part matters more than it looks — a school's entire team shares one
// NAT address, so per-IP limiting throttles a whole club as though it were one
// abusive client.
//
// This is deliberately not the end state. A JWT proves "some install of this
// app", not "a genuine, unmodified install" — the anon key ships in the binary
// and anyone can mint an anonymous token. App Attest is the real answer and is
// tracked as decision D1; this closes the open-relay hole and makes per-device
// limiting possible in the meantime.

import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";

export type AppPrincipal = {
  /** Supabase user id (JWT `sub`). Stable per install for anonymous users. */
  userId: string;
  /** True when the token came from anonymous sign-in rather than a real account. */
  anonymous: boolean;
};

function supabaseUrl(): string | null {
  const raw = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
  const trimmed = raw.trim().replace(/\/+$/, "");
  return trimmed || null;
}

/** The `iss` every Supabase-issued token carries. */
function expectedIssuer(): string | null {
  const base = supabaseUrl();
  return base ? `${base}/auth/v1` : null;
}

// JWKS is fetched lazily and cached by jose, which also handles rotation and
// rate-limits its own refetches. Built once so the cache is shared.
let cachedJwks: JWTVerifyGetKey | null | undefined;
function jwks(): JWTVerifyGetKey | null {
  if (cachedJwks !== undefined) return cachedJwks;
  const base = supabaseUrl();
  if (!base) {
    cachedJwks = null;
    return null;
  }
  cachedJwks = createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`), {
    cooldownDuration: 30_000,
    cacheMaxAge: 600_000,
  });
  return cachedJwks;
}

// Projects still on the legacy symmetric signing key verify with the shared
// secret instead. Asymmetric is preferred and tried first.
function legacySecret(): Uint8Array | null {
  const raw = process.env.SUPABASE_JWT_SECRET;
  return raw ? new TextEncoder().encode(raw) : null;
}

/** True when bearer-token auth is configured at all. */
export function isAppAuthConfigured(): boolean {
  return supabaseUrl() !== null || legacySecret() !== null;
}

/** Pull the raw token out of an `Authorization: Bearer <token>` header. */
export function bearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  return token ? token : null;
}

function principalFrom(payload: JWTPayload): AppPrincipal | null {
  const sub = typeof payload.sub === "string" ? payload.sub : null;
  if (!sub) return null;
  // Supabase sets `role` to "authenticated" for both real and anonymous users;
  // `is_anonymous` is what distinguishes them. Service-role tokens are rejected
  // outright — they must never reach this path from a client.
  if (payload.role === "service_role") return null;
  return { userId: sub, anonymous: payload.is_anonymous === true };
}

/**
 * Verify a Supabase access token. Returns the principal, or null when the token
 * is absent, malformed, expired, wrongly signed, or issued by another project.
 *
 * Never throws: a verification failure is an authorization outcome, not an
 * error condition, and must not take the proxy down.
 */
export async function verifyAppToken(header: string | null | undefined): Promise<AppPrincipal | null> {
  const token = bearerToken(header);
  if (!token) return null;

  const issuer = expectedIssuer();
  const options = {
    ...(issuer ? { issuer } : {}),
    audience: "authenticated",
    clockTolerance: 5,
  };

  const keySet = jwks();
  if (keySet) {
    try {
      const { payload } = await jwtVerify(token, keySet, options);
      return principalFrom(payload);
    } catch {
      // Fall through to the legacy secret — a project mid-migration may still
      // be issuing symmetric tokens that the JWKS cannot verify.
    }
  }

  const secret = legacySecret();
  if (secret) {
    try {
      const { payload } = await jwtVerify(token, secret, options);
      return principalFrom(payload);
    } catch {
      return null;
    }
  }

  return null;
}
