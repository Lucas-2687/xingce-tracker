import type {
  ModuleDefinition,
  ModuleKey,
  PracticeModuleKey,
  SimulationQuestionType,
} from "./types";

export const MODULES: ModuleDefinition<ModuleKey>[] = [
  {
    key: "politics",
    name: "政治理论",
    shortName: "政治",
    maxScore: 10,
    color: "#2f7d6d",
    softColor: "#dceee8",
  },
  {
    key: "common",
    name: "常识判断",
    shortName: "常识",
    maxScore: 4.5,
    color: "#3f8f94",
    softColor: "#dceff0",
  },
  {
    key: "verbal",
    name: "言语理解",
    shortName: "言语",
    maxScore: 15.5,
    color: "#4e76bd",
    softColor: "#e1e9f7",
  },
  {
    key: "quantitative",
    name: "数量关系",
    shortName: "数量",
    maxScore: 15,
    color: "#6a65ad",
    softColor: "#e9e7f5",
  },
  {
    key: "reasoning",
    name: "判断推理",
    shortName: "判断",
    maxScore: 31,
    color: "#397f9e",
    softColor: "#deedf3",
  },
  {
    key: "data",
    name: "资料分析",
    shortName: "资料",
    maxScore: 24,
    color: "#54895b",
    softColor: "#e1eee2",
  },
];

export const PRACTICE_MODULES: ModuleDefinition<PracticeModuleKey>[] = [
  ...MODULES,
  {
    key: "graphic",
    name: "图形推理",
    shortName: "图形",
    maxScore: 0,
    color: "#b36b3f",
    softColor: "#f5e7dd",
  },
];

// 2026 广东行测题型分值，按用户提供的分值表计分。
export const SIMULATION_QUESTION_TYPES: Record<ModuleKey, SimulationQuestionType[]> = {
  politics: [
    { key: "single", name: "单选", questionCount: 4, unitScore: 1 },
    { key: "multiple", name: "多选", questionCount: 2, unitScore: 1.4 },
    { key: "trueFalse", name: "判断对错", questionCount: 4, unitScore: 0.8 },
  ],
  common: [{ key: "common", name: "常识判断", questionCount: 5, unitScore: 0.9 }],
  verbal: [
    { key: "cloze", name: "选词填空", questionCount: 5, unitScore: 1.1 },
    { key: "reading", name: "阅读理解", questionCount: 10, unitScore: 1 },
  ],
  quantitative: [
    { key: "sequence", name: "数字推理", questionCount: 5, unitScore: 1 },
    { key: "math", name: "数学运算", questionCount: 10, unitScore: 1 },
  ],
  reasoning: [
    { key: "graphic", name: "图形推理", questionCount: 5, unitScore: 1 },
    { key: "logic", name: "逻辑判断", questionCount: 15, unitScore: 1.3 },
    { key: "science", name: "科学推理", questionCount: 5, unitScore: 1.3 },
  ],
  data: [{ key: "data", name: "资料分析", questionCount: 20, unitScore: 1.2 }],
};

export const MODULE_MAP = Object.fromEntries(
  PRACTICE_MODULES.map((module) => [module.key, module]),
) as Record<PracticeModuleKey, ModuleDefinition>;

export const SIMULATION_SOURCES = ["广东", "国考", "粉笔"] as const;

export const PRACTICE_SOURCES = ["题本", "粉笔"] as const;

export const WINDOW_OPTIONS = [3, 5, 10] as const;

export const STORAGE_KEY = "xingce-score-dashboard.records.v2";
export const PRACTICE_STORAGE_KEY =
  "xingce-score-dashboard.practice-records.v1";

