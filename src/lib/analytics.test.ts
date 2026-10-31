import { describe, expect, it } from "vitest";
import { createDemoRecords } from "../data/demo";
import { MODULES } from "../constants";
import type { ExamRecord } from "../types";
import { createSimulationAttempt } from "./scoring";
import { buildDiagnostics, getQuestionTypeTrend, getWindow, standardDeviation, weightedModuleRate, weightedQuestionTypeRate } from "./analytics";

function detailedRecord(index: number, logicWrong = 0): ExamRecord {
  const record = createDemoRecords()[index];
  record.modules = Object.fromEntries(MODULES.map((module) => [module.key, createSimulationAttempt(module.key)])) as ExamRecord["modules"];
  record.modules.reasoning = createSimulationAttempt("reasoning", { logic: logicWrong });
  return record;
}

describe("analytics", () => {
  it("calculates population standard deviation", () => {
    expect(standardDeviation([50, 60, 70])).toBeCloseTo(8.1649658);
  });

  it("waits for a full previous window before diagnosing decline", () => {
    const diagnostics = buildDiagnostics(createDemoRecords().slice(0, 5), 5);
    expect(diagnostics[1].available).toBe(false);
    expect(diagnostics[1].message).toContain("10 套");
  });

  it("finds declining and unstable modules with enough data", () => {
    const diagnostics = buildDiagnostics(createDemoRecords(), 5);
    expect(diagnostics[1].available).toBe(true);
    expect(diagnostics[1].moduleKey).toBe("verbal");
    expect(diagnostics[2].available).toBe(true);
    expect(diagnostics[2].moduleKey).toBe("quantitative");
  });

  it("weights the selected window by question count instead of displaying the latest rate or a plain mean", () => {
    const records = createDemoRecords().slice(0, 3);
    records[0].modules.politics = { correct: 100, wrong: 0, unanswered: 0 };
    records[1].modules.politics = { correct: 10, wrong: 0, unanswered: 0 };
    records[2].modules.politics = { correct: 0, wrong: 80, unanswered: 10 };
    expect(weightedModuleRate(getWindow(records.reverse(), 2), "politics")).toBeCloseTo(10);
  });

  it("keeps each question type's score weight when aggregating detailed modules", () => {
    const records = [detailedRecord(0, 2), detailedRecord(1, 5)];
    expect(weightedModuleRate(records, "reasoning")).toBeCloseTo((28.4 + 24.5) / 62 * 100);
    const trend = getQuestionTypeTrend(records, "reasoning", "logic", 3);
    expect(trend[0]).toMatchObject({ questionCount: 15, correct: 13, wrong: 2, score: 16.9, maxScore: 19.5 });
    expect(trend[1]).toMatchObject({ correct: 10, wrong: 5, score: 13 });
    expect(weightedQuestionTypeRate(trend)).toBeCloseTo(29.9 / 39 * 100);
  });

  it("does not backfill old detailed results from outside the selected exam window", () => {
    const old = detailedRecord(0, 2);
    const legacy = createDemoRecords()[1];
    expect(getQuestionTypeTrend([legacy, old], "reasoning", "logic", 1)).toEqual([]);
    expect(getQuestionTypeTrend([legacy, old], "reasoning", "logic", 2).map((point) => point.record.id)).toEqual([old.id]);
  });

  it("skips unknown legacy breakdowns and preserves real zero scores", () => {
    const legacy = createDemoRecords()[0];
    const zero = detailedRecord(1, 15);
    const trend = getQuestionTypeTrend([legacy, zero], "reasoning", "logic", 3);
    expect(trend).toHaveLength(1);
    expect(trend[0]).toMatchObject({ value: 0, correct: 0, wrong: 15 });
    expect(weightedQuestionTypeRate(trend)).toBe(0);
  });

  it("uses known aggregate counts for legacy single-type modules, including unanswered questions", () => {
    const records = createDemoRecords().slice(0, 2);
    records[0].modules.common = { correct: 1, wrong: 0, unanswered: 0 };
    records[1].modules.common = { correct: 0, wrong: 8, unanswered: 1 };
    const trend = getQuestionTypeTrend(records, "common", "common", 3);
    expect(trend[1]).toMatchObject({ questionCount: 9, wrong: 8, unanswered: 1, score: 0 });
    expect(weightedQuestionTypeRate(trend)).toBeCloseTo(10);
  });

  it("uses the same weighted rate in the weakest-module diagnostic", () => {
    const records = [detailedRecord(0), detailedRecord(1)];
    records[0].modules.politics = { correct: 1, wrong: 0, unanswered: 0 };
    records[1].modules.politics = { correct: 0, wrong: 9, unanswered: 0 };
    for (const record of records) record.modules.common = { correct: 2, wrong: 3, unanswered: 0 };
    expect(buildDiagnostics(records, 3)[0]).toMatchObject({ moduleKey: "politics", metric: 10 });
  });

  it("handles empty samples and an unknown question type without non-finite values", () => {
    expect(weightedModuleRate([], "politics")).toBe(0);
    expect(weightedQuestionTypeRate([])).toBe(0);
    expect(getQuestionTypeTrend([detailedRecord(0)], "reasoning", "missing", 3)).toEqual([]);
  });
});

