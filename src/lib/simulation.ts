import { SIMULATION_SOURCES } from "../constants";
import type { ExamRecord, TrackerData } from "../types";

export function normalizeSimulationSources(value: unknown): string[] {
  if (value === undefined) return [...SIMULATION_SOURCES];
  if (!Array.isArray(value)) throw new Error("来源列表格式不正确");
  const sources: string[] = [];
  for (const source of value) {
    if (typeof source !== "string" || !source.trim()) {
      throw new Error("来源名称不能为空");
    }
    const trimmed = source.trim();
    if (sources.includes(trimmed)) throw new Error("来源名称不能重复");
    sources.push(trimmed);
  }
  return sources;
}

export function withSimulationSources<T extends TrackerData>(
  data: T,
  fallback?: string[],
): T & { simulationSources: string[] } {
  return {
    ...data,
    simulationSources: normalizeSimulationSources(data.simulationSources ?? fallback),
  };
}

export function createSimulationRecordName(source: string, description?: string): string {
  return `${source.trim()}${description?.trim() ?? ""}`;
}

export function simulationMetadataForEditing(record: ExamRecord): ExamRecord {
  const type = record.type === "国考"
    ? record.type
    : record.region?.trim() || record.type.trim();
  const paperNo = [record.year?.trim(), record.paperNo?.trim()].filter(Boolean).join("");
  return { ...record, type, paperNo: paperNo || undefined, year: undefined, region: undefined };
}
