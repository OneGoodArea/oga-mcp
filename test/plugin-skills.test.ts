import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/* AR-1195: the plugin listing shows each skill's description, and the
   skills are the plugin's whole behaviour. Guards the front matter and the
   coverage wording (England, Wales and Scotland; never a bare UK). */

const SKILLS = join(dirname(fileURLToPath(import.meta.url)), "..", "plugin", "skills");
const EM_DASH = String.fromCharCode(0x2014);
const BARE_UK = /\bUK\b/;
const COVERAGE = /England, Wales (?:or|and) Scotland|OneGoodArea/;

const skills = readdirSync(SKILLS).map((name) => ({
  name,
  text: readFileSync(join(SKILLS, name, "SKILL.md"), "utf8").replace(/\r\n/g, "\n"),
}));

describe("plugin skills", () => {
  it("are the four shipped with the plugin", () => {
    expect(skills.map((s) => s.name).sort()).toEqual([
      "area-research-for-lenders",
      "portfolio-watch",
      "read-confidence-and-dates",
      "site-comparison-for-retail",
    ]);
  });

  it.each(skills.map((s) => [s.name, s] as const))("%s has front matter with its folder name and a one-line description", (_name, skill) => {
    const front = skill.text.match(/^---\n([\s\S]*?)\n---\n/);
    expect(front).not.toBeNull();
    expect(front![1]).toMatch(new RegExp(`^name: ${skill.name}$`, "m"));
    const description = front![1].match(/^description: (.+)$/m);
    expect(description).not.toBeNull();
    expect(description![1].length).toBeGreaterThan(60);
    expect(description![1]).toMatch(COVERAGE);
  });

  it.each(skills.map((s) => [s.name, s] as const))("%s names the coverage by nation and uses no em dash", (_name, skill) => {
    expect(skill.text).not.toMatch(BARE_UK);
    expect(skill.text).not.toContain(EM_DASH);
  });
});

/* AR-1200: the plugin listing links its homepage to the product page, not
   the docs. */
const MANIFEST = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "plugin", ".claude-plugin", "plugin.json"),
    "utf8",
  ),
) as { homepage: string; author: { url: string }; privacyPolicyUrl: string };

describe("plugin manifest", () => {
  it("links the product page as its homepage", () => {
    expect(MANIFEST.homepage).toBe("https://www.onegoodarea.com/mcp");
    expect(MANIFEST.author.url).toBe("https://www.onegoodarea.com");
    expect(MANIFEST.privacyPolicyUrl).toBe("https://www.onegoodarea.com/privacy");
  });
});
