import { describe, it, expect } from "vitest";
import {
  findPeersToolDef,
  parseFindPeersArgs,
  executeFindPeers,
} from "../../src/tools/find-peers.js";
import { OogaApiClient, OogaApiError, type OogaPeersResponse } from "../../src/api-client.js";

function samplePeers(): OogaPeersResponse {
  return {
    target: { geo_code: "E01005132", signals_used: ["crime.total_12m", "deprivation.imd_decile"] },
    peers: [
      { geo_code: "E01005140", distance: 0.12, n_dims_used: 2 },
      { geo_code: "E01005141", distance: 0.18, n_dims_used: 2 },
      { geo_code: "E01005142", distance: 0.31, n_dims_used: 1 },
    ],
    meta: { generated_at: "2026-06-28T01:00:00Z", scope: "global" },
  };
}

describe("findPeersToolDef", () => {
  it("has the right MCP fields", () => {
    expect(findPeersToolDef.name).toBe("find_peers");
    expect(findPeersToolDef.inputSchema.required).toEqual(["area"]);
    expect(findPeersToolDef.inputSchema.additionalProperties).toBe(false);
  });

  it("declares k bounds 1..200", () => {
    expect(findPeersToolDef.inputSchema.properties.k.minimum).toBe(1);
    expect(findPeersToolDef.inputSchema.properties.k.maximum).toBe(200);
  });
});

describe("parseFindPeersArgs", () => {
  it("accepts area only (k defaults via the API)", () => {
    expect(parseFindPeersArgs({ area: "M1 1AE" })).toEqual({ area: "M1 1AE", k: undefined });
  });

  it("accepts area + k", () => {
    expect(parseFindPeersArgs({ area: "M1 1AE", k: 10 })).toEqual({ area: "M1 1AE", k: 10 });
  });

  it("trims the area", () => {
    expect(parseFindPeersArgs({ area: "  M1 1AE  " }).area).toBe("M1 1AE");
  });

  it("rejects empty area", () => {
    expect(() => parseFindPeersArgs({ area: "" })).toThrow(/area/);
  });

  it("rejects area over 100 chars", () => {
    expect(() => parseFindPeersArgs({ area: "x".repeat(101) })).toThrow(/100/);
  });

  it("rejects non-integer k", () => {
    expect(() => parseFindPeersArgs({ area: "M1 1AE", k: 1.5 })).toThrow(/k must be/);
    expect(() => parseFindPeersArgs({ area: "M1 1AE", k: "twenty" })).toThrow(/k must be/);
  });

  it("rejects k out of bounds", () => {
    expect(() => parseFindPeersArgs({ area: "M1 1AE", k: 0 })).toThrow(/k must be/);
    expect(() => parseFindPeersArgs({ area: "M1 1AE", k: 201 })).toThrow(/k must be/);
  });
});

describe("executeFindPeers", () => {
  function makeClient(impl: (area: string, k?: number) => Promise<OogaPeersResponse>): OogaApiClient {
    const client = new OogaApiClient({ apiKey: "oga_test" });
    (client as unknown as { findPeers: (a: string, k?: number) => Promise<OogaPeersResponse> }).findPeers = impl;
    return client;
  }

  it("renders the target + ranked peers table", async () => {
    const client = makeClient(async () => samplePeers());
    const out = await executeFindPeers(client, { area: "M1 1AE" });
    expect(out.isError).toBeFalsy();
    const text = out.content[0]!.text;
    expect(text).toContain("# Peers · M1 1AE");
    expect(text).toContain("E01005132");
    expect(text).toContain("crime.total_12m, deprivation.imd_decile");
    expect(text).toContain("| 1 | E01005140 | 0.120 | 2 |");
    expect(text).toContain("| 2 | E01005141 | 0.180 | 2 |");
  });

  it("forwards k to the client when provided", async () => {
    let capturedK: number | undefined;
    const client = makeClient(async (_a, k) => {
      capturedK = k;
      return samplePeers();
    });
    await executeFindPeers(client, { area: "M1 1AE", k: 5 });
    expect(capturedK).toBe(5);
  });

  it("handles no-peers gracefully", async () => {
    const client = makeClient(async () => ({ ...samplePeers(), peers: [] }));
    const out = await executeFindPeers(client, { area: "M1 1AE" });
    expect(out.content[0]!.text).toContain("No peers found");
  });

  it("returns isError on auth failure", async () => {
    const client = makeClient(async () => {
      throw new OogaApiError("Invalid or revoked API key", 401);
    });
    const out = await executeFindPeers(client, { area: "M1 1AE" });
    expect(out.isError).toBe(true);
    expect(out.content[0]!.text).toContain("HTTP 401");
  });
});
