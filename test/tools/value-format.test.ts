import { describe, it, expect } from "vitest";
import { formatPercentile, formatValue, monthText, ordinal } from "../../src/tools/value-format.js";

describe("value-format (AR-974)", () => {
  it("writes every unit in words, never the raw code", () => {
    expect(formatValue({ value: 1935, unit: "count" })).toBe("1,935");
    expect(formatValue({ value: 161, unit: "per_month" })).toBe("161.0 a month");
    expect(formatValue({ value: 380000, unit: "GBP" })).toBe("£380,000");
    expect(formatValue({ value: 16.9, unit: "pct" })).toBe("16.9%");
    expect(formatValue({ value: 2, unit: "decile" })).toBe("2 of 10");
    expect(formatValue({ value: 603.6, unit: "per_1000" })).toBe("603.6 per 1,000 residents");
    expect(formatValue({ value: 1.2856, unit: "z_score" })).toBe("1.29 standard deviations");
    expect(formatValue({ value: null, unit: "count" })).toBe("n/a");
  });

  it("writes ordinals correctly and rounds percentiles", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st"]);
    expect(formatPercentile(68.89)).toBe("69th percentile");
  });

  it("writes a month in words", () => {
    expect(monthText("2026-06")).toBe("Jun 2026");
    expect(monthText("Year ending Sep 2025")).toBe("Year ending Sep 2025");
  });
});
