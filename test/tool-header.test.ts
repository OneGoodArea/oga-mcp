import { describe, it, expect } from "vitest";
import { OogaApiClient, TOOL_NAMES, callTool } from "../src/tools/index.js";
import type { FetchLike } from "../src/api-client.js";

/* AR-1170: every request a tool makes names the tool in X-OGA-Tool, so the
   API can say which tools people use. The local server and the hosted
   endpoint share callTool, so both send it the same way. */

type Seen = { url: string; headers: Record<string, string> };

function recordingClient(seen: Seen[]): OogaApiClient {
  const fetch: FetchLike = async (url, init) => {
    seen.push({ url, headers: init.headers });
    return new Response(JSON.stringify({ error: "recorded" }), { status: 418, headers: { "content-type": "application/json" } });
  };
  return new OogaApiClient({ apiKey: "oga_test", version: "1.0.13", fetch });
}

const ARGS: Record<string, unknown> = {
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

describe("X-OGA-Tool", () => {
  it.each(TOOL_NAMES.filter((name) => name !== "methodology_for"))("%s names itself on every request it makes", async (name) => {
    const seen: Seen[] = [];
    await callTool(recordingClient(seen), name, ARGS[name]);
    expect(seen.length).toBeGreaterThan(0);
    for (const request of seen) {
      expect(request.headers["X-OGA-Tool"]).toBe(name);
      expect(request.headers["Authorization"]).toBe("Bearer oga_test");
      expect(request.headers["User-Agent"]).toBe("onegoodarea-mcp-server/1.0.13");
    }
  });

  it("is absent from a request made outside a tool", async () => {
    const seen: Seen[] = [];
    const client = recordingClient(seen);
    await client.me().catch(() => undefined);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.headers).not.toHaveProperty("X-OGA-Tool");
  });

  it("leaves the shared client untouched, so parallel calls never see each other's tool", async () => {
    const seen: Seen[] = [];
    const client = recordingClient(seen);
    await Promise.all([
      callTool(client, "resolve_place", ARGS.resolve_place),
      callTool(client, "find_peers", ARGS.find_peers),
    ]);
    await client.me().catch(() => undefined);
    const tools = seen.map((request) => request.headers["X-OGA-Tool"]);
    expect(tools).toContain("resolve_place");
    expect(tools).toContain("find_peers");
    expect(tools.at(-1)).toBeUndefined();
  });

  it("keeps the host client the shared client learned at initialize", async () => {
    const seen: Seen[] = [];
    const client = recordingClient(seen);
    client.setHostClient({ name: "claude-code", version: "2.0.1" });
    await callTool(client, "resolve_place", ARGS.resolve_place);
    expect(seen[0]!.headers["User-Agent"]).toBe("onegoodarea-mcp-server/1.0.13 (claude-code/2.0.1)");
    expect(seen[0]!.headers["X-OGA-Tool"]).toBe("resolve_place");
  });

  it("is not sent for an unknown tool, which makes no request", async () => {
    const seen: Seen[] = [];
    const result = await callTool(recordingClient(seen), "not_a_tool", {});
    expect(result.isError).toBe(true);
    expect(seen).toHaveLength(0);
  });
});
