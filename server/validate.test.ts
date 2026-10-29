import { describe, expect, it } from "vitest";
import { createDemoRecords } from "../src/data/demo";
import { validateData } from "./validate";
import { readJson, sameOrigin } from "./http";

describe("data API validation", () => {
  it("preserves a valid full backup", () => {
    const body = { revision: 0, records: createDemoRecords(), practiceRecords: [] };
    expect(validateData(body)).toEqual(body);
  });
  it("accepts managed sources, including custom and empty lists, but rejects invalid lists", () => {
    const body = { revision: 0, records: [], practiceRecords: [] };
    expect(validateData({ ...body, simulationSources: [" 广东 ", "自定义来源"] }).simulationSources).toEqual(["广东", "自定义来源"]);
    expect(validateData({ ...body, simulationSources: [] }).simulationSources).toEqual([]);
    expect(validateData(body)).not.toHaveProperty("simulationSources");
    for (const sources of [null, "广东", [1], [" "], ["广东", "广东"]]) {
      expect(() => validateData({ ...body, simulationSources: sources })).toThrow();
    }
  });

  it("rejects duplicate IDs, missing arrays, and invalid versions", () => {
    const record = createDemoRecords()[0];
    expect(() => validateData({ revision: 0, records: [record, record], practiceRecords: [] })).toThrow();
    expect(() => validateData({ revision: 0, records: [] })).toThrow();
    expect(() => validateData({ revision: -1, records: [], practiceRecords: [] })).toThrow();
  });
  it("rejects missing origins and cross-origin writes", () => {
    expect(sameOrigin(new Request("https://tracker.example/api/data"))).toBe(false);
    expect(sameOrigin(new Request("https://tracker.example/api/data", { headers: { origin: "https://attacker.example" } }))).toBe(false);
    expect(sameOrigin(new Request("https://tracker.example/api/data", { headers: { origin: "https://tracker.example" } }))).toBe(true);
    expect(sameOrigin(new Request("http://localhost:4317/api/data", { headers: { origin: "http://127.0.0.1:4317", host: "127.0.0.1:4317" } }))).toBe(true);
    expect(sameOrigin(new Request("https://tracker.example/api/data", { headers: { origin: "https://attacker.example", "x-forwarded-host": "attacker.example" } }))).toBe(false);
  });
  it("bounds actual request bytes even without content-length", async () => {
    const request = new Request("https://tracker.example/api/data", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "x".repeat(100) }) });
    await expect(readJson(request, 30)).rejects.toThrow("payload_too_large");
  });
});
