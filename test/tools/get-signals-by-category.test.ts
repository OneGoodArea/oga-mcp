import { describe, it, expect } from "vitest";
import {
  getSignalsByCategoryToolDef,
  parseGetSignalsByCategoryArgs,
  executeGetSignalsByCategory,
} from "../../src/tools/get-signals-by-category.js";
import { OogaApiClient, OogaApiError, SIGNAL_CATEGORIES, type OogaAreaProfile, type SignalCategory } from "../../src/api-client.js";

function profileForCategory(category: SignalCategory): OogaAreaProfile {
  return {
    geo: {
      query: "M1 1AE",
      postcode: "M1 1AE",
      latitude: 53.480,
      longitude: -2.242,
      lsoa: "E01005132",
      msoa: "E02001074",
      admin_district: "Manchester",
      region: "North West",
      country: "England",
      area_type: "urban",
    },
    signals: [
      {
        key: `${category}.test`,
        category,
        label: `${category} test signal`,
        value: 42,
        unit: "count",
        direction: "lower_is_better",
        confidence: 0.85,
        confidence_reason: "Strong sample for this category",
        source: "Test source",
        observed_period: "Apr 2025 to Mar 2026",
      },
    ],
    meta: {
      engine_version: "1.0.0",
      generated_at: "2026-06-28T01:00:00Z",
      sources: ["Test source"],
      fetch_mode: "live",
    },
  };
}

describe("getSignalsByCategoryToolDef", () => {
  it("has the required MCP fields", () => {
    expect(getSignalsByCategoryToolDef.name).toBe("get_signals_by_category");
    expect(getSignalsByCategoryToolDef.inputSchema.required).toEqual(["area", "category"]);
    expect(getSignalsByCategoryToolDef.inputSchema.additionalProperties).toBe(false);
  });

  it("enumerates all seven signal categories", () => {
    expect(getSignalsByCategoryToolDef.inputSchema.properties.category.enum).toEqual(SIGNAL_CATEGORIES);
  });
});

describe("parseGetSignalsByCategoryArgs", () => {
  it("accepts valid args", () => {
    expect(parseGetSignalsByCategoryArgs({ area: "M1 1AE", category: "crime" })).toEqual({
      area: "M1 1AE",
      category: "crime",
    });
  });

  it("trims the area", () => {
    const out = parseGetSignalsByCategoryArgs({ area: "  M1 1AE  ", category: "amenities" });
    expect(out.area).toBe("M1 1AE");
  });

  it("rejects unknown category", () => {
    expect(() => parseGetSignalsByCategoryArgs({ area: "M1 1AE", category: "wonderful" })).toThrow(/category/);
  });

  it("rejects empty area", () => {
    expect(() => parseGetSignalsByCategoryArgs({ area: "", category: "crime" })).toThrow(/area/);
  });

  it("rejects area over 100 chars", () => {
    expect(() => parseGetSignalsByCategoryArgs({ area: "x".repeat(101), category: "crime" })).toThrow(/100/);
  });

  it("rejects non-object input", () => {
    expect(() => parseGetSignalsByCategoryArgs(null)).toThrow();
  });
});

describe("executeGetSignalsByCategory", () => {
  function makeClient(impl: (area: string, category: SignalCategory) => Promise<unknown>): OogaApiClient {
    const client = new OogaApiClient({ apiKey: "oga_test" });
    (client as unknown as { getSignalsByCategory: (a: string, c: SignalCategory) => Promise<unknown> }).getSignalsByCategory = impl;
    return client;
  }

  it("renders the category in the headline and skips other-category section headers", async () => {
    const client = makeClient(async (_a, c) => profileForCategory(c));
    const out = await executeGetSignalsByCategory(client, { area: "M1 1AE", category: "crime" });
    expect(out.isError).toBeFalsy();
    const text = out.content[0]!.text;
    expect(text).toContain("M1 1AE");
    expect(text).toContain("(crime)");
    /* With a single-category restriction the per-category H2 is skipped */
    expect(text).not.toContain("## crime");
    expect(text).toContain("crime test signal");
    expect(text).toContain("Strong sample for this category");
  });

  it("forwards the chosen category to the API client", async () => {
    let capturedCategory: SignalCategory | null = null;
    const client = makeClient(async (_a, c) => {
      capturedCategory = c;
      return profileForCategory(c);
    });
    await executeGetSignalsByCategory(client, { area: "M1 1AE", category: "schools" });
    expect(capturedCategory).toBe("schools");
  });

  it("returns isError on auth failure", async () => {
    const client = makeClient(async () => {
      throw new OogaApiError("Invalid or revoked API key", 401);
    });
    const out = await executeGetSignalsByCategory(client, { area: "M1 1AE", category: "crime" });
    expect(out.isError).toBe(true);
    expect(out.content[0]!.text).toContain("HTTP 401");
  });
});
