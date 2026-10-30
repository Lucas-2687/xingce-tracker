import { MODULES, PRACTICE_MODULES, SIMULATION_QUESTION_TYPES } from "../constants";
import type {
  ExamRecord,
  ModuleAttempt,
  ModuleKey,
  PracticeModuleKey,
  PracticeAttempt,
  PracticeRecord,
} from "../types";
import {
  createPracticeRecordName,
  validatePracticeAttempt,
} from "./practice";
import { validateModuleAttempt } from "./scoring";
import { normalizeSimulationSources } from "./simulation";

const BASE_COLUMNS = [
  "id",
  "name",
  "date",
  "type",
  "year",
  "region",
  "paperNo",
  "durationMinutes",
  "createdAt",
  "updatedAt",
];

const MODULE_COLUMNS = MODULES.flatMap((module) => [
  `${module.key}_correct`,
  `${module.key}_wrong`,
  `${module.key}_unanswered`,
  ...SIMULATION_QUESTION_TYPES[module.key].map((type) => `${module.key}_${type.key}_wrong`),
]);

export const CSV_COLUMNS = [...BASE_COLUMNS, ...MODULE_COLUMNS];

const PRACTICE_BASE_COLUMNS = [
  "recordKind",
  "id",
  "name",
  "date",
  "type",
  "year",
  "region",
  "paperNo",
  "createdAt",
  "updatedAt",
];

const PRACTICE_MODULE_COLUMNS = PRACTICE_MODULES.flatMap((module) => [
  `${module.key}_correct`,
  `${module.key}_wrong`,
]);

