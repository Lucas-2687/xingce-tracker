import { describe, expect, it } from "vitest";
import { MODULES, SIMULATION_QUESTION_TYPES } from "../constants";
import { createDemoRecords } from "../data/demo";
import { calculateModuleRate, calculateModuleScore, calculateQuestionTypeScore, calculateRecordTotal, createSimulationAttempt, displayTotalScore, validateModuleAttempt } from "./scoring";

describe("calculateModuleScore", () => {
  it("calculates 7 correct out of 10 verbal questions as 10.85", () => {
    const result = calculateModuleScore(
      { correct: 7, wrong: 3, unanswered: 0 },
      15.5,
    );
    expect(result.effectiveUnitScore).toBeCloseTo(1.55);
    expect(result.score).toBeCloseTo(10.85);
  });

  it("calculates 3 correct out of 5 verbal questions as 9.3", () => {
    const result = calculateModuleScore(
      { correct: 3, wrong: 2, unanswered: 0 },
      15.5,
    );
    expect(result.effectiveUnitScore).toBeCloseTo(3.1);
    expect(result.score).toBeCloseTo(9.3);
  });

  it("counts unanswered questions in the denominator", () => {
    const result = calculateModuleScore(
      { correct: 3, wrong: 1, unanswered: 1 },
      15.5,
    );
    expect(result.questionCount).toBe(5);
    expect(result.score).toBeCloseTo(9.3);
  });

  it("ignores legacy manual adjustments and uses equal scoring", () => {
    const legacyAttempt = {
      correct: 3,
      wrong: 2,
      unanswered: 0,
      scoreMode: "module",
      scoreOverride: 8.75,
    };
    const result = calculateModuleScore(legacyAttempt, 15.5);
    expect(result.score).toBeCloseTo(9.3);
  });

  it("displays the total with one decimal place", () => {
    expect(displayTotalScore(68.85)).toBe("68.9");
    expect(displayTotalScore(49.55)).toBe("49.6");
  });
});

describe("2026 Guangdong question-type scoring", () => {
  it("uses all 90 questions and gives 100 for all correct, zero for all wrong", () => {
    let questions = 0;
    let total = 0;
    for (const module of MODULES) {
      const full = createSimulationAttempt(module.key);
      questions += full.correct;
      total += calculateModuleScore(full, module.maxScore).score;
      expect(validateModuleAttempt(full, module.maxScore)).toEqual([]);
      expect(calculateModuleScore(full, module.maxScore).score).toBeCloseTo(module.maxScore);
      const zero = createSimulationAttempt(module.key, Object.fromEntries(SIMULATION_QUESTION_TYPES[module.key].map((type) => [type.key, type.questionCount])));
      expect(validateModuleAttempt(zero, module.maxScore)).toEqual([]);
      expect(calculateModuleScore(zero, module.maxScore).score).toBe(0);
    }
    expect(questions).toBe(90);
    expect(total).toBe(100);
  });

  it("scores two logic errors as 16.9 within a 28.4 reasoning module and 97.4 total", () => {
    const record = createDemoRecords()[0];
    record.modules = Object.fromEntries(MODULES.map((module) => [module.key, createSimulationAttempt(module.key)])) as typeof record.modules;
    record.modules.reasoning = createSimulationAttempt("reasoning", { logic: 2 });
    expect(calculateQuestionTypeScore(15, 1.3, 2)).toBe(16.9);
    expect(record.modules.reasoning).toMatchObject({ correct: 23, wrong: 2, unanswered: 0 });
    expect(calculateModuleScore(record.modules.reasoning, 31).score).toBeCloseTo(28.4);
    expect(calculateRecordTotal(record)).toBeCloseTo(97.4);
    expect(calculateModuleRate(record, "reasoning")).toBeCloseTo(28.4 / 31 * 100);
  });

  it("deducts each question type's actual weight instead of a module average", () => {
    for (const module of MODULES) {
      for (const type of SIMULATION_QUESTION_TYPES[module.key]) {
        const attempt = createSimulationAttempt(module.key, { [type.key]: 1 });
        expect(calculateModuleScore(attempt, module.maxScore).score).toBeCloseTo(module.maxScore - type.unitScore);
      }
    }
  });

  it("rejects out-of-range, fractional, missing, foreign and inconsistent details", () => {
    for (const wrong of [-1, 16, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(validateModuleAttempt(createSimulationAttempt("reasoning", { logic: wrong }), 31).length).toBeGreaterThan(0);
    }
    const attempt = createSimulationAttempt("reasoning", { logic: 2 });
    expect(validateModuleAttempt({ ...attempt, questionTypeWrongs: { logic: 2 } }, 31)).not.toEqual([]);
    expect(validateModuleAttempt({ ...attempt, questionTypeWrongs: { graphic: 0, logic: 2, cloze: 0 } }, 31)).not.toEqual([]);
    expect(validateModuleAttempt({ ...attempt, correct: 25 }, 31)).toContain("模块汇总与题型错题数不一致");
  });
});

