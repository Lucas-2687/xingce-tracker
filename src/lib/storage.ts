import { PRACTICE_STORAGE_KEY, STORAGE_KEY } from "../constants";
import type { ExamRecord, PracticeRecord } from "../types";
import { normalizePracticeRecord, normalizeRecord } from "./dataTransfer";

const PENDING_SYNC_KEY = "xingce-score-dashboard.pending-sync.v1";
const CLOUD_REVISION_KEY = "xingce-score-dashboard.cloud-revision.v1";
let accountId = "owner";
const accountKey = (key: string) => `xingce-independent.${encodeURIComponent(accountId)}.${key}`;
export function configureStorage(userId: string): void { accountId = userId; }
export function clearAccountStorage(): void {
  for (const key of [PENDING_SYNC_KEY, CLOUD_REVISION_KEY, STORAGE_KEY, PRACTICE_STORAGE_KEY]) {
    window.localStorage.removeItem(accountKey(key));
  }
}

export type PendingSyncData = {
  revision: number;
  records: ExamRecord[];
  practiceRecords: PracticeRecord[];
};

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
