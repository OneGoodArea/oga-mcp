import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { TOOL_DEFINITIONS } from "../src/tools/index.js";

/* AR-1166: the OpenAI plugin directory reads this package. It must name real
   tools, carry exactly the review cases the directory requires, and point at
   the hosted endpoint with OAuth. */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "openai-plugin");
const read = (rel: string) => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));

interface PositiveCase { description: string; prompt: string; tools_triggered: string; expected_behavior: string }
interface NegativeCase { description: string; prompt: string }

const manifest = read("plugin.json");
const mcp = read("mcp.json");
const openai = manifest.extensions["com.openai"];
const EM_DASH = String.fromCharCode(0x2014);
const BARE_UK = /\bUK\b/;

describe("OpenAI plugin package", () => {
  it("identifies the package and links our own pages over https", () => {
    expect(manifest.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    for (const key of ["websiteURL", "supportURL", "privacyPolicyURL", "termsOfServiceURL"]) {
      expect(openai.interface[key], key).toMatch(/^https:\/\/www\.onegoodarea\.com\//);
    }
    expect(manifest.homepage).toBe("https://www.onegoodarea.com/mcp");
  });

  it("keeps the listing text within the directory's limits and our wording rules", () => {
    const ui = openai.interface;
    expect(ui.displayName.length).toBeLessThanOrEqual(30);
    expect(ui.shortDescription.length).toBeLessThanOrEqual(30);
    expect(ui.longDescription.length).toBeLessThanOrEqual(4000);
    expect(ui.developerName.length).toBeLessThanOrEqual(80);
    expect(ui.capabilities.length).toBeLessThanOrEqual(20);
    for (const prompt of ui.defaultPrompt) expect(prompt.length).toBeLessThanOrEqual(128);
    const text = JSON.stringify(manifest);
    expect(text).not.toContain(EM_DASH);
    expect(text).not.toMatch(BARE_UK);
    expect(ui.longDescription).toMatch(/England, Wales (?:or|and) Scotland/);
  });

  it("ships the icons it references", () => {
    for (const key of ["composerIcon", "logo"]) {
      const rel = openai.interface[key] as string;
      expect(rel.startsWith("./")).toBe(true);
      expect(existsSync(join(ROOT, rel)), rel).toBe(true);
    }
  });

  it("carries five positive and three negative review cases naming real tools", () => {
    const names = new Set(TOOL_DEFINITIONS.map((t) => t.name));
    const positive = openai.review.test_cases.positive as PositiveCase[];
    const negative = openai.review.test_cases.negative as NegativeCase[];
    expect(positive).toHaveLength(5);
    expect(negative).toHaveLength(3);
    for (const c of positive) {
      expect(c.description.length).toBeGreaterThan(10);
      expect(c.prompt.length).toBeGreaterThan(5);
      expect(c.expected_behavior.length).toBeGreaterThan(20);
      for (const tool of c.tools_triggered.split(",").map((s) => s.trim())) {
        expect(names.has(tool), tool).toBe(true);
      }
    }
    for (const c of negative) {
      expect(c.description.length).toBeGreaterThan(10);
      expect(c.prompt.length).toBeGreaterThan(5);
    }
  });

  it("points at the hosted endpoint with OAuth and dynamic client registration", () => {
    const server = mcp.mcpServers.onegoodarea;
    expect(server.type).toBe("streamable-http");
    expect(server.url).toBe("https://api.onegoodarea.com/mcp");
    expect(server.headers).toBeUndefined();
    expect(server.extensions["com.openai"].auth).toEqual({ type: "oauth", client: { mode: "dcr" } });
  });
});
