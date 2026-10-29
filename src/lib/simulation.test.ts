import { describe, expect, it } from "vitest";
import { createDemoRecords } from "../data/demo";
import { createSimulationRecordName, normalizeSimulationSources, simulationMetadataForEditing, withSimulationSources } from "./simulation";

describe("simulation names and sources", () => {
  it("concatenates a source and optional description without extra separators", () => {
    expect(createSimulationRecordName(" 广东 ", " 2026 ")).toBe("广东2026");
    expect(createSimulationRecordName("粉笔", "2026上半年33")).toBe("粉笔2026上半年33");
    expect(createSimulationRecordName("粉笔", "上半年 第33套")).toBe("粉笔上半年 第33套");
    expect(createSimulationRecordName("国考")).toBe("国考");
    expect(createSimulationRecordName("国考", " ")).toBe("国考");
  });

  it("defaults only missing source lists and preserves an explicitly empty list", () => {
    expect(normalizeSimulationSources(undefined)).toEqual(["广东", "国考", "粉笔"]);
    expect(normalizeSimulationSources([])).toEqual([]);
    expect(normalizeSimulationSources([" 广东 ", "自定义机构"])).toEqual(["广东", "自定义机构"]);
    const data = { records: [], practiceRecords: [] };
    expect(withSimulationSources(data, ["四川"]).simulationSources).toEqual(["四川"]);
    expect(withSimulationSources({ ...data, simulationSources: [] }, ["四川"]).simulationSources).toEqual([]);
  });

  it("rejects malformed, empty and duplicate source names", () => {
    for (const sources of [null, "广东", [""], [" "], [1], ["广东", " 广东 "]]) {
      expect(() => normalizeSimulationSources(sources)).toThrow();
    }
  });

  it("combines legacy year and paper metadata once without mutating the original", () => {
    const original = { ...createDemoRecords()[0], type: "省考", region: "广东", paperNo: "上半年33" };
    const edited = simulationMetadataForEditing(original);
    expect(edited.type).toBe("广东");
    expect(edited.paperNo).toBe("2026上半年33");
    expect(edited.year).toBeUndefined();
    expect(edited.region).toBeUndefined();
    expect(simulationMetadataForEditing(edited)).toEqual(edited);
    expect(original.region).toBe("广东");
    expect(original.year).toBe("2026");
    expect(simulationMetadataForEditing({ ...original, type: "国考", region: "全国" }).type).toBe("国考");
  });
});
