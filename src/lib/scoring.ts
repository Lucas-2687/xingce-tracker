import { MODULES, MODULE_MAP, SIMULATION_QUESTION_TYPES } from "../constants";
import type {
  ExamRecord,
  ModuleAttempt,
  ModuleKey,
  ModuleScoreResult,
} from "../types";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function createSimulationAttempt(
  moduleKey: ModuleKey,
  wrongs: Record<string, number> = {},
): ModuleAttempt {
  const questionTypes = SIMULATION_QUESTION_TYPES[moduleKey];
  const questionTypeWrongs = Object.fromEntries(
    questionTypes.map((type) => [type.key, wrongs[type.key] ?? 0]),
  );
  const questionCount = questionTypes.reduce((sum, type) => sum + type.questionCount, 0);
  const wrong = Object.values(questionTypeWrongs).reduce((sum, count) => sum + count, 0);
  return { correct: questionCount - wrong, wrong, unanswered: 0, questionTypeWrongs };
}

export function calculateQuestionTypeScore(questionCount: number, unitScore: number, wrong: number): number {
  const score = (questionCount - wrong) * unitScore;
  return Math.round(clamp(Number.isFinite(score) ? score : 0, 0, questionCount * unitScore) * 100) / 100;
}

export function calculateModuleScore(
  attempt: ModuleAttempt,
  maxScore: number,
): ModuleScoreResult {
  const questionCount =
    attempt.correct + attempt.wrong + attempt.unanswered;
  const automaticUnitScore = questionCount > 0 ? maxScore / questionCount : 0;
  const effectiveUnitScore = automaticUnitScore;
  const definition = MODULES.find((module) => module.maxScore === maxScore);
  const rawScore = attempt.questionTypeWrongs && definition
    ? SIMULATION_QUESTION_TYPES[definition.key].reduce((sum, type) => sum + calculateQuestionTypeScore(
        type.questionCount, type.unitScore, attempt.questionTypeWrongs![type.key],
      ), 0)
    : attempt.correct * effectiveUnitScore;

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
  if (attempt.questionTypeWrongs !== undefined) {
    const definition = MODULES.find((module) => module.maxScore === maxScore);
    const questionTypes = definition && SIMULATION_QUESTION_TYPES[definition.key];
    if (!questionTypes || Object.keys(attempt.questionTypeWrongs).length !== questionTypes.length ||
        Object.keys(attempt.questionTypeWrongs).some((key) => !questionTypes.some((type) => type.key === key))) {
      return ["题型明细不完整或不属于当前模块"];
    }
    for (const type of questionTypes) {
      const wrong = attempt.questionTypeWrongs[type.key];
      if (!Number.isInteger(wrong) || wrong < 0 || wrong > type.questionCount) {
        errors.push(`${type.name}错题数须为 0～${type.questionCount} 的整数`);
      }
    }
    const expected = createSimulationAttempt(definition.key, attempt.questionTypeWrongs);
    if (attempt.correct !== expected.correct || attempt.wrong !== expected.wrong || attempt.unanswered !== 0) {
      errors.push("模块汇总与题型错题数不一致");
    }
    return errors;
  }
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

