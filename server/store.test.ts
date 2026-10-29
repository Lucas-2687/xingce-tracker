import { afterEach, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { createStore } from "./store";
import { createDemoRecords } from "../src/data/demo";
import { SIMULATION_SOURCES } from "../src/constants";

let client: Client;
afterEach(() => client?.close());
function setup() { client = createClient({ url: "file::memory:" }); return createStore(client, "owner"); }
describe("Turso-compatible data storage", () => {
  it("initializes empty data and preserves imported records", async () => {
    const store = setup();
    expect(await store.read()).toEqual({ revision: 0, records: [], practiceRecords: [], simulationSources: [...SIMULATION_SOURCES] });
    const data = { records: createDemoRecords(), practiceRecords: [] };
    expect(await store.write(0, data)).toBe(1);
    expect(await store.read()).toEqual({ ...data, simulationSources: [...SIMULATION_SOURCES], revision: 1 });
  });
  it("allows exactly one competing write and rejects a stale retry", async () => {
    const store = setup();
    const data = { records: createDemoRecords(), practiceRecords: [] };
    const results = await Promise.all([store.write(0, data), store.write(0, { records: [], practiceRecords: [] })]);
    expect(results.filter(value => value === 1)).toHaveLength(1);
    expect(results.filter(value => value === null)).toHaveLength(1);
    expect(await store.write(0, data)).toBeNull();
    expect((await store.read()).revision).toBe(1);
  });
  it("preserves an existing row on another instance and separates owners", async () => {
    const first = setup();
    await first.write(0, { records: createDemoRecords(), practiceRecords: [] });
    expect((await createStore(client, "owner").read()).records).toHaveLength(10);
    expect(await createStore(client, "another-owner").read()).toEqual({ revision: 0, records: [], practiceRecords: [], simulationSources: [...SIMULATION_SOURCES] });
  });
  it("keeps deleted sources deleted across legacy writes and other instances", async () => {
    const store = setup();
    const records = createDemoRecords();
    await store.write(0, { records, practiceRecords: [], simulationSources: ["自定义来源"] });
    expect((await createStore(client, "owner").read()).simulationSources).toEqual(["自定义来源"]);
    await store.write(1, { records, practiceRecords: [] });
    expect((await store.read()).simulationSources).toEqual(["自定义来源"]);
    await store.write(2, { records, practiceRecords: [], simulationSources: [] });
    await store.write(3, { records, practiceRecords: [] });
    expect((await store.read()).simulationSources).toEqual([]);
    expect((await store.read()).records).toEqual(records);
  });

  it("rejects stale source updates and keeps owners separate", async () => {
    const store = setup();
    const data = { records: [], practiceRecords: [] };
    await store.write(0, { ...data, simulationSources: ["四川"] });
    const results = await Promise.all([
      store.write(1, { ...data, simulationSources: ["粉笔"] }),
      store.write(1, data),
    ]);
    expect(results.filter(value => value === 2)).toHaveLength(1);
    expect(results.filter(value => value === null)).toHaveLength(1);
    expect((await createStore(client, "another-owner").read()).simulationSources).toEqual([...SIMULATION_SOURCES]);
    expect(await store.write(1, { ...data, simulationSources: [] })).toBeNull();
  });

  it("shares login limits across instances and resets after the window", async () => {
    const store = setup();
    for (let i = 0; i < 10; i++) expect(await store.allowLogin("test-ip", 1_000_000)).toBe(true);
    expect(await createStore(client, "owner").allowLogin("test-ip", 1_000_001)).toBe(false);
    expect(await store.allowLogin("other-ip", 1_000_001)).toBe(true);
    expect(await store.allowLogin("test-ip", 1_900_000)).toBe(true);
  });
});
