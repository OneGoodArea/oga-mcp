/**
 * AR-369: Render an audience-shaped brief from a real AreaProfile +
 * ScoreResponse (?explain=true). Server-side-narrative policy:
 *
 *   - The `summary`, `dimensions[].reasoning`, `dimensions[].confidence_reason`,
 *     `recommendations[]`, and `data_sources[]` come straight from
 *     /v1/score?explain=true (server-composed in AR-363).
 *   - The per-signal `confidence_reason`, `value`, `unit`, `percentile`,
 *     `source`, `observed_period` come straight from /v1/area (engine output).
 *   - This module SELECTS which of those fields render in which section
 *     based on the AudienceConfig. It does NOT invent prose.
 */

import type { OogaAreaProfile, OogaScoreResponse, OogaScoreDimension, OogaSignal } from "../api-client.js";
import type { AudienceConfig, BriefSection } from "./area-brief-audiences.js";
import { formatPercentile, formatValue } from "./value-format.js";
import { provenanceLine } from "./signals-format.js";

/* ── per-section renderers ──────────────────────────────────────── */

function renderDimensionLine(d: OogaScoreDimension): string[] {
  const lines: string[] = [];
  const conf = ` · confidence ${(d.confidence * 100).toFixed(0)}%`;
  lines.push(`- **${d.label}**: ${d.score}/100 (weight ${d.weight}%${conf})`);
  if (d.reasoning) lines.push(`  ${d.reasoning}`);
  if (d.confidence_reason) lines.push(`  _${d.confidence_reason}_`);
  return lines;
}

function renderSignalLine(s: OogaSignal): string[] {
  const lines: string[] = [];
  lines.push(`- **${s.label}**: ${formatValue(s)}`);
  if (typeof s.percentile === "number") {
    lines.push(`  ${formatPercentile(s.percentile)} · direction: ${s.direction.replace(/_/g, " ")}`);
  }
  lines.push(`  Confidence ${(s.confidence * 100).toFixed(0)}% · ${s.confidence_reason}`);
  lines.push(provenanceLine(s));
  return lines;
}

/* ── section selector ───────────────────────────────────────────── */

function pickDimensions(
  allDims: OogaScoreDimension[],
  labels: string[],
): OogaScoreDimension[] {
  /* Match by exact label (case-insensitive). The engine evolves dimension
     names across versions; the audience config lists known aliases so we
     don't drop a section just because "Safety" became "Safety & Crime". */
  const wanted = new Set(labels.map((l) => l.toLowerCase()));
  return allDims.filter((d) => wanted.has(d.label.toLowerCase()));
}

function pickSignals(allSignals: OogaSignal[], keys: string[]): OogaSignal[] {
  const wanted = new Set(keys);
  /* Preserve the audience-defined order, not the catalog order. */
  const byKey = new Map(allSignals.map((s) => [s.key, s] as const));
  const out: OogaSignal[] = [];
  for (const k of keys) {
    const s = byKey.get(k);
    if (s && wanted.has(k)) out.push(s);
  }
  return out;
}

function renderSection(
  section: BriefSection,
  score: OogaScoreResponse,
  profile: OogaAreaProfile,
): string[] {
  const dims = pickDimensions(score.dimensions, section.dimensions);
  const signals = pickSignals(profile.signals, section.signals);

  if (dims.length === 0 && signals.length === 0) {
    /* Drop empty sections rather than render an empty header, the
       audience config can over-specify and that's fine. */
    return [];
  }

  const lines: string[] = [];
  lines.push(`## ${section.title}`);
  for (const d of dims) for (const line of renderDimensionLine(d)) lines.push(line);
  for (const s of signals) for (const line of renderSignalLine(s)) lines.push(line);
  lines.push("");
  return lines;
}

/* ── brief assembly ─────────────────────────────────────────────── */

export function formatAreaBriefAsText(
  audience: AudienceConfig,
  profile: OogaAreaProfile,
  score: OogaScoreResponse,
): string {
  const lines: string[] = [];
  const geo = profile.geo;

  /* Headline. */
  const headlineLoc = geo.postcode && geo.postcode !== geo.query
    ? `${geo.query} (${geo.postcode})`
    : geo.query;
  lines.push(`# ${audience.label} · ${headlineLoc}`);
  lines.push(`${audience.framing}`);
  lines.push("");

  /* Geo summary line. */
  const geoBits: string[] = [];
  if (geo.admin_district) geoBits.push(geo.admin_district);
  if (geo.region) geoBits.push(geo.region);
  geoBits.push(geo.country);
  geoBits.push(geo.area_type ? `${geo.area_type} area` : "area type unavailable");
  if (geo.lsoa) geoBits.push(`LSOA ${geo.lsoa}`);
  lines.push(`**Area:** ${geoBits.join(" · ")}`);
  lines.push(`**Engine version:** ${score.engine_version} · **Preset:** ${score.preset} · **Fetch mode:** ${profile.meta.fetch_mode}`);
  lines.push("");

  /* Overall verdict block, score + server-composed summary. */
  lines.push(`## Overall verdict`);
  lines.push(`**Score:** ${score.score}/100 · **Aggregate confidence:** ${(score.confidence * 100).toFixed(0)}%`);
  if (score.summary) {
    lines.push("");
    lines.push(score.summary);
  }
  lines.push("");

  /* Audience-shaped sections. Each pulls real fields per the config. */
  for (const section of audience.sections) {
    for (const line of renderSection(section, score, profile)) lines.push(line);
  }

  /* Recommendations (server-composed, AR-363). */
  if (score.recommendations && score.recommendations.length > 0) {
    lines.push(`## Notes & risks`);
    for (const r of score.recommendations) lines.push(`- ${r}`);
    lines.push("");
  }

  /* Data sources (server-composed, AR-363). */
  if (score.data_sources && score.data_sources.length > 0) {
    lines.push(`## Data sources`);
    lines.push(score.data_sources.join(" · "));
  }

  return lines.join("\n").trimEnd();
}
