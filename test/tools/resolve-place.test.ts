import { afterEach, describe, it, expect, vi } from "vitest";
import {
  resolvePlaceToolDef,
  parseResolvePlaceArgs,
  executeResolvePlace,
  renderResolution,
} from "../../src/tools/resolve-place.js";
import { OogaApiClient, OogaApiError, type OogaPlaceResolveResponse, type OogaPlaceResolution } from "../../src/api-client.js";

const META = { engine_version: "1.12.6", generated_at: "2026-10-15T14:00:00.000Z" };

const PECKHAM = {
  place_id: "oga_pl_0Y7K3M9QZ2W4XB5",
  place_type: "neighbourhood" as const,
  name: "Southwark 023C",
  country: "GB",
  nation: "GB-ENG",
};

function resolved(overrides: Partial<Extract<OogaPlaceResolution, { status: "resolved" }>> = {}): OogaPlaceResolveResponse {
  return {
    result: {
      status: "resolved",
      input: "SE15 5DP",
      place: PECKHAM,
      resolved_via: { kind: "postcode", scheme: null, value: "SE15 5DP" },
      postcode: { postcode: "SE15 5DP", status: "live", terminated_on: null },
      ...overrides,
    },
    meta: META,
  };
}

describe("resolvePlaceToolDef", () => {
  it("has the MCP fields the directory requires", () => {
    expect(resolvePlaceToolDef.name).toBe("resolve_place");
    expect(resolvePlaceToolDef.title).toBe("Resolve a place");
    expect(resolvePlaceToolDef.annotations.readOnlyHint).toBe(true);
    expect(resolvePlaceToolDef.inputSchema.required).toEqual(["query"]);
    expect(resolvePlaceToolDef.inputSchema.additionalProperties).toBe(false);
  });

  it("describes coverage by nation and stays under 1,000 characters", () => {
    expect(resolvePlaceToolDef.description).toContain("England, Wales or Scotland");
    expect(resolvePlaceToolDef.description.length).toBeLessThan(1000);
    expect(resolvePlaceToolDef.description).not.toContain(String.fromCharCode(0x2014));
  });
});

describe("parseResolvePlaceArgs", () => {
  it("trims the query", () => {
    expect(parseResolvePlaceArgs({ query: "  SE15 5DP  " })).toEqual({ query: "SE15 5DP" });
  });

  it("rejects a missing, empty or non-string query", () => {
    expect(() => parseResolvePlaceArgs({})).toThrow(/query/);
    expect(() => parseResolvePlaceArgs({ query: "   " })).toThrow(/query/);
    expect(() => parseResolvePlaceArgs({ query: 42 })).toThrow(/query/);
    expect(() => parseResolvePlaceArgs(null)).toThrow(/object/);
  });

  it("rejects a query over 100 characters", () => {
    expect(() => parseResolvePlaceArgs({ query: "x".repeat(101) })).toThrow(/100/);
  });
});

