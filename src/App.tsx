"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LoginForm from "../app/LoginForm";
import { SessionGuard } from "./lib/sessionGuard";
import {
  RecordForm,
  type RecordFormValue,
} from "./components/ExamForm";
import { LineChart } from "./components/LineChart";
import { SimulationModuleDetails } from "./components/SimulationModuleDetails";
import {
  PracticeDashboard,
  PracticeHistoryView,
} from "./components/PracticeViews";
import { createDemoRecords } from "./data/demo";
import { createPracticeRecordName } from "./lib/practice";
import { normalizeSimulationSources, withSimulationSources } from "./lib/simulation";
import { MODULES, MODULE_MAP, WINDOW_OPTIONS } from "./constants";
import {
  buildDiagnostics,
  getModuleTrend,
  getTotalTrend,
  getWindow,
  sortRecords,
  average,
  weightedModuleRate,
} from "./lib/analytics";
import {
  exportAllRecordsToJson,
  exportPracticeRecordsToCsv,
  exportRecordsToCsv,
  parseImportedData,
  type ImportedData,
} from "./lib/dataTransfer";
import {
  calculateModuleScore,
  calculateRecordTotal,
  createSimulationAttempt,
  displayModuleScore,
  displayTotalScore,
} from "./lib/scoring";
import {
  clearAccountStorage,
  configureStorage,
  clearPendingData,
  loadCloudRevision,
  loadPendingData,
  loadPracticeRecords,
  loadRecords,
  loadSimulationSources,
  saveSimulationSources,
  saveCloudRevision,
  savePendingData,
  savePracticeRecords,
  saveRecords,
  SESSION_CHANGE_KEY,
  SESSION_CHANNEL_NAME,
  notifySessionChange,
  sessionChangeMarker,
  type PendingSyncData,
} from "./lib/storage";
import type {
  Diagnostic,
  ExamRecord,
  ModuleKey,
  PracticeRecord,
  PracticeModuleKey,
  RecordKind,
} from "./types";

type Tab = "simulation" | "practice" | "history";
type ImportMode = "merge" | "replace";

