import { describe, it, expect } from "vitest";
import {
  getAreaSignalsToolDef,
  parseGetAreaSignalsArgs,
  executeGetAreaSignals,
} from "../../src/tools/get-area-signals.js";
import { OogaApiClient, OogaApiError, type OogaAreaProfile } from "../../src/api-client.js";

function sampleProfile(over: Partial<OogaAreaProfile> = {}): OogaAreaProfile {
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
        key: "crime.total_12m",
        category: "crime",
        label: "Recorded crimes (12 months)",
        value: 240,
        unit: "count",
        direction: "lower_is_better",
        confidence: 0.85,
        confidence_reason: "240 crimes across 12 months provides strong signal",
        source: "police.uk",
        observed_period: "Apr 2025 to Mar 2026",
      },
      {
        key: "deprivation.imd_decile",
        category: "deprivation",
        label: "Deprivation decile (1 most, 10 least)",
        value: 2,
        unit: "decile",
        normalized_value: 0.78,
        percentile: 92,
        direction: "higher_is_better",
        confidence: 1.0,
        confidence_reason: "Fresh IMD 2025 release, primary source",
        source: "MHCLG IMD 2025",
        observed_period: "IMD 2025",
      },
      {
        key: "property.median_price",
        category: "property",
        label: "Median sale price",
        value: 214000,
        unit: "GBP",
        direction: "neutral",
        confidence: 0.7,
        confidence_reason: "47 transactions in the LSOA, moderate sample",
        source: "HM Land Registry",
        observed_period: "Apr 2025 to Mar 2026",
      },
    ],
    meta: {
      engine_version: "1.0.0",
      generated_at: "2026-06-28T01:00:00Z",
      sources: ["police.uk", "MHCLG IMD 2025", "HM Land Registry"],
      fetch_mode: "hybrid",
    },
    ...over,
  };
}

describe("getAreaSignalsToolDef", () => {
  it("has the required MCP fields", () => {
    expect(getAreaSignalsToolDef.name).toBe("get_area_signals");
    expect(typeof getAreaSignalsToolDef.description).toBe("string");
    expect(getAreaSignalsToolDef.description.length).toBeGreaterThan(50);
    expect(getAreaSignalsToolDef.inputSchema.required).toEqual(["area"]);
    expect(getAreaSignalsToolDef.inputSchema.additionalProperties).toBe(false);
  });
});

describe("parseGetAreaSignalsArgs", () => {
  it("accepts a valid area", () => {
    expect(parseGetAreaSignalsArgs({ area: "M1 1AE" })).toEqual({ area: "M1 1AE" });
  });

  it("trims whitespace", () => {
    expect(parseGetAreaSignalsArgs({ area: "  M1 1AE  " })).toEqual({ area: "M1 1AE" });
  });

  it("rejects non-object input", () => {
    expect(() => parseGetAreaSignalsArgs(null)).toThrow();
    expect(() => parseGetAreaSignalsArgs("M1 1AE")).toThrow();
  });

  it("rejects empty area", () => {
    expect(() => parseGetAreaSignalsArgs({ area: "" })).toThrow(/area/);
    expect(() => parseGetAreaSignalsArgs({ area: "   " })).toThrow(/area/);
  });

  it("rejects area over 100 chars", () => {
    expect(() => parseGetAreaSignalsArgs({ area: "x".repeat(101) })).toThrow(/100/);
  });
});

