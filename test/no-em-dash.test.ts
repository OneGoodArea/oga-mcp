import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

/* AR-1096: this package is mirrored to a public repository. House style
   has no em dashes anywhere, in copy, comments or fixtures. */

const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
const DASH = String.fromCharCode(0x2014);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|md|json)$/.test(name)) out.push(p);
  }
  return out;
}

describe("MCP package text", () => {
  it("carries no em dash in source, tests, README or metadata", () => {
    const offenders = walk(PKG)
      .filter((p) => readFileSync(p, "utf8").includes(DASH))
      .map((p) => relative(PKG, p));
    expect(offenders).toEqual([]);
  });

  it("no longer offers a way to skip the entitlement check", () => {
    const server = readFileSync(join(PKG, "src", "server.ts"), "utf8");
    expect(server).not.toContain("OOGA_SKIP_ENTITLEMENT_CHECK");
  });
});
