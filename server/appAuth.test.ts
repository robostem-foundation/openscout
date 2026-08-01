import { beforeAll, describe, expect, it } from "vitest";
import { SignJWT } from "jose";

// Force the symmetric (legacy secret) verification path. appAuth reads env
// lazily and only builds a remote JWKS when SUPABASE_URL is present, so clearing
// it here keeps these tests offline and deterministic.
const SECRET = "test-secret-that-is-long-enough-for-hs256-signing";
delete process.env.SUPABASE_URL;
delete process.env.VITE_SUPABASE_URL;
process.env.SUPABASE_JWT_SECRET = SECRET;

const key = new TextEncoder().encode(SECRET);

let bearerToken: typeof import("./appAuth.js").bearerToken;
let verifyAppToken: typeof import("./appAuth.js").verifyAppToken;
let isAppAuthConfigured: typeof import("./appAuth.js").isAppAuthConfigured;

beforeAll(async () => {
  ({ bearerToken, verifyAppToken, isAppAuthConfigured } = await import("./appAuth.js"));
});

type Claims = {
  sub?: string;
  role?: string;
  aud?: string;
  anonymous?: boolean;
  expiresIn?: string;
  secret?: Uint8Array;
};

async function mint(claims: Claims = {}): Promise<string> {
  const {
    sub = "11111111-2222-3333-4444-555555555555",
    role = "authenticated",
    aud = "authenticated",
    anonymous = false,
    expiresIn = "1h",
    secret = key,
  } = claims;

  return new SignJWT({ role, is_anonymous: anonymous })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}

describe("bearerToken", () => {
  it("extracts the token from a well-formed header", () => {
    expect(bearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
  });

  it("is case-insensitive on the scheme and tolerates extra whitespace", () => {
    expect(bearerToken("  bearer   abc.def.ghi  ")).toBe("abc.def.ghi");
  });

  it("returns null for a missing, empty, or non-bearer header", () => {
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
    expect(bearerToken("")).toBeNull();
    expect(bearerToken("Bearer")).toBeNull();
    expect(bearerToken("Bearer   ")).toBeNull();
    expect(bearerToken("Basic dXNlcjpwYXNz")).toBeNull();
  });
});

describe("isAppAuthConfigured", () => {
  it("is true when a signing secret is present", () => {
    expect(isAppAuthConfigured()).toBe(true);
  });
});

describe("verifyAppToken", () => {
  it("accepts a valid token and returns the user id", async () => {
    const principal = await verifyAppToken(`Bearer ${await mint()}`);
    expect(principal).toEqual({
      userId: "11111111-2222-3333-4444-555555555555",
      anonymous: false,
    });
  });

  it("accepts an anonymous token and flags it", async () => {
    // Anonymous sign-in is how the app browses without an account, so these
    // must pass — the flag exists for rate-limit policy, not for rejection.
    const principal = await verifyAppToken(`Bearer ${await mint({ anonymous: true })}`);
    expect(principal?.anonymous).toBe(true);
  });

  it("rejects a token signed with the wrong secret", async () => {
    const wrong = new TextEncoder().encode("a-completely-different-secret-value-here");
    expect(await verifyAppToken(`Bearer ${await mint({ secret: wrong })}`)).toBeNull();
  });

  it("rejects an expired token", async () => {
    expect(await verifyAppToken(`Bearer ${await mint({ expiresIn: "-10m" })}`)).toBeNull();
  });

  it("rejects a service_role token", async () => {
    // A service-role key bypasses RLS entirely. It must never authorize a
    // client-facing request, even though its signature is valid.
    expect(await verifyAppToken(`Bearer ${await mint({ role: "service_role" })}`)).toBeNull();
  });

  it("rejects a token for the wrong audience", async () => {
    expect(await verifyAppToken(`Bearer ${await mint({ aud: "some-other-service" })}`)).toBeNull();
  });

  it("rejects a token with no subject", async () => {
    const token = await new SignJWT({ role: "authenticated" })
      .setProtectedHeader({ alg: "HS256" })
      .setAudience("authenticated")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);
    expect(await verifyAppToken(`Bearer ${token}`)).toBeNull();
  });

  it("returns null rather than throwing on garbage input", async () => {
    expect(await verifyAppToken("Bearer not-a-jwt")).toBeNull();
    expect(await verifyAppToken("Bearer a.b.c")).toBeNull();
    expect(await verifyAppToken(null)).toBeNull();
  });
});