describe("executeResolvePlace", () => {
  function makeClient(impl: (query: string) => Promise<OogaPlaceResolveResponse>): OogaApiClient {
    const client = new OogaApiClient({ apiKey: "oga_test" });
    (client as unknown as { resolvePlace: (q: string) => Promise<OogaPlaceResolveResponse> }).resolvePlace = impl;
    return client;
  }

  it("renders a live postcode with the permanent id first", async () => {
    const client = makeClient(async () => resolved());
    const out = await executeResolvePlace(client, { query: "SE15 5DP" });
    expect(out.isError).toBeFalsy();
    const text = out.content[0]!.text;
    expect(text.split("\n")[0]).toBe("# Place · SE15 5DP");
    expect(text.split("\n")[1]).toBe("Place id: oga_pl_0Y7K3M9QZ2W4XB5");
    expect(text).toContain("Type: neighbourhood · Name: Southwark 023C");
    expect(text).toContain("Nation: England (GB-ENG)");
    expect(text).toContain("Resolved via postcode SE15 5DP.");
    expect(text).toContain("Postcode SE15 5DP: live.");
    expect(text).toContain("Engine: 1.12.6");
  });

  it("names the month a retired postcode went and says the result is its old neighbourhood", async () => {
    const client = makeClient(async () =>
      resolved({ input: "B1 1AA", resolved_via: { kind: "postcode", scheme: null, value: "B1 1AA" }, postcode: { postcode: "B1 1AA", status: "terminated", terminated_on: "2024-06-01" } }),
    );
    const out = await executeResolvePlace(client, { query: "B1 1AA" });
    const text = out.content[0]!.text;
    expect(text).toContain("Postcode B1 1AA: retired in Jun 2024.");
    expect(text).toContain("neighbourhood it was in");
  });

  it("describes a code and a name resolution by how they resolved", () => {
    const byCode = renderResolution(
      { ...resolved().result, input: "E01003920", resolved_via: { kind: "code", scheme: "lsoa21", value: "E01003920" }, postcode: null },
      META,
    );
    expect(byCode).toContain("Resolved via lsoa21 code E01003920.");
    expect(byCode).not.toContain("Postcode");

    const byName = renderResolution(
      { ...resolved().result, input: "Peckham", resolved_via: { kind: "name", scheme: "lsoa21", value: "E01003920" }, postcode: null },
      META,
    );
    expect(byName).toContain("Resolved via the place search to neighbourhood code E01003920.");
  });

  it("lists ambiguous candidates with their ids", async () => {
    const client = makeClient(async () => ({
      result: {
        status: "ambiguous",
        input: "Newport",
        candidates: [
          { label: "Newport, Wales", postcode: "NP20 1AA", place: { ...PECKHAM, place_id: "oga_pl_1111111111111", name: "Newport 001A", nation: "GB-WLS" } },
          { label: "Newport, Isle of Wight", postcode: "PO30 1AA", place: null },
        ],
      },
      meta: META,
    }));
    const out = await executeResolvePlace(client, { query: "Newport" });
    const text = out.content[0]!.text;
    expect(text).toContain('Ambiguous: 2 places match "Newport". Call again with one place id.');
    expect(text).toContain("| 1 | Newport, Wales | NP20 1AA | oga_pl_1111111111111 | neighbourhood | Newport 001A |");
    expect(text).toContain("| 2 | Newport, Isle of Wight | PO30 1AA | not in the registry |  |  |");
  });

  it("returns the reason and sentence when nothing matches, without isError", async () => {
    const client = makeClient(async () => ({
      result: { status: "not_found", input: "ZZ99 9ZZ", reason: "unknown_postcode", message: "ZZ99 9ZZ is not a postcode on the spine, live or retired." },
      meta: META,
    }));
    const out = await executeResolvePlace(client, { query: "ZZ99 9ZZ" });
    expect(out.isError).toBeFalsy();
    expect(out.content[0]!.text).toContain("Not found (unknown_postcode): ZZ99 9ZZ is not a postcode on the spine, live or retired.");
  });

  it("returns isError on an API failure", async () => {
    const client = makeClient(async () => {
      throw new OogaApiError("Invalid or revoked API key", 401);
    });
    const out = await executeResolvePlace(client, { query: "SE15 5DP" });
    expect(out.isError).toBe(true);
    expect(out.content[0]!.text).toContain("HTTP 401");
  });
});

describe("OogaApiClient.resolvePlace", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(status: number, body: unknown): { calls: string[] } {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    });
    return { calls };
  }

  it("encodes the query and returns the body on 200", async () => {
    const { calls } = stubFetch(200, resolved());
    const client = new OogaApiClient({ apiKey: "oga_test", baseUrl: "https://api.test" });
    const out = await client.resolvePlace("SE15 5DP");
    expect(calls[0]).toBe("https://api.test/v1/places/resolve?q=SE15%205DP");
    expect(out.result.status).toBe("resolved");
  });

  it("treats a 404 that carries a not_found result as a result", async () => {
    stubFetch(404, { result: { status: "not_found", input: "ZZ99 9ZZ", reason: "unknown_postcode", message: "no" }, meta: META });
    const client = new OogaApiClient({ apiKey: "oga_test", baseUrl: "https://api.test" });
    const out = await client.resolvePlace("ZZ99 9ZZ");
    expect(out.result.status).toBe("not_found");
  });

  it("still throws on a 404 error body and on other failures", async () => {
    stubFetch(404, { error: "Not found" });
    const client = new OogaApiClient({ apiKey: "oga_test", baseUrl: "https://api.test" });
    await expect(client.resolvePlace("SE15 5DP")).rejects.toMatchObject({ status: 404, message: "Not found" });

    stubFetch(401, { error: "Invalid or revoked API key" });
    await expect(client.resolvePlace("SE15 5DP")).rejects.toBeInstanceOf(OogaApiError);
  });
});
