import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionGuard, SessionLockedError } from "./sessionGuard";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("private request lifecycle", () => {
  it("aborts requests and ignores a late response after logout", async () => {
    const response = deferred<Response>();
    const fetcher = vi.fn<typeof fetch>(() => response.promise);
    vi.stubGlobal("fetch", fetcher);
    const locked = vi.fn();
    const guard = new SessionGuard(locked, Date.now() + 60_000);
    const pending = guard.request("/api/data");
    guard.lock();
    guard.lock();
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    response.resolve(Response.json({ records: ["synthetic"] }));
    await expect(pending).rejects.toBeInstanceOf(SessionLockedError);
    await expect(guard.request("/api/data")).rejects.toBeInstanceOf(SessionLockedError);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(locked).toHaveBeenCalledTimes(1);
  });

  it("ignores a body read from an earlier mount even after restarting", async () => {
    const body = deferred<unknown>();
    const reading = deferred<void>();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: () => { reading.resolve(); return body.promise; } })));
    const guard = new SessionGuard(vi.fn(), Date.now() + 60_000);
    const pending = guard.request("/api/data");
    await reading.promise;
    guard.dispose();
    guard.start();
    body.resolve({ revision: 42 });
    await expect(pending).rejects.toBeInstanceOf(SessionLockedError);
    expect(guard.active).toBe(true);
  });

  it("locks on 401 without reading its body", async () => {
    const json = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401, json })));
    const locked = vi.fn();
    const guard = new SessionGuard(locked, Date.now() + 60_000);
    await expect(guard.request("/api/data")).rejects.toBeInstanceOf(SessionLockedError);
    expect(guard.active).toBe(false);
    expect(locked).toHaveBeenCalledTimes(1);
    expect(json).not.toHaveBeenCalled();
  });

  it.each([409, 503])("preserves the session for HTTP %s", async status => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status })));
    const guard = new SessionGuard(vi.fn(), Date.now() + 60_000);
    expect(await guard.request("/api/data")).toEqual({ ok: false, status, data: null });
    expect(guard.active).toBe(true);
  });

  it("preserves the session on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const guard = new SessionGuard(vi.fn(), Date.now() + 60_000);
    await expect(guard.request("/api/data")).rejects.toThrow("offline");
    expect(guard.active).toBe(true);
  });

  it("refuses requests after expiry without contacting the network", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const locked = vi.fn();
    const guard = new SessionGuard(locked, Date.now() - 1);
    await expect(guard.request("/api/data")).rejects.toBeInstanceOf(SessionLockedError);
    expect(fetcher).not.toHaveBeenCalled();
    expect(locked).toHaveBeenCalledTimes(1);
  });
});
