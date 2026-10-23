import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession, hashPassword, verifyPassword, verifySession, SESSION_SECONDS } from "./auth";

beforeEach(async () => {
  vi.stubEnv("APP_PASSWORD_HASH", await hashPassword("test-password-only-12345"));
  vi.stubEnv("APP_SESSION_SECRET", "test-only-session-secret-that-is-long-enough");
  vi.stubEnv("APP_OWNER_ID", "test-owner");
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
  it("expires sessions after seven days", async () => {
    const session = await createSession();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + (SESSION_SECONDS + 1) * 1000);
    expect(await verifySession(session)).toBeNull();
  });
});
