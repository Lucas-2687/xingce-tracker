import { MODULES, MODULE_MAP } from "../constants";
import type {
  ExamRecord,
  ModuleAttempt,
  ModuleKey,
  ModuleScoreResult,
} from "../types";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function calculateModuleScore(
  attempt: ModuleAttempt,
  maxScore: number,
): ModuleScoreResult {
  const questionCount =
    attempt.correct + attempt.wrong + attempt.unanswered;
  const automaticUnitScore = questionCount > 0 ? maxScore / questionCount : 0;
  const effectiveUnitScore = automaticUnitScore;
  const rawScore = attempt.correct * effectiveUnitScore;

  return {
    questionCount,
    automaticUnitScore,
    effectiveUnitScore,
    rawScore,
    score: clamp(Number.isFinite(rawScore) ? rawScore : 0, 0, maxScore),
  };
}

export function calculateRecordTotal(record: ExamRecord): number {
  return MODULES.reduce((total, module) => {
    return (
      total +
      calculateModuleScore(record.modules[module.key], module.maxScore).score
    );
  }, 0);
}

export function calculateModuleRate(
  record: ExamRecord,
  moduleKey: ModuleKey,
): number {
  const definition = MODULE_MAP[moduleKey];
  const score = calculateModuleScore(
    record.modules[moduleKey],
    definition.maxScore,
  ).score;
  return definition.maxScore > 0 ? (score / definition.maxScore) * 100 : 0;
}

export function validateModuleAttempt(
  attempt: ModuleAttempt,
  maxScore: number,
): string[] {
  const errors: string[] = [];
  const counts = [attempt.correct, attempt.wrong, attempt.unanswered];

  if (counts.some((value) => !Number.isInteger(value) || value < 0)) {
    errors.push("答对、答错和未作答必须是非负整数");
  }

  if (counts.every((value) => value === 0)) {
    errors.push("请填写本模块的作答数量");
  }

  const result = calculateModuleScore(attempt, maxScore);
  if (result.rawScore > maxScore + Number.EPSILON) {
    errors.push(`模块得分不能超过满分 ${maxScore}`);
  }

  return errors;
}

function rounded(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function displayModuleScore(value: number): string {
  return rounded(value, 2).toFixed(2);
}

export function displayTotalScore(value: number): string {
  return rounded(value, 1).toFixed(1);
}
