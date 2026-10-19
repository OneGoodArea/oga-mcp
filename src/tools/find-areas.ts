/**
 * MCP tool: find_areas (AR-367)
 *
 * Natural-language interface to the OneGoodArea Intelligence query plane.
 * The planner translates the question into a typed plan (one of 7 ops);
 * the database executes it; the response carries plan + plan_source +
 * results so every answer is reproducible.
 *
 * Wraps POST /v1/query with {question}.
 */

import type { OogaApiClient } from "../api-client.js";
import { OogaApiError } from "../api-client.js";
import { formatQueryResponseAsText } from "./intelligence-format.js";

export const findAreasToolName = "find_areas";

export const findAreasToolDef = {
  name: findAreasToolName,
  title: "Ask a question about places",
  description:
    "Answers a natural-language question about places in England, Wales or Scotland by translating it into one typed query plan and running it: rank neighbourhoods by signals with filters, read one area, score an area, compare 2 to 5 areas, find peers, find peer-relative anomalies, or project a signal forward. " +
    "Returns the plan it ran with the results, so the answer is reproducible. Deprivation questions need a nation or a district, because deciles are relative within a nation. " +
    "Each call uses one natural-language question from the key's monthly allowance.",
  inputSchema: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description:
          "A question about places in England, Wales or Scotland. Examples: 'areas under £250k median price and rising YoY in England', 'compare M1 1AE, SW4 0LG, EH1 1BB for site selection', 'neighbourhoods like E01034129 with a similar crime and amenity profile', 'forecast median price in M1 1AE over the next 12 months'. Max 500 characters.",
      },
    },
    required: ["question"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
} as const;

export interface FindAreasArgs {
  question: string;
}

export function parseFindAreasArgs(raw: unknown): FindAreasArgs {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("find_areas arguments must be an object");
  }
  const obj = raw as Record<string, unknown>;
  const question = obj.question;

  if (typeof question !== "string" || question.trim().length === 0) {
    throw new Error("question must be a non-empty string");
  }
  if (question.length > 500) {
    throw new Error("question must be 500 characters or fewer");
  }

  return { question: question.trim() };
}

export async function executeFindAreas(
  client: OogaApiClient,
  args: FindAreasArgs,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  try {
    const result = await client.findAreas(args.question);
    return { content: [{ type: "text", text: formatQueryResponseAsText(result) }] };
  } catch (err) {
    if (err instanceof OogaApiError) {
      const msg = `OneGoodArea API error (HTTP ${err.status ?? "?"}): ${err.message}`;
      return { content: [{ type: "text", text: msg }], isError: true };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Tool error: ${msg}` }], isError: true };
  }
}
