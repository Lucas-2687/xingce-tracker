import { MODULES, PRACTICE_MODULES } from "../constants";
import type {
  Diagnostic,
  ModuleKey,
  PracticeModuleKey,
  PracticeAttempt,
  PracticeRecord,
} from "../types";
import { standardDeviation } from "./analytics";

export interface PracticeTrendPoint {
  record: PracticeRecord;
  attempt: PracticeAttempt;
  value: number;
}

export function practiceQuestionCount(attempt: PracticeAttempt): number {
  return attempt.correct + attempt.wrong;
}

export function calculatePracticeAccuracy(attempt: PracticeAttempt): number {
  const total = practiceQuestionCount(attempt);
  return total > 0 ? (attempt.correct / total) * 100 : 0;
}

export function validatePracticeAttempt(attempt: PracticeAttempt): string[] {
  const values = [attempt.correct, attempt.wrong];
  if (values.some((value) => !Number.isInteger(value) || value < 0)) {
    return ["答对和答错必须是非负整数"];
  }
  if (values.every((value) => value === 0)) {
    return ["请填写本模块的答题数量"];
  }
  return [];
}

export function activePracticeModuleKeys(record: PracticeRecord): PracticeModuleKey[] {
  return PRACTICE_MODULES.map((module) => module.key).filter((key) => {
    const attempt = record.modules[key];
    return attempt ? practiceQuestionCount(attempt) > 0 : false;
  });
}

export function sortPracticeRecords(
  records: PracticeRecord[],
): PracticeRecord[] {
  return [...records].sort((a, b) => {
    const dateDiff = a.date.localeCompare(b.date);
    return dateDiff || a.createdAt.localeCompare(b.createdAt);
  });
}

export function getPracticeAttempts(
  records: PracticeRecord[],
  moduleKey: PracticeModuleKey,
): PracticeTrendPoint[] {
  return sortPracticeRecords(records).flatMap((record) => {
    const attempt = record.modules[moduleKey];
    return attempt && practiceQuestionCount(attempt) > 0
      ? [
          {
            record,
            attempt,
            value: calculatePracticeAccuracy(attempt),
          },
        ]
      : [];
  });
}

export function getPracticeTrend(
  records: PracticeRecord[],
  moduleKey: PracticeModuleKey,
  size: number,
): PracticeTrendPoint[] {
  return getPracticeAttempts(records, moduleKey).slice(-size);
}

export function weightedPracticeAccuracy(
  attempts: PracticeAttempt[],
): number {
  const totals = attempts.reduce(
    (result, attempt) => ({
      correct: result.correct + attempt.correct,
      questions: result.questions + practiceQuestionCount(attempt),
    }),
    { correct: 0, questions: 0 },
  );
  return totals.questions > 0 ? (totals.correct / totals.questions) * 100 : 0;
}

export interface PracticeScorePredictionModule {
  key: ModuleKey;
  accuracy: number;
  predictedScore: number;
  maxScore: number;
  sampleCount: number;
}

export interface PracticeScorePrediction {
  score: number | null;
  predictedScore: number;
  maxScore: number;
  modules: PracticeScorePredictionModule[];
  missingModuleKeys: ModuleKey[];
}

export function calculatePracticeScorePrediction(
  records: PracticeRecord[],
  moduleKeys: ModuleKey[],
  windowSize: number,
): PracticeScorePrediction {
  const selected = new Set(moduleKeys);
  const modules = MODULES.filter((module) => selected.has(module.key)).flatMap(
    (module) => {
      const recentAttempts =
        module.key === "reasoning"
          ? sortPracticeRecords(records)
              .flatMap((record) => {
                const reasoning = record.modules.reasoning;
                const graphic = record.modules.graphic;
                if (!reasoning && !graphic) return [];
                const attempt = {
                  correct: (reasoning?.correct ?? 0) + (graphic?.correct ?? 0),
                  wrong: (reasoning?.wrong ?? 0) + (graphic?.wrong ?? 0),
                };
                return practiceQuestionCount(attempt) > 0 ? [attempt] : [];
              })
              .slice(-windowSize)
          : getPracticeTrend(records, module.key, windowSize).map(
              (item) => item.attempt,
            );
      if (!recentAttempts.length) return [];
      const accuracy = weightedPracticeAccuracy(
        recentAttempts,
      );
      return [
        {
          key: module.key,
          accuracy,
          predictedScore: (accuracy / 100) * module.maxScore,
          maxScore: module.maxScore,
          sampleCount: recentAttempts.length,
        },
      ];
    },
  );
  const availableKeys = new Set(modules.map((module) => module.key));
  const missingModuleKeys = moduleKeys.filter((key) => !availableKeys.has(key));
  const predictedScore = modules.reduce(
    (total, module) => total + module.predictedScore,
    0,
  );
  const maxScore = modules.reduce(
    (total, module) => total + module.maxScore,
    0,
  );

  return {
    score:
      moduleKeys.length > 0 && !missingModuleKeys.length && maxScore > 0
        ? (predictedScore / maxScore) * 100
        : null,
    predictedScore,
    maxScore,
    modules,
    missingModuleKeys,
  };
}

