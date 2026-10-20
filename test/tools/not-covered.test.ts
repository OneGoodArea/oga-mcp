import { describe, it, expect } from "vitest";
import { OogaApiError } from "../../src/api-client.js";
import { notCoveredResult } from "../../src/tools/not-covered.js";

/* AR-1219: a 422 with code nation_not_covered is a refusal rendered in
   resolve_place's words; every other error stays an error. */

const MESSAGE = "BT1 1AA is in Northern Ireland which OneGoodArea does not cover. Coverage is England, Wales and Scotland.";

describe("notCoveredResult", () => {
  it("renders the nation refusal as a plain answer, not an error", () => {
    const err = new OogaApiError(MESSAGE, 422, { error: MESSAGE, code: "nation_not_covered", reason: "nation_not_covered", source: "area_resolution" });
    const out = notCoveredResult(err);
    expect(out).toEqual({ content: [{ type: "text", text: `Not found (nation_not_covered): ${MESSAGE}` }] });
    expect(out && "isError" in out).toBe(false);
  });

  it("leaves other 422s, other statuses and non-API errors alone", () => {
    expect(notCoveredResult(new OogaApiError("Multiple areas match", 422, { error: "Multiple areas match", code: "ambiguous_area" }))).toBeNull();
    expect(notCoveredResult(new OogaApiError("Could not resolve area", 404, { error: "Could not resolve area", code: "area_not_found" }))).toBeNull();
    expect(notCoveredResult(new OogaApiError("Invalid or revoked API key", 401))).toBeNull();
    expect(notCoveredResult(new Error("network down"))).toBeNull();
  });
});
