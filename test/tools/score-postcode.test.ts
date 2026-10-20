import { describe, it, expect } from "vitest";
import {
  scorePostcodeToolDef,
  parseScorePostcodeArgs,
  formatScoreResultAsText,
  executeScorePostcode,
} from "../../src/tools/score-postcode.js";
import { OogaApiClient, OogaApiError, type OogaScoreResponse } from "../../src/api-client.js";

describe("scorePostcodeToolDef (MCP tool definition)", () => {
  it("has the required MCP fields", () => {
    expect(scorePostcodeToolDef.name).toBe("score_postcode");
    expect(typeof scorePostcodeToolDef.description).toBe("string");
    expect(scorePostcodeToolDef.description.length).toBeGreaterThan(50);
    expect(scorePostcodeToolDef.inputSchema.type).toBe("object");
  });

  it("requires area and preset", () => {
    expect(scorePostcodeToolDef.inputSchema.required).toEqual(["area", "preset"]);
  });

  it("preset enum matches the four supported values", () => {
    expect(scorePostcodeToolDef.inputSchema.properties.preset.enum).toEqual([
      "moving",
      "business",
      "investing",
      "research",
    ]);
  });

  it("rejects additional properties so the LLM can't pass random extras", () => {
    expect(scorePostcodeToolDef.inputSchema.additionalProperties).toBe(false);
  });
});

describe("parseScorePostcodeArgs", () => {
  it("accepts valid args", () => {
    expect(parseScorePostcodeArgs({ area: "M1 1AE", preset: "moving" })).toEqual({
      area: "M1 1AE",
      preset: "moving",
    });
  });

  it("trims whitespace from area", () => {
    expect(parseScorePostcodeArgs({ area: "  M1 1AE  ", preset: "investing" }).area).toBe(
      "M1 1AE",
    );
  });

  it("rejects non-object input", () => {
    expect(() => parseScorePostcodeArgs(null)).toThrow();
    expect(() => parseScorePostcodeArgs("M1 1AE")).toThrow();
  });

  it("rejects empty area", () => {
    expect(() => parseScorePostcodeArgs({ area: "", preset: "moving" })).toThrow(/area/);
    expect(() => parseScorePostcodeArgs({ area: "   ", preset: "moving" })).toThrow(/area/);
  });

  it("rejects area over 100 chars", () => {
    expect(() =>
      parseScorePostcodeArgs({ area: "x".repeat(101), preset: "moving" }),
    ).toThrow(/100/);
  });

  it("rejects unsupported preset", () => {
    expect(() =>
      parseScorePostcodeArgs({ area: "M1 1AE", preset: "origination" }),
    ).toThrow(/preset/);
    expect(() =>
      parseScorePostcodeArgs({ area: "M1 1AE", preset: 42 }),
    ).toThrow(/preset/);
  });
});

describe("formatScoreResultAsText", () => {
  const sample: OogaScoreResponse = {
    area: "Manchester",
    preset: "moving",
    score: 84,
    engine_version: "1.0.0",
    area_type: "suburban",
    confidence: 0.85,
    weights_source: "preset",
    dimensions: [
      {
        key: "safety_crime",
        label: "Safety & Crime",
        score: 80,
        weight: 25,
        confidence: 0.85,
        reasoning: "12 violent crimes per 1k residents over 12 months, below the urban benchmark.",
        confidence_reason: "240 crimes across 12 months provides strong signal",
      },
      {
        key: "schools_education",
        label: "Schools & Education",
        score: 95,
        weight: 20,
        confidence: 1.0,
        reasoning: "25 Ofsted-rated schools within 1.5km (5 Outstanding, 15 Good, 5 Requires Improvement).",
        confidence_reason: "Dense Ofsted coverage with multiple outstanding schools",
      },
    ],
    summary: "84/100: strong for a suburban area, with high confidence. Strongest on Schools & Education (95/100); weakest on Safety & Crime (80/100).",
    recommendations: [],
    data_sources: ["postcodes.io (geocoding)", "police.uk crime archive", "Ofsted school inspections (DfE)"],
  };

  it("renders headline with score and preset", () => {
    const text = formatScoreResultAsText(sample);
    expect(text).toContain("Manchester · moving · 84/100");
  });

  it("includes engine version", () => {
    expect(formatScoreResultAsText(sample)).toContain("Engine version: 1.0.0");
  });

  it("says the area type is unavailable instead of printing null (AR-1036)", () => {
    const text = formatScoreResultAsText({ ...sample, area_type: null });
    expect(text).toContain("Area type: unavailable (ranked among all GB neighbourhoods)");
    expect(text).not.toContain("null");
  });

  it("includes confidence on dimensions", () => {
    expect(formatScoreResultAsText(sample)).toContain("confidence 85%");
    expect(formatScoreResultAsText(sample)).toContain("confidence 100%");
  });

  it("renders the engine-grounded reasoning on each dimension", () => {
    const text = formatScoreResultAsText(sample);
    expect(text).toContain("12 violent crimes per 1k residents");
    expect(text).toContain("25 Ofsted-rated schools");
  });

  it("renders the confidence reason on each dimension", () => {
    const text = formatScoreResultAsText(sample);
    expect(text).toContain("240 crimes across 12 months provides strong signal");
  });

  it("renders the server-composed summary when present", () => {
    const text = formatScoreResultAsText(sample);
    expect(text).toContain("## Summary");
    expect(text).toContain("Strongest on Schools & Education");
  });

  it("omits summary section when missing (non-explain mode)", () => {
    const text = formatScoreResultAsText({ ...sample, summary: undefined });
    expect(text).not.toContain("## Summary");
  });

  it("includes recommendations when present", () => {
    const text = formatScoreResultAsText({ ...sample, recommendations: ["Visit before deciding", "Compare against Salford"] });
    expect(text).toContain("## Recommendations");
    expect(text).toContain("Visit before deciding");
  });

  it("omits recommendations section when empty", () => {
    expect(formatScoreResultAsText(sample)).not.toContain("## Recommendations");
  });

  it("includes data sources joined with separator", () => {
    expect(formatScoreResultAsText(sample)).toContain("postcodes.io (geocoding) · police.uk crime archive · Ofsted school inspections (DfE)");
  });
});

