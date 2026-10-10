import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/* AR-1097: this package is mirrored to github.com/OneGoodArea/oga-mcp. The
   licence and the package's own links must point there; the sync workflow
   must keep carrying everything except the tests that reach into the
   monorepo. The workflow checks skip inside the mirror, where the workflow
   file does not exist. */

const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIRROR = "https://github.com/OneGoodArea/oga-mcp";
const WORKFLOW = join(PKG, "..", ".github", "workflows", "mirror-mcp.yml");
const read = (p: string) => readFileSync(p, "utf8");

describe("public mirror", () => {
  it("ships an MIT licence held by OneGoodArea", () => {
    const licence = read(join(PKG, "LICENSE"));
    expect(licence.startsWith("MIT License")).toBe(true);
    expect(licence).toContain("Copyright (c) 2026 OneGoodArea");
    expect(JSON.parse(read(join(PKG, "package.json"))).license).toBe("MIT");
  });

  it("is where package.json sends people for source and issues", () => {
    const pkg = JSON.parse(read(join(PKG, "package.json")));
    expect(pkg.repository).toEqual({ type: "git", url: `git+${MIRROR}.git` });
    expect(pkg.bugs).toEqual({ url: `${MIRROR}/issues` });
    expect(read(join(PKG, "README.md"))).toContain(MIRROR);
  });

  it("tells Glama who maintains it", () => {
    const glama = JSON.parse(read(join(PKG, "glama.json")));
    expect(glama.$schema).toBe("https://glama.ai/mcp/schemas/server.json");
    expect(glama.maintainers).toContain("ptengelmann");
  });

  it.skipIf(!existsSync(WORKFLOW))("is fed by the sync workflow on every change to mcp/", () => {
    const wf = read(WORKFLOW);
    expect(wf).toContain("branches: [main]");
    expect(wf).toContain('- "mcp/**"');
    expect(wf).toContain("workflow_dispatch:");
    expect(wf).toContain("secrets.MCP_MIRROR_DEPLOY_KEY");
    expect(wf).toContain("git@github.com:OneGoodArea/oga-mcp.git");
    for (const excluded of ["node_modules", "dist", "test/registry-metadata.test.ts", "test/user-agent.test.ts"]) {
      expect(wf).toContain(`--exclude ${excluded}`);
    }
    expect(wf).toContain("--delete");
  });
});
