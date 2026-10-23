import { useMemo, useState } from "react";
import { MODULES, PRACTICE_MODULES, SIMULATION_SOURCES } from "../constants";
import {
  activePracticeModuleKeys,
  calculatePracticeAccuracy,
  createPracticeRecordName,
  practiceQuestionCount,
  validatePracticeAttempt,
} from "../lib/practice";
import {
  calculateModuleScore,
  calculateRecordTotal,
  displayModuleScore,
  displayTotalScore,
  validateModuleAttempt,
} from "../lib/scoring";
import type {
  ExamRecord,
  ModuleAttempt,
  ModuleKey,
  PracticeAttempt,
  PracticeModuleKey,
  PracticeRecord,
  RecordKind,
} from "../types";

export type RecordFormValue =
  | { kind: "simulation"; record: ExamRecord }
  | { kind: "practice"; record: PracticeRecord };

interface RecordFormProps {
  initialValue: RecordFormValue;
  onClose: () => void;
  onSave: (value: RecordFormValue) => void;
}

type MetadataKey =
  | "name"
  | "date"
  | "type"
  | "year"
  | "region"
  | "paperNo"
  | "durationMinutes";

function emptyExamFrom(record: ExamRecord | PracticeRecord): ExamRecord {
  const modules = Object.fromEntries(
    MODULES.map((module) => [
      module.key,
      { correct: 0, wrong: 0, unanswered: 0 },
    ]),
  ) as Record<ModuleKey, ModuleAttempt>;
  return {
    id: "",
    name: record.name,
    date: record.date,
    type: record.type ?? "模拟卷",
    year: record.year,
    region: record.region,
    paperNo: record.paperNo,
    modules,
    createdAt: "",
    updatedAt: "",
  };
}

function emptyPracticeFrom(record: ExamRecord | PracticeRecord): PracticeRecord {
  return {
    id: "",
    name: record.name,
    date: record.date,
    modules: {},
    createdAt: "",
    updatedAt: "",
  };
}

const optionalText = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed || undefined;
};

function MetadataFields({
  kind,
  record,
  onChange,
  errors,
}: {
  kind: RecordKind;
  record: ExamRecord | PracticeRecord;
  onChange: (key: MetadataKey, value: string | number | undefined) => void;
  errors: Record<string, string>;
}) {
  const simulation = kind === "simulation";
  const duration = simulation
    ? (record as ExamRecord).durationMinutes
    : undefined;
  const sourceValue = (SIMULATION_SOURCES as readonly string[]).includes(
    record.type ?? "",
  )
    ? record.type
    : "";
  return (
    <div className="paper-fields">
      <label className="field field--wide">
        <span>
          {simulation ? "试卷名称" : "练习名称"}
          {simulation && <> <b>*</b></>}
        </span>
        <input
          autoFocus
          value={record.name}
          onChange={(event) => onChange("name", event.target.value)}
          placeholder={
            simulation
              ? "例如：2026 江苏省考 A 类"
              : "选填，留空后按模块名和日期时间自动生成"
          }
          aria-invalid={Boolean(errors.name)}
        />
        {errors.name && <small className="field-error">{errors.name}</small>}
      </label>

      <label className="field">
        <span>
          练习日期 <b>*</b>
        </span>
        <input
          type="date"
          value={record.date}
          onChange={(event) => onChange("date", event.target.value)}
          aria-invalid={Boolean(errors.date)}
        />
        {errors.date && <small className="field-error">{errors.date}</small>}
      </label>

      {simulation && (
        <>
          <label className="field">
            <span>
              来源 <b>*</b>
            </span>
            <select
              value={sourceValue}
              onChange={(event) => onChange("type", event.target.value)}
              aria-invalid={Boolean(errors.type)}
            >
              <option value="">请选择来源</option>
              {SIMULATION_SOURCES.map((source) => (
                <option value={source} key={source}>
                  {source}
                </option>
              ))}
            </select>
            {errors.type && <small className="field-error">{errors.type}</small>}
          </label>

          <label className="field">
            <span>年份</span>
            <input
              inputMode="numeric"
              value={record.year ?? ""}
              onChange={(event) => onChange("year", event.target.value)}
              placeholder="2026"
            />
          </label>

          <label className="field">
            <span>地区</span>
            <input
              value={record.region ?? ""}
              onChange={(event) => onChange("region", event.target.value)}
              placeholder="例如：江苏"
            />
          </label>

          <label className="field">
            <span>套卷编号</span>
            <input
              value={record.paperNo ?? ""}
              onChange={(event) => onChange("paperNo", event.target.value)}
              placeholder="例如：A 类 / 第 3 套"
            />
          </label>

          <label className="field">
            <span>整卷总耗时（分钟）</span>
            <input
              type="number"
              min="1"
              value={duration ?? ""}
              onChange={(event) =>
                onChange(
                  "durationMinutes",
                  event.target.value ? Number(event.target.value) : undefined,
                )
              }
              placeholder="选填"
              aria-invalid={Boolean(errors.durationMinutes)}
            />
            {errors.durationMinutes && (
              <small className="field-error">{errors.durationMinutes}</small>
            )}
          </label>
        </>
      )}
    </div>
  );
}

