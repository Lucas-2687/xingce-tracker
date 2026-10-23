import { describe, expect, it } from "vitest";
import type { PracticeRecord } from "../types";
import {
  activePracticeModuleKeys,
  buildPracticeDiagnostics,
  calculatePracticeAccuracy,
  calculatePracticeScorePrediction,
  getPracticeTrend,
  weightedPracticeAccuracy,
} from "./practice";

function practice(
  id: string,
  date: string,
  correct: number,
  wrong: number,
): PracticeRecord {
  return {
    id,
    name: `言语理解_${date}_09-00`,
    date,
    modules: { verbal: { correct, wrong } },
    createdAt: `${date}T09:00:00.000Z`,
    updatedAt: `${date}T09:00:00.000Z`,
  };
}

describe("module practice analytics", () => {
  it("calculates accuracy from correct and wrong answers only", () => {
    expect(calculatePracticeAccuracy({ correct: 7, wrong: 3 })).toBe(70);
  });

  it("weights a window by question count", () => {
    expect(
      weightedPracticeAccuracy([
        { correct: 9, wrong: 1 },
        { correct: 1, wrong: 9 },
        { correct: 80, wrong: 20 },
      ]),
    ).toBeCloseTo(75);
  });

  it("takes the latest window independently for each module", () => {
    const records = [
      practice("p1", "2026-09-01", 9, 1),
      {
        ...practice("p2", "2026-09-02", 5, 5),
        modules: { reasoning: { correct: 6, wrong: 4 } },
      },
      practice("p3", "2026-09-03", 8, 2),
      practice("p4", "2026-09-04", 7, 3),
    ];
    expect(getPracticeTrend(records, "verbal", 2).map((item) => item.record.id)).toEqual([
      "p3",
      "p4",
    ]);
    expect(getPracticeTrend(records, "reasoning", 2)).toHaveLength(1);
  });

  it("tracks graphic reasoning as an independent practice module", () => {
    const record = {
      ...practice("p1", "2026-09-01", 9, 1),
      modules: { graphic: { correct: 8, wrong: 2 } },
    };
    expect(getPracticeTrend([record], "graphic", 3)[0].value).toBe(80);
    expect(activePracticeModuleKeys(record)).toEqual(["graphic"]);
  });

  it("predicts a 100-point score from selected module weights", () => {
    const records = [
      practice("p1", "2026-09-01", 6, 4),
      practice("p2", "2026-09-02", 9, 1),
      {
        ...practice("p3", "2026-09-03", 0, 1),
        modules: { reasoning: { correct: 5, wrong: 5 } },
      },
    ];
    const result = calculatePracticeScorePrediction(
      records,
      ["verbal", "reasoning"],
      3,
    );

    expect(result.modules[0].accuracy).toBe(75);
    expect(result.modules[0].predictedScore).toBeCloseTo(11.625);
    expect(result.modules[1].predictedScore).toBeCloseTo(15.5);
    expect(result.maxScore).toBe(46.5);
    expect(result.score).toBeCloseTo(58.3333333);
  });

  it("requires recent practice data for every selected module", () => {
    const result = calculatePracticeScorePrediction(
      [practice("p1", "2026-09-01", 8, 2)],
      ["verbal", "data"],
      3,
    );

    expect(result.score).toBeNull();
    expect(result.missingModuleKeys).toEqual(["data"]);
  });

  it("includes graphic reasoning in the reasoning score prediction", () => {
    const records = [
      {
        ...practice("p1", "2026-09-01", 0, 1),
        modules: { graphic: { correct: 8, wrong: 2 } },
      },
      {
        ...practice("p2", "2026-09-02", 0, 1),
        modules: {
          reasoning: { correct: 5, wrong: 5 },
          graphic: { correct: 10, wrong: 0 },
        },
      },
    ];
    const result = calculatePracticeScorePrediction(
      records,
      ["reasoning"],
      3,
    );

    expect(result.missingModuleKeys).toEqual([]);
    expect(result.modules[0].sampleCount).toBe(2);
    expect(result.modules[0].accuracy).toBeCloseTo(76.6666667);
    expect(result.score).toBeCloseTo(76.6666667);
  });

  it("diagnoses decline only when one module has two complete windows", () => {
    const records = [
      practice("p1", "2026-09-01", 9, 1),
      practice("p2", "2026-09-02", 9, 1),
      practice("p3", "2026-09-03", 8, 2),
      practice("p4", "2026-09-04", 6, 4),
      practice("p5", "2026-09-05", 5, 5),
      practice("p6", "2026-09-06", 4, 6),
    ];
    const diagnostics = buildPracticeDiagnostics(records, 3);
    expect(diagnostics[1].available).toBe(true);
    expect(diagnostics[1].moduleKey).toBe("verbal");
    expect(diagnostics[1].metric).toBeCloseTo(-36.6666667);
  });
});
