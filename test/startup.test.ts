import { describe, it, expect } from "vitest";
import { trainingCaptureLine, trainingCaptureState } from "../src/startup.js";

describe("training capture boot line", () => {
  it("reads a missing flag as opted out, the default since AR-1152", () => {
    expect(trainingCaptureState({})).toBe("off");
    expect(trainingCaptureState({ key: {} })).toBe("off");
    expect(trainingCaptureLine({ key: { training_optout: true } })).toContain("Training-data capture: OFF (the default)");
  });

  it("says when the owner opted in", () => {
    expect(trainingCaptureState({ key: { training_optout: false } })).toBe("on");
    expect(trainingCaptureLine({ key: { training_optout: false } })).toContain("ON (you opted in)");
  });

  it("points at the toggle and the policy", () => {
    const line = trainingCaptureLine({});
    expect(line).toContain("https://www.onegoodarea.com/api-usage");
    expect(line).toContain("https://www.onegoodarea.com/legal/data-policy");
    expect(line.endsWith("\n")).toBe(true);
  });
});
