/**
 * MCP tool: get_area_signals (AR-366)
 *
 * Returns the full Signals catalog for a UK area: every signal across all
 * seven categories with raw value + unit, percentile when store-backed,
 * per-signal confidence + engine-grounded reason, source attribution, and
 * observation period. Wraps GET /v1/area.
 *
 * Use this when the LLM needs to inspect the underlying data, not a
 * composite score, the actual signal values that would feed a score.
 */

import type { OogaApiClient } from "../api-client.js";
import { OogaApiError } from "../api-client.js";
import { parseSortArg, SORT_PROPERTY, type SortOrder } from "../api-client.js";
import { formatAreaProfileAsText } from "./signals-format.js";

export const getAreaSignalsToolName = "get_area_signals";

export const getAreaSignalsToolDef = {
  name: getAreaSignalsToolName,
  title: "All signals for a place",
  description:
    "Returns every signal OneGoodArea holds for one place in England, Wales or Scotland, across crime, deprivation, property, schools, amenities, transport and environment: value with unit, percentile where the store has one, confidence with the engine's reason, source and observation period. " +
    "Deprivation includes each nation's domain deciles (income, employment, health, education and more) with the published rank and score. " +
    "This is the data behind every score; for one category only, get_signals_by_category.",
  inputSchema: {
    type: "object",
    properties: {
      area: {
        type: "string",
        description:
          "A postcode (e.g. 'SW1A 1AA'), a place name (e.g. 'Manchester city centre') or a neighbourhood code (e.g. 'E01003920') in England, Wales or Scotland. Up to 100 characters.",
      },
      sort: SORT_PROPERTY,
    },
    required: ["area"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true },
} as const;

export interface GetAreaSignalsArgs {
  area: string;
  sort?: SortOrder;
}

export function parseGetAreaSignalsArgs(raw: unknown): GetAreaSignalsArgs {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("get_area_signals arguments must be an object");
  }
  const obj = raw as Record<string, unknown>;
  const area = obj.area;

  if (typeof area !== "string" || area.trim().length === 0) {
    throw new Error("area must be a non-empty string");
  }
  if (area.length > 100) {
    throw new Error("area must be 100 characters or fewer");
  }

  const sort = parseSortArg(obj.sort);
  return sort ? { area: area.trim(), sort } : { area: area.trim() };
}

export async function executeGetAreaSignals(
  client: OogaApiClient,
  args: GetAreaSignalsArgs,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  try {
    const result = await client.getAreaSignals(args.area, args.sort);
    return { content: [{ type: "text", text: formatAreaProfileAsText(result) }] };
  } catch (err) {
    if (err instanceof OogaApiError) {
      const msg = `OneGoodArea API error (HTTP ${err.status ?? "?"}): ${err.message}`;
      return { content: [{ type: "text", text: msg }], isError: true };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Tool error: ${msg}` }], isError: true };
  }
}
