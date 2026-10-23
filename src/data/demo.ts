// Synthetic examples for the optional demo. These are not a person's exam results.
import type { ExamRecord, ModuleAttempt, ModuleKey } from "../types";

const automatic = (correct: number, wrong: number): ModuleAttempt => ({
  correct,
  wrong,
  unanswered: 0,
});

const MODULE_QUESTIONS: Record<ModuleKey, number> = {
  politics: 10,
  common: 10,
  verbal: 10,
  quantitative: 10,
  reasoning: 20,
  data: 20,
};

const samples: Array<{
  date: string;
  name: string;
  duration: number;
  correct: Record<ModuleKey, number>;
}> = [
  {
    date: "2026-06-14",
    name: "2026 国考模考 · 第 1 套",
    duration: 118,
    correct: { politics: 6, common: 5, verbal: 5, quantitative: 3, reasoning: 11, data: 10 },
  },
  {
    date: "2026-06-21",
    name: "2026 国考模考 · 第 2 套",
    duration: 116,
    correct: { politics: 7, common: 6, verbal: 6, quantitative: 4, reasoning: 12, data: 12 },
  },
  {
    date: "2026-06-28",
    name: "2026 国考模考 · 第 3 套",
    duration: 115,
    correct: { politics: 7, common: 5, verbal: 7, quantitative: 6, reasoning: 13, data: 13 },
  },
  {
    date: "2026-07-05",
    name: "2026 联考模考 · 第 4 套",
    duration: 113,
    correct: { politics: 8, common: 6, verbal: 8, quantitative: 3, reasoning: 14, data: 14 },
  },
  {
    date: "2026-07-12",
    name: "2026 联考模考 · 第 5 套",
    duration: 112,
    correct: { politics: 8, common: 7, verbal: 8, quantitative: 7, reasoning: 15, data: 15 },
  },
  {
    date: "2026-07-19",
    name: "2026 联考模考 · 第 6 套",
    duration: 110,
    correct: { politics: 8, common: 7, verbal: 7, quantitative: 4, reasoning: 15, data: 16 },
  },
  {
    date: "2026-07-26",
    name: "2026 省考模考 · 第 7 套",
    duration: 108,
    correct: { politics: 9, common: 6, verbal: 7, quantitative: 8, reasoning: 16, data: 16 },
  },
  {
    date: "2026-08-02",
    name: "2026 省考模考 · 第 8 套",
    duration: 109,
    correct: { politics: 8, common: 7, verbal: 6, quantitative: 4, reasoning: 16, data: 17 },
  },
  {
    date: "2026-08-09",
    name: "2026 省考模考 · 第 9 套",
    duration: 106,
    correct: { politics: 9, common: 7, verbal: 6, quantitative: 7, reasoning: 17, data: 17 },
  },
  {
    date: "2026-08-16",
    name: "2026 省考模考 · 第 10 套",
    duration: 104,
    correct: { politics: 9, common: 8, verbal: 5, quantitative: 3, reasoning: 17, data: 18 },
  },
];

export function createDemoRecords(): ExamRecord[] {
  return samples.map((sample, index) => {
    const modules = {} as Record<ModuleKey, ModuleAttempt>;
    (Object.keys(MODULE_QUESTIONS) as ModuleKey[]).forEach((key) => {
      const correct = sample.correct[key];
      modules[key] = automatic(correct, MODULE_QUESTIONS[key] - correct);
    });

    const timestamp = `${sample.date}T09:${String(index).padStart(2, "0")}:00.000Z`;
    return {
      id: `demo-${index + 1}`,
      name: sample.name,
      date: sample.date,
      type: sample.name.includes("国考")
        ? "国考"
        : sample.name.includes("省考")
          ? "省考"
          : "模拟卷",
      year: "2026",
      durationMinutes: sample.duration,
      modules,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });
}