function localDate(): string {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function createBlankRecord(): ExamRecord {
  const modules = Object.fromEntries(
    MODULES.map((module) => [
      module.key,
      createSimulationAttempt(module.key),
    ]),
  ) as ExamRecord["modules"];

  return {
    id: "",
    name: "",
    date: localDate(),
    type: "",
    modules,
    createdAt: "",
    updatedAt: "",
  };
}

function createBlankPracticeRecord(): PracticeRecord {
  return {
    id: "",
    name: "",
    date: localDate(),
    modules: {},
    createdAt: "",
    updatedAt: "",
  };
}

function createRecordId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `exam-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const merged = new Map(current.map((record) => [record.id, record]));
  incoming.forEach((record) => merged.set(record.id, record));
  return [...merged.values()];
}

function shortDate(value: string): string {
  const [, month, day] = value.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function downloadText(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function WindowSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="window-selector" aria-label="趋势窗口">
      {WINDOW_OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          className={value === option ? "is-active" : ""}
          onClick={() => onChange(option)}
        >
          近 {option} 套
        </button>
      ))}
    </div>
  );
}

function EmptyState({
  kind,
  onCreate,
  onDemo,
}: {
  kind: RecordKind;
  onCreate: () => void;
  onDemo?: () => void;
}) {
  const practice = kind === "practice";
  return (
    <main className="empty-state">
      <div className="empty-sheet" aria-hidden="true">
        <span>01</span><i /><i /><i /><i /><i /><i />
      </div>
      <p className="eyebrow">{practice ? "第一条模块轨迹" : "你的第一条基线"}</p>
      <h1>
        {practice ? "先录入一次模块练习，" : "先录入一套试卷，"}
        <br />看板才有故事可讲。
      </h1>
      <p>
        {practice
          ? "每个模块拥有独立趋势，并在数据足够后识别弱项、退步和波动。"
          : "系统会自动计算六个模块得分，并从第三套开始识别波动。"}
      </p>
      <div className="empty-actions">
        <button className="button button--primary" onClick={onCreate}>
          {practice ? "录入第一次模块练习" : "录入第一套试卷"}
        </button>
        {onDemo && (
          <button className="button button--secondary" onClick={onDemo}>
            加载演示数据
          </button>
        )}
      </div>
      <small>
        {practice
          ? "模块练习与仿真模拟数据相互独立。"
          : "演示数据只在你主动加载时写入，也可以逐条删除。"}
      </small>
    </main>
  );
}

function DiagnosticCard({ diagnostic }: { diagnostic: Diagnostic }) {
  const module = diagnostic.moduleKey ? MODULE_MAP[diagnostic.moduleKey] : undefined;
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

function Dashboard({
  records,
  windowSize,
  setWindowSize,
  selectedModule,
  setSelectedModule,
  onEdit,
}: {
  records: ExamRecord[];
  windowSize: number;
  setWindowSize: (size: number) => void;
  selectedModule: ModuleKey;
  setSelectedModule: (key: ModuleKey) => void;
  onEdit: (record: ExamRecord) => void;
}) {
  const sorted = useMemo(() => sortRecords(records), [records]);
  const latest = sorted.at(-1)!;
  const previous = sorted.at(-2);
  const latestTotal = calculateRecordTotal(latest);
  const previousTotal = previous ? calculateRecordTotal(previous) : undefined;
  const totalChange = previousTotal === undefined ? undefined : latestTotal - previousTotal;
  const totalTrend = getTotalTrend(records, windowSize);
  const diagnostics = buildDiagnostics(records, windowSize);
  const selectedDefinition = MODULE_MAP[selectedModule];
  const selectedTrend = getModuleTrend(records, selectedModule, windowSize);
  const selectedRates = selectedTrend.map((item) => item.value);
  const recentRecords = getWindow(records, windowSize);
  const recentAverage = average(recentRecords.map(calculateRecordTotal));

  return (
    <main className="dashboard-shell">
      <section className="dashboard-intro">
        <div>
          <p className="eyebrow">成绩分析看板</p>
          <h1>最近的问题，<br /><span>别让它藏在总分里。</span></h1>
        </div>
        <div className="intro-controls">
          <p>趋势范围</p>
          <WindowSelector value={windowSize} onChange={setWindowSize} />
        </div>
      </section>

      <section className="overview-grid">
        <article className="latest-score-card">
          <div className="card-topline">
            <div>
              <p className="eyebrow">最近一套 · {latest.date}</p>
              <h2>{latest.name}</h2>
            </div>
            <button className="text-button" type="button" onClick={() => onEdit(latest)}>编辑</button>
          </div>
          <div className="hero-score-row">
            <div className="hero-score">
              <strong>{displayTotalScore(latestTotal)}</strong>
              <span>/ 100</span>
            </div>
            <div className={`score-delta${totalChange !== undefined && totalChange < 0 ? " is-down" : ""}`}>
              {totalChange === undefined ? (
                <span>第一套基线</span>
              ) : (
                <>
                  <b>{totalChange >= 0 ? "+" : ""}{totalChange.toFixed(1)}</b>
                  <span>较上一套</span>
                </>
              )}
            </div>
          </div>
          <div className="latest-meta">
            <span>{latest.type}</span>
            {latest.durationMinutes && <span>{latest.durationMinutes} 分钟</span>}
          </div>
        </article>

        <article className="total-trend-card">
          <div className="card-topline">
            <div>
              <p className="eyebrow">百分制总分</p>
              <h2>近期总分趋势</h2>
            </div>
            <div className="average-stat">
              <span>窗口均分</span>
              <strong>{displayTotalScore(recentAverage)}</strong>
            </div>
          </div>
          <LineChart
            ariaLabel="近期总分趋势折线图"
            data={totalTrend.map(({ record, value }) => ({
              label: shortDate(record.date),
              title: record.name,
              value,
            }))}
          />
        </article>
      </section>

      <section className="section-block" aria-labelledby="diagnostics-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">自动诊断</p>
            <h2 id="diagnostics-title">这段时间最值得处理的三件事</h2>
          </div>
          <p className="section-note">只使用你已录入的得分率，窗口不足时不做判断。</p>
        </div>
        <div className="diagnostic-grid">
          {diagnostics.map((diagnostic) => (
            <DiagnosticCard key={diagnostic.kind} diagnostic={diagnostic} />
          ))}
        </div>
      </section>

      <section className="section-block" aria-labelledby="module-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">六大模块</p>
            <h2 id="module-title">模块得分率趋势</h2>
          </div>
          <p className="section-note">数字按窗口内题量加权；点击模块，查看子题型明细与趋势。</p>
        </div>
        <div className="module-card-grid">
          {MODULES.map((module) => {
            const trend = getModuleTrend(records, module.key, windowSize);
            const result = calculateModuleScore(latest.modules[module.key], module.maxScore);
            const rate = weightedModuleRate(recentRecords, module.key);
            return (
              <button
                type="button"
                key={module.key}
                className={`module-card${selectedModule === module.key ? " is-selected" : ""}`}
                aria-pressed={selectedModule === module.key}
                aria-controls="simulation-module-summary"
                style={{ "--module-color": module.color, "--module-soft": module.softColor } as React.CSSProperties}
                onClick={() => setSelectedModule(module.key)}
              >
                <div className="module-card__heading">
                  <div>
                    <span>{module.name}</span>
                    <small>窗口加权 · 满分 {module.maxScore}</small>
                  </div>
                  <strong>{rate.toFixed(1)}<em>%</em></strong>
                </div>
                <LineChart
                  compact
                  ariaLabel={`${module.name}近期得分率`}
                  color={module.color}
                  valueSuffix="%"
                  data={trend.map(({ record, value }) => ({ label: shortDate(record.date), title: record.name, value }))}
                />
                <div className="module-card__footer">
                  <span>本次 {displayModuleScore(result.score)} 分</span>
                  <span>{latest.modules[module.key].correct} 对</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="module-detail" id="simulation-module-summary" aria-labelledby="module-detail-title">
        <div className="module-detail__copy">
          <span className="module-index" style={{ backgroundColor: selectedDefinition.softColor, color: selectedDefinition.color }}>
            {String(MODULES.findIndex((module) => module.key === selectedModule) + 1).padStart(2, "0")}
          </span>
          <p className="eyebrow">当前模块</p>
          <h2 id="module-detail-title">{selectedDefinition.name}</h2>
          <p>详细趋势按得分率呈现，题量变化时仍可以直接比较。</p>
          <dl>
            <div><dt>窗口加权得分率</dt><dd>{weightedModuleRate(recentRecords, selectedModule).toFixed(1)}%</dd></div>
            <div><dt>本次得分率</dt><dd>{(selectedRates.at(-1) ?? 0).toFixed(1)}%</dd></div>
            <div><dt>窗口最好</dt><dd>{Math.max(...selectedRates, 0).toFixed(1)}%</dd></div>
          </dl>
        </div>
        <div className="module-detail__chart">
          <LineChart
            ariaLabel={`${selectedDefinition.name}详细得分率趋势`}
            color={selectedDefinition.color}
            valueSuffix="%"
            rateLabel="得分率"
            data={selectedTrend.map(({ record, value }) => {
              const attempt = record.modules[selectedModule];
              return {
                label: shortDate(record.date),
                title: record.name,
                value,
                questionCount: attempt.correct + attempt.wrong + attempt.unanswered,
                accuracy: value,
              };
            })}
          />
        </div>
      </section>
      <SimulationModuleDetails records={records} moduleKey={selectedModule} windowSize={windowSize} />
    </main>
  );
}

function HistoryView({
  records,
  onEdit,
  onCopy,
  onDelete,
  onExportCsv,
  modeSelector,
}: {
  records: ExamRecord[];
  onEdit: (record: ExamRecord) => void;
  onCopy: (record: ExamRecord) => void;
  onDelete: (record: ExamRecord) => void;
  onExportCsv: () => void;
  modeSelector: React.ReactNode;
}) {
  const sorted = sortRecords(records).reverse();
  return (
    <main className="history-shell">
      <section className="history-heading">
        <div>
          <p className="eyebrow">历史记录</p>
          <h1>每套试卷，都留下可复盘的坐标。</h1>
          <p>共 {records.length} 套完整试卷，按练习日期从新到旧排列。</p>
        </div>
        <div className="history-heading-actions">
          {modeSelector}
          <button className="button button--secondary" type="button" onClick={onExportCsv} disabled={!records.length}>导出仿真模拟 CSV</button>
        </div>
      </section>

      <div className="history-table-wrap">
        <table className="history-table">
          <thead>
            <tr>
              <th>日期 / 试卷</th>
              <th>来源</th>
              <th>总分</th>
              <th>模块得分</th>
              <th>总耗时</th>
              <th><span className="sr-only">操作</span></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((record) => (
              <tr key={record.id}>
                <td>
                  <time>{record.date}</time>
                  <strong>{record.name}</strong>
                  {(record.region || record.paperNo) && <small>{[record.region, record.paperNo].filter(Boolean).join(" · ")}</small>}
                </td>
                <td><span className="type-label">{record.type}</span></td>
                <td>
                  <b className="table-total">{displayTotalScore(calculateRecordTotal(record))}</b>
                </td>
                <td>
                  <div className="module-score-list">
                    {MODULES.map((module) => (
                      <span key={module.key} title={module.name}>
                        <i style={{ backgroundColor: module.color }} />
                        {module.shortName} {displayModuleScore(calculateModuleScore(record.modules[module.key], module.maxScore).score)}
                      </span>
                    ))}
                  </div>
                </td>
                <td>{record.durationMinutes ? `${record.durationMinutes} 分钟` : "—"}</td>
                <td>
                  <div className="row-actions">
                    <button type="button" onClick={() => onEdit(record)}>编辑</button>
                    <button type="button" onClick={() => onCopy(record)}>复制</button>
                    <button className="is-danger" type="button" onClick={() => onDelete(record)}>删除</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!records.length && <div className="table-empty">还没有历史记录。</div>}
      </div>
    </main>
  );
}

function ImportDialog({
  fileName,
  imported,
  existingRecords,
  existingPracticeRecords,
  onCancel,
  onImport,
}: {
  fileName: string;
  imported: ImportedData;
  existingRecords: ExamRecord[];
  existingPracticeRecords: PracticeRecord[];
  onCancel: () => void;
  onImport: (mode: ImportMode) => void;
}) {
  const examIds = new Set(existingRecords.map((record) => record.id));
  const practiceIds = new Set(
    existingPracticeRecords.map((record) => record.id),
  );
  const duplicates =
    imported.records.filter((record) => examIds.has(record.id)).length +
    imported.practiceRecords.filter((record) => practiceIds.has(record.id)).length;
  const total = imported.records.length + imported.practiceRecords.length;
  return (
    <div className="modal-backdrop">
      <div className="confirm-dialog import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <p className="eyebrow">导入预览</p>
        <h2 id="import-title">准备导入 {total} 条成绩记录</h2>
        <p className="dialog-file">{fileName}</p>
        <div className="import-summary">
          <div><span>仿真模拟</span><strong>{imported.records.length}</strong></div>
          <div><span>模块练习</span><strong>{imported.practiceRecords.length}</strong></div>
          <div><span>与当前重复 ID</span><strong>{duplicates}</strong></div>
        </div>
        <p className="dialog-note">
          合并会用导入版本更新同 ID 记录；替换只清除文件中所包含的记录类别，另一类数据保持不变。
        </p>
        {imported.simulationSources !== undefined && (
          <p className="dialog-note">
            文件包含 {imported.simulationSources.length} 个来源；合并会保留现有来源，替换会使用文件中的来源列表。
          </p>
        )}
        <div className="dialog-actions">
          <button className="button button--secondary" type="button" onClick={onCancel}>取消</button>
          <button className="button button--secondary" type="button" onClick={() => onImport("merge")}>合并导入</button>
          <button className="button button--danger" type="button" onClick={() => onImport("replace")}>替换全部</button>
        </div>
      </div>
    </div>
  );
}

function DeleteDialog({
  name,
  label,
  onCancel,
  onConfirm,
}: {
  name: string;
  label: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-title">
        <p className="eyebrow">删除{label}</p>
        <h2 id="delete-title">确定删除“{name}”吗？</h2>
        <p>删除后无法从看板恢复；如果需要保留，请先导出完整 JSON 备份。</p>
        <div className="dialog-actions">
          <button className="button button--secondary" type="button" onClick={onCancel}>取消</button>
          <button className="button button--danger" type="button" onClick={onConfirm}>确认删除</button>
        </div>
      </div>
    </div>
  );
}

type CloudData = PendingSyncData;
type PendingData = PendingSyncData;

type AppProps = { userName: string; userId: string; sessionExpiresAt: number };

export default function App(props: AppProps) {
  const [notice, setNotice] = useState("");
  const lock = useCallback(() => setNotice("登录已失效，成绩已隐藏。本机未同步修改仍保留，请重新登录后继续。"), []);
  return notice ? <LoginForm notice={notice} /> : <AuthenticatedApp {...props} onLock={lock} onNotice={setNotice} />;
}

function AuthenticatedApp({ userName, userId, sessionExpiresAt, onLock, onNotice }: AppProps & { onLock: () => void; onNotice: (notice: string) => void }) {
  configureStorage(userId);
  const [guard] = useState(() => new SessionGuard(() => { notifySessionChange(); onLock(); }, sessionExpiresAt));
  const [records, setRecords] = useState<ExamRecord[]>([]);
  const [practiceRecords, setPracticeRecords] = useState<PracticeRecord[]>([]);
  const [simulationSources, setSimulationSources] = useState<string[]>(() => normalizeSimulationSources(undefined));
  const [dataReady, setDataReady] = useState(false);
  const [syncState, setSyncState] = useState<"loading" | "synced" | "saving" | "pending" | "conflict" | "error">("loading");
  const [tab, setTab] = useState<Tab>("simulation");
  const [historyKind, setHistoryKind] =
    useState<RecordKind>("simulation");
  const [windowSize, setWindowSize] = useState(5);
  const [selectedModule, setSelectedModule] = useState<ModuleKey>("verbal");
  const [selectedPracticeModule, setSelectedPracticeModule] =
    useState<PracticeModuleKey>("verbal");
  const [formValue, setFormValue] = useState<RecordFormValue | null>(null);
  const [deleteValue, setDeleteValue] = useState<RecordFormValue | null>(null);
  const [imported, setImported] = useState<ImportedData | null>(null);
  const [importFileName, setImportFileName] = useState("");
  const [toast, setToast] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const revisionRef = useRef(0);
  const skipSyncRef = useRef(false);
  const syncingRef = useRef(false);
  const pendingRef = useRef<PendingData | null>(null);
  const conflictRevisionRef = useRef<number | null>(null);
  const latestDataRef = useRef<CloudData>(withSimulationSources({ revision: 0, records: [], practiceRecords: [] }));

  useEffect(() => {
    guard.start();
    const marker = sessionChangeMarker();
    const lockFromOtherTab = () => { if (guard.active) { guard.dispose(); onLock(); } };
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(SESSION_CHANNEL_NAME) : null;
    if (channel) channel.onmessage = lockFromOtherTab;
    const check = () => {
      if (sessionChangeMarker() !== marker) lockFromOtherTab();
      else if (Date.now() >= sessionExpiresAt) guard.lock();
    };
    const changed = (event: StorageEvent) => {
      if (event.storageArea === window.localStorage && (event.key === SESSION_CHANGE_KEY || event.key === null)) lockFromOtherTab();
    };
    const timeout = window.setTimeout(() => guard.lock(), Math.max(0, sessionExpiresAt - Date.now()));
    window.addEventListener("storage", changed);
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", check);
    document.addEventListener("visibilitychange", check);
    check();
    return () => {
      guard.dispose();
      channel?.close();
      window.clearTimeout(timeout);
      window.removeEventListener("storage", changed);
      window.removeEventListener("focus", check);
      window.removeEventListener("pageshow", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [guard, onLock, sessionExpiresAt]);

  const syncPending = useCallback(async () => {
    if (!guard.active || syncingRef.current || !pendingRef.current) return;
    syncingRef.current = true;
    try {
      while (guard.active && pendingRef.current) {
        const pending: PendingData = pendingRef.current;
        setSyncState("saving");
        const response = await guard.request<{ revision: number }>("/api/data", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(pending),
          signal: AbortSignal.timeout(10_000),
        });
        if (!guard.active) return;
        let revision: number;
        if (response.status === 409) {
          const cloudResponse = await guard.request<CloudData>("/api/data", { cache: "no-store" });
          if (!guard.active) return;
          if (!cloudResponse.ok || !cloudResponse.data) throw new Error("无法核对云端记录");
          const cloud = withSimulationSources(cloudResponse.data);
          if (JSON.stringify([cloud.records, cloud.practiceRecords, cloud.simulationSources]) !==
              JSON.stringify([pending.records, pending.practiceRecords, pending.simulationSources])) {
            conflictRevisionRef.current = cloud.revision;
            setSyncState("conflict");
            setToast("云端有其他修改，本机记录已保留；请先导出备份再处理冲突。");
            break;
          }
          revision = cloud.revision;
        } else {
          if (!response.ok) throw new Error("同步失败");
          revision = response.data!.revision;
        }
        revisionRef.current = revision;
        conflictRevisionRef.current = null;
        saveCloudRevision(revision);
        if (pendingRef.current === pending) {
          pendingRef.current = null;
          const stored = loadPendingData();
          if (stored && JSON.stringify(stored) !== JSON.stringify(pending)) {
            setSyncState("pending");
          } else {
            clearPendingData();
            setSyncState("synced");
          }
        } else {
          pendingRef.current.revision = revision;
          savePendingData(pendingRef.current);
        }
      }
    } catch {
      if (!guard.active) return;
      setSyncState("pending");
      setToast("记录已保存在本机，联网后会继续同步。");
    } finally {
      syncingRef.current = false;
    }
  }, [guard]);

  useEffect(() => {
    let cancelled = false;
    void guard.request<CloudData>("/api/data", { cache: "no-store" })
      .then((response) => {
        if (!response.ok || !response.data) throw new Error("无法读取云端记录");
        return withSimulationSources(response.data);
      })
      .then((cloud) => {
        if (cancelled || !guard.active) return;
        saveCloudRevision(cloud.revision);
        const pending = loadPendingData();
        const localRecords = loadRecords();
        const localPractice = loadPracticeRecords();
        const localSources = loadSimulationSources();
        const shouldMigrate = pending === null && cloud.revision === 0 &&
          (localRecords.length > 0 || localPractice.length > 0 ||
            JSON.stringify(localSources) !== JSON.stringify(cloud.simulationSources));
        const hasPending = pending !== null || shouldMigrate;
        const next = withSimulationSources(pending ?? (shouldMigrate
          ? { revision: cloud.revision, records: localRecords, practiceRecords: localPractice, simulationSources: localSources }
          : cloud), cloud.simulationSources);
        revisionRef.current = next.revision;
        pendingRef.current = hasPending ? next : null;
        if (hasPending) savePendingData(next);
        skipSyncRef.current = true;
        latestDataRef.current = next;
        setRecords(next.records);
        setPracticeRecords(next.practiceRecords);
        setSimulationSources(next.simulationSources);
        saveRecords(next.records);
        savePracticeRecords(next.practiceRecords);
        saveSimulationSources(next.simulationSources);
        setDataReady(true);
        setSyncState(hasPending ? "pending" : "synced");
        if (hasPending) void syncPending();
      })
      .catch(() => {
        if (cancelled || !guard.active) return;
        const pending = loadPendingData();
        const local = withSimulationSources(pending ?? {
          revision: loadCloudRevision(),
          records: loadRecords(),
          practiceRecords: loadPracticeRecords(),
        }, loadSimulationSources());
        revisionRef.current = local.revision;
        pendingRef.current = pending ? local : null;
        latestDataRef.current = local;
        skipSyncRef.current = true;
        setRecords(local.records);
        setPracticeRecords(local.practiceRecords);
        setSimulationSources(local.simulationSources);
        setDataReady(true);
        setSyncState(pending ? "pending" : "error");
        setToast("正在使用本机记录；网络恢复后可继续同步。");
      });
    return () => { cancelled = true; };
  }, [guard, syncPending]);

  useEffect(() => {
    if (!dataReady || !guard.active) return;
    if (skipSyncRef.current) {
      skipSyncRef.current = false;
      return;
    }
    const next = { revision: revisionRef.current, records, practiceRecords, simulationSources };
    try {
      savePendingData(next);
      saveRecords(records);
      savePracticeRecords(practiceRecords);
      saveSimulationSources(simulationSources);
    } catch {
      setSyncState("error");
      setToast("本机保存失败，请导出备份后检查浏览器存储空间。");
      return;
    }
    pendingRef.current = next;
    latestDataRef.current = next;
    setSyncState("pending");
    const timeout = window.setTimeout(() => {
      void syncPending();
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [records, practiceRecords, simulationSources, dataReady, guard, syncPending]);

  useEffect(() => {
    const refresh = () => {
      if (!guard.active || !dataReady || document.visibilityState !== "visible") return;
      if (pendingRef.current) {
        if (syncState !== "conflict") void syncPending();
        return;
      }
      void guard.request<CloudData>("/api/data", { cache: "no-store" }).then((response) => {
        if (!guard.active || !response.ok || !response.data) return;
        const cloud = withSimulationSources(response.data);
        if (cloud.revision <= revisionRef.current) {
          setSyncState("synced");
          return;
        }
        const current = latestDataRef.current;
        if (current.records === records && current.practiceRecords === practiceRecords && current.simulationSources === simulationSources) {
          revisionRef.current = cloud.revision;
          saveCloudRevision(cloud.revision);
          skipSyncRef.current = true;
          latestDataRef.current = cloud;
          setRecords(cloud.records);
          setPracticeRecords(cloud.practiceRecords);
          setSimulationSources(cloud.simulationSources);
          saveRecords(cloud.records);
          savePracticeRecords(cloud.practiceRecords);
          saveSimulationSources(cloud.simulationSources);
          setSyncState("synced");
        }
      }).catch(() => undefined);
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    const interval = window.setInterval(refresh, 30_000);
    return () => { window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); window.clearInterval(interval); };
  }, [dataReady, records, practiceRecords, simulationSources, guard, syncPending, syncState]);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const notify = (message: string) => setToast(message);
  const logout = async () => {
    if ((pendingRef.current || syncingRef.current) && !window.confirm("本机还有待同步记录。请先导出完整 JSON 备份；退出将清除本机缓存。确定退出吗？")) return;
    guard.lock();
    const marker = sessionChangeMarker();
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error("logout_failed");
      // Do not erase changes made by a new login while this logout was in flight.
      if (sessionChangeMarker() === marker) { clearAccountStorage(); notifySessionChange(); }
      window.location.replace("/");
    } catch { onNotice("退出尚未完成。本机记录仍保留，请检查网络，重新登录后再退出。"); }
  };
  const overwriteCloud = () => {
    const pending = pendingRef.current;
    const cloudRevision = conflictRevisionRef.current;
    if (!pending || cloudRevision === null) return;
    if (!window.confirm("云端有其他修改。确定用本机记录覆盖云端吗？建议先导出完整 JSON 备份。")) return;
    pending.revision = cloudRevision;
    savePendingData(pending);
    conflictRevisionRef.current = null;
    void syncPending();
  };
  const preferredKind: RecordKind =
    tab === "practice" || (tab === "history" && historyKind === "practice")
      ? "practice"
      : "simulation";

  const openNew = (kind: RecordKind = preferredKind) =>
    setFormValue(
      kind === "simulation"
        ? { kind, record: createBlankRecord() }
        : { kind, record: createBlankPracticeRecord() },
    );
  const openExamEdit = (record: ExamRecord) =>
    setFormValue({ kind: "simulation", record: structuredClone(record) });
  const openPracticeEdit = (record: PracticeRecord) =>
    setFormValue({ kind: "practice", record: structuredClone(record) });
  const openExamCopy = (record: ExamRecord) => {
    const copy = structuredClone(record);
    copy.id = "";
    copy.name = "";
    copy.date = localDate();
    copy.createdAt = "";
    copy.updatedAt = "";
    setFormValue({ kind: "simulation", record: copy });
  };
  const openPracticeCopy = (record: PracticeRecord) => {
    const copy = structuredClone(record);
    copy.id = "";
    copy.name = "";
    copy.date = localDate();
    copy.createdAt = "";
    copy.updatedAt = "";
    setFormValue({ kind: "practice", record: copy });
  };

  const saveFormValue = (value: RecordFormValue) => {
    const next = value.record.id
      ? value.record
      : { ...value.record, id: createRecordId() };
    if (value.kind === "simulation") {
      const exam = next as ExamRecord;
      setRecords((current) => {
        const exists = current.some((item) => item.id === exam.id);
        return exists
          ? current.map((item) => (item.id === exam.id ? exam : item))
          : [...current, exam];
      });
      setTab("simulation");
      setHistoryKind("simulation");
      notify(value.record.id ? "仿真模拟已更新" : "仿真模拟已保存");
    } else {
      const practice = next as PracticeRecord;
      setPracticeRecords((current) => {
        const exists = current.some((item) => item.id === practice.id);
        return exists
          ? current.map((item) =>
              item.id === practice.id ? practice : item,
            )
          : [...current, practice];
      });
      setTab("practice");
      setHistoryKind("practice");
      notify(value.record.id ? "模块练习已更新" : "模块练习已保存");
    }
    setFormValue(null);
  };

  const confirmDelete = () => {
    if (!deleteValue) return;
    if (deleteValue.kind === "simulation") {
      setRecords((current) =>
        current.filter((record) => record.id !== deleteValue.record.id),
      );
      notify("仿真模拟记录已删除");
    } else {
      setPracticeRecords((current) =>
        current.filter((record) => record.id !== deleteValue.record.id),
      );
      notify("模块练习记录已删除");
    }
    setDeleteValue(null);
  };

  const exportJson = () => {
    downloadText(
      exportAllRecordsToJson(records, practiceRecords, simulationSources),
      `行测轨迹完整备份-${localDate()}.json`,
      "application/json;charset=utf-8",
    );
    notify("完整 JSON 备份已导出");
  };
  const exportExamCsv = () => {
    downloadText(
      exportRecordsToCsv(records),
      `行测轨迹-仿真模拟-${localDate()}.csv`,
      "text/csv;charset=utf-8",
    );
    notify("仿真模拟 CSV 已导出");
  };
  const exportPracticeCsv = () => {
    downloadText(
      exportPracticeRecordsToCsv(practiceRecords),
      `行测轨迹-模块练习-${localDate()}.csv`,
      "text/csv;charset=utf-8",
    );
    notify("模块练习 CSV 已导出");
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = parseImportedData(await file.text(), file.name);
      setImported(parsed);
      setImportFileName(file.name);
    } catch (error) {
      notify(error instanceof Error ? error.message : "无法读取导入文件");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const applyImport = (mode: ImportMode) => {
    if (!imported) return;
    if (imported.includesRecords) {
      setRecords((current) =>
        mode === "replace"
          ? imported.records
          : mergeById(current, imported.records),
      );
    }
    if (imported.includesPracticeRecords) {
      setPracticeRecords((current) =>
        mode === "replace"
          ? imported.practiceRecords
          : mergeById(current, imported.practiceRecords),
      );
    }
    if (imported.simulationSources !== undefined) {
      const sources = imported.simulationSources;
      setSimulationSources((current) => mode === "replace" ? sources : [...new Set([...current, ...sources])]);
    }
    const count = imported.records.length + imported.practiceRecords.length;
    setImported(null);
    notify(`已${mode === "replace" ? "替换" : "合并"} ${count} 条记录`);
  };

  const openHistory = () => {
    if (tab === "practice") setHistoryKind("practice");
    if (tab === "simulation") setHistoryKind("simulation");
    setTab("history");
  };
  const historyModeSelector = (
    <div className="window-selector history-kind-selector" aria-label="历史记录类型">
      <button
        type="button"
        className={historyKind === "simulation" ? "is-active" : ""}
        onClick={() => setHistoryKind("simulation")}
      >
        仿真模拟
      </button>
      <button
        type="button"
        className={historyKind === "practice" ? "is-active" : ""}
        onClick={() => setHistoryKind("practice")}
      >
        模块练习
      </button>
    </div>
  );

  if (!dataReady) {
    return (
      <main className="sync-loading">
        <p className="eyebrow">行测轨迹 · 私有云端</p>
        <h1>正在读取你的成绩记录</h1>
        <p>登录账号：{userName}</p>
        {syncState === "error" && <p role="alert">云端连接失败，请检查网络后刷新页面。</p>}
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="brand"
          type="button"
          onClick={() => setTab("simulation")}
          aria-label="返回仿真模拟分析"
        >
          <span className="brand-mark">
            <i />
            <i />
            <i />
          </span>
          <span>
            <strong>行测轨迹</strong>
            <small>Score atlas</small>
          </span>
        </button>

        <nav className="main-nav" aria-label="主导航">
          <button
            type="button"
            className={tab === "simulation" ? "is-active" : ""}
            onClick={() => setTab("simulation")}
            aria-current={tab === "simulation" ? "page" : undefined}
          >
            仿真模拟分析
          </button>
          <button
            type="button"
            className={tab === "practice" ? "is-active" : ""}
            onClick={() => setTab("practice")}
            aria-current={tab === "practice" ? "page" : undefined}
          >
            模块练习分析
          </button>
          <button
            type="button"
            className={tab === "history" ? "is-active" : ""}
            onClick={openHistory}
            aria-current={tab === "history" ? "page" : undefined}
          >
            历史记录 <span>{records.length + practiceRecords.length}</span>
          </button>
        </nav>

        <div className="topbar-actions">
          <div className="account-actions">
            <span className={`sync-indicator sync-indicator--${syncState}`}>
              {syncState === "synced" ? "已同步" : syncState === "saving" ? "同步中" : syncState === "pending" ? "已存本机·待同步" : syncState === "conflict" ? "云端记录冲突" : syncState === "error" ? "离线记录" : "读取中"}
            </span>
            {(syncState === "pending" || syncState === "error") && (
              <button className="sync-retry" type="button" onClick={() => pendingRef.current ? void syncPending() : window.location.reload()}>
                重试同步
              </button>
            )}
            {syncState === "conflict" && (
              <button className="sync-retry" type="button" onClick={overwriteCloud}>
                处理冲突
              </button>
            )}
          </div>
          <details className="data-menu">
            <summary>数据管理</summary>
            <div className="data-menu__panel">
              <p>备份与迁移</p>
              <label className="data-action">
                导入 JSON / CSV
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.csv,application/json,text/csv"
                  onChange={(event) =>
                    void handleFile(event.target.files?.[0])
                  }
                />
              </label>
              <button
                type="button"
                className="data-action"
                onClick={exportJson}
                disabled={!records.length && !practiceRecords.length}
              >
                导出完整 JSON
              </button>
              <button
                type="button"
                className="data-action"
                onClick={exportExamCsv}
                disabled={!records.length}
              >
                导出仿真模拟 CSV
              </button>
              <button
                type="button"
                className="data-action"
                onClick={exportPracticeCsv}
                disabled={!practiceRecords.length}
              >
                导出模块练习 CSV
              </button>
              <small>记录保存在你的数据库，可在其他设备登录后继续编辑。</small>
              <button type="button" className="data-action" onClick={() => void logout()}>退出登录并清除本机缓存</button>
            </div>
          </details>
          <button
            className="button button--primary add-button"
            type="button"
            onClick={() => openNew()}
          >
            <span>＋</span> 录入成绩
          </button>
        </div>
      </header>


      {tab === "simulation" &&
        (!records.length ? (
          <EmptyState
            kind="simulation"
            onCreate={() => openNew("simulation")}
            onDemo={() => {
              setRecords(createDemoRecords());
              notify("已加载 10 套演示数据");
            }}
          />
        ) : (
          <Dashboard
            records={records}
            windowSize={windowSize}
            setWindowSize={setWindowSize}
            selectedModule={selectedModule}
            setSelectedModule={setSelectedModule}
            onEdit={openExamEdit}
          />
        ))}

      {tab === "practice" &&
        (!practiceRecords.length ? (
          <EmptyState
            kind="practice"
            onCreate={() => openNew("practice")}
          />
        ) : (
          <PracticeDashboard
            records={practiceRecords}
            windowSize={windowSize}
            setWindowSize={setWindowSize}
            selectedModule={selectedPracticeModule}
            setSelectedModule={setSelectedPracticeModule}
          />
        ))}

      {tab === "history" && historyKind === "simulation" && (
        <HistoryView
          records={records}
          onEdit={openExamEdit}
          onCopy={openExamCopy}
          onDelete={(record) =>
            setDeleteValue({ kind: "simulation", record })
          }
          onExportCsv={exportExamCsv}
          modeSelector={historyModeSelector}
        />
      )}
      {tab === "history" && historyKind === "practice" && (
        <PracticeHistoryView
          records={practiceRecords}
          onEdit={openPracticeEdit}
          onCopy={openPracticeCopy}
          onDelete={(record) => setDeleteValue({ kind: "practice", record })}
          onExportCsv={exportPracticeCsv}
          modeSelector={historyModeSelector}
        />
      )}

      {formValue && (
        <RecordForm
          initialValue={formValue}
          simulationSources={simulationSources}
          onSourcesChange={setSimulationSources}
          onClose={() => setFormValue(null)}
          onSave={saveFormValue}
        />
      )}
      {deleteValue && (
        <DeleteDialog
          name={deleteValue.kind === "practice"
            ? createPracticeRecordName(deleteValue.record, deleteValue.record.createdAt)
            : deleteValue.record.name}
          label={
            deleteValue.kind === "simulation" ? "仿真模拟记录" : "模块练习记录"
          }
          onCancel={() => setDeleteValue(null)}
          onConfirm={confirmDelete}
        />
      )}
      {imported && (
        <ImportDialog
          fileName={importFileName}
          imported={imported}
          existingRecords={records}
          existingPracticeRecords={practiceRecords}
          onCancel={() => setImported(null)}
          onImport={applyImport}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

