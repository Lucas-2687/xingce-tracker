import { MODULES } from "../constants";
import type { ExamRecord } from "../types";
import { calculateModuleRate, calculateModuleScore } from "../lib/scoring";

interface ScoreRailProps {
  record: ExamRecord;
}

export function ScoreRail({ record }: ScoreRailProps) {
  return (
    <section className="score-rail-card" aria-labelledby="score-rail-title">
      <div className="section-heading section-heading--tight">
        <div>
          <p className="eyebrow">最新试卷 · 模块贡献</p>
          <h2 id="score-rail-title">答题卡得分轨</h2>
        </div>
        <p className="section-note">分段长度代表模块满分占比，填充长度代表本次得分率。</p>
      </div>

      <div className="score-rail" aria-label="六个模块得分率">
        {MODULES.map((module) => {
          const rate = calculateModuleRate(record, module.key);
          return (
            <div
              key={module.key}
              className="score-rail__segment"
              style={{
                flexBasis: `${module.maxScore}%`,
                backgroundColor: module.softColor,
              }}
              title={`${module.name}：${rate.toFixed(1)}%`}
            >
              <span
                style={{ width: `${rate}%`, backgroundColor: module.color }}
              />
            </div>
          );
        })}
      </div>

      <div className="score-rail-legend">
        {MODULES.map((module) => {
          const result = calculateModuleScore(
            record.modules[module.key],
            module.maxScore,
          );
          return (
            <div className="rail-legend-item" key={module.key}>
              <span className="rail-dot" style={{ backgroundColor: module.color }} />
              <span>{module.shortName}</span>
              <strong>{result.score.toFixed(2)}</strong>
              <small>/ {module.maxScore}</small>
            </div>
          );
        })}
      </div>
    </section>
  );
}
