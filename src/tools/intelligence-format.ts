/**
 * AR-367: Format /v1/query responses for the find_areas MCP tool.
 *
 * The query plane returns a discriminated union over 7 plan ops. This
 * module renders each op's results as markdown the LLM can pass to its
 * user. Every value rendered is a real field from the response, no
 * client-side text synthesis.
 *
 * Rendering bias: surface the emitted PLAN front-and-center (the
 * "what did the planner decide to run" transparency play that makes
 * the query plane defensible), then the op-specific results.
 */

import type { OogaQueryResponse, OogaPlanOp } from "../api-client.js";
import { formatAreaProfileAsText } from "./signals-format.js";
import { ordinal } from "./value-format.js";

/* ── per-op renderers ─────────────────────────────────────────────── */

interface AreaRow {
  geo_code: string;
  value?: number | null;
  normalized_value?: number | null;
  percentile?: number | null;
}

function formatRankAreas(plan: { params: unknown }, results: unknown): string {
  const params = plan.params as {
    signal?: string;
    signals?: Array<{ key: string }>;
    sort_by?: { signal: string; mode?: string; direction?: string };
    country?: string;
    lad?: string;
    limit?: number;
  };
  const sortLabel = params.sort_by
    ? `${params.sort_by.signal} (${params.sort_by.mode ?? "percentile"} ${params.sort_by.direction ?? "desc"})`
    : params.signal ?? "default";

  const rows = (Array.isArray(results) ? results : []) as AreaRow[];
  const lines: string[] = [];
  lines.push(`**Ranking by:** ${sortLabel}`);
  if (params.country) lines.push(`**Scope:** ${params.country}`);
  if (params.lad) lines.push(`**LAD:** ${params.lad}`);
  if (params.limit) lines.push(`**Limit:** ${params.limit}`);
  lines.push("");

  if (rows.length === 0) {
    lines.push("No areas matched.");
    return lines.join("\n");
  }

  lines.push("| Rank | LSOA | Value | Percentile |");
  lines.push("|---|---|---|---|");
  let rank = 1;
  for (const r of rows) {
    const v = r.value === null || r.value === undefined ? "n/a" : String(r.value);
    const p = r.percentile === null || r.percentile === undefined ? "n/a" : ordinal(r.percentile);
    lines.push(`| ${rank} | ${r.geo_code} | ${v} | ${p} |`);
    rank++;
  }
  return lines.join("\n");
}

function formatGetArea(results: unknown): string {
  /* results === null means the area didn't resolve. */
  if (results === null) return "Area could not be resolved.";
  return formatAreaProfileAsText(results as Parameters<typeof formatAreaProfileAsText>[0]);
}

function formatScoreArea(results: unknown): string {
  if (results === null) return "Area could not be resolved.";
  const r = results as {
    area: string;
    preset: string;
    score: number;
    area_type: string | null;
    dimensions?: Array<{ label: string; score: number; weight: number; confidence: number }>;
    confidence: number;
    engine_version: string;
  };
  const lines: string[] = [];
  lines.push(`**${r.area}** · preset ${r.preset} · **${r.score}/100** · ${r.area_type ?? "area type unavailable"} · confidence ${(r.confidence * 100).toFixed(0)}%`);
  lines.push(`Engine version: ${r.engine_version}`);
  lines.push("");
  if (r.dimensions && r.dimensions.length > 0) {
    lines.push("| Dimension | Score | Weight | Confidence |");
    lines.push("|---|---|---|---|");
    for (const d of r.dimensions) {
      lines.push(`| ${d.label} | ${d.score}/100 | ${d.weight}% | ${(d.confidence * 100).toFixed(0)}% |`);
    }
  }
  return lines.join("\n");
}

