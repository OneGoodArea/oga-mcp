/**
 * MCP tool: area_brief (AR-369), the marquee composite.
 *
 * Given an area + audience, returns a fully-formatted audience-shaped
 * brief on that area, composed from real engine state. Internally calls
 * GET /v1/area (full signal catalog) and POST /v1/score?explain=true
 * (audience's preset, with server-composed summary + recommendations +
 * data sources), then renders an audience-specific markdown layout.
 *
 * Brief-shape policy: no client-side text synthesis. The MCP only
 * SELECTS which real fields render in which section per the audience
 * config. Every word of prose comes from the engine.
 */

import type { OogaApiClient } from "../api-client.js";
import { OogaApiError } from "../api-client.js";
import { AUDIENCES, getAudienceConfig, type Audience } from "./area-brief-audiences.js";
import { formatAreaBriefAsText } from "./area-brief-format.js";

export const areaBriefToolName = "area_brief";

export const areaBriefToolDef = {
  name: areaBriefToolName,
  title: "Brief on a place for an audience",
  description:
    "Writes a brief on one place in England, Wales or Scotland for one audience: lender (residential mortgage origination), insurer (property risk underwriting), retailer (site selection) or investor (residential investment). " +
    "Combines the full signals catalogue with the audience's scoring preset and returns a markdown document: verdict, the dimensions and signals that matter to that audience with provenance, recommendations and data sources, all composed from engine output. " +
    "Counts as two API calls.",
  inputSchema: {
    type: "object",
    properties: {
      area: {
        type: "string",
        description:
          "A postcode (e.g. 'SW1A 1AA'), a place name (e.g. 'Manchester city centre') or a neighbourhood code (e.g. 'E01003920') in England, Wales or Scotland. Up to 100 characters.",
      },
      audience: {
        type: "string",
        enum: AUDIENCES,
        description: "Who the brief is for: lender, insurer, retailer or investor.",
      },
    },
    required: ["area", "audience"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
} as const;

export interface AreaBriefArgs {
  area: string;
  audience: Audience;
}

export function parseAreaBriefArgs(raw: unknown): AreaBriefArgs {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("area_brief arguments must be an object");
  }
  const obj = raw as Record<string, unknown>;
  const area = obj.area;
  const audience = obj.audience;

  if (typeof area !== "string" || area.trim().length === 0) {
    throw new Error("area must be a non-empty string");
  }
  if (area.length > 100) {
    throw new Error("area must be 100 characters or fewer");
  }
  if (typeof audience !== "string" || !(AUDIENCES as readonly string[]).includes(audience)) {
    throw new Error(`audience must be one of: ${AUDIENCES.join(", ")}`);
  }

  return { area: area.trim(), audience: audience as Audience };
}

export async function executeAreaBrief(
  client: OogaApiClient,
  args: AreaBriefArgs,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const config = getAudienceConfig(args.audience);

  try {
    /* Two parallel calls, the brief needs both responses to render
       and the network round-trip is the dominant cost. /v1/score is
       called with explain=true (AR-363) so summary + recommendations
       + data_sources come back server-composed. */
    const [profile, score] = await Promise.all([
      client.getAreaSignals(args.area),
      client.scoreArea(args.area, config.preset),
    ]);

    return {
      content: [{ type: "text", text: formatAreaBriefAsText(config, profile, score) }],
    };
  } catch (err) {
    if (err instanceof OogaApiError) {
      const msg = `OneGoodArea API error (HTTP ${err.status ?? "?"}): ${err.message}`;
      return { content: [{ type: "text", text: msg }], isError: true };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Tool error: ${msg}` }], isError: true };
  }
}
