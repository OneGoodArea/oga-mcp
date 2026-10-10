import { describe, it, expect, vi } from "vitest";
import {
  areaBriefToolDef,
  parseAreaBriefArgs,
  executeAreaBrief,
} from "../../src/tools/area-brief.js";
import {
  OogaApiClient,
  OogaApiError,
  type OogaAreaProfile,
  type OogaScoreResponse,
  type Preset,
} from "../../src/api-client.js";
import { AUDIENCES, getAudienceConfig, type Audience } from "../../src/tools/area-brief-audiences.js";
import { formatAreaBriefAsText } from "../../src/tools/area-brief-format.js";

/* ── Sample fixtures ─────────────────────────────────────────────── */

function sampleProfile(): OogaAreaProfile {
  return {
    geo: {
      query: "M1 1AE",
      postcode: "M1 1AE",
      latitude: 53.48,
      longitude: -2.24,
      lsoa: "E01005132",
      msoa: "E02001074",
      admin_district: "Manchester",
      region: "North West",
      country: "England",
      area_type: "urban",
    },
    signals: [
      {
        key: "property.median_price",
        category: "property",
        label: "Median sale price",
        value: 214000,
        unit: "GBP",
        direction: "neutral",
        confidence: 0.85,
        confidence_reason: "47 transactions provides moderate sample",
        source: "HM Land Registry",
        observed_period: "Apr 2025 to Mar 2026",
      },
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
        key: "environment.flood_areas_nearby",
        category: "environment",
        label: "Flood-risk areas nearby",
        value: 2,
        unit: "count",
        direction: "lower_is_better",
        confidence: 1.0,
        confidence_reason: "Live Environment Agency data",
        source: "Environment Agency",
        observed_period: "Live",
      },
      {
        key: "amenities.total",
        category: "amenities",
        label: "Amenities nearby (total)",
        value: 142,
        unit: "count",
        direction: "higher_is_better",
        confidence: 0.85,
        confidence_reason: "Dense OSM coverage",
        source: "OpenStreetMap",
        observed_period: "Live",
      },
      {
        key: "transport.stations",
        category: "transport",
        label: "Transport stations nearby",
        value: 3,
        unit: "count",
        direction: "higher_is_better",
        confidence: 0.85,
        confidence_reason: "3 stations in 1.5km radius",
        source: "OpenStreetMap",
        observed_period: "Live",
      },
    ],
    meta: {
      engine_version: "1.0.0",
      generated_at: "2026-06-28T01:00:00Z",
      sources: ["HM Land Registry", "police.uk", "Environment Agency", "OpenStreetMap"],
      fetch_mode: "hybrid",
    },
  };
}

function sampleScore(preset: Preset, dimensions: Array<{ label: string; score: number; weight: number }>): OogaScoreResponse {
  return {
    area: "M1 1AE",
    preset,
    score: 73,
    area_type: "urban",
    dimensions: dimensions.map((d) => ({
      key: d.label.toLowerCase().replace(/\s+/g, "_"),
      label: d.label,
      score: d.score,
      weight: d.weight,
      confidence: 0.85,
      reasoning: `${d.label} scored ${d.score} from underlying signals`,
      confidence_reason: "Strong sample",
    })),
    confidence: 0.85,
    weights_source: "preset",
    engine_version: "1.0.0",
    summary: `73/100: above-average for an urban area, with high confidence.`,
    recommendations: ["Cost of Living confidence is medium: 47 transactions. Treat as indicative."],
    data_sources: ["postcodes.io (geocoding)", "MHCLG IMD 2025", "HM Land Registry"],
  };
}

function makeClient(profile: OogaAreaProfile, score: OogaScoreResponse): OogaApiClient {
  const client = new OogaApiClient({ apiKey: "oga_test" });
  (client as unknown as { getAreaSignals: () => Promise<OogaAreaProfile> }).getAreaSignals = async () => profile;
  (client as unknown as { scoreArea: () => Promise<OogaScoreResponse> }).scoreArea = async () => score;
  return client;
}

/* ── Tool definition + parser ────────────────────────────────────── */

describe("areaBriefToolDef", () => {
  it("has the required MCP fields", () => {
    expect(areaBriefToolDef.name).toBe("area_brief");
    expect(areaBriefToolDef.inputSchema.required).toEqual(["area", "audience"]);
    expect(areaBriefToolDef.inputSchema.additionalProperties).toBe(false);
  });

  it("enumerates all four audiences", () => {
    expect(areaBriefToolDef.inputSchema.properties.audience.enum).toEqual(AUDIENCES);
    expect(AUDIENCES).toEqual(["lender", "insurer", "retailer", "investor"]);
  });
});