function updateAttempt(
  attempt: ModuleAttempt,
  field: "correct" | "wrong" | "unanswered",
  value: number,
): ModuleAttempt {
  return { ...attempt, [field]: value };
}

function ExamModuleEditor({
  moduleKey,
  attempt,
  onChange,
  error,
}: {
  moduleKey: ModuleKey;
  attempt: ModuleAttempt;
  onChange: (attempt: ModuleAttempt) => void;
  error?: string;
}) {
  const definition = MODULES.find((module) => module.key === moduleKey)!;
  const result = calculateModuleScore(attempt, definition.maxScore);
  const setNumber = (
    field: "correct" | "wrong" | "unanswered",
    raw: string,
  ) =>
    onChange(updateAttempt(attempt, field, raw === "" ? 0 : Number(raw)));

  return (
    <section
      className="module-editor module-editor--compact"
      style={{ "--module-color": definition.color } as React.CSSProperties}
    >
      <div className="module-editor__heading">
        <div>
          <p className="eyebrow">模块满分 {definition.maxScore}</p>
          <h3>{definition.name}</h3>
        </div>
        <div className="module-score-preview">
          <strong>{displayModuleScore(result.score)}</strong>
          <span>/ {definition.maxScore}</span>
        </div>
      </div>

      <div className="answer-count-grid">
        {([
          ["correct", "答对"],
          ["wrong", "答错"],
          ["unanswered", "未作答"],
        ] as const).map(([field, label]) => (
          <label className="field" key={field}>
            <span>{label}</span>
            <input
              type="number"
              min="0"
              step="1"
              value={attempt[field]}
              onChange={(event) => setNumber(field, event.target.value)}
            />
          </label>
        ))}
      </div>

      <div className="score-formula">
        <span>共 {result.questionCount} 题</span>
        <span>等分每题 {result.automaticUnitScore.toFixed(4)}</span>
        <span>
          得分率 {((result.score / definition.maxScore) * 100).toFixed(1)}%
        </span>
      </div>
      {error && <p className="module-error">{error}</p>}
    </section>
  );
}

function PracticeModuleEditor({
  moduleKey,
  attempt,
  onChange,
  error,
}: {
  moduleKey: PracticeModuleKey;
  attempt: PracticeAttempt;
  onChange: (attempt: PracticeAttempt) => void;
  error?: string;
}) {
  const definition = PRACTICE_MODULES.find((module) => module.key === moduleKey)!;
  const questions = practiceQuestionCount(attempt);
  const accuracy = calculatePracticeAccuracy(attempt);
  const setNumber = (field: keyof PracticeAttempt, raw: string) =>
    onChange({ ...attempt, [field]: raw === "" ? 0 : Number(raw) });

  return (
    <section
      className={`module-editor module-editor--compact practice-editor${
        questions === 0 ? " is-empty" : ""
      }`}
      style={{ "--module-color": definition.color } as React.CSSProperties}
    >
      <div className="module-editor__heading">
        <div>
          <p className="eyebrow">
            {questions ? `本次共 ${questions} 题` : "本次未填写"}
          </p>
          <h3>{definition.name}</h3>
        </div>
        <div className="module-score-preview practice-rate-preview">
          <strong>{questions ? accuracy.toFixed(1) : "—"}</strong>
          <span>{questions ? "% 正确率" : "填入后计入分析"}</span>
        </div>
      </div>

      <div className="answer-count-grid answer-count-grid--practice">
        {([
          ["correct", "答对"],
          ["wrong", "答错"],
        ] as const).map(([field, label]) => (
          <label className="field" key={field}>
            <span>{label}</span>
            <input
              type="number"
              min="0"
              step="1"
              value={attempt[field]}
              onChange={(event) => setNumber(field, event.target.value)}
            />
          </label>
        ))}
      </div>

      {questions > 0 && (
        <div className="score-formula practice-formula">
          <span>答对 {attempt.correct}</span>
          <span>答错 {attempt.wrong}</span>
          <span>正确率 {accuracy.toFixed(1)}%</span>
        </div>
      )}
      {error && <p className="module-error">{error}</p>}
    </section>
  );
}