describe("executeGetAreaSignals", () => {
  function makeClient(impl: (area: string) => Promise<unknown>): OogaApiClient {
    const client = new OogaApiClient({ apiKey: "oga_test" });
    (client as unknown as { getAreaSignals: (a: string) => Promise<unknown> }).getAreaSignals = impl;
    return client;
  }

  it("returns formatted text on success", async () => {
    const client = makeClient(async () => sampleProfile());
    const out = await executeGetAreaSignals(client, { area: "M1 1AE" });
    expect(out.isError).toBeFalsy();
    const text = out.content[0]!.text;
    expect(text).toContain("M1 1AE");
    expect(text).toContain("Engine version: 1.0.0");
    expect(text).toContain("Fetch mode: hybrid");
    expect(text).toContain("## crime");
    expect(text).toContain("## deprivation");
    expect(text).toContain("## property");
    expect(text).toContain("Recorded crimes (12 months)");
    expect(text).toContain("240 crimes across 12 months provides strong signal");
  });

  it("formats GBP values with the £ sign and comma separators", async () => {
    const client = makeClient(async () => sampleProfile());
    const out = await executeGetAreaSignals(client, { area: "M1 1AE" });
    expect(out.content[0]!.text).toContain("£214,000");
  });

  it("renders the percentile when present (store-backed)", async () => {
    const client = makeClient(async () => sampleProfile());
    const out = await executeGetAreaSignals(client, { area: "M1 1AE" });
    expect(out.content[0]!.text).toContain("92nd percentile");
  });

  it("renders the published rank and score behind a deprivation domain, and a rank alone", async () => {
    const domain = (key: string, detail: { rank?: number; score?: number }) => ({
      key, category: "deprivation" as const, label: key, value: 3, unit: "decile", direction: "higher_is_better" as const,
      confidence: 0.9, confidence_reason: "ok", source: "IMD 2025", observed_period: "IMD 2025", detail,
    });
    const profile = sampleProfile();
    profile.signals.push(domain("deprivation.income", { rank: 9000, score: 21.5 }), domain("deprivation.scotland.housing", { rank: 2790.5 }));
    const text = (await executeGetAreaSignals(makeClient(async () => profile), { area: "M1 1AE" })).content[0]!.text;
    expect(text).toContain("Published rank 9000 · score 21.5");
    expect(text).toContain("Published rank 2790.5\n");
  });

  it("says in its description that deprivation includes domain deciles with rank and score", () => {
    expect(getAreaSignalsToolDef.description).toContain("domain deciles");
  });

  it("renders per-signal source attribution", async () => {
    const client = makeClient(async () => sampleProfile());
    const out = await executeGetAreaSignals(client, { area: "M1 1AE" });
    expect(out.content[0]!.text).toContain("Source: police.uk · Apr 2025 to Mar 2026");
  });

  it("labels a load-dated period, and passes the chosen order to the API (AR-1007)", async () => {
    const calls: unknown[][] = [];
    const client = new OogaApiClient({ apiKey: "oga_test" });
    (client as unknown as { getAreaSignals: (...a: unknown[]) => Promise<unknown> }).getAreaSignals = async (...a) => {
      calls.push(a);
      const profile = sampleProfile() as { signals: Array<Record<string, unknown>> };
      profile.signals[1] = { ...profile.signals[1], observed_period: "2026-05-25", period_basis: "load" };
      return profile;
    };
    const out = await executeGetAreaSignals(client, parseGetAreaSignalsArgs({ area: "M1 1AE", sort: "period" }));
    expect(calls).toEqual([["M1 1AE", "period"]]);
    expect(out.content[0]!.text).toContain("· 2026-05-25 (date loaded; the source states no date)");
  });

  it("accepts only the three date orders", () => {
    expect(parseGetAreaSignalsArgs({ area: "M1 1AE" })).toEqual({ area: "M1 1AE" });
    expect(parseGetAreaSignalsArgs({ area: "M1 1AE", sort: "loaded" })).toEqual({ area: "M1 1AE", sort: "loaded" });
    expect(() => parseGetAreaSignalsArgs({ area: "M1 1AE", sort: "value" })).toThrow(/period, loaded, released/);
    expect(getAreaSignalsToolDef.inputSchema.properties.sort.enum).toEqual(["period", "loaded", "released"]);
  });

  it("renders the area-level Data sources section", async () => {
    const client = makeClient(async () => sampleProfile());
    const out = await executeGetAreaSignals(client, { area: "M1 1AE" });
    expect(out.content[0]!.text).toContain("## Data sources");
    expect(out.content[0]!.text).toContain("police.uk · MHCLG IMD 2025 · HM Land Registry");
  });

  it("handles a profile with no signals gracefully", async () => {
    const client = makeClient(async () => sampleProfile({ signals: [], meta: { ...sampleProfile().meta, sources: [] } }));
    const out = await executeGetAreaSignals(client, { area: "M1 1AE" });
    expect(out.content[0]!.text).toContain("No signals returned");
  });

  it("returns isError + readable message on auth failure", async () => {
    const client = makeClient(async () => {
      throw new OogaApiError("Invalid or revoked API key", 401);
    });
    const out = await executeGetAreaSignals(client, { area: "M1 1AE" });
    expect(out.isError).toBe(true);
    expect(out.content[0]!.text).toContain("HTTP 401");
  });

  it("returns isError on unexpected error", async () => {
    const client = makeClient(async () => {
      throw new Error("Network exploded");
    });
    const out = await executeGetAreaSignals(client, { area: "M1 1AE" });
    expect(out.isError).toBe(true);
    expect(out.content[0]!.text).toContain("Network exploded");
  });
});
