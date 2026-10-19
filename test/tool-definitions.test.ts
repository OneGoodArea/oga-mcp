import { describe, it, expect } from "vitest";
import { resolvePlaceToolDef } from "../src/tools/resolve-place.js";
import { scorePostcodeToolDef } from "../src/tools/score-postcode.js";
import { comparePostcodesToolDef } from "../src/tools/compare-postcodes.js";
import { getAreaSignalsToolDef } from "../src/tools/get-area-signals.js";
import { getSignalsByCategoryToolDef } from "../src/tools/get-signals-by-category.js";
import { findAreasToolDef } from "../src/tools/find-areas.js";
import { findPeersToolDef } from "../src/tools/find-peers.js";
import { watchPortfolioToolDef } from "../src/tools/watch-portfolio.js";
import { getPortfolioChangesToolDef } from "../src/tools/get-portfolio-changes.js";
import { areaBriefToolDef } from "../src/tools/area-brief.js";
import { methodologyForToolDef } from "../src/tools/methodology-for.js";
import { engineVersionToolDef } from "../src/tools/engine-version.js";
import { TOOL_DEFINITIONS } from "../src/tools/index.js";

/* AR-1152: the Claude directory requires a title and a read-only or
   destructive hint on every tool, and reads descriptions as the model does.
   This guards the whole set so a new tool cannot ship without them. */

interface ToolShape {
  name: string;
  title: string;
  description: string;
  inputSchema: { type: string; properties: Record<string, { description?: string }>; required?: readonly string[]; additionalProperties: boolean };
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; openWorldHint: boolean; idempotentHint?: boolean };
}

const TOOLS: readonly ToolShape[] = [
  resolvePlaceToolDef,
  scorePostcodeToolDef,
  comparePostcodesToolDef,
  getAreaSignalsToolDef,
  getSignalsByCategoryToolDef,
  findAreasToolDef,
  findPeersToolDef,
  watchPortfolioToolDef,
  getPortfolioChangesToolDef,
  areaBriefToolDef,
  methodologyForToolDef,
  engineVersionToolDef,
];

const EM_DASH = String.fromCharCode(0x2014);
const MODEL_WORDS = /\b(LLM|Claude|Anthropic|GPT|OpenAI|assistant)\b/;
const BARE_UK = /\bUK\b/;

describe("tool definitions", () => {
  it("are twelve, uniquely named, each name 64 characters or fewer", () => {
    const names = TOOLS.map((t) => t.name);
    expect(names).toHaveLength(12);
    expect(new Set(names).size).toBe(12);
    for (const name of names) {
      expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(name.length).toBeLessThanOrEqual(64);
    }
  });

  it.each(TOOLS.map((t) => [t.name, t] as const))("%s carries a title and the three hints the directories read (AR-1166)", (_name, tool) => {
    expect(typeof tool.title).toBe("string");
    expect(tool.title.length).toBeGreaterThan(3);
    expect(typeof tool.annotations.readOnlyHint).toBe("boolean");
    expect(typeof tool.annotations.destructiveHint).toBe("boolean");
    expect(tool.annotations.openWorldHint).toBe(false);
    if (!tool.annotations.readOnlyHint) {
      expect(typeof tool.annotations.idempotentHint).toBe("boolean");
    }
  });

  it("carry the title inside annotations as well, where the directory reads it (AR-1191)", () => {
    expect(TOOL_DEFINITIONS).toHaveLength(TOOLS.length);
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.annotations.title, tool.name).toBe(tool.title);
    }
  });

  it("marks every tool read-only except watch_portfolio, which creates a portfolio", () => {
    for (const tool of TOOLS) {
      expect(tool.annotations.readOnlyHint, tool.name).toBe(tool.name !== "watch_portfolio");
    }
    expect(watchPortfolioToolDef.annotations.destructiveHint).toBe(false);
  });

  it.each(TOOLS.map((t) => [t.name, t] as const))("%s describes itself for the model", (_name, tool) => {
    expect(tool.description.length).toBeGreaterThan(80);
    expect(tool.description.length).toBeLessThan(1000);
    expect(tool.description).not.toContain(EM_DASH);
    expect(tool.description).not.toMatch(MODEL_WORDS);
    expect(tool.description).not.toMatch(BARE_UK);
    expect(tool.description).not.toMatch(/\bLSOA/);
  });

  it.each(TOOLS.map((t) => [t.name, t] as const))("%s describes every argument without bare UK", (_name, tool) => {
    expect(tool.inputSchema.additionalProperties).toBe(false);
    for (const [key, prop] of Object.entries(tool.inputSchema.properties)) {
      expect(typeof prop.description, `${tool.name}.${key}`).toBe("string");
      expect(prop.description, `${tool.name}.${key}`).not.toMatch(BARE_UK);
      expect(prop.description, `${tool.name}.${key}`).not.toContain(EM_DASH);
    }
  });

  it("states coverage by nation on every tool that takes a place", () => {
    const placeTools = TOOLS.filter((t) => ["area", "areas", "query", "question"].some((k) => k in t.inputSchema.properties));
    expect(placeTools.map((t) => t.name)).toHaveLength(9);
    for (const tool of placeTools) {
      const text = tool.description + Object.values(tool.inputSchema.properties).map((p) => p.description ?? "").join(" ");
      expect(text, tool.name).toMatch(/England, Wales (?:or|and) Scotland/);
    }
  });
});
