/**
 * MCP tool: compare_postcodes
 *
 * Scores N areas (max 8) for a single preset in parallel and returns a
 * comparison table sorted by overall score. Uses the existing scoreArea
 * client method, Promise.allSettled in parallel, individual failures are
 * captured inline rather than failing the whole call. Each per-area
 * summary uses the server-composed `summary` from /v1/score?explain=true;
 * no client-side narrative synthesis.
 */

import type { OogaApiClient, Preset, OogaScoreResponse } from "../api-client.js";
import { OogaApiError } from "../api-client.js";

const MAX_AREAS = 8;

export const comparePostcodesToolName = "compare_postcodes";

export const comparePostcodesToolDef = {
  name: comparePostcodesToolName,
  title: "Compare places side by side",
  description:
    "Scores 2 to 8 places in England, Wales or Scotland for the same decision preset and returns one table sorted by score: overall score, area type, strongest dimension and a one-line summary per place. " +
    "Each place is scored independently, so a place that fails is reported in its row while the others still return.",
  inputSchema: {
    type: "object",
    properties: {
      areas: {
        type: "array",
        items: { type: "string" },
        minItems: 2,
        maxItems: MAX_AREAS,
        description: `Postcodes, place names or neighbourhood codes in England, Wales or Scotland to compare. Between 2 and ${MAX_AREAS} entries.`,
      },
      preset: {
        type: "string",
        enum: ["moving", "business", "investing", "research"],
        description:
          "The preset applied to every place: 'moving' for residential mortgage origination, 'business' for site selection, 'investing' for yield and growth, 'research' for a neutral baseline.",
      },
    },
    required: ["areas", "preset"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true },
} as const;

export interface ComparePostcodesArgs {
  areas: string[];
  preset: Preset;
}

export function parseComparePostcodesArgs(raw: unknown): ComparePostcodesArgs {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("compare_postcodes arguments must be an object");
  }
  const obj = raw as Record<string, unknown>;
  const areas = obj.areas;
  const preset = obj.preset;

  if (!Array.isArray(areas)) {
    throw new Error("areas must be an array");
  }
  if (areas.length < 2) {
    throw new Error("areas must contain at least 2 entries");
  }
  if (areas.length > MAX_AREAS) {
    throw new Error(`areas must contain at most ${MAX_AREAS} entries`);
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

  const presets: Preset[] = ["moving", "business", "investing", "research"];
  if (typeof preset !== "string" || !presets.includes(preset as Preset)) {
    throw new Error(`preset must be one of: ${presets.join(", ")}`);
  }

  return { areas: cleaned, preset: preset as Preset };
}

interface ComparisonRow {
  area: string;
  score: number | null;
  result: OogaScoreResponse | null;
  error: string | null;
}

export function formatComparisonAsText(rows: ComparisonRow[], preset: Preset): string {
  // Sort: successful results by descending score, errors at the bottom
  const sorted = [...rows].sort((a, b) => {
    if (a.score === null && b.score === null) return 0;
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return b.score - a.score;
  });

  const lines: string[] = [];
  lines.push(`# Comparison · ${rows.length} areas · preset: ${preset}`);
  lines.push("");

  // Headline table, score + area type per area
  lines.push("| Rank | Area | Score | Area type | Top dimension |");
  lines.push("|---|---|---|---|---|");
  let rank = 1;
  for (const r of sorted) {
    if (r.score === null) {
      lines.push(`| n/a | ${r.area} | ERROR | n/a | ${r.error ?? "Unknown"} |`);
      continue;
    }
    const top = r.result?.dimensions?.length
      ? r.result.dimensions.reduce((a, b) => (a.score > b.score ? a : b))
      : null;
    const topStr = top ? `${top.label} (${top.score}/100)` : "n/a";
    const areaType = r.result?.area_type ?? "n/a";
    lines.push(`| ${rank} | ${r.area} | ${r.score}/100 | ${areaType} | ${topStr} |`);
    rank++;
  }
  lines.push("");

  // Per-area summary
  lines.push("## Summaries");
  for (const r of sorted) {
    if (r.score === null) {
      lines.push(`- **${r.area}**: error: ${r.error ?? "unknown failure"}`);
      continue;
    }
    /* Summary is server-composed from explain=true. Falls back to a
       minimal score line only if explain mode somehow returned without it. */
    const summary = r.result?.summary ?? `${r.score}/100`;
    lines.push(`- **${r.area}**: ${summary}`);
  }

  // Footer with engine version if available
  const firstSuccess = sorted.find((r) => r.result !== null)?.result;
  if (firstSuccess?.engine_version) {
    lines.push("");
    lines.push(`Engine version: ${firstSuccess.engine_version}`);
  }

  return lines.join("\n");
}

export async function executeComparePostcodes(
  client: OogaApiClient,
  args: ComparePostcodesArgs,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const settled = await Promise.allSettled(
    args.areas.map((a) => client.scoreArea(a, args.preset)),
  );

  const rows: ComparisonRow[] = settled.map((s, i) => {
    if (s.status === "fulfilled") {
      return {
        area: args.areas[i]!,
        score: s.value.score,
        result: s.value,
        error: null,
      };
    }
    const reason = s.reason instanceof OogaApiError
      ? `HTTP ${s.reason.status ?? "?"}: ${s.reason.message}`
      : s.reason instanceof Error
        ? s.reason.message
        : String(s.reason);
    return { area: args.areas[i]!, score: null, result: null, error: reason };
  });

  // If EVERY call failed, surface that as isError so the LLM can act
  const allFailed = rows.every((r) => r.error !== null);

  return {
    content: [{ type: "text", text: formatComparisonAsText(rows, args.preset) }],
    ...(allFailed ? { isError: true } : {}),
  };
}
