import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createDemoRecords } from "../data/demo";
import { createSimulationAttempt } from "../lib/scoring";
import { SimulationModuleDetails } from "./SimulationModuleDetails";

describe("simulation question-type details", () => {
  it("renders the real logic score, all reasoning trends and missing historical details", () => {
    const records = createDemoRecords().slice(0, 2);
    records[1].modules.reasoning = createSimulationAttempt("reasoning", { logic: 2 });
    const html = renderToStaticMarkup(createElement(SimulationModuleDetails, { records, moduleKey: "reasoning", windowSize: 3 }));
    expect(html).toContain("16.90");
    expect(html).toContain("13 对 / 2 错");
    expect(html).toContain("1 套历史试卷未录入子题型明细");
    for (const name of ["图形推理", "逻辑判断", "科学推理"]) expect(html).toContain(`${name}得分率趋势`);
    expect(html).not.toMatch(/NaN|Infinity/);
  });

  it("switches the breakdown to the selected module and excludes exams outside the window", () => {
    const records = createDemoRecords().slice(0, 4);
    for (const record of records) record.modules.politics = createSimulationAttempt("politics");
    const html = renderToStaticMarkup(createElement(SimulationModuleDetails, { records, moduleKey: "politics", windowSize: 3 }));
    expect(html).not.toContain(records[0].name);
    expect(html).not.toContain("逻辑判断");
    expect(html.indexOf("判断题")).toBeLessThan(html.indexOf("单选题"));
    expect(html.indexOf("单选题")).toBeLessThan(html.indexOf("多选题"));
    expect(html).toContain("100.0");
  });

  it("keeps single-type modules in their original module view without a duplicate breakdown", () => {
    for (const moduleKey of ["common", "data"] as const) {
      const records = createDemoRecords().slice(0, 2);
      expect(renderToStaticMarkup(createElement(SimulationModuleDetails, { records, moduleKey, windowSize: 3 }))).toBe("");
      records[1].modules[moduleKey] = createSimulationAttempt(moduleKey);
      expect(renderToStaticMarkup(createElement(SimulationModuleDetails, { records, moduleKey, windowSize: 3 }))).toBe("");
    }
  });
});
