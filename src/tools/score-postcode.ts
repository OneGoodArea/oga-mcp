/**
 * MCP tool: score_postcode
 *
 * Lets a Claude / Cursor / MCP-compatible client score any UK area for a
 * given decision preset. Wraps POST /v1/score?explain=true so the response
 * carries server-side composed summary + per-dimension reasoning +
 * recommendations + data-source attribution. The MCP NEVER synthesises
 * narrative, every line of output comes from real engine state.
 */

import type { OogaApiClient, Preset, OogaScoreResponse } from "../api-client.js";
import { OogaApiError } from "../api-client.js";

export const scorePostcodeToolName = "score_postcode";

export const scorePostcodeToolDef = {
  name: scorePostcodeToolName,
  title: "Score a place for a decision",
  description:
    "Scores one place in England, Wales or Scotland for a decision preset: an overall 0 to 100 score, seven weighted dimensions each with confidence and the engine's reasoning, a one-paragraph summary, recommendations drawn from low-scoring or low-confidence dimensions, and the public datasets used. " +
    "Deterministic, with the methodology version stamped on the response. For the underlying numbers rather than a composite, get_area_signals; for several places at once, compare_postcodes.",
  inputSchema: {
    type: "object",
    properties: {
      area: {
        type: "string",
        description:
          "A postcode (e.g. 'SW1A 1AA'), a place name (e.g. 'Manchester city centre') or a neighbourhood code (e.g. 'E01003920') in England, Wales or Scotland. Up to 100 characters.",
      },
      preset: {
        type: "string",
        enum: ["moving", "business", "investing", "research"],
        description:
          "The decision the score is for. 'moving' = residential mortgage origination (suitability, demand-side risk). " +
          "'business' = site selection (footfall, competition, commercial viability). " +
          "'investing' = investment scoring (yield, growth, regeneration). " +
          "'research' = reference scoring (neutral baseline across all seven dimensions).",
      },
    },
    required: ["area", "preset"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
} as const;

export interface ScorePostcodeArgs {
  area: string;
  preset: Preset;
}

export function parseScorePostcodeArgs(raw: unknown): ScorePostcodeArgs {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("score_postcode arguments must be an object");
  }
  const obj = raw as Record<string, unknown>;
  const area = obj.area;
  const preset = obj.preset;

  if (typeof area !== "string" || area.trim().length === 0) {
    throw new Error("area must be a non-empty string");
  }
  if (area.length > 100) {
    throw new Error("area must be 100 characters or fewer");
  }
  const presets: Preset[] = ["moving", "business", "investing", "research"];
  if (typeof preset !== "string" || !presets.includes(preset as Preset)) {
    throw new Error(`preset must be one of: ${presets.join(", ")}`);
  }

  return { area: area.trim(), preset: preset as Preset };
}

export function formatScoreResultAsText(result: OogaScoreResponse): string {
  const lines: string[] = [];

  lines.push(`# ${result.area} · ${result.preset} · ${result.score}/100`);
  lines.push(`Engine version: ${result.engine_version}`);
  lines.push(`Area type: ${result.area_type ?? "unavailable (ranked among all GB neighbourhoods)"}`);
  lines.push("");

  if (result.summary) {
    lines.push(`## Summary`);
    lines.push(result.summary);
    lines.push("");
  }

  lines.push(`## Dimensions`);
  for (const d of result.dimensions) {
    const conf = ` · confidence ${(d.confidence * 100).toFixed(0)}%`;
    lines.push(`- **${d.label}**: ${d.score}/100 (weight ${d.weight}%${conf})`);
    lines.push(`  ${d.reasoning}`);
    lines.push(`  _${d.confidence_reason}_`);
  }
  lines.push("");

  if (result.recommendations && result.recommendations.length > 0) {
    lines.push(`## Recommendations`);
    for (const r of result.recommendations) lines.push(`- ${r}`);
    lines.push("");
  }

  if (result.data_sources && result.data_sources.length > 0) {
    lines.push(`## Data sources`);
    lines.push(result.data_sources.join(" · "));
  }

  return lines.join("\n").trimEnd();
}

/**
 * Tool execution. Calls the API, returns formatted text. Throws on auth /
 * quota errors with a clear message the LLM can pass to the user.
 */
export async function executeScorePostcode(
  client: OogaApiClient,
  args: ScorePostcodeArgs,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  try {
    const result = await client.scoreArea(args.area, args.preset);
    return {
      content: [{ type: "text", text: formatScoreResultAsText(result) }],
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