export function RecordForm({ initialValue, onClose, onSave }: RecordFormProps) {
  const [kind, setKind] = useState<RecordKind>(initialValue.kind);
  const [exam, setExam] = useState<ExamRecord>(() =>
    initialValue.kind === "simulation"
      ? initialValue.record
      : emptyExamFrom(initialValue.record),
  );
  const [practice, setPractice] = useState<PracticeRecord>(() =>
    initialValue.kind === "practice"
      ? initialValue.record
      : emptyPracticeFrom(initialValue.record),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const lockedKind = Boolean(initialValue.record.id);
  const total = useMemo(() => calculateRecordTotal(exam), [exam]);
  const selectedPracticeCount = activePracticeModuleKeys(practice).length;
  const activeRecord = kind === "simulation" ? exam : practice;

  const copyMetadata = (
    source: ExamRecord | PracticeRecord,
    targetKind: RecordKind,
  ) => {
    const sourceType = source.type;
    if (targetKind === "practice") {
      setPractice((current) => ({
        ...current,
        name: source.name,
        date: source.date,
      }));
    } else {
      setExam((current) => ({
        ...current,
        name: source.name,
        date: source.date,
        type: sourceType &&
          (SIMULATION_SOURCES as readonly string[]).includes(sourceType)
          ? sourceType
          : "模拟卷",
        year: source.year,
        region: source.region,
        paperNo: source.paperNo,
      }));
    }
  };

  const changeKind = (next: RecordKind) => {
    if (lockedKind || next === kind) return;
    copyMetadata(activeRecord, next);
    setKind(next);
    setErrors({});
  };

  const updateMetadata = (
    key: MetadataKey,
    value: string | number | undefined,
  ) => {
    if (kind === "simulation") {
      setExam((current) => ({ ...current, [key]: value }));
    } else {
      setPractice((current) => ({ ...current, [key]: value }));
    }
    setErrors((current) => ({ ...current, [key]: "" }));
  };

  const updateExamModule = (key: ModuleKey, attempt: ModuleAttempt) => {
    setExam((current) => ({
      ...current,
      modules: { ...current.modules, [key]: attempt },
    }));
    setErrors((current) => ({ ...current, [key]: "" }));
  };

  const updatePracticeModule = (key: PracticeModuleKey, attempt: PracticeAttempt) => {
    setPractice((current) => ({
      ...current,
      modules: { ...current.modules, [key]: attempt },
    }));
    setErrors((current) => ({ ...current, [key]: "", modules: "" }));
  };

  const validateExam = () => {
    const next: Record<string, string> = {};
    if (!exam.name.trim()) next.name = "请填写试卷名称";
    if (!exam.date) next.date = "请选择练习日期";
    if (!(SIMULATION_SOURCES as readonly string[]).includes(exam.type)) {
      next.type = "请选择来源";
    }
    if (
      exam.durationMinutes !== undefined &&
      (!Number.isFinite(exam.durationMinutes) || exam.durationMinutes <= 0)
    ) {
      next.durationMinutes = "总耗时必须大于 0";
    }
    for (const module of MODULES) {
      const moduleErrors = validateModuleAttempt(
        exam.modules[module.key],
        module.maxScore,
      );
      if (moduleErrors.length) next[module.key] = moduleErrors[0];
    }
    setErrors(next);
    return !Object.keys(next).length;
  };

  const validatePractice = () => {
    const next: Record<string, string> = {};
    if (!practice.date) next.date = "请选择练习日期";
    let enteredModules = 0;
    for (const module of PRACTICE_MODULES) {
      const attempt = practice.modules[module.key];
      if (!attempt || (attempt.correct === 0 && attempt.wrong === 0)) continue;
      enteredModules += 1;
      const moduleErrors = validatePracticeAttempt(attempt);
      if (moduleErrors.length) next[module.key] = moduleErrors[0];
    }
    if (!enteredModules) next.modules = "模块练习至少需要填写一个模块";
    setErrors(next);
    return !Object.keys(next).length;
  };

  const handleSubmit = () => {
    const now = new Date().toISOString();
    if (kind === "simulation") {
      if (!validateExam()) return;
      onSave({
        kind,
        record: {
          ...exam,
          name: exam.name.trim(),
          type: exam.type.trim(),
          modules: Object.fromEntries(
            MODULES.map((module) => {
              const attempt = exam.modules[module.key];
              return [
                module.key,
                {
                  correct: attempt.correct,
                  wrong: attempt.wrong,
                  unanswered: attempt.unanswered,
                },
              ];
            }),
          ) as Record<ModuleKey, ModuleAttempt>,
          year: optionalText(exam.year),
          region: optionalText(exam.region),
          paperNo: optionalText(exam.paperNo),
          updatedAt: now,
          createdAt: exam.createdAt || now,
        },
      });
      return;
    }

    if (!validatePractice()) return;
    const modules: Partial<Record<PracticeModuleKey, PracticeAttempt>> = {};
    for (const module of PRACTICE_MODULES) {
      const attempt = practice.modules[module.key];
      if (attempt && practiceQuestionCount(attempt) > 0) {
        modules[module.key] = attempt;
      }
    }
    const next: PracticeRecord = {
      ...practice,
      modules,
      name: practice.name.trim(),
      type: optionalText(practice.type),
      year: optionalText(practice.year),
      region: optionalText(practice.region),
      paperNo: optionalText(practice.paperNo),
      updatedAt: now,
      createdAt: practice.createdAt || now,
    };
    if (!next.name) next.name = createPracticeRecordName(next, now);
    onSave({ kind, record: next });
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) =>
        event.target === event.currentTarget && onClose()
      }
    >
      <div
        className="exam-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-form-title"
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">
              {activeRecord.id ? "编辑历史记录" : "新增成绩记录"}
            </p>
            <h2 id="record-form-title">
              {kind === "simulation" ? "录入仿真模拟" : "录入模块练习"}
            </h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="关闭录入窗口"
          >
            ×
          </button>
        </header>

        <div className="record-kind-panel">
          <label className="field">
            <span>
              练习类型 <b>*</b>
            </span>
            <select
              value={kind}
              onChange={(event) => changeKind(event.target.value as RecordKind)}
              disabled={lockedKind}
            >
              <option value="simulation">仿真模拟</option>
              <option value="practice">模块练习</option>
            </select>
          </label>
          <p>
            {lockedKind
              ? "已保存记录的练习类型不可修改。"
              : kind === "simulation"
                ? "仿真模拟需要完整填写六个模块。"
                : "模块练习可填写一个或多个模块，空模块不会保存。"}
          </p>
        </div>

        <div className="modal-body">
          <MetadataFields
            kind={kind}
            record={activeRecord}
            onChange={updateMetadata}
            errors={errors}
          />

          <div className="form-section-heading">
            <div>
              <p className="eyebrow">
                {kind === "simulation" ? "完整作答情况" : "按模块登记"}
              </p>
              <h3>
                {kind === "simulation"
                  ? "填写全部六大模块"
                  : "填写本次练习过的模块"}
              </h3>
            </div>
            <p>
              {kind === "simulation"
                ? "每个模块都必须有作答数量。"
                : "答对和答错均为 0 的模块将被忽略。"}
            </p>
          </div>
          {errors.modules && (
            <p className="module-error module-error--summary">
              {errors.modules}
            </p>
          )}

          <div className="quick-modules">
            {(kind === "simulation" ? MODULES : PRACTICE_MODULES).map((module) =>
              kind === "simulation" ? (
                <ExamModuleEditor
                  key={module.key}
                  moduleKey={module.key as ModuleKey}
                  attempt={exam.modules[module.key as ModuleKey]}
                  onChange={(attempt) =>
                    updateExamModule(module.key as ModuleKey, attempt)
                  }
                  error={errors[module.key]}
                />
              ) : (
                <PracticeModuleEditor
                  key={module.key}
                  moduleKey={module.key}
                  attempt={practice.modules[module.key] ?? {
                    correct: 0,
                    wrong: 0,
                  }}
                  onChange={(attempt) =>
                    updatePracticeModule(module.key, attempt)
                  }
                  error={errors[module.key]}
                />
              ),
            )}
          </div>
        </div>

        <footer className="modal-footer">
          <div className="running-total">
            {kind === "simulation" ? (
              <>
                <span>当前总分</span>
                <strong>{displayTotalScore(total)}</strong>
              </>
            ) : (
              <>
                <span>已填写模块</span>
                <strong>{selectedPracticeCount}</strong>
              </>
            )}
          </div>
          <div className="modal-actions">
            <button
              className="button button--secondary"
              type="button"
              onClick={onClose}
            >
              取消
            </button>
            <button
              className="button button--primary"
              type="button"
              onClick={handleSubmit}
            >
              {kind === "simulation" ? "保存仿真模拟" : "保存模块练习"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
