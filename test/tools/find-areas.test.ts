import { describe, it, expect } from "vitest";
import {
  findAreasToolDef,
  parseFindAreasArgs,
  executeFindAreas,
} from "../../src/tools/find-areas.js";
import { OogaApiClient, OogaApiError, type OogaQueryResponse } from "../../src/api-client.js";

function rankAreasResponse(rows: Array<{ geo_code: string; value: number | null; percentile: number | null }>): OogaQueryResponse {
  return {
    plan: {
      op: "rank_areas",
      params: {
        signals: [{ key: "property.median_price" }],
        sort_by: { signal: "property.median_price", mode: "value", direction: "asc" },
        country: "England",
        limit: 5,
      },
    },
    plan_source: "nl",
    results: rows,
    meta: { generated_at: "2026-06-28T01:00:00Z" },
  };
}

describe("findAreasToolDef", () => {
  it("has the right MCP fields", () => {
    expect(findAreasToolDef.name).toBe("find_areas");
    expect(findAreasToolDef.inputSchema.required).toEqual(["question"]);
    expect(findAreasToolDef.inputSchema.additionalProperties).toBe(false);
  });
});

describe("parseFindAreasArgs", () => {
  it("accepts a valid question", () => {
    expect(parseFindAreasArgs({ question: "areas under £250k in England" })).toEqual({
      question: "areas under £250k in England",
    });
  });

  it("trims whitespace", () => {
    expect(parseFindAreasArgs({ question: "  hello  " })).toEqual({ question: "hello" });
  });

  it("rejects empty question", () => {
    expect(() => parseFindAreasArgs({ question: "" })).toThrow(/question/);
    expect(() => parseFindAreasArgs({ question: "   " })).toThrow(/question/);
  });

  it("rejects questions over 500 chars", () => {
    expect(() => parseFindAreasArgs({ question: "x".repeat(501) })).toThrow(/500/);
  });

  it("rejects non-object input", () => {
    expect(() => parseFindAreasArgs(null)).toThrow();
    expect(() => parseFindAreasArgs("question")).toThrow();
  });
});

describe("executeFindAreas: rank_areas", () => {
  function makeClient(impl: (q: string) => Promise<OogaQueryResponse>): OogaApiClient {
    const client = new OogaApiClient({ apiKey: "oga_test" });
    (client as unknown as { findAreas: (q: string) => Promise<OogaQueryResponse> }).findAreas = impl;
    return client;
  }

  it("renders the op header and emitted plan", async () => {
    const client = makeClient(async () => rankAreasResponse([
      { geo_code: "E01005132", value: 214000, percentile: 12 },
      { geo_code: "E01005133", value: 218000, percentile: 14 },
    ]));
    const out = await executeFindAreas(client, { question: "cheap LSOAs" });
    expect(out.isError).toBeFalsy();
    const text = out.content[0]!.text;
    expect(text).toContain("op: rank_areas");
    expect(text).toContain("Plan source: nl");
    expect(text).toContain("Emitted plan");
    expect(text).toContain("property.median_price");
  });

  it("renders a ranked table for rank_areas results", async () => {
    const client = makeClient(async () => rankAreasResponse([
      { geo_code: "E01005132", value: 214000, percentile: 12 },
    ]));
    const out = await executeFindAreas(client, { question: "cheap LSOAs" });
    expect(out.content[0]!.text).toContain("| Rank | LSOA | Value | Percentile |");
    expect(out.content[0]!.text).toContain("| 1 | E01005132 | 214000 | 12th |");
  });

  it("handles an empty rank_areas result gracefully", async () => {
    const client = makeClient(async () => rankAreasResponse([]));
    const out = await executeFindAreas(client, { question: "empty" });
    expect(out.content[0]!.text).toContain("No areas matched.");
  });
});

