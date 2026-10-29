import { describe, expect, it } from "vitest";
import { createDemoRecords } from "../data/demo";
import {
  exportAllRecordsToJson,
  exportPracticeRecordsToCsv,
  exportRecordsToCsv,
  exportRecordsToJson,
  parseBackupJson,
  parseCsv,
  parseJson,
  parsePracticeCsv,
} from "./dataTransfer";
import type { PracticeRecord } from "../types";

const practiceRecord: PracticeRecord = {
  id: "practice-1",
  name: "言语理解+判断推理+图形推理_2026-09-03_14-30",
  date: "2026-09-03",
  type: undefined,
  year: undefined,
  region: undefined,
  paperNo: undefined,
  modules: {
    verbal: { correct: 7, wrong: 3 },
    reasoning: { correct: 8, wrong: 2 },
    graphic: { correct: 9, wrong: 1 },
  },
  createdAt: "2026-09-03T06:30:00.000Z",
  updatedAt: "2026-09-03T06:30:00.000Z",
};

describe("data transfer", () => {
  it("round-trips a complete JSON backup", () => {
    const source = createDemoRecords().slice(0, 2);
    const restored = parseJson(exportRecordsToJson(source));
    expect(restored).toEqual(source);
  });

  it("round-trips CSV records including all six modules", () => {
    const source = createDemoRecords().slice(0, 2);
    const restored = parseCsv(exportRecordsToCsv(source));
    expect(restored).toEqual(source);
  });

  it("rejects incomplete records", () => {
    expect(() =>
      parseJson(
        JSON.stringify({
          records: [{ name: "残缺试卷", date: "2026-09-03", type: "模拟卷" }],
        }),
      ),
    ).toThrow("缺少政治理论数据");
  });

  it("round-trips a module practice CSV with multiple modules", () => {
    expect(
      parsePracticeCsv(exportPracticeRecordsToCsv([practiceRecord])),
    ).toEqual([practiceRecord]);
  });

  it("round-trips a combined JSON backup", () => {
    const exams = createDemoRecords().slice(0, 1);
    const restored = parseBackupJson(
      exportAllRecordsToJson(exams, [practiceRecord]),
    );
    expect(restored.records).toEqual(exams);
    expect(restored.practiceRecords).toEqual([practiceRecord]);
    expect(restored.includesRecords).toBe(true);
    expect(restored.includesPracticeRecords).toBe(true);
  });

  it("round-trips source settings without renaming legacy records or losing empty lists", () => {
    const exams = createDemoRecords().slice(0, 1);
    for (const sources of [["广东", "自定义来源"], []]) {
      const restored = parseBackupJson(exportAllRecordsToJson(exams, [practiceRecord], sources));
      expect(restored.simulationSources).toEqual(sources);
      expect(restored.records).toEqual(exams);
      expect(restored.practiceRecords).toEqual([practiceRecord]);
    }
    const legacy = parseBackupJson(JSON.stringify({ records: exams, practiceRecords: [practiceRecord] }));
    expect(legacy).not.toHaveProperty("simulationSources");
    for (const sources of [null, [1], ["广东", "广东"]]) {
      expect(() => parseBackupJson(JSON.stringify({ records: [], simulationSources: sources }))).toThrow();
    }
  });

  it("keeps old JSON backups compatible", () => {
    const restored = parseBackupJson(
      exportRecordsToJson(createDemoRecords().slice(0, 1)),
    );
    expect(restored.records).toHaveLength(1);
    expect(restored.practiceRecords).toEqual([]);
    expect(restored.includesPracticeRecords).toBe(false);
  });

  it("rejects module practice records without an answered module", () => {
    expect(() =>
      parseBackupJson(
        JSON.stringify({
          records: [],
          practiceRecords: [{ date: "2026-09-03", modules: {} }],
        }),
      ),
    ).toThrow("模块练习至少需要填写一个模块");
  });
});
