import { describe, expect, it } from "vitest";
import { calculateModuleScore, displayTotalScore } from "./scoring";

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
