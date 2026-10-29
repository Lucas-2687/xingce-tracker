export type ModuleKey =
  | "politics"
  | "common"
  | "verbal"
  | "quantitative"
  | "reasoning"
  | "data";

export type PracticeModuleKey = ModuleKey | "graphic";

export type RecordKind = "simulation" | "practice";

export interface ModuleAttempt {
  correct: number;
  wrong: number;
  unanswered: number;
}

export interface ExamRecord {
  id: string;
  name: string;
  date: string;
  type: string;
  year?: string;
  region?: string;
  paperNo?: string;
  durationMinutes?: number;
  modules: Record<ModuleKey, ModuleAttempt>;
  createdAt: string;
  updatedAt: string;
}

export interface TrackerData {
  records: ExamRecord[];
  practiceRecords: PracticeRecord[];
  simulationSources?: string[];
}

export interface PracticeAttempt {
  correct: number;
  wrong: number;
}

export interface PracticeRecord {
  id: string;
  name: string;
  date: string;
  type?: string;
  year?: string;
  region?: string;
  paperNo?: string;
  modules: Partial<Record<PracticeModuleKey, PracticeAttempt>>;
  createdAt: string;
  updatedAt: string;
}

export interface ModuleDefinition<TKey extends PracticeModuleKey = PracticeModuleKey> {
  key: TKey;
  name: string;
  shortName: string;
  maxScore: number;
  color: string;
  softColor: string;
}

export interface ModuleScoreResult {
  questionCount: number;
  automaticUnitScore: number;
  effectiveUnitScore: number;
  rawScore: number;
  score: number;
}

export type DiagnosticKind = "weakest" | "declining" | "unstable";

export interface Diagnostic {
  kind: DiagnosticKind;
  title: string;
  moduleKey?: PracticeModuleKey;
  metric?: number;
  message: string;
  advice: string;
  available: boolean;
}