describe("parseAreaBriefArgs", () => {
  it("accepts valid args", () => {
    expect(parseAreaBriefArgs({ area: "M1 1AE", audience: "lender" })).toEqual({
      area: "M1 1AE",
      audience: "lender",
    });
  });

  it("trims area", () => {
    expect(parseAreaBriefArgs({ area: "  M1 1AE  ", audience: "investor" }).area).toBe("M1 1AE");
  });

  it("rejects empty area", () => {
    expect(() => parseAreaBriefArgs({ area: "", audience: "lender" })).toThrow(/area/);
  });

  it("rejects area > 100 chars", () => {
    expect(() => parseAreaBriefArgs({ area: "x".repeat(101), audience: "lender" })).toThrow(/100/);
  });

  it("rejects unknown audience", () => {
    expect(() => parseAreaBriefArgs({ area: "M1 1AE", audience: "homebuyer" })).toThrow(/audience/);
  });

  it("rejects non-object input", () => {
    expect(() => parseAreaBriefArgs(null)).toThrow();
  });
});

/* ── Per-audience renders prove the config shapes output ─────────── */

describe("formatAreaBriefAsText: audience-shaped sections", () => {
  it("lender brief uses moving preset + cost/risk/long-term sections", () => {
    const config = getAudienceConfig("lender");
    expect(config.preset).toBe("moving");

    const score = sampleScore("moving", [
      { label: "Safety", score: 78, weight: 25 },
      { label: "Schools", score: 82, weight: 20 },
      { label: "Transport", score: 70, weight: 20 },
      { label: "Amenities", score: 75, weight: 15 },
      { label: "Cost of Living", score: 62, weight: 20 },
    ]);
    const text = formatAreaBriefAsText(config, sampleProfile(), score);
    expect(text).toContain("# Lender brief · M1 1AE");
    expect(text).toContain("Residential mortgage origination");
    expect(text).toContain("## Affordability & cost");
    expect(text).toContain("## Borrower-side risk");
    expect(text).toContain("## Long-term value drivers");
    expect(text).toContain("Median sale price");
    expect(text).toContain("Recorded crimes (12 months)");
    expect(text).toContain("Flood-risk areas nearby");
  });

  it("insurer brief uses investing preset + hazard/crime/stock sections", () => {
    const config = getAudienceConfig("insurer");
    expect(config.preset).toBe("investing");

    const score = sampleScore("investing", [
      { label: "Price Growth", score: 70, weight: 25 },
      { label: "Risk Factors", score: 65, weight: 25 },
      { label: "Safety", score: 78, weight: 20 },
    ]);
    const text = formatAreaBriefAsText(config, sampleProfile(), score);
    expect(text).toContain("# Insurer brief");
    expect(text).toContain("## Physical hazard");
    expect(text).toContain("## Crime profile");
    expect(text).toContain("## Building stock & market signals");
    expect(text).not.toContain("## Affordability & cost"); // belongs to lender, not insurer
  });

  it("retailer brief uses business preset + catchment sections", () => {
    const config = getAudienceConfig("retailer");
    expect(config.preset).toBe("business");

    const score = sampleScore("business", [
      { label: "Foot Traffic", score: 78, weight: 25 },
      { label: "Competition", score: 60, weight: 20 },
      { label: "Transport", score: 70, weight: 20 },
      { label: "Spending Power", score: 65, weight: 20 },
      { label: "Commercial Costs", score: 55, weight: 15 },
    ]);
    const text = formatAreaBriefAsText(config, sampleProfile(), score);
    expect(text).toContain("# Retailer brief");
    expect(text).toContain("## Footfall & spending power");
    expect(text).toContain("## Competition");
    expect(text).toContain("## Access");
    expect(text).toContain("## Commercial costs");
  });

  it("investor brief uses investing preset + yield/demand/risk sections", () => {
    const config = getAudienceConfig("investor");
    expect(config.preset).toBe("investing");

    const score = sampleScore("investing", [
      { label: "Price Growth", score: 70, weight: 25 },
      { label: "Rental Yield", score: 65, weight: 25 },
      { label: "Regeneration", score: 72, weight: 20 },
      { label: "Tenant Demand", score: 68, weight: 20 },
      { label: "Risk Factors", score: 60, weight: 10 },
    ]);
    const text = formatAreaBriefAsText(config, sampleProfile(), score);
    expect(text).toContain("# Investor brief");
    expect(text).toContain("## Yield & growth");
    expect(text).toContain("## Demand pressure");
    expect(text).toContain("## Risk discount");
  });

  it("drops empty sections rather than rendering bare headers", () => {
    /* A profile with NO signals + a score with NO matching dimensions
       should NOT render a section header. */
    const config = getAudienceConfig("lender");
    const emptyProfile: OogaAreaProfile = { ...sampleProfile(), signals: [] };
    const emptyScore = sampleScore("moving", [
      { label: "Some unrelated dimension", score: 50, weight: 100 },
    ]);
    const text = formatAreaBriefAsText(config, emptyProfile, emptyScore);
    expect(text).not.toContain("## Affordability & cost");
    expect(text).not.toContain("## Borrower-side risk");
    expect(text).not.toContain("## Long-term value drivers");
  });

  it("renders the server-composed score summary verbatim", () => {
    const config = getAudienceConfig("lender");
    const score = sampleScore("moving", [
      { label: "Safety", score: 78, weight: 25 },
    ]);
    const text = formatAreaBriefAsText(config, sampleProfile(), score);
    expect(text).toContain("73/100: above-average for an urban area, with high confidence.");
  });

  it("renders recommendations from the score response (server-composed)", () => {
    const config = getAudienceConfig("lender");
    const score = sampleScore("moving", [{ label: "Safety", score: 78, weight: 25 }]);
    const text = formatAreaBriefAsText(config, sampleProfile(), score);
    expect(text).toContain("## Notes & risks");
    expect(text).toContain("Cost of Living confidence is medium");
  });

  it("renders data sources from the score response", () => {
    const config = getAudienceConfig("lender");
    const score = sampleScore("moving", [{ label: "Safety", score: 78, weight: 25 }]);
    const text = formatAreaBriefAsText(config, sampleProfile(), score);
    expect(text).toContain("## Data sources");
    expect(text).toContain("postcodes.io (geocoding) · MHCLG IMD 2025 · HM Land Registry");
  });
});

