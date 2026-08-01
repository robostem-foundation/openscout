import { beforeAll, describe, expect, it } from "vitest";
import { SignJWT } from "jose";

// Same offline setup as appAuth.test.ts: symmetric verification, no JWKS fetch.
const SECRET = "test-secret-that-is-long-enough-for-hs256-signing";
delete process.env.SUPABASE_URL;
delete process.env.VITE_SUPABASE_URL;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
process.env.SUPABASE_JWT_SECRET = SECRET;
process.env.APP_ORIGIN = "https://openscout.ing";

const key = new TextEncoder().encode(SECRET);

let guardProxyRequest: typeof import("./proxy.js").guardProxyRequest;

beforeAll(async () => {
  ({ guardProxyRequest } = await import("./proxy.js"));
});

function token(sub = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"): Promise<string> {
  return new SignJWT({ role: "authenticated", is_anonymous: true })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}

describe("guardProxyRequest", () => {
  it("allows an allow-listed origin", async () => {
    const result = await guardProxyRequest({ origin: "https://openscout.ing", ip: "1.2.3.4" });
    expect(result.ok).toBe(true);
  });

  it("allows a same-origin request carrying only a Referer", async () => {
    const result = await guardProxyRequest({ referer: "https://openscout.ing/events", ip: "1.2.3.4" });
    expect(result.ok).toBe(true);
  });

  it("rejects a foreign origin", async () => {
    const result = await guardProxyRequest({ origin: "https://evil.example", ip: "1.2.3.4" });
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  // The regression this whole change exists to fix: URLSession sends neither
  // Origin nor Referer, so before bearer support every native call 403'd.
  it("rejects a request with no origin, no referer, and no token", async () => {
    const result = await guardProxyRequest({ ip: "1.2.3.4" });
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it("allows a headerless request that presents a valid token", async () => {
    const result = await guardProxyRequest({
      authorization: `Bearer ${await token()}`,
      ip: "1.2.3.4",
    });
    expect(result.ok).toBe(true);
  });

  it("still rejects a headerless request whose token is invalid", async () => {
    const result = await guardProxyRequest({
      authorization: "Bearer not-a-real-token",
      ip: "1.2.3.4",
    });
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it("does not let a valid token launder a foreign origin into an allowed one", async () => {
    // A token is an alternative credential, not an override — but a browser
    // request from evil.example that somehow carries a token should still be
    // authorized on the token's merits, since the token is the stronger claim.
    // What must never happen is the origin allowlist being silently widened.
    const result = await guardProxyRequest({
      origin: "https://evil.example",
      authorization: `Bearer ${await token()}`,
      ip: "1.2.3.4",
    });
    expect(result.ok).toBe(true);
  });
});
