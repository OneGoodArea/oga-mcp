import { describe, it, expect } from "vitest";
import {
  getPortfolioChangesToolDef,
  parseGetPortfolioChangesArgs,
  executeGetPortfolioChanges,
  formatChangeReportAsText,
  causeText,
} from "../../src/tools/get-portfolio-changes.js";
import { OogaApiClient, OogaApiError, type OogaChangeReport } from "../../src/api-client.js";

function sampleReport(over: Partial<OogaChangeReport> = {}): OogaChangeReport {
  return {
    portfolio_id: "ptf_abc123",
    baseline: "previous",
    threshold_pct: 5,
    min_transactions: 20,
    areas_checked: 12,
    material_count: 2,
    changes: [
      {
        signal_key: "property.median_price",
        label: "Median sale price",
        area: "M1 1AE",
        geo_code: "E01005132",
        period_from: "2026-04",
        period_to: "2026-05",
        value_from: 200000,
        value_to: 214000,
        delta: 14000,
        pct_change: 7.0,
        direction: "up",
        material: true,
        cause: "source_and_method",
        method_releases: ["1.12.1"],
      },
      {
        signal_key: "crime.total_12m",
        label: "Recorded crimes (12 months)",
        area: "M2 5AB",
        geo_code: "E01005133",
        period_from: "2026-04",
        period_to: "2026-05",
        value_from: 280,
        value_to: 240,
        delta: -40,
        pct_change: -14.3,
        direction: "down",
        material: true,
        cause: "source",
        method_releases: [],
      },
    ],
    generated_at: "2026-06-28T01:00:00Z",
    ...over,
  };
}

describe("getPortfolioChangesToolDef", () => {
  it("has the right MCP fields", () => {
    expect(getPortfolioChangesToolDef.name).toBe("get_portfolio_changes");
    expect(getPortfolioChangesToolDef.inputSchema.required).toEqual(["portfolio_id"]);
    expect(getPortfolioChangesToolDef.inputSchema.additionalProperties).toBe(false);
  });

  it("enumerates baseline correctly", () => {
    expect(getPortfolioChangesToolDef.inputSchema.properties.baseline.enum).toEqual(["previous", "first"]);
  });
});

describe("parseGetPortfolioChangesArgs", () => {
  it("accepts the minimum (just portfolio_id)", () => {
    expect(parseGetPortfolioChangesArgs({ portfolio_id: "ptf_abc" })).toEqual({ portfolio_id: "ptf_abc" });
  });

  it("accepts all optional fields", () => {
    expect(parseGetPortfolioChangesArgs({
      portfolio_id: "ptf_abc",
      threshold_pct: 10,
      baseline: "first",
      min_transactions: 50,
    })).toEqual({
      portfolio_id: "ptf_abc",
      threshold_pct: 10,
      baseline: "first",
      min_transactions: 50,
    });
  });

  it("rejects empty portfolio_id", () => {
    expect(() => parseGetPortfolioChangesArgs({ portfolio_id: "" })).toThrow(/portfolio_id/);
  });

  it("rejects negative threshold_pct", () => {
    expect(() => parseGetPortfolioChangesArgs({ portfolio_id: "p", threshold_pct: -1 })).toThrow(/threshold_pct/);
  });

  it("rejects invalid baseline", () => {
    expect(() => parseGetPortfolioChangesArgs({ portfolio_id: "p", baseline: "future" })).toThrow(/baseline/);
  });

  it("accepts a cause filter and rejects a cause that does not exist", () => {
    expect(parseGetPortfolioChangesArgs({ portfolio_id: "p", cause: ["method"] })).toEqual({ portfolio_id: "p", cause: ["method"] });
    expect(() => parseGetPortfolioChangesArgs({ portfolio_id: "p", cause: ["weather"] })).toThrow(/cause/);
    expect(() => parseGetPortfolioChangesArgs({ portfolio_id: "p", cause: [] })).toThrow(/cause/);
  });

  it("rejects non-numeric threshold_pct", () => {
    expect(() => parseGetPortfolioChangesArgs({ portfolio_id: "p", threshold_pct: "10" })).toThrow(/threshold_pct/);
  });
});

describe("formatChangeReportAsText", () => {
  it("renders the scope header and change table", () => {
    const text = formatChangeReportAsText(sampleReport());
    expect(text).toContain("# Portfolio changes · `ptf_abc123`");
    expect(text).toContain("**Baseline:** previous");
    expect(text).toContain("**Threshold:** 5%");
    expect(text).toContain("**Areas checked:** 12");
    expect(text).toContain("**Material changes:** 2");
    expect(text).toContain("Median sale price");
    expect(text).toContain("200,000 ↑ 214,000");
    expect(text).toContain("+7.0%");
    expect(text).toContain("280 ↓ 240");
    expect(text).toContain("-14.3%");
  });

  it("renders the empty-state message when no material changes", () => {
    const text = formatChangeReportAsText(sampleReport({ material_count: 0, changes: [] }));
    expect(text).toContain("No material signal changes detected");
  });
});

describe("executeGetPortfolioChanges", () => {
  function makeClient(impl: (id: string, opts: Record<string, unknown>) => Promise<OogaChangeReport>): OogaApiClient {
    const client = new OogaApiClient({ apiKey: "oga_test" });
    (client as unknown as { getPortfolioChanges: typeof impl }).getPortfolioChanges = impl;
    return client;
  }

  it("forwards options to the API client", async () => {
    let capturedId: string | null = null;
    let capturedOpts: Record<string, unknown> | null = null;
    const client = makeClient(async (id, opts) => {
      capturedId = id;
      capturedOpts = opts;
      return sampleReport();
    });
    await executeGetPortfolioChanges(client, {
      portfolio_id: "ptf_abc",
      threshold_pct: 8,
      baseline: "first",
      min_transactions: 30,
    });
    expect(capturedId).toBe("ptf_abc");
    expect(capturedOpts).toEqual({ threshold_pct: 8, baseline: "first", min_transactions: 30 });
  });

  it("returns the formatted markdown on success", async () => {
    const client = makeClient(async () => sampleReport());
    const out = await executeGetPortfolioChanges(client, { portfolio_id: "ptf_abc" });
    expect(out.isError).toBeFalsy();
    expect(out.content[0]!.text).toContain("**Material changes:** 2");
  });

  it("returns isError on auth failure", async () => {
    const client = makeClient(async () => {
      throw new OogaApiError("Invalid or revoked API key", 401);
    });
    const out = await executeGetPortfolioChanges(client, { portfolio_id: "ptf_abc" });
    expect(out.isError).toBe(true);
    expect(out.content[0]!.text).toContain("HTTP 401");
  });
});

describe("why a change moved (AR-977)", () => {
  it("names the source data or the methodology releases, and explains a method move once", () => {
    const text = formatChangeReportAsText(sampleReport());
    expect(text).toContain("| % change | Why |");
    expect(text).toContain("| Source data and methodology (1.12.1) |");
    expect(text).toContain("| Source data |");
    expect(text).toContain("A methodology move comes from a OneGoodArea release");
  });

  it("leaves the column empty, and adds no note, for an API older than the field", () => {
    const old = sampleReport({ changes: [{ ...sampleReport().changes[1]!, cause: undefined, method_releases: undefined }] });
    const text = formatChangeReportAsText(old);
    expect(text).not.toContain("A methodology move");
    expect(causeText(old.changes[0]!)).toBe("");
  });
});

