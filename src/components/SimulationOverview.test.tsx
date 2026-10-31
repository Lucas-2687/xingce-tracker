import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MODULES } from "../constants";
import { createDemoRecords } from "../data/demo";
import { SimulationOverview } from "./SimulationOverview";

function recordWithScore(index: number, score: number) {
  const record = createDemoRecords()[index];
  for (const module of MODULES) record.modules[module.key] = { correct: score, wrong: 100 - score, unanswered: 0 };
  return record;
}

const render = (records: ReturnType<typeof createDemoRecords>, windowSize = 3) =>
  renderToStaticMarkup(createElement(SimulationOverview, { records, windowSize }));

describe("simulation window overview", () => {
  it("uses the selected window for the headline mean, reference line and trend", () => {
    const records = [recordWithScore(0, 100), recordWithScore(1, 70), recordWithScore(2, 80), recordWithScore(3, 90)];
    const html = render([...records].reverse());
    expect(html).toContain('<output aria-label="窗口均分">80.0</output>');
    expect(html).toContain("窗口均分 80.0分");
    expect(html).not.toContain(records[0].name);
    for (const record of records.slice(1)) expect(html).toContain(record.name);
    expect(render(records, 2)).toContain('<output aria-label="窗口均分">85.0</output>');
  });

  it("shows a genuine zero mean with a single exam", () => {
    const html = render([recordWithScore(0, 0)], 5);
    expect(html).toContain('<output aria-label="窗口均分">0.0</output>');
    expect(html).not.toMatch(/NaN|Infinity/);
  });

  it("shows an empty overview without inventing a score or reference line", () => {
    const html = render([]);
    expect(html).toContain('<output aria-label="窗口均分">—</output>');
    expect(html).toContain("录入数据后显示趋势");
    expect(html).not.toContain("chart-reference");
    expect(html).not.toMatch(/NaN|Infinity/);
  });
});
