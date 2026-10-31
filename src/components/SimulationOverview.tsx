import { average, getTotalTrend } from "../lib/analytics";
import { displayTotalScore } from "../lib/scoring";
import type { ExamRecord } from "../types";
import { LineChart } from "./LineChart";

function shortDate(value: string): string {
  const [, month, day] = value.split("-");
  return `${Number(month)}/${Number(day)}`;
}

export function SimulationOverview({ records, windowSize, onEdit }: {
  records: ExamRecord[];
  windowSize: number;
  onEdit: (record: ExamRecord) => void;
}) {
  const trend = getTotalTrend(records, windowSize);
  const scores = trend.map((point) => point.value);
  const mean = Number(displayTotalScore(average(scores)));
  const first = trend[0];
  const latest = trend.at(-1);
  const change = trend.length > 1
    ? Number(displayTotalScore(latest!.value - first.value))
    : undefined;

  return (
    <section className="simulation-overview" aria-labelledby="simulation-overview-title">
      <div className="simulation-overview__summary">
        <p className="eyebrow">近 {windowSize} 套窗口 · 已录 {trend.length} 套</p>
        <h2 id="simulation-overview-title">窗口均分</h2>
        <div className="overview-mean">
          <output aria-label="窗口均分">{scores.length ? displayTotalScore(mean) : "—"}</output>
          <span>/ 100</span>
        </div>
        <div className={`overview-change${change !== undefined && change < 0 ? " is-down" : ""}`}>
          {change === undefined ? <span>再录一套后显示窗口变化</span> : (
            <><b>{change === 0 ? "持平" : `${change > 0 ? "+" : ""}${displayTotalScore(change)} 分`}</b><span>窗口首尾变化</span></>
          )}
        </div>
        <p className="overview-date-range">{first && latest ? `${first.record.date} — ${latest.record.date}` : "录入成绩后显示日期范围"}</p>
        <dl className="overview-range">
          <div><dt>窗口最高</dt><dd>{scores.length ? displayTotalScore(Math.max(...scores)) : "—"}<span> 分</span></dd></div>
          <div><dt>窗口最低</dt><dd>{scores.length ? displayTotalScore(Math.min(...scores)) : "—"}<span> 分</span></dd></div>
        </dl>
      </div>
      <div className="simulation-overview__chart">
        <div className="overview-chart-heading">
          <div><h3>窗口总分趋势</h3><p>每个点代表一套试卷，虚线表示窗口均分。</p></div>
          {latest && <button className="text-button" type="button" onClick={() => onEdit(latest.record)}>编辑最近一套</button>}
        </div>
        <div className="overview-chart-key" aria-hidden="true">
          <span><i />逐套总分</span><span><i className="is-reference" />窗口均分</span>
        </div>
        <LineChart
          ariaLabel="窗口总分趋势及均分参考线"
          color="#2f7d6d"
          height={240}
          valueSuffix="分"
          referenceLine={scores.length ? { value: mean, label: "窗口均分" } : undefined}
          data={trend.map(({ record, value }) => ({ label: shortDate(record.date), title: `${record.date} ${record.name}`, value }))}
        />
      </div>
    </section>
  );
}
