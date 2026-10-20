import { OogaApiError } from "../api-client.js";

/* AR-1219: a place outside England, Wales and Scotland is a refusal, not a
   failure. The API answers 422 with code nation_not_covered; the tools
   render it in the words resolve_place uses, so the model sees one
   message for one condition and never a score. */
export function notCoveredResult(err: unknown): { content: Array<{ type: "text"; text: string }> } | null {
  if (!(err instanceof OogaApiError) || err.status !== 422) return null;
  const body = err.responseBody;
  if (typeof body !== "object" || body === null) return null;
  const { code, error } = body as { code?: unknown; error?: unknown };
  if (code !== "nation_not_covered") return null;
  const message = typeof error === "string" && error.length > 0 ? error : err.message;
  return { content: [{ type: "text", text: `Not found (nation_not_covered): ${message}` }] };
}
