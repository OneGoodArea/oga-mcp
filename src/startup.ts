/**
 * The lines the server prints on boot. Pure, so they can be tested without
 * starting a transport.
 */

import type { OogaMeResponse } from "./api-client.js";

export const TRAINING_TOGGLE_URL = "https://www.onegoodarea.com/api-usage";
export const DATA_POLICY_URL = "https://www.onegoodarea.com/legal/data-policy";

/** Training capture is opt-in since AR-1152: a key without the flag is treated
    as opted out, which is also what the API now stores for every new key. */
export function trainingCaptureState(me: Pick<OogaMeResponse, "key">): "off" | "on" {
  const optout = me.key?.training_optout ?? true;
  return optout ? "off" : "on";
}

export function trainingCaptureLine(me: Pick<OogaMeResponse, "key">): string {
  const state = trainingCaptureState(me) === "off" ? "OFF (the default)" : "ON (you opted in)";
  return (
    `[oga-mcp] Training-data capture: ${state} for this key. ` +
    `Toggle at ${TRAINING_TOGGLE_URL} · Policy: ${DATA_POLICY_URL}\n`
  );
}
