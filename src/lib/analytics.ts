import { MODULES, MODULE_MAP, SIMULATION_QUESTION_TYPES } from "../constants";
import type { Diagnostic, ExamRecord, ModuleKey } from "../types";
import {
  calculateModuleRate,
  calculateModuleScore,
  calculateQuestionTypeScore,
  calculateRecordTotal,
} from "./scoring";

export function sortRecords(records: ExamRecord[]): ExamRecord[] {
  return [...records].sort((a, b) => {
    const dateDiff = a.date.localeCompare(b.date);
    return dateDiff || a.createdAt.localeCompare(b.createdAt);
  });
}

export const average = (values: number[]): number =>
  values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : 0;

export const standardDeviation = (values: number[]): number => {
  if (!values.length) return 0;
  const mean = average(values);
  return Math.sqrt(
    average(values.map((value) => (value - mean) ** 2)),
  );
};

export function getWindow(records: ExamRecord[], size: number): ExamRecord[] {
  return sortRecords(records).slice(-size);
}

function weightedRate(points: { value: number; questionCount: number }[]): number {
  const questions = points.reduce((sum, point) => sum + point.questionCount, 0);
  return questions > 0
    ? points.reduce((sum, point) => sum + point.value * point.questionCount, 0) / questions
    : 0;
}

export function weightedModuleRate(records: ExamRecord[], moduleKey: ModuleKey): number {
  return weightedRate(records.map((record) => {
    const result = calculateModuleScore(record.modules[moduleKey], MODULE_MAP[moduleKey].maxScore);
    return { value: calculateModuleRate(record, moduleKey), questionCount: result.questionCount };
  }));
}

export interface QuestionTypeTrendPoint {
  record: ExamRecord;
  questionCount: number;
  correct: number;
  wrong: number;
  unanswered: number;
  score: number;
  maxScore: number;
  value: number;
}

export function weightedQuestionTypeRate(points: QuestionTypeTrendPoint[]): number {
  return weightedRate(points);
}

export function getQuestionTypeTrend(
  records: ExamRecord[],
  moduleKey: ModuleKey,
  questionTypeKey: string,
  size: number,
): QuestionTypeTrendPoint[] {
  const types = SIMULATION_QUESTION_TYPES[moduleKey];
  const type = types.find((item) => item.key === questionTypeKey);
  if (!type) return [];
  return getWindow(records, size).flatMap((record) => {
    const attempt = record.modules[moduleKey];
    const maxScore = type.questionCount * type.unitScore;
    if (attempt.questionTypeWrongs !== undefined) {
      const wrong = attempt.questionTypeWrongs[type.key];
      const score = calculateQuestionTypeScore(type.questionCount, type.unitScore, wrong);
      return [{ record, questionCount: type.questionCount, correct: type.questionCount - wrong,
        wrong, unanswered: 0, score, maxScore, value: score / maxScore * 100 }];
    }
    // A single-type module already has a complete breakdown in legacy totals.
    // Multi-type modules cannot be reconstructed from aggregate counts.
    if (types.length !== 1) return [];
    const result = calculateModuleScore(attempt, MODULE_MAP[moduleKey].maxScore);
    if (!result.questionCount) return [];
    return [{ record, questionCount: result.questionCount, correct: attempt.correct,
      wrong: attempt.wrong, unanswered: attempt.unanswered, score: result.score,
      maxScore, value: result.score / maxScore * 100 }];
  });
}

export function buildDiagnostics(
  records: ExamRecord[],
  windowSize: number,
): Diagnostic[] {
  const sorted = sortRecords(records);
  const recent = sorted.slice(-windowSize);
  const previous = sorted.slice(-windowSize * 2, -windowSize);

  const weakest: Diagnostic = recent.length
    ? (() => {
        const ranked = MODULES.map((module) => ({
          module,
          value: weightedModuleRate(recent, module.key),
        })).sort((a, b) => a.value - b.value);
        const result = ranked[0];
        return {
          kind: "weakest",
          title: "当前最弱",
          moduleKey: result.module.key,
          metric: result.value,
          message: `${result.module.name}最近加权得分率 ${result.value.toFixed(1)}%`,
          advice: "先把稳定能拿到的基础分补齐，再处理高耗时题。",
          available: true,
        };
      })()
    : {
        kind: "weakest",
        title: "当前最弱",
        message: "录入第一套试卷后开始判断",
        advice: "",
        available: false,
      };

  const declining: Diagnostic =
    recent.length === windowSize && previous.length === windowSize
      ? (() => {
          const ranked = MODULES.map((module) => {
            const recentRate = weightedModuleRate(recent, module.key);
            const previousRate = weightedModuleRate(previous, module.key);
            return { module, change: recentRate - previousRate };
          }).sort((a, b) => a.change - b.change);
          const result = ranked[0];
          return {
            kind: "declining",
            title: "退步最多",
            moduleKey: result.module.key,
            metric: result.change,
            message: `${result.module.name}较前 ${windowSize} 套${
              result.change < 0 ? "下降" : "变化"
            } ${Math.abs(result.change).toFixed(1)} 个百分点`,
            advice:
              result.change < 0
                ? "回看最近几套的作答数量，确认是连续下滑还是单次失常。"
                : "目前没有模块下降，继续观察下一窗口。",
            available: true,
          };
        })()
      : {
          kind: "declining",
          title: "退步最多",
          message: `需要至少 ${windowSize * 2} 套试卷完成前后窗口比较`,
          advice: "",
          available: false,
        };

  const unstable: Diagnostic =
    recent.length >= 3
      ? (() => {
          const ranked = MODULES.map((module) => ({
            module,
            deviation: standardDeviation(
              recent.map((record) => calculateModuleRate(record, module.key)),
            ),
          })).sort((a, b) => b.deviation - a.deviation);
          const result = ranked[0];
          return {
            kind: "unstable",
            title: "最不稳定",
            moduleKey: result.module.key,
            metric: result.deviation,
            message: `${result.module.name}得分率标准差 ${result.deviation.toFixed(
              1,
            )} 个百分点`,
            advice: "优先检查做题节奏和取舍策略是否每套都一致。",
            available: true,
          };
        })()
      : {
          kind: "unstable",
          title: "最不稳定",
          message: "至少录入 3 套试卷后判断波动",
          advice: "",
          available: false,
        };

  return [weakest, declining, unstable];
}

export function getTotalTrend(records: ExamRecord[], size: number) {
  return getWindow(records, size).map((record) => ({
    record,
    value: calculateRecordTotal(record),
  }));
}

export function getModuleTrend(
  records: ExamRecord[],
  moduleKey: ModuleKey,
  size: number,
) {
  return getWindow(records, size).map((record) => ({
    record,
    value: calculateModuleRate(record, moduleKey),
  }));
}

