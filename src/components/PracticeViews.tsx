import { useState, type ReactNode } from "react";
import { MODULES, MODULE_MAP, PRACTICE_MODULES, WINDOW_OPTIONS } from "../constants";
import {
  activePracticeModuleKeys,
  buildPracticeDiagnostics,
  calculatePracticeAccuracy,
  calculatePracticeScorePrediction,
  createPracticeRecordName,
  getPracticeAttempts,
  getPracticeTrend,
  practiceQuestionCount,
  sortPracticeRecords,
  weightedPracticeAccuracy,
} from "../lib/practice";
import type {
  Diagnostic,
  ModuleKey,
  PracticeModuleKey,
  PracticeRecord,
} from "../types";
import { LineChart } from "./LineChart";

function shortDate(value: string): string {
  const [, month, day] = value.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function WindowSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="window-selector" aria-label="模块练习趋势窗口">
      {WINDOW_OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          className={value === option ? "is-active" : ""}
          onClick={() => onChange(option)}
        >
          近 {option} 次
        </button>
      ))}
    </div>
  );
}

function DiagnosticCard({ diagnostic }: { diagnostic: Diagnostic }) {
  const module = diagnostic.moduleKey
    ? MODULE_MAP[diagnostic.moduleKey]
    : undefined;
  return (
    <article className={`diagnostic-card diagnostic-card--${diagnostic.kind}`}>
      <div className="diagnostic-card__top">
        <span className="diagnostic-mark" />
        <p>{diagnostic.title}</p>
      </div>
      {diagnostic.available && module ? (
        <>
          <h3>{module.name}</h3>
          <p className="diagnostic-message">{diagnostic.message}</p>
          <p className="diagnostic-advice">{diagnostic.advice}</p>
        </>
      ) : (
        <div className="diagnostic-pending">
          <h3>数据不足</h3>
          <p>{diagnostic.message}</p>
        </div>
      )}
    </article>
  );
}

