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
  const questionTypes = SIMULATION_QUESTION_TYPES[moduleKey];
  if (questionTypes.length <= 1) return null;
  const module = MODULE_MAP[moduleKey];
  const window = getWindow(records, windowSize);
  const types = questionTypes.map((type) => ({
    ...type,
    trend: getQuestionTypeTrend(records, moduleKey, type.key, windowSize),
  }));
  const missing = window.filter((record) => record.modules[moduleKey].questionTypeWrongs === undefined).length;

  return (
    <section className="section-block" id="simulation-module-details" aria-labelledby="question-type-title">
      <div className="section-heading">
        <h2 id="question-type-title">{module.name}的子题型趋势</h2>
      </div>
      {missing > 0 && (
        <p className="question-type-note">
          {missing} 套缺少题型明细，未计入子题型统计。
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
              <div className="question-type-card__info">
                <div className="question-type-card__heading">
                  <div>
                    <h3>{type.name}</h3>
                    <p>{type.questionCount} 题 × {type.unitScore} 分</p>
                  </div>
                  <div className="question-type-card__rate">
                    <span>得分率</span>
                    <strong>{latest ? weightedQuestionTypeRate(type.trend).toFixed(1) : "—"}{latest && <em>%</em>}</strong>
                  </div>
                </div>
                <dl className="question-type-stats">
                  <div><dt>题量</dt><dd>{totals.questions} 题</dd></div>
                  <div><dt>答对</dt><dd>{totals.correct} 题</dd></div>
                  <div><dt>错 / 未答</dt><dd>{totals.missed} 题</dd></div>
                </dl>
              </div>
              <div className="question-type-card__trend">
                {latest ? (
                  <LineChart
                    height={640 / 3}
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
                ) : <div className="chart-empty">暂无题型明细</div>}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
