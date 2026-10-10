import { describe, it, expect } from "vitest";
import {
  comparePostcodesToolDef,
  parseComparePostcodesArgs,
  formatComparisonAsText,
  executeComparePostcodes,
} from "../../src/tools/compare-postcodes.js";
import { OogaApiClient, OogaApiError, type OogaScoreResponse } from "../../src/api-client.js";

/* Helper: build a minimal OogaScoreResponse for tests. */
function makeResult(over: Partial<OogaScoreResponse>): OogaScoreResponse {
  return {
    area: "X",
    preset: "moving",
    score: 50,
    engine_version: "1.0.0",
    area_type: "urban",
    confidence: 0.7,
    weights_source: "preset",
    dimensions: [],
    ...over,
  };
}

describe("comparePostcodesToolDef", () => {
  it("declares areas as array with min 2 / max 8", () => {
    expect(comparePostcodesToolDef.inputSchema.properties.areas.minItems).toBe(2);
    expect(comparePostcodesToolDef.inputSchema.properties.areas.maxItems).toBe(8);
  });

  it("requires both areas and preset", () => {
    expect(comparePostcodesToolDef.inputSchema.required).toEqual(["areas", "preset"]);
  });
});

describe("parseComparePostcodesArgs", () => {
  it("accepts valid args", () => {
    expect(parseComparePostcodesArgs({ areas: ["M1 1AE", "SW4 0LG"], preset: "moving" })).toEqual({
      areas: ["M1 1AE", "SW4 0LG"],
      preset: "moving",
    });
  });

  it("trims each area", () => {
    const out = parseComparePostcodesArgs({ areas: ["  M1 1AE  ", "SW4 0LG"], preset: "moving" });
    expect(out.areas).toEqual(["M1 1AE", "SW4 0LG"]);
  });

  it("rejects fewer than 2 areas", () => {
    expect(() => parseComparePostcodesArgs({ areas: ["M1 1AE"], preset: "moving" })).toThrow(/at least 2/);
  });

  it("rejects more than 8 areas", () => {
    const tooMany = Array(9).fill("M1 1AE");
    expect(() => parseComparePostcodesArgs({ areas: tooMany, preset: "moving" })).toThrow(/at most 8/);
  });

  it("rejects empty area in array", () => {
    expect(() => parseComparePostcodesArgs({ areas: ["M1 1AE", ""], preset: "moving" })).toThrow();
  });

  it("rejects unsupported preset", () => {
    expect(() =>
      parseComparePostcodesArgs({ areas: ["M1 1AE", "SW4 0LG"], preset: "garbage" }),
    ).toThrow(/preset/);
  });

  it("rejects non-array areas", () => {
    expect(() =>
      parseComparePostcodesArgs({ areas: "M1 1AE", preset: "moving" }),
    ).toThrow(/array/);
  });
});

describe("formatComparisonAsText", () => {
  it("sorts successful results by descending score", () => {
    const text = formatComparisonAsText(
      [
        { area: "A", score: 70, result: makeResult({ area: "A", score: 70, summary: "Lower." }), error: null },
        { area: "B", score: 90, result: makeResult({ area: "B", score: 90, summary: "Higher." }), error: null },
      ],
      "moving",
    );
    const bRow = text.indexOf("| 1 | B |");
    const aRow = text.indexOf("| 2 | A |");
    expect(bRow).toBeGreaterThan(-1);
    expect(aRow).toBeGreaterThan(bRow);
  });

  it("places errors at the bottom", () => {
    const text = formatComparisonAsText(
      [
        { area: "BAD", score: null, result: null, error: "404" },
        { area: "A", score: 50, result: makeResult({ area: "A", score: 50, summary: "OK." }), error: null },
      ],
      "moving",
    );
    const aIdx = text.indexOf("| 1 | A |");
    const errIdx = text.indexOf("BAD | ERROR");
    expect(aIdx).toBeLessThan(errIdx);
  });

  it("renders the engine-grounded summary per area", () => {
    const text = formatComparisonAsText(
      [
        { area: "A", score: 80, result: makeResult({ area: "A", score: 80, summary: "Strong urban with high confidence." }), error: null },
      ],
      "investing",
    );
    expect(text).toContain("Strong urban with high confidence");
  });

  it("includes engine version footer when first success has it", () => {
    const text = formatComparisonAsText(
      [
        { area: "A", score: 80, result: makeResult({ area: "A", score: 80, summary: "." }), error: null },
      ],
      "investing",
    );
    expect(text).toContain("Engine version: 1.0.0");
  });

  it("shows top dimension in the comparison row", () => {
    const text = formatComparisonAsText(
      [
        {
          area: "A",
          score: 70,
          result: makeResult({
            area: "A",
            score: 70,
            summary: "ok",
            dimensions: [
              { key: "a", label: "Safety", score: 80, weight: 20, confidence: 0.9, reasoning: "r", confidence_reason: "cr" },
              { key: "b", label: "Cost", score: 60, weight: 20, confidence: 0.9, reasoning: "r", confidence_reason: "cr" },
            ],
          }),
          error: null,
        },
      ],
      "moving",
    );
    expect(text).toContain("Safety (80/100)");
  });
});

describe("executeComparePostcodes", () => {
  function makeClient(impl: (area: string) => Promise<unknown>): OogaApiClient {
    const client = new OogaApiClient({ apiKey: "oga_test" });
    (client as unknown as { scoreArea: (a: string) => Promise<unknown> }).scoreArea = impl;
    return client;
  }

  it("returns combined comparison text on full success", async () => {
    const client = makeClient(async (p) =>
      makeResult({ area: p, preset: "moving", score: p === "M1 1AE" ? 84 : 71, summary: `${p} summary.` }),
    );

    const out = await executeComparePostcodes(client, {
      areas: ["M1 1AE", "SW4 0LG"],
      preset: "moving",
    });
    expect(out.isError).toBeFalsy();
    expect(out.content[0]!.text).toContain("M1 1AE");
    expect(out.content[0]!.text).toContain("SW4 0LG");
    expect(out.content[0]!.text).toContain("84/100");
  });

  it("returns partial success when some calls fail", async () => {
    const client = makeClient(async (p) => {
      if (p === "BAD") throw new OogaApiError("Invalid area", 400);
      return makeResult({ area: p, preset: "moving", score: 70, summary: "ok" });
    });

    const out = await executeComparePostcodes(client, {
      areas: ["M1 1AE", "BAD"],
      preset: "moving",
    });
    expect(out.isError).toBeFalsy(); // partial success isn't isError
    expect(out.content[0]!.text).toContain("M1 1AE");
    expect(out.content[0]!.text).toContain("HTTP 400");
  });

  it("flags isError when ALL calls fail", async () => {
    const client = makeClient(async () => {
      throw new OogaApiError("Quota exceeded", 403);
    });

    const out = await executeComparePostcodes(client, {
      areas: ["A", "B"],
      preset: "moving",
    });
    expect(out.isError).toBe(true);
    expect(out.content[0]!.text).toContain("HTTP 403");
  });
});
