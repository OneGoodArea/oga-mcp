/**
 * MCP tool: get_signals_by_category (AR-366)
 *
 * Returns the Signals for one category only (crime, deprivation, property,
 * schools, amenities, transport, or environment). Use this when the LLM
 * needs to focus on a single data domain, narrower than get_area_signals,
 * same engine-grounded fields per signal.
 *
 * Wraps GET /v1/signals/:category.
 */

import type { OogaApiClient, SignalCategory } from "../api-client.js";
import { OogaApiError, SIGNAL_CATEGORIES } from "../api-client.js";
import { parseSortArg, SORT_PROPERTY, type SortOrder } from "../api-client.js";
import { formatAreaProfileAsText } from "./signals-format.js";

export const getSignalsByCategoryToolName = "get_signals_by_category";

export const getSignalsByCategoryToolDef = {
  name: getSignalsByCategoryToolName,
  description:
    "Get OneGoodArea Signals for a single category at a UK area. Categories: crime (police.uk), deprivation (IMD/WIMD/SIMD), property (HM Land Registry), schools (Ofsted/Estyn/Education Scotland), amenities (OpenStreetMap), transport (OpenStreetMap), environment (Environment Agency). " +
    "Same per-signal shape as get_area_signals (value, unit, percentile when store-backed, confidence with engine-grounded reason, source, observation period), narrowed to one category for focused analysis. Deprivation includes each nation's domain deciles with the published rank and score.",
  inputSchema: {
    type: "object",
    properties: {
      area: {
        type: "string",
        description:
          "UK postcode (e.g. 'SW1A 1AA') or place name (e.g. 'Manchester city centre'). Max 100 characters.",
      },
      category: {
        type: "string",
        enum: SIGNAL_CATEGORIES,
        description:
          "Signal category to return. One of: crime, deprivation, property, schools, amenities, transport, environment.",
      },
      sort: SORT_PROPERTY,
    },
    required: ["area", "category"],
    additionalProperties: false,
  },
} as const;

export interface GetSignalsByCategoryArgs {
  area: string;
  category: SignalCategory;
  sort?: SortOrder;
}

export function parseGetSignalsByCategoryArgs(raw: unknown): GetSignalsByCategoryArgs {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("get_signals_by_category arguments must be an object");
  }
  const obj = raw as Record<string, unknown>;
  const area = obj.area;
  const category = obj.category;

  if (typeof area !== "string" || area.trim().length === 0) {
    throw new Error("area must be a non-empty string");
  }
  if (area.length > 100) {
    throw new Error("area must be 100 characters or fewer");
  }
  if (typeof category !== "string" || !(SIGNAL_CATEGORIES as readonly string[]).includes(category)) {
    throw new Error(`category must be one of: ${SIGNAL_CATEGORIES.join(", ")}`);
  }

  const sort = parseSortArg(obj.sort);
  const parsed = { area: area.trim(), category: category as SignalCategory };
  return sort ? { ...parsed, sort } : parsed;
}

export async function executeGetSignalsByCategory(
  client: OogaApiClient,
  args: GetSignalsByCategoryArgs,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  try {
    const result = await client.getSignalsByCategory(args.area, args.category, args.sort);
    return { content: [{ type: "text", text: formatAreaProfileAsText(result, args.category) }] };
  } catch (err) {
    if (err instanceof OogaApiError) {
      const msg = `OneGoodArea API error (HTTP ${err.status ?? "?"}): ${err.message}`;
      return { content: [{ type: "text", text: msg }], isError: true };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Tool error: ${msg}` }], isError: true };
  }
}
