import { normalizePracticeRecord, normalizeRecord } from "../src/lib/dataTransfer";
import { normalizeSimulationSources } from "../src/lib/simulation";
import type { StoredData } from "./store";

function checkRecords(value: unknown) {
  if (!Array.isArray(value) || value.length > 10_000) throw new Error("invalid_data");
  const ids = new Set<string>();
  for (const record of value) {
    if (!record || typeof record !== "object" || typeof record.id !== "string" || !record.id.trim() || record.id.length > 200 || ids.has(record.id) || typeof record.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(record.date) || typeof record.createdAt !== "string" || !record.createdAt || typeof record.updatedAt !== "string" || !record.updatedAt) throw new Error("invalid_data");
    ids.add(record.id);
  }
  return value;
}
export function validateData(body: unknown): StoredData & { revision: number } {
  if (!body || typeof body !== "object") throw new Error("invalid_data");
  const value = body as Record<string, unknown>;
  if (!Number.isSafeInteger(value.revision) || Number(value.revision) < 0 || Number(value.revision) >= Number.MAX_SAFE_INTEGER) throw new Error("invalid_data");
  return {
    revision: Number(value.revision),
    records: checkRecords(value.records).map(normalizeRecord),
    practiceRecords: checkRecords(value.practiceRecords).map(normalizePracticeRecord),
    ...(value.simulationSources === undefined ? {} : {
      simulationSources: normalizeSimulationSources(value.simulationSources),
    }),
  };
}
