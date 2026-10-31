import { useState } from "react";

interface ChartDatum {
  label: string;
  title: string;
  value: number;
  questionCount?: number;
  accuracy?: number;
}

interface LineChartProps {
  data: ChartDatum[];
  color?: string;
  compact?: boolean;
  height?: number;
  ariaLabel: string;
  valueSuffix?: string;
  rateLabel?: string;
}

const clamp = (value: number) => Math.min(100, Math.max(0, value));

export function LineChart({
  data,
  color = "#4e76bd",
  compact = false,
  height = compact ? 84 : 248,
  ariaLabel,
  valueSuffix = "",
  rateLabel = "正确率",
}: LineChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (!data.length) {
    return <div className="chart-empty">录入数据后显示趋势</div>;
  }

  const width = 640;
  const margin = compact
    ? { top: 8, right: 4, bottom: 8, left: 4 }
    : { top: 18, right: 18, bottom: 38, left: 38 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const bottom = margin.top + plotHeight;
  const points = data.map((datum, index) => {
    const x =
      data.length === 1
        ? margin.left + plotWidth / 2
        : margin.left + (plotWidth * index) / (data.length - 1);
    const y = margin.top + (1 - clamp(datum.value) / 100) * plotHeight;
    return { ...datum, x, y };
  });
  const path = points
    .map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`)
    .join(" ");
  const area = `${path} L${points.at(-1)?.x},${bottom} L${points[0].x},${bottom} Z`;
  const ticks = compact ? [] : [25, 50, 75, 100];
  const tooltipPoint = activeIndex === null ? undefined : points[activeIndex];
  const tooltipX = tooltipPoint ? Math.min(width - 108, Math.max(8, tooltipPoint.x - 50)) : 0;
  const tooltipY = tooltipPoint ? (tooltipPoint.y < 60 ? tooltipPoint.y + 14 : tooltipPoint.y - 50) : 0;

  return (
    <svg
      className={compact ? "line-chart line-chart--compact" : "line-chart"}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
    >
      {!compact &&
        ticks.map((tick) => {
          const y = margin.top + (1 - tick / 100) * plotHeight;
          return (
            <g key={tick}>
              <line
                x1={margin.left}
                x2={width - margin.right}
                y1={y}
                y2={y}
                className="chart-gridline"
              />
              <text x={margin.left - 9} y={y + 4} className="chart-axis" textAnchor="end">
                {tick}
              </text>
            </g>
          );
        })}
      <path d={area} fill={color} opacity="0.08" />
      <path d={path} fill="none" stroke={color} strokeWidth={compact ? 5 : 3} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((point, index) => (
        <g key={`${point.label}-${index}`}>
          <circle cx={point.x} cy={point.y} r={compact ? 4 : 5} fill="#fff" stroke={color} strokeWidth={compact ? 3 : 2.5}>
            <title>{`${point.title}：${point.value.toFixed(1)}${valueSuffix}`}</title>
          </circle>
          {point.questionCount !== undefined && point.accuracy !== undefined && (
            <circle
              cx={point.x}
              cy={point.y}
              r={14}
              fill="transparent"
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
              onFocus={() => setActiveIndex(index)}
              onBlur={() => setActiveIndex(null)}
              tabIndex={0}
              aria-label={`${point.title}，题量 ${point.questionCount} 题，${rateLabel} ${point.accuracy.toFixed(1)}%`}
            />
          )}
          {!compact && (
            <text x={point.x} y={height - 12} className="chart-label" textAnchor="middle">
              {point.label}
            </text>
          )}
        </g>
      ))}
      {tooltipPoint && tooltipPoint.questionCount !== undefined && tooltipPoint.accuracy !== undefined && (
        <g transform={`translate(${tooltipX}, ${tooltipY})`} pointerEvents="none">
          <rect width="100" height="38" rx="5" fill="#fff" stroke="#cbdad6" />
          <text x="50" y="15" textAnchor="middle" fill="#18302f" fontSize="10" fontFamily="Aptos, sans-serif">题量 {tooltipPoint.questionCount} 题</text>
          <text x="50" y="29" textAnchor="middle" fill="#18302f" fontSize="10" fontFamily="Aptos, sans-serif">{rateLabel} {tooltipPoint.accuracy.toFixed(1)}%</text>
        </g>
      )}
    </svg>
  );
}