/* ── execute path: parallel API calls ────────────────────────────── */

describe("executeAreaBrief", () => {
  it("calls both /v1/area and /v1/score with the audience's preset", async () => {
    let capturedScorePreset: Preset | null = null;
    const client = new OogaApiClient({ apiKey: "oga_test" });
    const signalsSpy = vi.fn(async () => sampleProfile());
    const scoreSpy = vi.fn(async (_area: string, preset: Preset) => {
      capturedScorePreset = preset;
      return sampleScore(preset, [{ label: "Safety", score: 78, weight: 25 }]);
    });
    (client as unknown as { getAreaSignals: typeof signalsSpy }).getAreaSignals = signalsSpy;
    (client as unknown as { scoreArea: typeof scoreSpy }).scoreArea = scoreSpy;

    const out = await executeAreaBrief(client, { area: "M1 1AE", audience: "lender" });
    expect(out.isError).toBeFalsy();
    expect(signalsSpy).toHaveBeenCalledTimes(1);
    expect(scoreSpy).toHaveBeenCalledTimes(1);
    expect(capturedScorePreset).toBe("moving"); // lender → moving
  });

  it("uses the right preset for each audience", async () => {
    const expected: Record<Audience, Preset> = {
      lender: "moving",
      insurer: "investing",
      retailer: "business",
      investor: "investing",
    };
    for (const audience of AUDIENCES) {
      let captured: Preset | null = null;
      const client = new OogaApiClient({ apiKey: "oga_test" });
      (client as unknown as { getAreaSignals: () => Promise<OogaAreaProfile> }).getAreaSignals = async () => sampleProfile();
      (client as unknown as { scoreArea: (a: string, p: Preset) => Promise<OogaScoreResponse> }).scoreArea = async (_a, p) => {
        captured = p;
        return sampleScore(p, []);
      };
      await executeAreaBrief(client, { area: "M1 1AE", audience });
      expect(captured).toBe(expected[audience]);
    }
  });

  it("returns isError when the score call rejects", async () => {
    const client = new OogaApiClient({ apiKey: "oga_test" });
    (client as unknown as { getAreaSignals: () => Promise<OogaAreaProfile> }).getAreaSignals = async () => sampleProfile();
    (client as unknown as { scoreArea: () => Promise<OogaScoreResponse> }).scoreArea = async () => {
      throw new OogaApiError("Quota exceeded", 403);
    };
    const out = await executeAreaBrief(client, { area: "M1 1AE", audience: "lender" });
    expect(out.isError).toBe(true);
    expect(out.content[0]!.text).toContain("HTTP 403");
  });

  it("returns isError when /v1/area rejects", async () => {
    const client = new OogaApiClient({ apiKey: "oga_test" });
    (client as unknown as { getAreaSignals: () => Promise<OogaAreaProfile> }).getAreaSignals = async () => {
      throw new OogaApiError("Could not resolve", 404);
    };
    (client as unknown as { scoreArea: () => Promise<OogaScoreResponse> }).scoreArea = async () =>
      sampleScore("moving", []);
    const out = await executeAreaBrief(client, { area: "Nowhereville", audience: "lender" });
    expect(out.isError).toBe(true);
    expect(out.content[0]!.text).toContain("HTTP 404");
  });

  it("returns formatted brief on full success", async () => {
    const client = makeClient(
      sampleProfile(),
      sampleScore("moving", [{ label: "Safety", score: 78, weight: 25 }]),
    );
    const out = await executeAreaBrief(client, { area: "M1 1AE", audience: "lender" });
    expect(out.isError).toBeFalsy();
    expect(out.content[0]!.text).toContain("# Lender brief · M1 1AE");
    expect(out.content[0]!.text).toContain("**Score:** 73/100");
  });
});
