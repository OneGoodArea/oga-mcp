import { describe, it, expect } from "vitest";
import { CASES } from "../eval/cases.js";
import { GROUPS, GROUP_ORDER, renderResults, scoreCase, summarise } from "../eval/score.js";
import type { CaseResult, EvalCase, Observation } from "../eval/score.js";
import { TOOL_NAMES } from "../src/tools/index.js";

/* AR-1155: the tool-selection eval. The cases and the scorer are pure, so
   everything but the API call is proven here. */

const byId = (id: string): EvalCase => {
  const c = CASES.find((x) => x.id === id);
  if (!c) throw new Error(`no case ${id}`);
  return c;
};

const observed = (calls: Array<{ name: string; input: Record<string, unknown> }>, resolvedFirst = false): Observation => ({
  calls,
  resolvedFirst,
});

describe("eval cases", () => {
  it("are fifty, split as the step list on AR-1168 says", () => {
    expect(CASES).toHaveLength(50);
    for (const group of GROUP_ORDER) {
      expect(CASES.filter((c) => c.group === group), group).toHaveLength(GROUPS[group].cases);
    }
    expect(Object.values(GROUPS).reduce((n, g) => n + g.cases, 0)).toBe(50);
  });

  it("have unique ids prefixed by their group and prompts a user could type", () => {
    const ids = CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CASES) {
      expect(c.id.startsWith(`${c.group}-`), c.id).toBe(true);
      expect(c.prompt.trim().length, c.id).toBeGreaterThan(10);
      expect(c.prompt.length, c.id).toBeLessThanOrEqual(500);
    }
  });

  it("expect a real tool or none, and between them cover every one of the twelve tools", () => {
    const expected = new Set<string>();
    for (const c of CASES) {
      if (c.expect === null) {
        expect(c.check, c.id).toBeUndefined();
        continue;
      }
      expect(TOOL_NAMES, c.id).toContain(c.expect);
      expected.add(c.expect);
    }
    for (const name of TOOL_NAMES) {
      expect(expected.has(name), name).toBe(true);
    }
  });

  it("have argument checks that answer on an empty input instead of throwing", () => {
    for (const c of CASES) {
      if (!c.check) continue;
      const reason = c.check({});
      expect(typeof reason, c.id).toBe("string");
      expect(c.check({ areas: "not a list", cause: 3 }), c.id).toBeTypeOf("string");
    }
  });
});

describe("scoreCase", () => {
  it("passes a tool case when the tool and the arguments are right", () => {
    const r = scoreCase(byId("compare-01"), observed([{ name: "compare_postcodes", input: { areas: ["SE15 5DP", "E17 4AA", "N16 8BX"], preset: "investing" } }]));
    expect(r.toolPass).toBe(true);
    expect(r.pass).toBe(true);
    expect(r.failure).toBeNull();
  });

  it("accepts a resolved place id where a postcode was named", () => {
    const r = scoreCase(
      byId("compare-01"),
      observed([{ name: "compare_postcodes", input: { areas: ["oga_pl_evalfixture00000", "E17 4AA", "oga_pl_evalfixture00000"], preset: "investing" } }], true),
    );
    expect(r.pass).toBe(true);
    expect(r.resolvedFirst).toBe(true);
    const r2 = scoreCase(byId("peers-01"), observed([{ name: "find_peers", input: { area: "oga_pl_evalfixture00000" } }], true));
    expect(r2.pass).toBe(true);
  });

  it("fails on the wrong tool and names what was called", () => {
    const r = scoreCase(byId("compare-02"), observed([{ name: "score_postcode", input: { area: "M1 1AE", preset: "business" } }]));
    expect(r.toolPass).toBe(false);
    expect(r.pass).toBe(false);
    expect(r.failure).toBe("expected compare_postcodes, called score_postcode");
  });

  it("fails on no tool when one was expected", () => {
    const r = scoreCase(byId("find-01"), observed([]));
    expect(r.failure).toBe("expected find_areas, called no tool");
  });

  it("counts the tool as right but the case as failed when an argument check fails", () => {
    const r = scoreCase(byId("single-01"), observed([{ name: "score_postcode", input: { area: "SE15 5DP", preset: "moving" } }]));
    expect(r.toolPass).toBe(true);
    expect(r.pass).toBe(false);
    expect(r.failure).toContain('preset should be "investing"');
  });

  it("scores the expected tool even when another tool was called beside it", () => {
    const r = scoreCase(
      byId("portfolio-02"),
      observed([
        { name: "score_postcode", input: { area: "M1 1AE", preset: "research" } },
        { name: "watch_portfolio", input: { name: "Sites", areas: ["M1 1AE", "M2 4WU", "M3 3EB"] } },
      ]),
    );
    expect(r.pass).toBe(true);
    expect(r.called).toEqual(["score_postcode", "watch_portfolio"]);
  });

  it("passes a no-tool case only when nothing was called", () => {
    expect(scoreCase(byId("none-06"), observed([])).pass).toBe(true);
    const r = scoreCase(byId("none-06"), observed([{ name: "find_areas", input: { question: "Belfast lowest crime" } }]));
    expect(r.pass).toBe(false);
    expect(r.failure).toBe("expected no tool, called find_areas");
  });

  it("checks list arguments, named fields and numbers", () => {
    const h2 = byId("history-02");
    expect(scoreCase(h2, observed([{ name: "get_portfolio_changes", input: { portfolio_id: "pf_7f3a9c", cause: ["method"], threshold_pct: 10 } }])).pass).toBe(true);
    expect(scoreCase(h2, observed([{ name: "get_portfolio_changes", input: { portfolio_id: "pf_7f3a9c", threshold_pct: 10 } }])).failure).toContain("cause should be a list");
    expect(scoreCase(h2, observed([{ name: "get_portfolio_changes", input: { portfolio_id: "pf_7f3a9c", cause: ["source"], threshold_pct: 10 } }])).failure).toContain("cause should include method");
    const p2 = byId("peers-02");
    expect(scoreCase(p2, observed([{ name: "find_peers", input: { area: "Didsbury", k: 20 } }])).failure).toContain("k should be 10");
    const c1 = byId("compare-01");
    expect(scoreCase(c1, observed([{ name: "compare_postcodes", input: { areas: ["SE15 5DP"], preset: "investing" } }])).failure).toContain("areas should include E17 4AA, N16 8BX");
  });

  it("fails a case whose request failed and keeps the error", () => {
    const r = scoreCase(byId("none-01"), { calls: [], resolvedFirst: false, error: "529 overloaded" });
    expect(r.pass).toBe(false);
    expect(r.toolPass).toBe(false);
    expect(r.failure).toBe("request failed: 529 overloaded");
  });
});

