import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configurationReady, createSession, hashPassword, loginRateKey, verifyPassword, verifySession, SESSION_SECONDS } from "./auth";

vi.mock("server-only", () => ({}));

beforeEach(async () => {
  vi.stubEnv("APP_PASSWORD_HASH", await hashPassword("test-password-only-12345"));
  vi.stubEnv("APP_SESSION_SECRET", "test-only-session-secret-that-is-long-enough");
  vi.stubEnv("APP_OWNER_ID", "test-owner");
  vi.stubEnv("TURSO_DATABASE_URL", "file::memory:");
  vi.stubEnv("TURSO_AUTH_TOKEN", "");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("APP_PREVIEW_ENABLED", "");
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
describe("private owner authentication", () => {
  it("accepts only the correct password", async () => {
    expect(await verifyPassword("test-password-only-12345")).toBe(true);
    expect(await verifyPassword("wrong-password")).toBe(false);
  });
  it("rejects modified sessions and invalidates sessions on password change", async () => {
    const session = await createSession();
    expect((await verifySession(session))?.userId).toBe("test-owner");
    expect(await verifySession(session + "tampered")).toBeNull();
    vi.stubEnv("APP_PASSWORD_HASH", await hashPassword("new-test-password-12345"));
    expect(await verifySession(session)).toBeNull();
  });
  it("rejects sessions after signing-key or owner changes", async () => {
    const session = await createSession();
    vi.stubEnv("APP_OWNER_ID", "another-owner");
    expect(await verifySession(session)).toBeNull();
    vi.stubEnv("APP_OWNER_ID", "test-owner");
    vi.stubEnv("APP_SESSION_SECRET", "rotated-test-session-key-that-is-long-enough");
    expect(await verifySession(session)).toBeNull();
  });
  it("fails closed without credentials and disables previews by default", () => {
    expect(configurationReady()).toBe(true);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(configurationReady()).toBe(false);
    vi.stubEnv("APP_PREVIEW_ENABLED", "true");
    expect(configurationReady()).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(configurationReady()).toBe(false);
    vi.stubEnv("TURSO_AUTH_TOKEN", "unit-test-only-token");
    expect(configurationReady()).toBe(true);
    vi.stubEnv("APP_PASSWORD_HASH", "");
    expect(configurationReady()).toBe(false);
  });
  it("ignores spoofable IP headers on non-Vercel hosts", () => {
    const make = (ip: string) => new Request("https://tracker.example", { headers: { "x-forwarded-for": ip, "x-vercel-forwarded-for": ip } });
    expect(loginRateKey(make("192.0.2.1"))).toBe(loginRateKey(make("192.0.2.2")));
  });
  it("uses only a valid Vercel ingress IP on Vercel", () => {
    vi.stubEnv("VERCEL", "1");
    const make = (ip: string, other: string) => new Request("https://tracker.example", { headers: { "x-vercel-forwarded-for": ip, "x-forwarded-for": other } });
    expect(loginRateKey(make("192.0.2.1", "192.0.2.2"))).toBe(loginRateKey(make("192.0.2.1", "192.0.2.3")));
    expect(loginRateKey(make("192.0.2.1", ""))).not.toBe(loginRateKey(make("192.0.2.2", "")));
    expect(loginRateKey(make("invalid", ""))).toBe(loginRateKey(make("", "")));
  });
  it("expires sessions after seven days", async () => {
    const session = await createSession();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + (SESSION_SECONDS + 1) * 1000);
    expect(await verifySession(session)).toBeNull();
  });
});
