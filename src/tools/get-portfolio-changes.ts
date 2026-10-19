/**
 * MCP tool: get_portfolio_changes (AR-368)
 *
 * Check a Monitor portfolio for material signal changes between two
 * time-series periods. Wraps POST /v1/portfolios/:id/changes (with
 * emit:false, the MCP shouldn't fire webhooks on a probe call).
 *
 * Returns the change report rendered as markdown: scope (baseline,
 * threshold, min_transactions), counts (areas_checked, material_count),
 * and a per-area table of material signal moves.
 */

import type { OogaApiClient, OogaChangeCause, OogaChangeReport, OogaSignalChange } from "../api-client.js";
import { OogaApiError } from "../api-client.js";
import { monthText } from "./value-format.js";

export const getPortfolioChangesToolName = "get_portfolio_changes";

export const getPortfolioChangesToolDef = {
  name: getPortfolioChangesToolName,
  title: "Material changes in a portfolio",
  description:
    "Reports material signal changes across a portfolio between two periods: the baseline and threshold used, counts of places checked and changes found, and for each place every signal that moved with direction, from and to values, delta, percent change and the cause (the source data moved, or a OneGoodArea methodology release named by version). " +
    "Needs a portfolio id from watch_portfolio. Reading does not fire the portfolio's webhooks.",
  inputSchema: {
    type: "object",
    properties: {
      portfolio_id: {
        type: "string",
        description: "The portfolio id returned by watch_portfolio (e.g. 'pf_...').",
      },
      threshold_pct: {
        type: "number",
        description: "Smallest absolute percent change that counts as material. Default 5. Zero or more.",
        minimum: 0,
      },
      baseline: {
        type: "string",
        enum: ["previous", "first"],
        description: "Compare the latest period with the previous period (default) or with the first period in range.",
      },
      min_transactions: {
        type: "number",
        description: "Sample-size gate for price moves: both periods need at least this many sales. Whole number, zero or more; default 8.",
        minimum: 0,
      },
      cause: {
        type: "array",
        items: { type: "string", enum: ["source", "method", "source_and_method"] },
        description: "List only changes with these causes: source (the source data moved it), method (a OneGoodArea methodology release did, same period), source_and_method (both). Default every cause.",
      },
    },
    required: ["portfolio_id"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
} as const;

export interface GetPortfolioChangesArgs {
  portfolio_id: string;
  threshold_pct?: number;
  baseline?: "previous" | "first";
  min_transactions?: number;
  cause?: OogaChangeCause[];
}

const CAUSES: readonly OogaChangeCause[] = ["source", "method", "source_and_method"];

export function parseGetPortfolioChangesArgs(raw: unknown): GetPortfolioChangesArgs {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("get_portfolio_changes arguments must be an object");
  }
  const obj = raw as Record<string, unknown>;
  const portfolio_id = obj.portfolio_id;
  if (typeof portfolio_id !== "string" || portfolio_id.trim().length === 0) {
    throw new Error("portfolio_id must be a non-empty string");
  }

  const out: GetPortfolioChangesArgs = { portfolio_id: portfolio_id.trim() };

  if (obj.threshold_pct !== undefined) {
    if (typeof obj.threshold_pct !== "number" || !Number.isFinite(obj.threshold_pct) || obj.threshold_pct < 0) {
      throw new Error("threshold_pct must be a non-negative number");
    }
    out.threshold_pct = obj.threshold_pct;
  }
  if (obj.baseline !== undefined) {
    if (obj.baseline !== "previous" && obj.baseline !== "first") {
      throw new Error("baseline must be 'previous' or 'first'");
    }
    out.baseline = obj.baseline;
  }
  if (obj.min_transactions !== undefined) {
    if (typeof obj.min_transactions !== "number" || !Number.isFinite(obj.min_transactions) || obj.min_transactions < 0) {
      throw new Error("min_transactions must be a non-negative number");
    }
    out.min_transactions = obj.min_transactions;
  }
  if (obj.cause !== undefined) {
    if (!Array.isArray(obj.cause) || obj.cause.length === 0 || !obj.cause.every((c) => CAUSES.includes(c as OogaChangeCause))) {
      throw new Error("cause must list source, method or source_and_method");
    }
    out.cause = obj.cause as OogaChangeCause[];
  }

  return out;
}

/** AR-977: why a value moved, in words: the source data, or our method
    (the releases named), or both. Empty for an API older than the field. */
export function causeText(c: OogaSignalChange): string {
  const releases = c.method_releases && c.method_releases.length > 0 ? ` (${c.method_releases.join(", ")})` : "";
  if (c.cause === "source") return "Source data";
  if (c.cause === "method") return `Methodology${releases}`;
  if (c.cause === "source_and_method") return `Source data and methodology${releases}`;
  return "";
}

function formatChange(c: OogaSignalChange): string {
  const arrow = c.direction === "up" ? "↑" : c.direction === "down" ? "↓" : "→";
  const pct = c.pct_change === null ? "n/a" : `${c.pct_change > 0 ? "+" : ""}${c.pct_change.toFixed(1)}%`;
  const from = c.value_from === null ? "n/a" : c.value_from.toLocaleString("en-GB");
  const to = c.value_to === null ? "n/a" : c.value_to.toLocaleString("en-GB");
  const label = c.label ?? c.signal_key;
  return `| ${c.area} (${c.geo_code}) | ${label} | ${monthText(c.period_from)} → ${monthText(c.period_to)} | ${from} ${arrow} ${to} | ${pct} | ${causeText(c)} |`;
}

export function formatChangeReportAsText(report: OogaChangeReport): string {
  const lines: string[] = [];
  lines.push(`# Portfolio changes · \`${report.portfolio_id}\``);
  lines.push(`Generated at: ${report.generated_at}`);
  lines.push("");
  lines.push(`**Baseline:** ${report.baseline}`);
  lines.push(`**Threshold:** ${report.threshold_pct}% · **Min transactions:** ${report.min_transactions}`);
  lines.push(`**Areas checked:** ${report.areas_checked} · **Material changes:** ${report.material_count}`);
  lines.push("");

  if (report.changes.length === 0) {
    lines.push("No material signal changes detected for this portfolio with the current threshold.");
    return lines.join("\n").trimEnd();
  }

  lines.push("| Area | Signal | Period | Value | % change | Why |");
  lines.push("|---|---|---|---|---|---|");
  for (const c of report.changes) lines.push(formatChange(c));
  if (report.changes.some((c) => c.cause && c.cause !== "source")) {
    lines.push("");
    lines.push("A methodology move comes from a OneGoodArea release, not from an event in the area; the release is named, and webhooks push source-data changes only unless a subscription asks for more.");
  }
  return lines.join("\n").trimEnd();
}

export async function executeGetPortfolioChanges(
  client: OogaApiClient,
  args: GetPortfolioChangesArgs,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  try {
    const report = await client.getPortfolioChanges(args.portfolio_id, {
      baseline: args.baseline,
      threshold_pct: args.threshold_pct,
      min_transactions: args.min_transactions,
      cause: args.cause,
    });
    return { content: [{ type: "text", text: formatChangeReportAsText(report) }] };
  } catch (err) {
    if (err instanceof OogaApiError) {
      const msg = `OneGoodArea API error (HTTP ${err.status ?? "?"}): ${err.message}`;
      return { content: [{ type: "text", text: msg }], isError: true };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Tool error: ${msg}` }], isError: true };
  }
}
