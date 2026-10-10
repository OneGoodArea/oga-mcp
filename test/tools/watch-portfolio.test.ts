import { describe, it, expect, vi } from "vitest";
import {
  watchPortfolioToolDef,
  parseWatchPortfolioArgs,
  executeWatchPortfolio,
} from "../../src/tools/watch-portfolio.js";
import { OogaApiClient, OogaApiError, type OogaPortfolio, type OogaPortfolioDetail } from "../../src/api-client.js";

function sampleCreated(): OogaPortfolio {
  return { id: "ptf_abc123", name: "North Manchester picks", created_at: "2026-06-28T01:00:00Z" };
}

/* AR-386: addPortfolioAreas now returns {added, portfolio: PortfolioDetail}
   instead of bare PortfolioDetail, apps/api change forced by the
   false-failure crash. Tests track the new shape. */
function sampleAdded(): { added: number; portfolio: OogaPortfolioDetail } {
  return {
    added: 2,
    portfolio: {
      id: "ptf_abc123",
      name: "North Manchester picks",
      created_at: "2026-06-28T01:00:00Z",
      areas: [
        { id: "pa_1", area: "M1 1AE", label: null },
        { id: "pa_2", area: "M2 5AB", label: "Town hall" },
      ],
    },
  };
}

describe("watchPortfolioToolDef", () => {
  it("has the right MCP fields", () => {
    expect(watchPortfolioToolDef.name).toBe("watch_portfolio");
    expect(watchPortfolioToolDef.inputSchema.required).toEqual(["name", "areas"]);
    expect(watchPortfolioToolDef.inputSchema.additionalProperties).toBe(false);
  });

  it("declares areas bounds 1..100", () => {
    expect(watchPortfolioToolDef.inputSchema.properties.areas.minItems).toBe(1);
    expect(watchPortfolioToolDef.inputSchema.properties.areas.maxItems).toBe(100);
  });
});

describe("parseWatchPortfolioArgs", () => {
  it("accepts valid args", () => {
    expect(parseWatchPortfolioArgs({ name: "My picks", areas: ["M1 1AE", "SW4 0LG"] })).toEqual({
      name: "My picks",
      areas: ["M1 1AE", "SW4 0LG"],
    });
  });

  it("trims name and each area", () => {
    expect(parseWatchPortfolioArgs({ name: "  hi  ", areas: ["  M1  ", "  SW4 0LG"] })).toEqual({
      name: "hi",
      areas: ["M1", "SW4 0LG"],
    });
  });

  it("rejects empty name", () => {
    expect(() => parseWatchPortfolioArgs({ name: "", areas: ["M1"] })).toThrow(/name/);
  });

  it("rejects name over 200 chars", () => {
    expect(() => parseWatchPortfolioArgs({ name: "x".repeat(201), areas: ["M1"] })).toThrow(/200/);
  });

  it("rejects empty areas array", () => {
    expect(() => parseWatchPortfolioArgs({ name: "x", areas: [] })).toThrow(/areas/);
  });

  it("rejects > 100 areas", () => {
    expect(() => parseWatchPortfolioArgs({ name: "x", areas: Array(101).fill("M1") })).toThrow(/100/);
  });

  it("rejects empty string in areas", () => {
    expect(() => parseWatchPortfolioArgs({ name: "x", areas: ["M1", ""] })).toThrow(/non-empty/);
  });

  it("rejects an area over 100 chars", () => {
    expect(() => parseWatchPortfolioArgs({ name: "x", areas: ["M1", "y".repeat(101)] })).toThrow(/100/);
  });
});

describe("executeWatchPortfolio", () => {
  function makeClient(opts: {
    create?: () => Promise<OogaPortfolio>;
    addAreas?: () => Promise<{ added: number; portfolio: OogaPortfolioDetail }>;
  }): OogaApiClient {
    const client = new OogaApiClient({ apiKey: "oga_test" });
    if (opts.create) {
      (client as unknown as { createPortfolio: () => Promise<OogaPortfolio> }).createPortfolio = opts.create;
    }
    if (opts.addAreas) {
      (client as unknown as { addPortfolioAreas: () => Promise<{ added: number; portfolio: OogaPortfolioDetail }> }).addPortfolioAreas = opts.addAreas;
    }
    return client;
  }

  it("returns formatted success markdown when both calls succeed", async () => {
    const client = makeClient({
      create: async () => sampleCreated(),
      addAreas: async () => sampleAdded(),
    });
    const out = await executeWatchPortfolio(client, { name: "X", areas: ["M1 1AE", "M2 5AB"] });
    expect(out.isError).toBeFalsy();
    const text = out.content[0]!.text;
    expect(text).toContain("# Portfolio: North Manchester picks");
    expect(text).toContain("ptf_abc123");
    expect(text).toContain("Areas tracked (2):");
    expect(text).toContain("M2 5AB (Town hall)");
    expect(text).toContain("Use `get_portfolio_changes`");
  });

  it("passes only the areas through (no labels) on the add call", async () => {
    const captured: unknown[] = [];
    const client = makeClient({
      create: async () => sampleCreated(),
      addAreas: async () => {
        captured.push("called");
        return sampleAdded();
      },
    });
    // Spy on the client.addPortfolioAreas method to inspect the second arg
    const realAdd = vi.fn(async () => sampleAdded());
    (client as unknown as { addPortfolioAreas: typeof realAdd }).addPortfolioAreas = realAdd;
    await executeWatchPortfolio(client, { name: "X", areas: ["M1", "M2"] });
    expect(realAdd).toHaveBeenCalledTimes(1);
    expect(realAdd.mock.calls[0]![1]).toEqual([{ area: "M1" }, { area: "M2" }]);
  });

  it("surfaces partial state (and isError) when create succeeds but add fails", async () => {
    const client = makeClient({
      create: async () => sampleCreated(),
      addAreas: async () => {
        throw new OogaApiError("Database temporarily unavailable", 503);
      },
    });
    const out = await executeWatchPortfolio(client, { name: "X", areas: ["M1 1AE"] });
    expect(out.isError).toBe(true);
    const text = out.content[0]!.text;
    expect(text).toContain("ptf_abc123");
    expect(text).toContain("Areas tracked: 0");
    expect(text).toContain("HTTP 503");
    expect(text).toContain("Retry by calling watch_portfolio");
  });

  it("returns isError without partial state if the create call fails", async () => {
    const client = makeClient({
      create: async () => {
        throw new OogaApiError("Quota exceeded", 403);
      },
      addAreas: async () => sampleAdded(),
    });
    const out = await executeWatchPortfolio(client, { name: "X", areas: ["M1 1AE"] });
    expect(out.isError).toBe(true);
    expect(out.content[0]!.text).toContain("HTTP 403");
    expect(out.content[0]!.text).not.toContain("Portfolio:");
  });
});
