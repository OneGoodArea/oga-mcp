/**
 * MCP tool: watch_portfolio (AR-368)
 *
 * One-shot setup for a Monitor portfolio: creates the portfolio and adds
 * the tracked areas in a single call so the LLM can set up watching
 * conversationally. Wraps POST /v1/portfolios + POST /v1/portfolios/:id/areas
 * sequentially.
 *
 * Failure handling: if the create succeeds but the add fails, the response
 * still surfaces the new portfolio_id with `areas_added: 0` so the LLM can
 * tell the user "the portfolio exists but no areas were added; retry with..."
 */

import type { OogaApiClient, OogaPortfolio, OogaPortfolioDetail } from "../api-client.js";
import { OogaApiError } from "../api-client.js";

export const watchPortfolioToolName = "watch_portfolio";

const MAX_AREAS_PER_CALL = 100;

export const watchPortfolioToolDef = {
  name: watchPortfolioToolName,
  title: "Watch a portfolio of places",
  description:
    "Creates a named Monitor portfolio and adds the places to track, in one call. Returns the portfolio id and the tracked places. " +
    "Every call creates a new portfolio, so call it once per portfolio and keep the id; get_portfolio_changes reads material changes for it afterwards. " +
    "Places are postcodes, place names or neighbourhood codes in England, Wales or Scotland.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Display name for the portfolio. 1 to 200 characters.",
      },
      areas: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: MAX_AREAS_PER_CALL,
        description: `Postcodes, place names or neighbourhood codes in England, Wales or Scotland to track. 1 to ${MAX_AREAS_PER_CALL} entries.`,
      },
    },
    required: ["name", "areas"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
} as const;

export interface WatchPortfolioArgs {
  name: string;
  areas: string[];
}

export function parseWatchPortfolioArgs(raw: unknown): WatchPortfolioArgs {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("watch_portfolio arguments must be an object");
  }
  const obj = raw as Record<string, unknown>;
  const name = obj.name;
  const areas = obj.areas;

  if (typeof name !== "string" || name.trim().length === 0) {
    throw new Error("name must be a non-empty string");
  }
  if (name.length > 200) {
    throw new Error("name must be 200 characters or fewer");
  }

  if (!Array.isArray(areas) || areas.length === 0) {
    throw new Error("areas must be a non-empty array");
  }
  if (areas.length > MAX_AREAS_PER_CALL) {
    throw new Error(`areas must contain at most ${MAX_AREAS_PER_CALL} entries`);
  }
  const cleaned: string[] = [];
  for (const a of areas) {
    if (typeof a !== "string" || a.trim().length === 0) {
      throw new Error("every area must be a non-empty string");
    }
    if (a.length > 100) {
      throw new Error("each area must be 100 characters or fewer");
    }
    cleaned.push(a.trim());
  }

  return { name: name.trim(), areas: cleaned };
}

function formatPortfolioSetup(
  created: OogaPortfolio,
  added: OogaPortfolioDetail | null,
  addError: string | null,
): string {
  const lines: string[] = [];
  lines.push(`# Portfolio: ${created.name}`);
  lines.push(`**ID:** \`${created.id}\``);
  if (created.created_at) lines.push(`**Created:** ${created.created_at}`);
  lines.push("");

  if (added !== null) {
    lines.push(`**Areas tracked (${added.areas.length}):**`);
    for (const a of added.areas) {
      const label = a.label ? ` (${a.label})` : "";
      lines.push(`- ${a.area}${label}`);
    }
    lines.push("");
    lines.push(`Use \`get_portfolio_changes\` with portfolio_id \`${created.id}\` to check for material signal moves.`);
  } else {
    lines.push("**Areas tracked: 0**");
    lines.push("");
    lines.push(`The portfolio was created but the area-add step failed: ${addError ?? "unknown error"}.`);
    lines.push(`Retry by calling watch_portfolio with the same name and the same areas (the duplicate portfolio is harmless to leave; or delete it via the dashboard).`);
  }

  return lines.join("\n").trimEnd();
}

export async function executeWatchPortfolio(
  client: OogaApiClient,
  args: WatchPortfolioArgs,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  let created: OogaPortfolio;
  try {
    created = await client.createPortfolio(args.name);
  } catch (err) {
    if (err instanceof OogaApiError) {
      const msg = `OneGoodArea API error (HTTP ${err.status ?? "?"}) creating portfolio: ${err.message}`;
      return { content: [{ type: "text", text: msg }], isError: true };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Tool error: ${msg}` }], isError: true };
  }

  /* Phase 2, add areas. If it fails, the portfolio exists empty; surface
     that so the LLM can act rather than swallowing the create.
     AR-386: addPortfolioAreas now returns {added, portfolio}, pass the
     nested `portfolio` to the formatter (was treating the whole response
     as a PortfolioDetail and crashing on .areas.length). */
  try {
    const result = await client.addPortfolioAreas(
      created.id,
      args.areas.map((a) => ({ area: a })),
    );
    return { content: [{ type: "text", text: formatPortfolioSetup(created, result.portfolio, null) }] };
  } catch (err) {
    const msg = err instanceof OogaApiError
      ? `HTTP ${err.status ?? "?"}: ${err.message}`
      : err instanceof Error
        ? err.message
        : String(err);
    return {
      content: [{ type: "text", text: formatPortfolioSetup(created, null, msg) }],
      isError: true,
    };
  }
}
