import { average, getTotalTrend } from "../lib/analytics";
import { displayTotalScore } from "../lib/scoring";
import type { ExamRecord } from "../types";
import { LineChart } from "./LineChart";

function shortDate(value: string): string {
  const [, month, day] = value.split("-");
  return `${Number(month)}/${Number(day)}`;
}

export function SimulationOverview({ records, windowSize }: {
  records: ExamRecord[];
  windowSize: number;
}) {
  const trend = getTotalTrend(records, windowSize);
  const scores = trend.map((point) => point.value);
  const mean = Number(displayTotalScore(average(scores)));

  return (
    <section className="simulation-overview" aria-labelledby="simulation-overview-title">
      <div className="simulation-overview__summary">
        <h2 id="simulation-overview-title">窗口均分</h2>
        <div className="overview-mean">
          <output aria-label="窗口均分">{scores.length ? displayTotalScore(mean) : "—"}</output>
          <span>/ 100</span>
        </div>
        <dl className="overview-range">
          <div><dt>窗口最高</dt><dd>{scores.length ? displayTotalScore(Math.max(...scores)) : "—"}<span> 分</span></dd></div>
          <div><dt>窗口最低</dt><dd>{scores.length ? displayTotalScore(Math.min(...scores)) : "—"}<span> 分</span></dd></div>
        </dl>
      </div>
      <div className="simulation-overview__chart">
        <div className="overview-chart-heading">
          <h3>总分趋势</h3>
          <div className="overview-chart-key" aria-hidden="true">
            <span><i />总分</span><span><i className="is-reference" />均分</span>
          </div>
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
