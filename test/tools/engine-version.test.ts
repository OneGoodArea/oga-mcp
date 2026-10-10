import { describe, it, expect } from "vitest";
import { engineVersionToolDef, executeEngineVersion } from "../../src/tools/engine-version.js";
import { OogaApiClient, OogaApiError, type OogaMetaResponse } from "../../src/api-client.js";

function makeClient(impl: () => Promise<OogaMetaResponse>): OogaApiClient {
  const client = new OogaApiClient({ apiKey: "oga_test" });
  (client as unknown as { meta: () => Promise<OogaMetaResponse> }).meta = impl;
  return client;
}

const META: OogaMetaResponse = {
  engine_version: "1.9.1",
  methodology: [
    { version: "1.0.0", released_at: "2026-07-08", summary: "Launch." },
    { version: "1.9.0", released_at: "2026-09-24", summary: "Flood from the store." },
    { version: "1.9.1", released_at: "2026-09-24", summary: "Peers share most signals." },
  ],
};

describe("engineVersionToolDef", () => {
  it("takes no required args", () => {
    expect(engineVersionToolDef.inputSchema.properties).toEqual({});
    expect(engineVersionToolDef.inputSchema.additionalProperties).toBe(false);
  });
});

describe("executeEngineVersion", () => {
  it("reports the live version, newest release first", async () => {
    const text = (await executeEngineVersion(makeClient(async () => META))).content[0]!.text;
    expect(text).toContain("# OneGoodArea engine 1.9.1");
    expect(text).toContain("Released: 2026-09-24");
    expect(text.indexOf("### 1.9.1 (2026-09-24)")).toBeLessThan(text.indexOf("### 1.9.0"));
    expect(text).toContain("/methodology");
    expect(text).not.toContain("\u2014");
  });

  it("lists at most five releases", async () => {
    const methodology = Array.from({ length: 8 }, (_, i) => ({ version: `1.${i}.0`, released_at: "2026-09-01", summary: "x" }));
    const text = (await executeEngineVersion(makeClient(async () => ({ engine_version: "1.7.0", methodology })))).content[0]!.text;
    expect(text.match(/^### /gm)).toHaveLength(5);
  });

  it("surfaces an API error", async () => {
    const out = await executeEngineVersion(makeClient(async () => { throw new OogaApiError("down", 503, null); }));
    expect(out.isError).toBe(true);
    expect(out.content[0]!.text).toContain("HTTP 503");
  });
});
