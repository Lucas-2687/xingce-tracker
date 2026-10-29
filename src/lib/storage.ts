import { PRACTICE_STORAGE_KEY, STORAGE_KEY } from "../constants";
import type { ExamRecord, PracticeRecord, TrackerData } from "../types";
import { normalizePracticeRecord, normalizeRecord } from "./dataTransfer";
import { normalizeSimulationSources } from "./simulation";

const PENDING_SYNC_KEY = "xingce-score-dashboard.pending-sync.v1";
const CLOUD_REVISION_KEY = "xingce-score-dashboard.cloud-revision.v1";
const SIMULATION_SOURCES_KEY = "xingce-score-dashboard.simulation-sources.v1";
export const SESSION_CHANGE_KEY = "xingce-independent.session-change.v1";
export const SESSION_CHANNEL_NAME = "xingce-independent.session";
export function sessionChangeMarker(): string | null {
  try { return window.localStorage.getItem(SESSION_CHANGE_KEY); } catch { return null; }
}
export function notifySessionChange(): void {
  const marker = `${Date.now()}:${Math.random()}`;
  try { window.localStorage.setItem(SESSION_CHANGE_KEY, marker); } catch {}
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(SESSION_CHANNEL_NAME);
      channel.postMessage(marker);
      channel.close();
    }
  } catch {}
}
let accountId = "owner";
const accountKey = (key: string) => `xingce-independent.${encodeURIComponent(accountId)}.${key}`;
export function configureStorage(userId: string): void { accountId = userId; }
export function clearAccountStorage(): void {
  for (const key of [PENDING_SYNC_KEY, CLOUD_REVISION_KEY, STORAGE_KEY, PRACTICE_STORAGE_KEY, SIMULATION_SOURCES_KEY]) {
    window.localStorage.removeItem(accountKey(key));
  }
}

export type PendingSyncData = TrackerData & { revision: number };

export function loadCloudRevision(): number {
  const value = Number(window.localStorage.getItem(accountKey(CLOUD_REVISION_KEY)));
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function saveCloudRevision(revision: number): void {
  window.localStorage.setItem(accountKey(CLOUD_REVISION_KEY), String(revision));
}

export function loadPendingData(): PendingSyncData | null {
  const raw = window.localStorage.getItem(accountKey(PENDING_SYNC_KEY));
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as PendingSyncData;
    if (!Number.isSafeInteger(value.revision) || value.revision < 0 ||
        !Array.isArray(value.records) || !Array.isArray(value.practiceRecords)) return null;
    return {
      revision: value.revision,
      records: value.records.map(normalizeRecord),
      practiceRecords: value.practiceRecords.map(normalizePracticeRecord),
      ...(value.simulationSources === undefined ? {} : {
        simulationSources: normalizeSimulationSources(value.simulationSources),
      }),
    };
  } catch {
    return null;
  }
}

export function savePendingData(data: PendingSyncData): void {
  window.localStorage.setItem(accountKey(PENDING_SYNC_KEY), JSON.stringify(data));
}

export function clearPendingData(): void {
  window.localStorage.removeItem(accountKey(PENDING_SYNC_KEY));
}

export function loadRecords(): ExamRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(accountKey(STORAGE_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeRecord) : [];
  } catch {
    return [];
  }
}

export function saveRecords(records: ExamRecord[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(accountKey(STORAGE_KEY), JSON.stringify(records));
}

export function loadPracticeRecords(): PracticeRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(accountKey(PRACTICE_STORAGE_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizePracticeRecord) : [];
  } catch {
    return [];
  }
}

export function savePracticeRecords(records: PracticeRecord[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(accountKey(PRACTICE_STORAGE_KEY), JSON.stringify(records));
}

export function loadSimulationSources(): string[] {
  if (typeof window === "undefined") return normalizeSimulationSources(undefined);
  try {
    const raw = window.localStorage.getItem(accountKey(SIMULATION_SOURCES_KEY));
    return normalizeSimulationSources(raw === null ? undefined : JSON.parse(raw));
  } catch {
    return normalizeSimulationSources(undefined);
  }
}

export function saveSimulationSources(sources: string[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(accountKey(SIMULATION_SOURCES_KEY), JSON.stringify(sources));
}
