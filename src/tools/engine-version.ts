/**
 * MCP tool: engine_version
 *
 * Returns the engine version the API stamps now and the methodology
 * history, read live from GET /v1/meta so the answer never trails a
 * release. Useful for procurement and model-risk teams documenting which
 * engine version is in production.
 */

import { OogaApiError, type OogaApiClient } from "../api-client.js";

export const engineVersionToolName = "engine_version";

/** Releases listed, newest first. The full history is on /methodology. */
const RECENT_RELEASES = 5;

export const engineVersionToolDef = {
  name: engineVersionToolName,
  description:
    "Return the current OneGoodArea engine version, its release date, and the most recent methodology releases. " +
    "Use this when a customer asks 'what version are we on' or for procurement / model-risk documentation. " +
    "The engine version is also stamped on every score_postcode response for audit trails.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
} as const;

export async function executeEngineVersion(client: OogaApiClient): Promise<{
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}> {
  try {
    const meta = await client.meta();
    const releases = [...meta.methodology].reverse();
    const current = releases.find((r) => r.version === meta.engine_version);

    const lines: string[] = [];
    lines.push(`# OneGoodArea engine ${meta.engine_version}`);
    if (current) lines.push(`Released: ${current.released_at}`);
    lines.push("");
    lines.push(`## Recent releases`);
    for (const r of releases.slice(0, RECENT_RELEASES)) {
      lines.push(`### ${r.version} (${r.released_at})`);
      lines.push(r.summary);
      lines.push("");
    }
    lines.push(`Full history: https://www.onegoodarea.com/methodology`);
    return { content: [{ type: "text", text: lines.join("\n") }] };
  } catch (err) {
    if (err instanceof OogaApiError) {
      const msg = `OneGoodArea API error (HTTP ${err.status ?? "?"}): ${err.message}`;
      return { content: [{ type: "text", text: msg }], isError: true };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Tool error: ${msg}` }], isError: true };
  }
}