describe("executeScorePostcode", () => {
  function makeClient(scoreAreaImpl: () => Promise<unknown>): OogaApiClient {
    const client = new OogaApiClient({ apiKey: "oga_test" });
    // Replace the network method with a stub
    (client as unknown as { scoreArea: () => Promise<unknown> }).scoreArea = scoreAreaImpl;
    return client;
  }

  const minimal: OogaScoreResponse = {
    area: "Manchester",
    preset: "moving",
    score: 84,
    engine_version: "1.0.0",
    area_type: "suburban",
    confidence: 0.85,
    weights_source: "preset",
    dimensions: [],
    summary: "Strong fit.",
    recommendations: [],
    data_sources: ["postcodes.io (geocoding)"],
  };

  it("returns formatted text on success", async () => {
    const client = makeClient(async () => minimal);

    const out = await executeScorePostcode(client, { area: "M1 1AE", preset: "moving" });
    expect(out.isError).toBeFalsy();
    expect(out.content[0]!.type).toBe("text");
    expect(out.content[0]!.text).toContain("Manchester");
    expect(out.content[0]!.text).toContain("84/100");
  });

  it("returns isError + readable message on API auth failure", async () => {
    const client = makeClient(async () => {
      throw new OogaApiError("Invalid or revoked API key", 401);
    });

    const out = await executeScorePostcode(client, { area: "M1 1AE", preset: "moving" });
    expect(out.isError).toBe(true);
    expect(out.content[0]!.text).toContain("HTTP 401");
    expect(out.content[0]!.text).toContain("Invalid or revoked API key");
  });

  it("renders a nation refusal as an answer, never a score (AR-1219)", async () => {
    const message = "BT1 1AA is in Northern Ireland which OneGoodArea does not cover. Coverage is England, Wales and Scotland.";
    const client = makeClient(async () => {
      throw new OogaApiError(message, 422, { error: message, code: "nation_not_covered", reason: "nation_not_covered", source: "area_resolution" });
    });

    const out = await executeScorePostcode(client, { area: "BT1 1AA", preset: "research" });
    expect(out.isError).toBeFalsy();
    expect(out.content[0]!.text).toBe(`Not found (nation_not_covered): ${message}`);
  });

  it("returns isError + readable message on quota exceeded (HTTP 403)", async () => {
    const client = makeClient(async () => {
      throw new OogaApiError("Monthly API call limit reached", 403);
    });

    const out = await executeScorePostcode(client, { area: "M1 1AE", preset: "moving" });
    expect(out.isError).toBe(true);
    expect(out.content[0]!.text).toContain("HTTP 403");
  });

  it("returns isError on unexpected error type", async () => {
    const client = makeClient(async () => {
      throw new Error("Network exploded");
    });

    const out = await executeScorePostcode(client, { area: "M1 1AE", preset: "moving" });
    expect(out.isError).toBe(true);
    expect(out.content[0]!.text).toContain("Network exploded");
  });
});