describe("executeFindAreas: other plan ops", () => {
  function makeClient(response: OogaQueryResponse): OogaApiClient {
    const client = new OogaApiClient({ apiKey: "oga_test" });
    (client as unknown as { findAreas: () => Promise<OogaQueryResponse> }).findAreas = async () => response;
    return client;
  }

  it("renders compare_areas with one block per slot", async () => {
    const profile = {
      geo: {
        query: "M1 1AE", postcode: "M1 1AE", latitude: 0, longitude: 0, lsoa: "E01005132",
        msoa: null, admin_district: "Manchester", region: "North West", country: "England", area_type: "urban" as const,
      },
      signals: [],
      meta: { engine_version: "1.0.0", generated_at: "x", sources: [], fetch_mode: "live" as const },
    };
    const out = await executeFindAreas(
      makeClient({
        plan: { op: "compare_areas", params: { areas: ["M1 1AE", "Nowhere"] } },
        plan_source: "nl",
        results: {
          areas: [
            { query: "M1 1AE", profile },
            { query: "Nowhere", profile: null },
          ],
          meta: { generated_at: "x", scope: "compare" },
        },
        meta: { generated_at: "x" },
      }),
      { question: "compare these" },
    );
    expect(out.content[0]!.text).toContain("### M1 1AE");
    expect(out.content[0]!.text).toContain("### Nowhere");
    expect(out.content[0]!.text).toContain("Could not resolve");
  });

  it("renders find_peers results from the query plane", async () => {
    const out = await executeFindAreas(
      makeClient({
        plan: { op: "find_peers", params: { target: { area: "M1 1AE" }, k: 3 } },
        plan_source: "nl",
        results: {
          target: { geo_code: "E01005132", signals_used: ["crime.total_12m", "deprivation.imd_decile"] },
          peers: [
            { geo_code: "E01005140", distance: 0.12, n_dims_used: 2 },
            { geo_code: "E01005141", distance: 0.18, n_dims_used: 2 },
          ],
          meta: { generated_at: "x", scope: "global" },
        },
        meta: { generated_at: "x" },
      }),
      { question: "peers" },
    );
    expect(out.content[0]!.text).toContain("Target LSOA:");
    expect(out.content[0]!.text).toContain("E01005140");
    expect(out.content[0]!.text).toContain("0.120");
  });

  it("renders find_insights as a ranked anomaly table", async () => {
    const out = await executeFindAreas(
      makeClient({
        plan: { op: "find_insights", params: { signal_key: "crime.total_12m_peer_relative_z" } },
        plan_source: "nl",
        results: {
          signal_key: "crime.total_12m_peer_relative_z",
          insights: [{ geo_code: "E01005132", peer_relative_z: 2.8, abs_z: 2.8 }],
          meta: { generated_at: "x", scope: "England", threshold: 2.0 },
        },
        meta: { generated_at: "x" },
      }),
      { question: "anomalies" },
    );
    expect(out.content[0]!.text).toContain("Threshold:");
    expect(out.content[0]!.text).toContain("E01005132");
    expect(out.content[0]!.text).toContain("2.80");
  });

  it("handles null results (resolution failures) on get_area", async () => {
    const out = await executeFindAreas(
      makeClient({
        plan: { op: "get_area", params: { area: "Nowhere" } },
        plan_source: "nl",
        results: null,
        meta: { generated_at: "x" },
      }),
      { question: "get area" },
    );
    expect(out.content[0]!.text).toContain("Area could not be resolved");
  });
});

describe("executeFindAreas error paths", () => {
  function makeClient(impl: () => Promise<OogaQueryResponse>): OogaApiClient {
    const client = new OogaApiClient({ apiKey: "oga_test" });
    (client as unknown as { findAreas: () => Promise<OogaQueryResponse> }).findAreas = impl;
    return client;
  }

  it("returns isError + readable message on API auth failure", async () => {
    const client = makeClient(async () => {
      throw new OogaApiError("Invalid or revoked API key", 401);
    });
    const out = await executeFindAreas(client, { question: "x" });
    expect(out.isError).toBe(true);
    expect(out.content[0]!.text).toContain("HTTP 401");
  });

  it("returns isError on unexpected error", async () => {
    const client = makeClient(async () => {
      throw new Error("Network exploded");
    });
    const out = await executeFindAreas(client, { question: "x" });
    expect(out.isError).toBe(true);
    expect(out.content[0]!.text).toContain("Network exploded");
  });
});
