/**
 * MCP tool: methodology_for
 *
 * Returns the methodology explanation for a given scoring dimension. Pure
 * static lookup, no network call. Source of truth in methodology-data.ts,
 * which is updated when the engine methodology changes.
 */

import { findDimension, METHODOLOGY } from "../methodology-data.js";

export const methodologyForToolName = "methodology_for";

export const methodologyForToolDef = {
  name: methodologyForToolName,
  description:
    "Get the methodology explanation for a specific scoring dimension (e.g. 'Crime', 'Transport', 'Environment'). " +
    "Returns the data source, summary of how the score is computed, and the per-intent weight. " +
    "Useful when a customer asks 'why did Safety score 80?' or for procurement teams reviewing methodology before integration. " +
    `Recognised dimensions: ${METHODOLOGY.map((d) => d.dimension).join(", ")}.`,
  inputSchema: {
    type: "object",
    properties: {
      dimension: {
        type: "string",
        description:
          "Dimension name. Case-insensitive, partial match supported (e.g. 'environ' matches 'Environment').",
      },
    },
    required: ["dimension"],
    additionalProperties: false,
  },
} as const;

export interface MethodologyForArgs {
  dimension: string;
}

export function parseMethodologyForArgs(raw: unknown): MethodologyForArgs {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("methodology_for arguments must be an object");
  }
  const obj = raw as Record<string, unknown>;
  const dimension = obj.dimension;
  if (typeof dimension !== "string" || dimension.trim().length === 0) {
    throw new Error("dimension must be a non-empty string");
  }
  return { dimension: dimension.trim() };
}

export function executeMethodologyFor(
  args: MethodologyForArgs,
): { content: Array<{ type: "text"; text: string }>; isError?: boolean } {
  const match = findDimension(args.dimension);
  if (!match) {
    const available = METHODOLOGY.map((d) => d.dimension).join(", ");
    return {
      content: [
        {
          type: "text",
          text: `No methodology found for "${args.dimension}". Available dimensions: ${available}`,
        },
      ],
      isError: true,
    };
  }

  const lines: string[] = [];
  lines.push(`# ${match.dimension}`);
  lines.push("");
  /* AR-391: derive intents from non-zero weights instead of reading the
     static `intents` field. The static list drifted from the weights
     table, e.g. Safety & Crime listed ["moving", "research"] but had
     non-zero weights for all 4 presets. The weights are the engine's
     source of truth; derive the header from them so the two can't
     disagree. Surfaced by ICP E2E 2026-06-30 finding #12. */
  const usedIntents = Object.entries(match.weights)
    .filter(([, w]) => w > 0)
    .map(([intent]) => intent);
  lines.push(`**Used in intents:** ${usedIntents.join(", ")}`);
  lines.push(`**Data source:** ${match.source}`);
  lines.push("");
  lines.push(`## How it scores`);
  lines.push(match.summary);
  lines.push("");
  lines.push(`## Weight per intent`);
  for (const [intent, weight] of Object.entries(match.weights)) {
    if (weight > 0) lines.push(`- **${intent}**: ${weight}%`);
  }
  lines.push("");
  lines.push(`Full methodology: https://www.onegoodarea.com/methodology`);

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
