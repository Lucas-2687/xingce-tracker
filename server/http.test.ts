import { describe, expect, it } from "vitest";
import { json, readJson, sameOrigin } from "./http";

const request = (headers: Record<string, string> = {}) => new Request("https://tracker.example/api/data", { headers });

describe("private HTTP boundaries", () => {
  it("requires the exact browser origin and ignores arbitrary forwarded hosts", () => {
    expect(sameOrigin(request({ origin: "https://tracker.example" }))).toBe(true);
    for (const origin of ["https://other.example", "http://tracker.example", "null", "https://tracker.example:444"]) {
      expect(sameOrigin(request({ origin }))).toBe(false);
    }
    expect(sameOrigin(request())).toBe(false);
    expect(sameOrigin(request({ origin: "https://tracker.example", "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(sameOrigin(request({ origin: "https://other.example", "x-forwarded-host": "other.example" }))).toBe(false);
  });

  it("returns private non-cacheable data", () => {
    expect(json({ ok: true }).headers.get("cache-control")).toBe("private, no-store");
  });

  it("accepts JSON with charset but rejects lookalike media types", async () => {
    const make = (type: string) => new Request("https://tracker.example", { method: "PUT", headers: { "content-type": type }, body: "{}" });
    expect(await readJson(make("application/json; charset=utf-8"), 20)).toEqual({});
    await expect(readJson(make("application/jsonp"), 20)).rejects.toThrow("invalid_json");
  });

  it("enforces actual byte limits even with a false content length", async () => {
    const body = JSON.stringify({ value: "中".repeat(20) });
    const oversized = new Request("https://tracker.example", { method: "PUT", headers: { "content-type": "application/json", "content-length": "1" }, body });
    await expect(readJson(oversized, 30)).rejects.toThrow("payload_too_large");
  });
});
