import { describe, it, expect } from "vitest";
import { TOOL_DEFINITIONS, TOOL_NAMES, callTool, isToolName, OogaApiClient } from "../../src/tools/index.js";

/* AR-1153: the stdio server and the hosted endpoint share this layer, so the
   list and the dispatcher are pinned here rather than in either transport. */

const EXPECTED = [
  "resolve_place",
  "score_postcode",
  "compare_postcodes",
  "get_area_signals",
  "get_signals_by_category",
  "find_areas",
  "find_peers",
  "watch_portfolio",
  "get_portfolio_changes",
  "area_brief",
  "methodology_for",
  "engine_version",
];

/** A client whose every network call answers 418 with a sentinel body, so a
    dispatched tool proves which path it took without a server. */
function teapotClient(): OogaApiClient {
  return new OogaApiClient({
    apiKey: "oga_test",
    version: "0.0.0-test",
    fetch: async () => new Response(JSON.stringify({ error: "sentinel teapot" }), { status: 418, headers: { "content-type": "application/json" } }),
  });
}

const MINIMAL_ARGS: Record<string, unknown> = {
  resolve_place: { query: "SE15 5DP" },
  score_postcode: { area: "SE15 5DP", preset: "moving" },
  compare_postcodes: { areas: ["SE15 5DP", "M1 1AE"], preset: "research" },
  get_area_signals: { area: "SE15 5DP" },
  get_signals_by_category: { area: "SE15 5DP", category: "crime" },
  find_areas: { question: "areas under 250k in England" },
  find_peers: { area: "SE15 5DP" },
  watch_portfolio: { name: "Test", areas: ["SE15 5DP"] },
  get_portfolio_changes: { portfolio_id: "pf_test" },
  area_brief: { area: "SE15 5DP", audience: "lender" },
  methodology_for: { dimension: "Crime" },
  engine_version: {},
};

describe("the tool layer", () => {
  it("lists the twelve tools in a stable order", () => {
    expect(TOOL_DEFINITIONS.map((t) => t.name)).toEqual(EXPECTED);
    expect([...TOOL_NAMES]).toEqual(EXPECTED);
    expect(isToolName("score_postcode")).toBe(true);
    expect(isToolName("delete_everything")).toBe(false);
  });

  it("dispatches every network tool to an executor that uses the client", async () => {
    const client = teapotClient();
    for (const name of EXPECTED.filter((n) => n !== "methodology_for")) {
      const result = await callTool(client, name, MINIMAL_ARGS[name]);
      expect(JSON.stringify(result), name).toContain("418");
    }
  });

  it("answers methodology_for without the network", async () => {
    const result = await callTool(teapotClient(), "methodology_for", { dimension: "Crime" });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain("Crime");
  });

  it("reports an unknown tool as a tool error", async () => {
    const result = await callTool(teapotClient(), "delete_everything", {});
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Unknown tool: delete_everything");
  });

  it("throws on malformed arguments, as the transports expect", async () => {
    await expect(callTool(teapotClient(), "score_postcode", { area: "" })).rejects.toThrow(/area/);
  });
});

describe("OogaApiClient transport and version", () => {
  it("sends the given version in the User-Agent through the injected fetch", async () => {
    let seen: Record<string, string> = {};
    const client = new OogaApiClient({
      apiKey: "oga_test",
      baseUrl: "https://api.test",
      version: "9.9.9",
      fetch: async (_url, init) => {
        seen = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>));
        return new Response(JSON.stringify({ service: "x", phase: "p", intents: [], engine_version: "1.0", methodology: [] }), { status: 200 });
      },
    });
    await client.meta();
    expect(seen["User-Agent"]).toBe("onegoodarea-mcp-server/9.9.9");
    expect(seen["Authorization"]).toBe("Bearer oga_test");
  });

  it("falls back to an unknown version when none is given", async () => {
    let ua = "";
    const client = new OogaApiClient({
      apiKey: "oga_test",
      baseUrl: "https://api.test",
      fetch: async (_url, init) => {
        ua = ((init.headers ?? {}) as Record<string, string>)["User-Agent"] ?? "";
        return new Response("{}", { status: 200 });
      },
    });
    await client.meta();
    expect(ua).toBe("onegoodarea-mcp-server/unknown");
  });
});
