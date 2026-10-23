import { describe, expect, it } from "vitest";
import { createDemoRecords } from "../data/demo";
import { buildDiagnostics, standardDeviation } from "./analytics";

describe("analytics", () => {
  it("calculates population standard deviation", () => {
    expect(standardDeviation([50, 60, 70])).toBeCloseTo(8.1649658);
  });

  it("waits for a full previous window before diagnosing decline", () => {
    const diagnostics = buildDiagnostics(createDemoRecords().slice(0, 5), 5);
    expect(diagnostics[1].available).toBe(false);
    expect(diagnostics[1].message).toContain("10 套");
  });

  it("finds declining and unstable modules with enough data", () => {
    const diagnostics = buildDiagnostics(createDemoRecords(), 5);
    expect(diagnostics[1].available).toBe(true);
    expect(diagnostics[1].moduleKey).toBe("verbal");
    expect(diagnostics[2].available).toBe(true);
    expect(diagnostics[2].moduleKey).toBe("quantitative");
  });
});
