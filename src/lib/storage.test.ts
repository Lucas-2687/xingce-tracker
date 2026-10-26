import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAccountStorage, configureStorage, loadPendingData, loadRecords, notifySessionChange, saveCloudRevision, savePendingData, saveRecords, SESSION_CHANGE_KEY, sessionChangeMarker } from "./storage";
import { createDemoRecords } from "../data/demo";

let items: Map<string, string>;
beforeEach(() => {
  items = new Map();
  vi.stubGlobal("window", { localStorage: { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => items.set(key, value), removeItem: (key: string) => items.delete(key) } });
  configureStorage("owner");
});
afterEach(() => vi.unstubAllGlobals());

describe("account-scoped private caches", () => {
  it("clears only this owner and preserves other applications and owners", () => {
    const records = createDemoRecords();
    items.set("unrelated-app", "keep");
    configureStorage("another-owner");
    saveRecords(records);
    configureStorage("owner");
    saveRecords(records);
    saveCloudRevision(7);
    savePendingData({ revision: 7, records, practiceRecords: [] });
    notifySessionChange();
    clearAccountStorage();
    expect(loadRecords()).toEqual([]);
    expect(loadPendingData()).toBeNull();
    expect(items.get("unrelated-app")).toBe("keep");
    expect(items.has(SESSION_CHANGE_KEY)).toBe(true);
    configureStorage("another-owner");
    expect(loadRecords()).toEqual(records);
  });

  it("broadcasts a lock even when browser storage is unavailable", () => {
    const sent = vi.fn();
    const closed = vi.fn();
    vi.stubGlobal("BroadcastChannel", class { postMessage = sent; close = closed; });
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => { throw new Error("storage_disabled"); });
    notifySessionChange();
    expect(sent).toHaveBeenCalledTimes(1);
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it("session locking retains unsynced data for reauthentication", () => {
    const pending = { revision: 3, records: createDemoRecords(), practiceRecords: [] };
    savePendingData(pending);
    notifySessionChange();
    const first = sessionChangeMarker();
    expect(first).not.toBeNull();
    notifySessionChange();
    expect(sessionChangeMarker()).not.toBe(first);
    expect(loadPendingData()).toEqual(pending);
  });
});
