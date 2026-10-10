import { describe, it, expect } from "vitest";
import {
  methodologyForToolDef,
  parseMethodologyForArgs,
  executeMethodologyFor,
} from "../../src/tools/methodology-for.js";

describe("methodologyForToolDef", () => {
  it("requires dimension", () => {
    expect(methodologyForToolDef.inputSchema.required).toEqual(["dimension"]);
  });

  it("description lists recognised dimensions", () => {
    expect(methodologyForToolDef.description).toContain("Crime");
    expect(methodologyForToolDef.description).toContain("Transport");
  });
});

describe("parseMethodologyForArgs", () => {
  it("accepts valid input", () => {
    expect(parseMethodologyForArgs({ dimension: "Crime" })).toEqual({ dimension: "Crime" });
  });

  it("trims whitespace", () => {
    expect(parseMethodologyForArgs({ dimension: "  Schools  " }).dimension).toBe("Schools");
  });

  it("rejects empty string", () => {
    expect(() => parseMethodologyForArgs({ dimension: "" })).toThrow();
    expect(() => parseMethodologyForArgs({ dimension: "   " })).toThrow();
  });
});

describe("executeMethodologyFor", () => {
  it("returns methodology for exact dimension name", () => {
    const out = executeMethodologyFor({ dimension: "Crime" });
    expect(out.isError).toBeFalsy();
    expect(out.content[0].text).toContain("# Crime");
    expect(out.content[0].text).toContain("police.uk");
    expect(out.content[0].text).toContain("moving");
  });

  it("matches case-insensitively", () => {
    const out = executeMethodologyFor({ dimension: "crime" });
    expect(out.isError).toBeFalsy();
    expect(out.content[0].text).toContain("# Crime");
  });

  it("matches partial query (substring)", () => {
    const out = executeMethodologyFor({ dimension: "transport" });
    expect(out.isError).toBeFalsy();
    expect(out.content[0].text).toContain("Transport");
    expect(out.content[0].text).toContain("NaPTAN");
  });

  it("returns error with available list when unknown dimension", () => {
    const out = executeMethodologyFor({ dimension: "made-up dimension" });
    expect(out.isError).toBe(true);
    expect(out.content[0].text).toContain("No methodology found");
    expect(out.content[0].text).toContain("Crime");
  });

  it("includes per-intent weights for the dimension", () => {
    const out = executeMethodologyFor({ dimension: "Property" });
    expect(out.content[0].text).toContain("moving");
    expect(out.content[0].text).toContain("20%");
  });

  it("includes link to full methodology page", () => {
    const out = executeMethodologyFor({ dimension: "Schools" });
    expect(out.content[0].text).toContain("/methodology");
  });

  /* AR-391: "Used in intents" header must agree with the weights
     table, derived from non-zero weights, NOT the static intents
     field which had drifted. Crime previously read
     "Used in intents: moving, research" but had non-zero weights
     for all 4 presets. */
  it("derives 'Used in intents' from non-zero weights (no header/table drift)", () => {
    const out = executeMethodologyFor({ dimension: "Crime" });
    const text = out.content[0].text;
    // Header reflects ALL 4 presets (all have non-zero weight).
    expect(text).toMatch(/Used in intents:.*moving.*business.*investing.*research/s);
  });

  it("all seven dimensions are weighted for every preset", () => {
    for (const dim of ["Crime", "Deprivation", "Property", "Schools", "Amenities", "Transport", "Environment"]) {
      const out = executeMethodologyFor({ dimension: dim });
      const text = out.content[0].text;
      expect(text).toMatch(/Used in intents:.*moving.*business.*investing.*research/s);
    }
  });
});