function ScorePrediction({ records }: { records: PracticeRecord[] }) {
  const [windowSize, setWindowSize] = useState(5);
  const [selectedModules, setSelectedModules] = useState<ModuleKey[]>(
    MODULES.map((module) => module.key),
  );
  const prediction = calculatePracticeScorePrediction(
    records,
    selectedModules,
    windowSize,
  );
  const missingNames = prediction.missingModuleKeys.map(
    (key) => MODULE_MAP[key].name,
  );
  const toggleModule = (key: ModuleKey) => {
    setSelectedModules((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  };

  return (
    <section className="section-block" aria-labelledby="score-prediction-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">行测预测分数</p>
          <h2 id="score-prediction-title">用近期专项正确率，折算百分制分数</h2>
        </div>
        <WindowSelector value={windowSize} onChange={setWindowSize} />
      </div>

      <div className="score-prediction-card">
        <div className="prediction-result">
          <p>预测分数</p>
          {prediction.score !== null ? (
            <strong>{prediction.score.toFixed(1)}<em>/ 100</em></strong>
          ) : (
            <strong className="is-pending">—</strong>
          )}
          <span>
            {prediction.score !== null
              ? `${prediction.predictedScore.toFixed(2)} ÷ ${prediction.maxScore.toFixed(1)} × 100`
              : !selectedModules.length
                ? "请至少选择一个计分模块"
                : `还缺少：${missingNames.join("、")}`}
          </span>
        </div>

        <div className="prediction-settings">
          <div className="prediction-settings__heading">
            <div>
              <h3>选择计分板块</h3>
              <p>各板块使用最近 {windowSize} 次练习的题量加权正确率。</p>
            </div>
            <button
              type="button"
              className="text-button"
              onClick={() =>
                setSelectedModules(
                  selectedModules.length === MODULES.length
                    ? []
                    : MODULES.map((module) => module.key),
                )
              }
            >
              {selectedModules.length === MODULES.length ? "清空" : "全选"}
            </button>
          </div>
          <div className="prediction-module-grid">
            {MODULES.map((module) => {
              const selected = selectedModules.includes(module.key);
              const result = prediction.modules.find(
                (item) => item.key === module.key,
              );
              return (
                <label
                  key={module.key}
                  className={`prediction-module${selected ? " is-selected" : ""}`}
                  style={
                    {
                      "--module-color": module.color,
                      "--module-soft": module.softColor,
                    } as React.CSSProperties
                  }
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleModule(module.key)}
                  />
                  <span>
                    <b>
                      {module.key === "reasoning"
                        ? "判断推理（含图形）"
                        : module.name}
                    </b>
                    <small>满分 {module.maxScore}</small>
                  </span>
                  <strong>
                    {selected && result
                      ? `${result.accuracy.toFixed(1)}%`
                      : selected
                        ? "暂无数据"
                        : "未计入"}
                  </strong>
                </label>
              );
            })}
          </div>
          <p className="prediction-formula">
            先按仿真模块满分折算各模块得分，再除以所选模块满分合计；图形推理的答题数据合并计入判断推理。
          </p>
        </div>
      </div>
    </section>
  );
}

export function PracticeDashboard({
  records,
  windowSize,
  setWindowSize,
  selectedModule,
  setSelectedModule,
}: {
  records: PracticeRecord[];
  windowSize: number;
  setWindowSize: (value: number) => void;
  selectedModule: PracticeModuleKey;
  setSelectedModule: (value: PracticeModuleKey) => void;
}) {
  const diagnostics = buildPracticeDiagnostics(records, windowSize);
  const selectedDefinition = MODULE_MAP[selectedModule];
  const selectedTrend = getPracticeTrend(
    records,
    selectedModule,
    windowSize,
  );
  const selectedAttempts = getPracticeAttempts(records, selectedModule);
  const selectedWindowAccuracy = weightedPracticeAccuracy(
    selectedTrend.map((item) => item.attempt),
  );
  const selectedAllAccuracy = weightedPracticeAccuracy(
    selectedAttempts.map((item) => item.attempt),
  );
  const selectedQuestions = selectedTrend.reduce(
    (total, item) => total + practiceQuestionCount(item.attempt),
    0,
  );

  return (
    <main className="dashboard-shell practice-dashboard">
      <section className="dashboard-intro">
        <div>
          <p className="eyebrow">模块练习分析</p>
          <h1>
            每个模块，<br />
            <span>都沿自己的轨迹进步。</span>
          </h1>
        </div>
        <div className="intro-controls">
          <p>每个模块独立取样</p>
          <WindowSelector value={windowSize} onChange={setWindowSize} />
        </div>
      </section>

      <section className="section-block practice-first-section" aria-labelledby="practice-diagnostics-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">正确率诊断</p>
            <h2 id="practice-diagnostics-title">近期最值得处理的三个信号</h2>
          </div>
          <p className="section-note">
            弱项与退步按题量加权，波动按每次练习正确率计算。
          </p>
        </div>
        <div className="diagnostic-grid">
          {diagnostics.map((diagnostic) => (
            <DiagnosticCard key={diagnostic.kind} diagnostic={diagnostic} />
          ))}
        </div>
      </section>

      <section className="section-block" aria-labelledby="practice-module-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">专项模块</p>
            <h2 id="practice-module-title">各模块正确率趋势</h2>
          </div>
          <p className="section-note">点击模块，查看它自己的最近练习。</p>
        </div>
        <div className="module-card-grid">
          {PRACTICE_MODULES.map((module) => {
            const trend = getPracticeTrend(records, module.key, windowSize);
            const latest = trend.at(-1);
            const totalAttempts = getPracticeAttempts(records, module.key).length;
            const windowAccuracy = weightedPracticeAccuracy(
              trend.map((item) => item.attempt),
            );
            return (
              <button
                type="button"
                key={module.key}
                className={`module-card${
                  selectedModule === module.key ? " is-selected" : ""
                }`}
                style={
                  {
                    "--module-color": module.color,
                    "--module-soft": module.softColor,
                  } as React.CSSProperties
                }
                onClick={() => setSelectedModule(module.key)}
              >
                <div className="module-card__heading">
                  <div>
                    <span>{module.name}</span>
                    <small>累计 {totalAttempts} 次练习</small>
                  </div>
                  <strong>
                    {latest ? windowAccuracy.toFixed(1) : "—"}
                    {latest && <em>%</em>}
                  </strong>
                </div>
                <LineChart
                  compact
                  ariaLabel={`${module.name}模块练习正确率`}
                  color={module.color}
                  valueSuffix="%"
                  data={trend.map(({ record, value }) => ({
                    label: shortDate(record.date),
                    title: createPracticeRecordName(record, record.createdAt),
                    value,
                  }))}
                />
                <div className="module-card__footer">
                  {latest ? (
                    <>
                      <span>最近 {shortDate(latest.record.date)}</span>
                      <span>
                        {latest.attempt.correct} 对 / {latest.attempt.wrong} 错
                      </span>
                    </>
                  ) : (
                    <span>还没有该模块记录</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="module-detail" aria-labelledby="practice-module-detail-title">
        <div className="module-detail__copy">
          <span
            className="module-index"
            style={{
              backgroundColor: selectedDefinition.softColor,
              color: selectedDefinition.color,
            }}
          >
            {String(
              PRACTICE_MODULES.findIndex((module) => module.key === selectedModule) + 1,
            ).padStart(2, "0")}
          </span>
          <p className="eyebrow">当前模块</p>
          <h2 id="practice-module-detail-title">{selectedDefinition.name}</h2>
          <p>每个点代表一次包含该模块的练习批次。</p>
          <dl>
            <div>
              <dt>窗口练习</dt>
              <dd>{selectedTrend.length} 次</dd>
            </div>
            <div>
              <dt>窗口题量</dt>
              <dd>{selectedQuestions} 题</dd>
            </div>
            <div>
              <dt>窗口加权正确率</dt>
              <dd>
                {selectedTrend.length
                  ? `${selectedWindowAccuracy.toFixed(1)}%`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>全部加权正确率</dt>
              <dd>
                {selectedAttempts.length
                  ? `${selectedAllAccuracy.toFixed(1)}%`
                  : "—"}
              </dd>
            </div>
          </dl>
        </div>
        <div className="module-detail__chart">
          <LineChart
            ariaLabel={`${selectedDefinition.name}模块练习详细趋势`}
            color={selectedDefinition.color}
            valueSuffix="%"
            data={selectedTrend.map(({ record, attempt, value }) => ({
              label: shortDate(record.date),
              title: createPracticeRecordName(record, record.createdAt),
              value,
              questionCount: practiceQuestionCount(attempt),
              accuracy: value,
            }))}
          />
        </div>
      </section>

      <ScorePrediction records={records} />
    </main>
  );
}

export function PracticeHistoryView({
  records,
  onEdit,
  onCopy,
  onDelete,
  onExportCsv,
  modeSelector,
}: {
  records: PracticeRecord[];
  onEdit: (record: PracticeRecord) => void;
  onCopy: (record: PracticeRecord) => void;
  onDelete: (record: PracticeRecord) => void;
  onExportCsv: () => void;
  modeSelector: ReactNode;
}) {
  const sorted = sortPracticeRecords(records).reverse();
  return (
    <main className="history-shell">
      <section className="history-heading">
        <div>
          <p className="eyebrow">模块练习历史</p>
          <h1>每次练习，按批次留下记录。</h1>
          <p>共 {records.length} 次练习，模块成绩分别参与各自分析。</p>
        </div>
        <div className="history-heading-actions">
          {modeSelector}
          <button
            className="button button--secondary"
            type="button"
            onClick={onExportCsv}
            disabled={!records.length}
          >
            导出模块练习 CSV
          </button>
        </div>
      </section>

      <div className="history-table-wrap practice-history-wrap">
        <table className="history-table practice-history-table">
          <thead>
            <tr>
              <th scope="col">日期 / 练习</th>
              <th scope="col">模块与正确率</th>
              <th scope="col">
                <span className="sr-only">操作</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((record) => {
              const keys = activePracticeModuleKeys(record);
              return (
                <tr key={record.id}>
                  <td>
                    <div className="practice-history-date">
                      <time dateTime={record.date}>{record.date}</time>
                      <strong>{createPracticeRecordName(record, record.createdAt)}</strong>
                    </div>
                  </td>
                  <td>
                    <div className={`practice-module-list${keys.length === 1 ? " practice-module-list--single" : ""}`}>
                      {keys.map((key) => {
                        const module = MODULE_MAP[key];
                        const attempt = record.modules[key]!;
                        return (
                          <div className="practice-module-item" key={key}>
                            <span className="practice-module-name">
                              <i style={{ backgroundColor: module.color }} />
                              <b>{module.name}</b>
                            </span>
                            <strong>{calculatePracticeAccuracy(attempt).toFixed(1)}%</strong>
                          </div>
                        );
                      })}
                    </div>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button type="button" onClick={() => onEdit(record)}>
                        编辑
                      </button>
                      <button type="button" onClick={() => onCopy(record)}>
                        复制
                      </button>
                      <button
                        className="is-danger"
                        type="button"
                        onClick={() => onDelete(record)}
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!records.length && <div className="table-empty">还没有模块练习记录。</div>}
      </div>
    </main>
  );
}