export const PRACTICE_CSV_COLUMNS = [
  ...PRACTICE_BASE_COLUMNS,
  ...PRACTICE_MODULE_COLUMNS,
];

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `exam-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const textValue = (value: unknown): string =>
  typeof value === "string" ? value.trim() : String(value ?? "").trim();

const optionalText = (value: unknown): string | undefined => {
  const result = textValue(value);
  return result || undefined;
};

const numberValue = (value: unknown, fallback = 0): number => {
  if (value === "" || value === null || value === undefined) return fallback;
  const result = Number(value);
  return Number.isFinite(result) ? result : Number.NaN;
};

const optionalNumber = (value: unknown): number | undefined => {
  if (value === "" || value === null || value === undefined) return undefined;
  const result = Number(value);
  return Number.isFinite(result) ? result : Number.NaN;
};

function normalizeAttempt(raw: unknown): ModuleAttempt {
  const value = (raw ?? {}) as Record<string, unknown>;
  let questionTypeWrongs: Record<string, number> | undefined;
  if (value.questionTypeWrongs !== undefined) {
    if (!value.questionTypeWrongs || typeof value.questionTypeWrongs !== "object" || Array.isArray(value.questionTypeWrongs)) {
      throw new Error("题型错题数格式不正确");
    }
    questionTypeWrongs = Object.fromEntries(Object.entries(value.questionTypeWrongs).map(
      ([key, wrong]) => [key, typeof wrong === "number" ? wrong : Number.NaN],
    ));
  }
  return {
    correct: numberValue(value.correct),
    wrong: numberValue(value.wrong),
    unanswered: numberValue(value.unanswered),
    ...(questionTypeWrongs === undefined ? {} : { questionTypeWrongs }),
  };
}

export function normalizeRecord(raw: unknown): ExamRecord {
  if (!raw || typeof raw !== "object") {
    throw new Error("记录格式不正确");
  }

  const value = raw as Record<string, unknown>;
  const name = textValue(value.name);
  const date = textValue(value.date);
  const type = textValue(value.type);
  if (!name || !date || !type) {
    throw new Error("每条记录都必须包含试卷名称、日期和类型");
  }

  const rawModules = (value.modules ?? {}) as Record<string, unknown>;
  const modules = {} as Record<ModuleKey, ModuleAttempt>;
  for (const module of MODULES) {
    if (!rawModules[module.key]) {
      throw new Error(`${name} 缺少${module.name}数据`);
    }
    const attempt = normalizeAttempt(rawModules[module.key]);
    const errors = validateModuleAttempt(attempt, module.maxScore);
    if (errors.length) {
      throw new Error(`${name} · ${module.name}：${errors[0]}`);
    }
    modules[module.key] = attempt;
  }

  const durationMinutes = optionalNumber(value.durationMinutes);
  if (
    durationMinutes !== undefined &&
    (!Number.isFinite(durationMinutes) || durationMinutes <= 0)
  ) {
    throw new Error(`${name} 的总耗时必须大于 0`);
  }

  const now = new Date().toISOString();
  return {
    id: textValue(value.id) || createId(),
    name,
    date,
    type,
    year: optionalText(value.year),
    region: optionalText(value.region),
    paperNo: optionalText(value.paperNo),
    durationMinutes,
    modules,
    createdAt: textValue(value.createdAt) || now,
    updatedAt: textValue(value.updatedAt) || now,
  };
}

function normalizePracticeAttempt(raw: unknown): PracticeAttempt {
  const value = (raw ?? {}) as Record<string, unknown>;
  return {
    correct: numberValue(value.correct),
    wrong: numberValue(value.wrong),
  };
}

export function normalizePracticeRecord(raw: unknown): PracticeRecord {
  if (!raw || typeof raw !== "object") {
    throw new Error("模块练习记录格式不正确");
  }

  const value = raw as Record<string, unknown>;
  const date = textValue(value.date);
  if (!date) throw new Error("模块练习必须包含日期");

  const rawModules = (value.modules ?? {}) as Record<string, unknown>;
  const modules: Partial<Record<PracticeModuleKey, PracticeAttempt>> = {};
  for (const module of PRACTICE_MODULES) {
    if (rawModules[module.key] === undefined) continue;
    const attempt = normalizePracticeAttempt(rawModules[module.key]);
    const errors = validatePracticeAttempt(attempt);
    if (errors.length) {
      throw new Error(`${module.name}：${errors[0]}`);
    }
    modules[module.key] = attempt;
  }
  if (!Object.keys(modules).length) {
    throw new Error("模块练习至少需要填写一个模块");
  }

  const now = new Date().toISOString();
  const createdAt = textValue(value.createdAt) || now;
  const record: PracticeRecord = {
    id: textValue(value.id) || createId(),
    name: textValue(value.name),
    date,
    type: optionalText(value.type),
    year: optionalText(value.year),
    region: optionalText(value.region),
    paperNo: optionalText(value.paperNo),
    modules,
    createdAt,
    updatedAt: textValue(value.updatedAt) || now,
  };
  if (!record.name) {
    record.name = createPracticeRecordName(record, createdAt);
  }
  return record;
}

function escapeCsv(value: unknown): string {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function recordToFlat(record: ExamRecord): Record<string, unknown> {
  const flat: Record<string, unknown> = {
    id: record.id,
    name: record.name,
    date: record.date,
    type: record.type,
    year: record.year,
    region: record.region,
    paperNo: record.paperNo,
    durationMinutes: record.durationMinutes,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
  for (const module of MODULES) {
    const attempt = record.modules[module.key];
    flat[`${module.key}_correct`] = attempt.correct;
    flat[`${module.key}_wrong`] = attempt.wrong;
    flat[`${module.key}_unanswered`] = attempt.unanswered;
    for (const type of SIMULATION_QUESTION_TYPES[module.key]) {
      flat[`${module.key}_${type.key}_wrong`] = attempt.questionTypeWrongs?.[type.key];
    }
  }
  return flat;
}

export function exportRecordsToJson(records: ExamRecord[]): string {
  return JSON.stringify(
    {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      records,
    },
    null,
    2,
  );
}

export function exportAllRecordsToJson(
  records: ExamRecord[],
  practiceRecords: PracticeRecord[],
  simulationSources?: string[],
): string {
  return JSON.stringify(
    {
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      records,
      practiceRecords,
      simulationSources: normalizeSimulationSources(simulationSources),
    },
    null,
    2,
  );
}

export function exportRecordsToCsv(records: ExamRecord[]): string {
  const lines = [CSV_COLUMNS.map(escapeCsv).join(",")];
  for (const record of records) {
    const flat = recordToFlat(record);
    lines.push(CSV_COLUMNS.map((column) => escapeCsv(flat[column])).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}`;
}