function formatCompareAreas(results: unknown): string {
  if (results === null) return "Comparison could not be resolved.";
  const r = results as {
    areas: Array<{ query: string; profile: unknown | null }>;
    meta: { scope: string };
  };
  const lines: string[] = [];
  lines.push(`**Scope:** ${r.meta.scope}`);
  lines.push("");
  for (const slot of r.areas) {
    lines.push(`### ${slot.query}`);
    if (slot.profile === null) {
      lines.push("Could not resolve.");
    } else {
      lines.push(formatAreaProfileAsText(slot.profile as Parameters<typeof formatAreaProfileAsText>[0]));
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

function formatFindPeersFromQuery(results: unknown): string {
  if (results === null) return "Peers could not be resolved.";
  const r = results as {
    target: { geo_code: string; signals_used: string[] };
    peers: Array<{ geo_code: string; distance: number; n_dims_used: number }>;
    meta: { scope: string };
  };
  return renderPeersBlock(r);
}

function formatFindInsights(results: unknown): string {
  if (results === null) return "Insights could not be computed.";
  const r = results as {
    signal_key: string;
    insights: Array<{ geo_code: string; peer_relative_z: number; abs_z: number }>;
    meta: { scope: string; threshold: number | null };
  };
  const lines: string[] = [];
  lines.push(`**Signal:** ${r.signal_key}`);
  lines.push(`**Scope:** ${r.meta.scope}`);
  if (r.meta.threshold !== null) lines.push(`**Threshold:** |z| >= ${r.meta.threshold}`);
  lines.push("");

  if (r.insights.length === 0) {
    lines.push("No anomalies found.");
    return lines.join("\n");
  }
  lines.push("| Rank | LSOA | peer-relative z | |z| |");
  lines.push("|---|---|---|---|");
  let rank = 1;
  for (const ins of r.insights) {
    lines.push(`| ${rank} | ${ins.geo_code} | ${ins.peer_relative_z.toFixed(2)} | ${ins.abs_z.toFixed(2)} |`);
    rank++;
  }
  return lines.join("\n");
}

function formatFindForecast(results: unknown): string {
  if (results === null) return "Forecast could not be computed.";
  const r = results as {
    target: { geo_code: string };
    signal_key: string;
    points: Array<{ observed_period: string; projected_value: number; lower_bound: number; upper_bound: number }>;
    meta: {
      window_months: number;
      horizon_months: number;
      n_observations: number;
      r2: number | null;
      slope_per_month: number;
      latest_observed_period: string;
    };
  };
  const lines: string[] = [];
  lines.push(`**Target:** ${r.target.geo_code}`);
  lines.push(`**Signal:** ${r.signal_key}`);
  lines.push(`**Fit:** ${r.meta.n_observations} obs over ${r.meta.window_months}m · slope/month ${r.meta.slope_per_month.toFixed(3)}` +
    (r.meta.r2 !== null ? ` · R² ${r.meta.r2.toFixed(3)}` : ""));
  lines.push(`**Latest observed:** ${r.meta.latest_observed_period}`);
  lines.push("");

  if (r.points.length === 0) {
    lines.push("No projection points returned.");
    return lines.join("\n");
  }
  lines.push("| Period | Projected | Lower | Upper |");
  lines.push("|---|---|---|---|");
  for (const p of r.points) {
    lines.push(`| ${p.observed_period} | ${p.projected_value.toFixed(2)} | ${p.lower_bound.toFixed(2)} | ${p.upper_bound.toFixed(2)} |`);
  }
  return lines.join("\n");
}

/* ── shared ───────────────────────────────────────────────────────── */

export function renderPeersBlock(r: {
  target: { geo_code: string; signals_used: string[] };
  peers: Array<{ geo_code: string; distance: number; n_dims_used: number }>;
  meta: { scope: string };
}): string {
  const lines: string[] = [];
  lines.push(`**Target LSOA:** ${r.target.geo_code}`);
  lines.push(`**Scope:** ${r.meta.scope}`);
  lines.push(`**Comparison signals (${r.target.signals_used.length}):** ${r.target.signals_used.join(", ")}`);
  lines.push("");

  if (r.peers.length === 0) {
    lines.push("No peers found within the requested scope.");
    return lines.join("\n");
  }
  lines.push("| Rank | LSOA | Distance | Signals used |");
  lines.push("|---|---|---|---|");
  let rank = 1;
  for (const p of r.peers) {
    lines.push(`| ${rank} | ${p.geo_code} | ${p.distance.toFixed(3)} | ${p.n_dims_used} |`);
    rank++;
  }
  return lines.join("\n");
}

/* ── entry point ──────────────────────────────────────────────────── */

export function formatQueryResponseAsText(res: OogaQueryResponse): string {
  const op: OogaPlanOp = res.plan.op;

  const lines: string[] = [];
  lines.push(`# Query result · op: ${op}`);
  lines.push(`Plan source: ${res.plan_source} · Generated at: ${res.meta.generated_at}`);
  lines.push("");

  /* Show the emitted plan params verbatim, transparency about what
     the planner decided to run. */
  lines.push(`## Emitted plan`);
  lines.push("```json");
  lines.push(JSON.stringify(res.plan, null, 2));
  lines.push("```");
  lines.push("");

  lines.push(`## Results`);
  switch (op) {
    case "rank_areas":
      lines.push(formatRankAreas(res.plan, res.results));
      break;
    case "get_area":
      lines.push(formatGetArea(res.results));
      break;
    case "score_area":
      lines.push(formatScoreArea(res.results));
      break;
    case "compare_areas":
      lines.push(formatCompareAreas(res.results));
      break;
    case "find_peers":
      lines.push(formatFindPeersFromQuery(res.results));
      break;
    case "find_insights":
      lines.push(formatFindInsights(res.results));
      break;
    case "find_forecast":
      lines.push(formatFindForecast(res.results));
      break;
  }

  return lines.join("\n").trimEnd();
}
