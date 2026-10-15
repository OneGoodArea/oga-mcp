/**
 * MCP tool: resolve_place (AR-1152)
 *
 * The registry's door: a postcode, place name, official code or place id to
 * the permanent place it names, through GET /v1/places/resolve (ADR 0044).
 */

import type { OogaApiClient, OogaPlaceCandidate, OogaPlaceRef, OogaPlaceResolution } from "../api-client.js";
import { OogaApiError } from "../api-client.js";
import { monthText } from "./value-format.js";

export const resolvePlaceToolName = "resolve_place";

export const PLACE_QUERY_MAX_LENGTH = 100;

export const resolvePlaceToolDef = {
  name: resolvePlaceToolName,
  title: "Resolve a place",
  description:
    "Resolve a postcode, place name, official neighbourhood code or OneGoodArea place id to the permanent place it names in England, Wales or Scotland. " +
    "Returns the place id (oga_pl_...), its type and name, country and nation, how the input resolved, and for a postcode whether it is live or retired with the month it was retired; a retired postcode still resolves to the neighbourhood it was in. " +
    "A name that could mean several places returns the candidates with their ids; an input that names nothing returns the reason. " +
    "Call it first when an input may be retired or ambiguous, or to obtain an id that survives boundary changes before calling the other tools.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "A postcode (e.g. 'SE15 5DP'), a place name (e.g. 'Peckham'), an official code (e.g. 'E01003920') or a place id (e.g. 'oga_pl_...'). Up to 100 characters.",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true },
} as const;

export interface ResolvePlaceArgs {
  query: string;
}

export function parseResolvePlaceArgs(raw: unknown): ResolvePlaceArgs {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("resolve_place arguments must be an object");
  }
  const query = (raw as Record<string, unknown>).query;
  if (typeof query !== "string" || query.trim().length === 0) {
    throw new Error("query must be a non-empty string");
  }
  if (query.length > PLACE_QUERY_MAX_LENGTH) {
    throw new Error(`query must be ${PLACE_QUERY_MAX_LENGTH} characters or fewer`);
  }
  return { query: query.trim() };
}

const NATION_NAMES: Record<string, string> = {
  "GB-ENG": "England",
  "GB-WLS": "Wales",
  "GB-SCT": "Scotland",
};

function nationText(nation: string): string {
  const name = NATION_NAMES[nation];
  return name ? `${name} (${nation})` : nation;
}

function placeLines(place: OogaPlaceRef): string[] {
  const lines = [`Place id: ${place.place_id}`];
  lines.push(place.name ? `Type: ${place.place_type} · Name: ${place.name}` : `Type: ${place.place_type}`);
  lines.push(place.nation ? `Country: ${place.country} · Nation: ${nationText(place.nation)}` : `Country: ${place.country}`);
  return lines;
}

function resolvedViaText(via: Extract<OogaPlaceResolution, { status: "resolved" }>["resolved_via"]): string {
  switch (via.kind) {
    case "postcode": return `Resolved via postcode ${via.value}.`;
    case "code": return via.scheme ? `Resolved via ${via.scheme} code ${via.value}.` : `Resolved via code ${via.value}.`;
    case "name": return `Resolved via the place search to neighbourhood code ${via.value}.`;
    case "place_id": return "Resolved via place id.";
  }
}

function postcodeText(pc: { postcode: string; status: "live" | "terminated"; terminated_on: string | null }): string {
  if (pc.status === "live") return `Postcode ${pc.postcode}: live.`;
  const when = pc.terminated_on ? ` in ${monthText(pc.terminated_on.slice(0, 7))}` : "";
  return `Postcode ${pc.postcode}: retired${when}. The result is the neighbourhood it was in, not the postcodes there today.`;
}

function candidateRow(index: number, c: OogaPlaceCandidate): string {
  const place = c.place;
  return `| ${index + 1} | ${c.label} | ${c.postcode ?? ""} | ${place?.place_id ?? "not in the registry"} | ${place?.place_type ?? ""} | ${place?.name ?? ""} |`;
}

export function renderResolution(result: OogaPlaceResolution, meta: { engine_version: string; generated_at: string }): string {
  const lines: string[] = [`# Place · ${result.input}`];
  switch (result.status) {
    case "resolved":
      lines.push(...placeLines(result.place));
      lines.push(resolvedViaText(result.resolved_via));
      if (result.postcode) lines.push(postcodeText(result.postcode));
      break;
    case "ambiguous":
      lines.push(`Ambiguous: ${result.candidates.length} places match "${result.input}". Call again with one place id.`);
      lines.push("");
      lines.push("| # | Label | Postcode | Place id | Type | Name |");
      lines.push("|---|---|---|---|---|---|");
      result.candidates.forEach((c, i) => lines.push(candidateRow(i, c)));
      break;
    case "not_found":
      lines.push(`Not found (${result.reason}): ${result.message}`);
      break;
  }
  lines.push("");
  lines.push(`Engine: ${meta.engine_version} · Generated at: ${meta.generated_at}`);
  return lines.join("\n");
}

export async function executeResolvePlace(
  client: OogaApiClient,
  args: ResolvePlaceArgs,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  try {
    const response = await client.resolvePlace(args.query);
    return { content: [{ type: "text", text: renderResolution(response.result, response.meta) }] };
  } catch (err) {
    if (err instanceof OogaApiError) {
      const msg = `OneGoodArea API error (HTTP ${err.status ?? "?"}): ${err.message}`;
      return { content: [{ type: "text", text: msg }], isError: true };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Tool error: ${msg}` }], isError: true };
  }
}
