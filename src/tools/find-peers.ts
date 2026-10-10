/**
 * MCP tool: find_peers (AR-367)
 *
 * k-nearest-neighbour peers for a UK area, by normalized signal values.
 * Returns the target's geo_code + signals_used + a ranked peers[] list
 * with distance and how many signal dimensions contributed.
 *
 * Wraps POST /v1/peers.
 */

import type { OogaApiClient } from "../api-client.js";
import { OogaApiError } from "../api-client.js";
import { renderPeersBlock } from "./intelligence-format.js";

export const findPeersToolName = "find_peers";

export const findPeersToolDef = {
  name: findPeersToolName,
  description:
    "Find LSOAs similar to a UK area by k-nearest-neighbour over normalized signal values. " +
    "Returns the target LSOA, the signal dimensions used in the comparison, and a ranked list of peers with distance (0 = identical, 1 = maximally distant in the normalized space) and n_dims_used. " +
    "Use this when the LLM needs 'areas like this one' for a specific postcode or place name.",
  inputSchema: {
    type: "object",
    properties: {
      area: {
        type: "string",
        description:
          "UK postcode (e.g. 'SW1A 1AA') or place name (e.g. 'Manchester city centre'). Max 100 characters.",
      },
      k: {
        type: "number",
        description: "Number of peers to return. Default 20, max 200.",
        minimum: 1,
        maximum: 200,
      },
    },
    required: ["area"],
    additionalProperties: false,
  },
} as const;

export interface FindPeersArgs {
  area: string;
  k?: number;
}

export function parseFindPeersArgs(raw: unknown): FindPeersArgs {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("find_peers arguments must be an object");
  }
  const obj = raw as Record<string, unknown>;
  const area = obj.area;
  const kRaw = obj.k;

  if (typeof area !== "string" || area.trim().length === 0) {
    throw new Error("area must be a non-empty string");
  }
  if (area.length > 100) {
    throw new Error("area must be 100 characters or fewer");
  }

  let k: number | undefined;
  if (kRaw !== undefined) {
    if (typeof kRaw !== "number" || !Number.isInteger(kRaw) || kRaw < 1 || kRaw > 200) {
      throw new Error("k must be an integer between 1 and 200");
    }
    k = kRaw;
  }

  return { area: area.trim(), k };
}

export async function executeFindPeers(
  client: OogaApiClient,
  args: FindPeersArgs,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  try {
    const result = await client.findPeers(args.area, args.k);
    const lines: string[] = [];
    lines.push(`# Peers · ${args.area}`);
    lines.push(`Generated at: ${result.meta.generated_at}`);
    lines.push("");
    lines.push(renderPeersBlock(result));
    return { content: [{ type: "text", text: lines.join("\n").trimEnd() }] };
  } catch (err) {
    if (err instanceof OogaApiError) {
      const msg = `OneGoodArea API error (HTTP ${err.status ?? "?"}): ${err.message}`;
      return { content: [{ type: "text", text: msg }], isError: true };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Tool error: ${msg}` }], isError: true };
  }
}