function practiceRecordToFlat(
  record: PracticeRecord,
): Record<string, unknown> {
  const flat: Record<string, unknown> = {
    recordKind: "practice",
    id: record.id,
    name: record.name,
    date: record.date,
    type: record.type,
    year: record.year,
    region: record.region,
    paperNo: record.paperNo,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
  for (const module of PRACTICE_MODULES) {
    const attempt = record.modules[module.key];
    if (!attempt) continue;
    flat[`${module.key}_correct`] = attempt.correct;
    flat[`${module.key}_wrong`] = attempt.wrong;
  }
  return flat;
}

export function exportPracticeRecordsToCsv(
  records: PracticeRecord[],
): string {
  const lines = [PRACTICE_CSV_COLUMNS.map(escapeCsv).join(",")];
  for (const record of records) {
    const flat = practiceRecordToFlat(record);
    lines.push(
      PRACTICE_CSV_COLUMNS.map((column) => escapeCsv(flat[column])).join(","),
    );
  }
  return `\uFEFF${lines.join("\r\n")}`;
}

function parseCsvRows(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (quoted) {
      if (character === '"' && content[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((current) => current.some((cell) => cell.trim()));
}

function flatToRecord(flat: Record<string, unknown>): ExamRecord {
  const modules = {} as Record<ModuleKey, ModuleAttempt>;
  for (const module of MODULES) {
    const questionTypes = SIMULATION_QUESTION_TYPES[module.key];
    const hasQuestionTypes = questionTypes.some((type) => textValue(flat[`${module.key}_${type.key}_wrong`]) !== "");
    modules[module.key] = {
      correct: numberValue(flat[`${module.key}_correct`]),
      wrong: numberValue(flat[`${module.key}_wrong`]),
      unanswered: numberValue(flat[`${module.key}_unanswered`]),
      ...(hasQuestionTypes ? { questionTypeWrongs: Object.fromEntries(questionTypes.map((type) => [
        type.key, numberValue(flat[`${module.key}_${type.key}_wrong`], Number.NaN),
      ])) } : {}),
    };
  }
  return normalizeRecord({ ...flat, modules });
}

export function parseCsv(content: string): ExamRecord[] {
  const rows = parseCsvRows(content.replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new Error("CSV 中没有可导入的记录");
  const headers = rows[0].map((header) => header.trim());
  for (const required of ["name", "date", "type"]) {
    if (!headers.includes(required)) {
      throw new Error(`CSV 缺少 ${required} 列`);
    }
  }
  return rows.slice(1).map((cells) => {
    const flat = Object.fromEntries(
      headers.map((header, index) => [header, cells[index] ?? ""]),
    );
    return flatToRecord(flat);
  });
}

function flatToPracticeRecord(
  flat: Record<string, unknown>,
): PracticeRecord {
  const modules: Partial<Record<PracticeModuleKey, PracticeAttempt>> = {};
  for (const module of PRACTICE_MODULES) {
    const correct = textValue(flat[`${module.key}_correct`]);
    const wrong = textValue(flat[`${module.key}_wrong`]);
    if (!correct && !wrong) continue;
    modules[module.key] = {
      correct: numberValue(correct),
      wrong: numberValue(wrong),
    };
  }
  return normalizePracticeRecord({ ...flat, modules });
}

export function parsePracticeCsv(content: string): PracticeRecord[] {
  const rows = parseCsvRows(content.replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new Error("CSV 中没有可导入的模块练习");
  const headers = rows[0].map((header) => header.trim());
  if (!headers.includes("date")) throw new Error("CSV 缺少 date 列");
  return rows.slice(1).map((cells) => {
    const flat = Object.fromEntries(
      headers.map((header, index) => [header, cells[index] ?? ""]),
    );
    return flatToPracticeRecord(flat);
  });
}

export function parseJson(content: string): ExamRecord[] {
  const parsed = JSON.parse(content) as unknown;
  const records = Array.isArray(parsed)
    ? parsed
    : (parsed as { records?: unknown[] })?.records;
  if (!Array.isArray(records)) {
    throw new Error("JSON 中没有 records 数组");
  }
  return records.map(normalizeRecord);
}

export interface ImportedData {
  records: ExamRecord[];
  practiceRecords: PracticeRecord[];
  simulationSources?: string[];
  includesRecords: boolean;
  includesPracticeRecords: boolean;
}

export function parseBackupJson(content: string): ImportedData {
  const parsed = JSON.parse(content) as unknown;
  if (Array.isArray(parsed)) {
    return {
      records: parsed.map(normalizeRecord),
      practiceRecords: [],
      includesRecords: true,
      includesPracticeRecords: false,
    };
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("JSON 备份格式不正确");
  }
  const value = parsed as Record<string, unknown>;
  const includesRecords = Array.isArray(value.records);
  const includesPracticeRecords = Array.isArray(value.practiceRecords);
  if (!includesRecords && !includesPracticeRecords) {
    throw new Error("JSON 中没有可导入的记录数组");
  }
  return {
    records: includesRecords
      ? (value.records as unknown[]).map(normalizeRecord)
      : [],
    practiceRecords: includesPracticeRecords
      ? (value.practiceRecords as unknown[]).map(normalizePracticeRecord)
      : [],
    includesRecords,
    includesPracticeRecords,
    ...(value.simulationSources === undefined ? {} : {
      simulationSources: normalizeSimulationSources(value.simulationSources),
    }),
  };
}

export function parseImportedData(
  content: string,
  fileName: string,
): ImportedData {
  if (!fileName.toLowerCase().endsWith(".csv")) {
    return parseBackupJson(content);
  }
  const header = parseCsvRows(content.replace(/^\uFEFF/, ""))[0] ?? [];
  const isPractice = header.map((cell) => cell.trim()).includes("recordKind");
  return isPractice
    ? {
        records: [],
        practiceRecords: parsePracticeCsv(content),
        includesRecords: false,
        includesPracticeRecords: true,
      }
    : {
        records: parseCsv(content),
        practiceRecords: [],
        includesRecords: true,
        includesPracticeRecords: false,
      };
}

export function parseImportedRecords(
  content: string,
  fileName: string,
): ExamRecord[] {
  return fileName.toLowerCase().endsWith(".csv")
    ? parseCsv(content)
    : parseJson(content);
}