describe("summarise and renderResults", () => {
  const results: CaseResult[] = CASES.map((c) => {
    if (c.id === "compare-02") return scoreCase(c, observed([{ name: "score_postcode", input: { area: "M1 1AE", preset: "business" } }]));
    if (c.id === "none-06") return scoreCase(c, observed([{ name: "find_areas", input: { question: "Belfast" } }]));
    if (c.id === "single-01") return scoreCase(c, observed([{ name: "score_postcode", input: { area: "SE15 5DP", preset: "moving" } }]));
    if (c.expect === null) return scoreCase(c, observed([]));
    const input: Record<string, unknown> = { areas: ["SE15 5DP", "E17 4AA", "N16 8BX", "EH1 1YZ", "G1 1XQ", "AB10 1AB", "DD1 1DB", "M1 1AE", "M4 1HN", "Leeds city centre", "Headingley", "CF10 1EP", "SA1 1AA", "BS1 4DJ", "BA1 1AA", "GL1 1AA", "NE1 7RU", "SR1 3AA", "DH1 3AA", "Peckham", "Brixton", "Camberwell", "Dulwich", "SE22 8HF", "SE5 8TR", "M2 4WU", "M3 3EB", "LL57 1DT"], preset: c.id === "compare-01" || c.id === "compare-07" ? "investing" : c.id === "compare-02" || c.id === "compare-05" ? "business" : c.id === "compare-04" ? "research" : "moving" };
    const perTool: Record<string, Record<string, unknown>> = {
      compare_postcodes: input,
      find_areas: { question: c.prompt },
      find_peers: { area: c.prompt, k: 10 },
      get_portfolio_changes: { portfolio_id: "pf_7f3a9c", cause: ["method"], threshold_pct: 10 },
      engine_version: {},
      methodology_for: { dimension: c.id === "history-04" ? "Crime" : "Environment" },
      watch_portfolio: { name: c.prompt, areas: input.areas },
      resolve_place: { query: c.prompt },
      score_postcode: { area: c.prompt, preset: c.id === "single-01" ? "investing" : "moving" },
      get_area_signals: { area: c.prompt },
      get_signals_by_category: { area: c.prompt, category: "crime" },
      area_brief: { area: c.prompt, audience: c.id === "single-05" ? "lender" : "insurer" },
    };
    return scoreCase(c, observed([{ name: c.expect as string, input: perTool[c.expect as string] }], c.group === "peers"));
  });

  it("counts per group and overall", () => {
    const s = summarise(results);
    expect(s.cases).toBe(50);
    expect(s.pass).toBe(47);
    expect(s.toolPass).toBe(48);
    expect(s.resolvedFirst).toBe(4);
    expect(s.errors).toBe(0);
    expect(s.failures.map((f) => f.id)).toEqual(["compare-02", "single-01", "none-06"]);
    const compare = s.groups.find((g) => g.group === "compare");
    expect(compare).toEqual({ group: "compare", label: "Compare named places", cases: 8, toolPass: 7, pass: 7 });
  });

  it("renders a deterministic RESULTS.md with the table, the overall line and the failures", () => {
    const meta = { model: "claude-haiku-4-5", packageVersion: "1.0.13", ranOn: "2026-10-20" };
    const a = renderResults(summarise(results), meta);
    const b = renderResults(summarise(results), meta);
    expect(a).toBe(b);
    expect(a).toContain("# Tool-selection eval");
    expect(a).toContain("50 prompts sent to `claude-haiku-4-5` with the twelve tool definitions of `@oga-mcp/server` 1.0.13");
    expect(a).toContain("| Compare named places | 8 | 7 | 7 |");
    expect(a).toContain("| All | 50 | 48 | 47 |");
    expect(a).toContain("Overall: 47 of 50 passed (94%). Tool choice right in 48 of 50 (96%). 4 prompts went through resolve_place first.");
    expect(a).toContain("- `compare-02`: expected compare_postcodes, called score_postcode. Prompt: \"Which is the better spot to open a coffee shop: M1 1AE or M4 1HN?\"");
    expect(a).not.toContain(String.fromCharCode(0x2014));
  });

  it("says None when nothing failed and reports failed requests", () => {
    const clean = results.map((r) => ({ ...r, pass: true, toolPass: true, failure: null }));
    expect(renderResults(summarise(clean), { model: "m", packageVersion: "0", ranOn: "2026-10-20" })).toContain("## Failures\n\nNone.");
    const broken = results.map((r, i) => (i === 0 ? { ...r, pass: false, toolPass: false, failure: "request failed: 529 overloaded" } : r));
    const s = summarise(broken);
    expect(s.errors).toBe(1);
    expect(renderResults(s, { model: "m", packageVersion: "0", ranOn: "2026-10-20" })).toContain("1 request failed.");
  });
});
