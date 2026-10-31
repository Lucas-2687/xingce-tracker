import { MODULE_MAP, SIMULATION_QUESTION_TYPES } from "../constants";
import { getQuestionTypeTrend, getWindow, weightedQuestionTypeRate } from "../lib/analytics";
import { displayModuleScore } from "../lib/scoring";
import type { ExamRecord, ModuleKey } from "../types";
import { LineChart } from "./LineChart";

function shortDate(value: string): string {
  const [, month, day] = value.split("-");
  return `${Number(month)}/${Number(day)}`;
}

export function SimulationModuleDetails({ records, moduleKey, windowSize }: {
  records: ExamRecord[];
  moduleKey: ModuleKey;
  windowSize: number;
}) {
  const module = MODULE_MAP[moduleKey];
  const window = getWindow(records, windowSize);
  const types = SIMULATION_QUESTION_TYPES[moduleKey].map((type) => ({
    ...type,
    trend: getQuestionTypeTrend(records, moduleKey, type.key, windowSize),
  }));
  const missing = types.length > 1
    ? window.filter((record) => record.modules[moduleKey].questionTypeWrongs === undefined).length
    : 0;

  return (
    <section className="section-block" id="simulation-module-details" aria-labelledby="question-type-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">当前模块 · 子题型分析</p>
          <h2 id="question-type-title">{module.name}的明细与趋势</h2>
        </div>
        <p className="section-note">沿用近 {windowSize} 套窗口，得分率按题量加权。</p>
      </div>
      {missing > 0 && (
        <p className="question-type-note">
          窗口内 {missing} 套历史试卷未录入子题型明细，仍计入模块分析，子题型统计仅使用有明细的试卷。
        </p>
      )}
      <div className="question-type-grid">
        {types.map((type) => {
          const totals = type.trend.reduce((sum, point) => ({
            questions: sum.questions + point.questionCount,
            correct: sum.correct + point.correct,
            missed: sum.missed + point.wrong + point.unanswered,
          }), { questions: 0, correct: 0, missed: 0 });
          const latest = type.trend.at(-1);
          return (
            <article className="question-type-card" key={`${moduleKey}-${type.key}`} style={{ "--module-color": module.color } as React.CSSProperties}>
              <div className="question-type-card__heading">
                <div>
                  <h3>{type.name}</h3>
                  <p>{type.questionCount} 题 × {type.unitScore} 分 · 窗口加权</p>
                </div>
                <strong>{latest ? weightedQuestionTypeRate(type.trend).toFixed(1) : "—"}{latest && <em>%</em>}</strong>
              </div>
              <dl className="question-type-stats">
                <div><dt>窗口题量</dt><dd>{totals.questions} 题</dd></div>
                <div><dt>答对</dt><dd>{totals.correct} 题</dd></div>
                <div><dt>错 / 未答</dt><dd>{totals.missed} 题</dd></div>
              </dl>
              {latest ? (
                <LineChart
                  compact
                  ariaLabel={`${module.name} · ${type.name}得分率趋势`}
                  color={module.color}
                  valueSuffix="%"
                  rateLabel="得分率"
                  data={type.trend.map((point) => ({
                    label: shortDate(point.record.date),
                    title: `${point.record.date} ${point.record.name}，${point.correct} 对 / ${point.wrong} 错 / ${point.unanswered} 未答，得分 ${displayModuleScore(point.score)}`,
                    value: point.value,
                    questionCount: point.questionCount,
                    accuracy: point.value,
                  }))}
                />
              ) : <div className="chart-empty">当前窗口未录入该题型明细</div>}
              <p className="question-type-card__latest">
                {latest
                  ? `最近有明细 · ${shortDate(latest.record.date)} · ${displayModuleScore(latest.score)} / ${displayModuleScore(latest.maxScore)} 分`
                  : "补充历史试卷的子题型错题数后，即可显示趋势。"}
              </p>
            </article>
          );
        })}
      </div>
      <div className="question-type-history">
        <h3>逐套题型明细</h3>
        <p>每格显示得分及对错数量；未录明细的题型不参与子题型统计。</p>
        <div className="history-table-wrap">
          <table className="history-table question-type-table">
            <thead>
              <tr><th scope="col">日期 / 试卷</th>{types.map((type) => <th scope="col" key={type.key}>{type.name}</th>)}</tr>
            </thead>
            <tbody>
              {[...window].reverse().map((record) => (
                <tr key={record.id}>
                  <th scope="row"><span>{record.date}</span><small>{record.name}</small></th>
                  {types.map((type) => {
                    const point = type.trend.find((item) => item.record.id === record.id);
                    return (
                      <td key={type.key}>
                        {point ? (
                          <div className="question-type-result">
                            <strong>{displayModuleScore(point.score)} <small>/ {displayModuleScore(point.maxScore)} 分</small></strong>
                            <span>{point.correct} 对 · {point.wrong} 错{point.unanswered > 0 && ` · ${point.unanswered} 未答`}</span>
                          </div>
                        ) : <span className="question-type-missing">未录明细</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {!window.length && <tr><td colSpan={types.length + 1}>录入仿真模拟成绩后显示明细。</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