export function buildPracticeDiagnostics(
  records: PracticeRecord[],
  windowSize: number,
): Diagnostic[] {
  const series = PRACTICE_MODULES.map((module) => ({
    module,
    attempts: getPracticeAttempts(records, module.key),
  }));

  const weakestCandidates = series
    .filter(({ attempts }) => attempts.length > 0)
    .map(({ module, attempts }) => {
      const recent = attempts.slice(-windowSize);
      return {
        module,
        count: recent.length,
        value: weightedPracticeAccuracy(recent.map((item) => item.attempt)),
      };
    })
    .sort((a, b) => a.value - b.value);
  const weakestResult = weakestCandidates[0];
  const weakest: Diagnostic = weakestResult
    ? {
        kind: "weakest",
        title: "当前最弱",
        moduleKey: weakestResult.module.key,
        metric: weakestResult.value,
        message: `${weakestResult.module.name}最近 ${weakestResult.count} 次加权正确率 ${weakestResult.value.toFixed(1)}%`,
        advice: "优先回看错题分布，再安排下一轮同模块练习。",
        available: true,
      }
    : {
        kind: "weakest",
        title: "当前最弱",
        message: "录入第一次模块练习后开始判断",
        advice: "",
        available: false,
      };

  const decliningCandidates = series
    .filter(({ attempts }) => attempts.length >= windowSize * 2)
    .map(({ module, attempts }) => {
      const recent = attempts.slice(-windowSize);
      const previous = attempts.slice(-windowSize * 2, -windowSize);
      const recentRate = weightedPracticeAccuracy(
        recent.map((item) => item.attempt),
      );
      const previousRate = weightedPracticeAccuracy(
        previous.map((item) => item.attempt),
      );
      return { module, change: recentRate - previousRate };
    })
    .sort((a, b) => a.change - b.change);
  const decliningResult = decliningCandidates[0];
  const declining: Diagnostic = decliningResult
    ? {
        kind: "declining",
        title: "退步最多",
        moduleKey: decliningResult.module.key,
        metric: decliningResult.change,
        message: `${decliningResult.module.name}较前 ${windowSize} 次${
          decliningResult.change < 0 ? "下降" : "变化"
        } ${Math.abs(decliningResult.change).toFixed(1)} 个百分点`,
        advice:
          decliningResult.change < 0
            ? "对照前后两段练习，检查题型变化和错因是否集中。"
            : "目前没有模块下降，继续观察下一窗口。",
        available: true,
      }
    : {
        kind: "declining",
        title: "退步最多",
        message: `同一模块至少需要 ${windowSize * 2} 次练习才能比较前后窗口`,
        advice: "",
        available: false,
      };

  const unstableCandidates = series
    .map(({ module, attempts }) => ({
      module,
      recent: attempts.slice(-windowSize),
    }))
    .filter(({ recent }) => recent.length >= 3)
    .map(({ module, recent }) => ({
      module,
      deviation: standardDeviation(recent.map((item) => item.value)),
    }))
    .sort((a, b) => b.deviation - a.deviation);
  const unstableResult = unstableCandidates[0];
  const unstable: Diagnostic = unstableResult
    ? {
        kind: "unstable",
        title: "最不稳定",
        moduleKey: unstableResult.module.key,
        metric: unstableResult.deviation,
        message: `${unstableResult.module.name}正确率标准差 ${unstableResult.deviation.toFixed(1)} 个百分点`,
        advice: "检查每次题量和练习难度是否接近，再定位波动来源。",
        available: true,
      }
    : {
        kind: "unstable",
        title: "最不稳定",
        message: "同一模块至少录入 3 次后判断波动",
        advice: "",
        available: false,
      };

  return [weakest, declining, unstable];
}

export function createPracticeRecordName(
  record: Pick<PracticeRecord, "date">,
  timestamp: string,
): string {
  const date = new Date(timestamp);
  const time = Number.isNaN(date.getTime())
    ? "00:00"
    : `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return `${record.date} ${time}`;
}
