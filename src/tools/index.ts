/**
 * The tool layer: every tool definition and executor, and the dispatcher that
 * maps a tool name to its executor. The stdio server (server.ts) and the
 * hosted endpoint in apps/api both run this same code, so a tool exists once.
 */

import type { OogaApiClient } from "../api-client.js";
import { resolvePlaceToolDef, resolvePlaceToolName, parseResolvePlaceArgs, executeResolvePlace } from "./resolve-place.js";
import { scorePostcodeToolDef, scorePostcodeToolName, parseScorePostcodeArgs, executeScorePostcode } from "./score-postcode.js";
import { comparePostcodesToolDef, comparePostcodesToolName, parseComparePostcodesArgs, executeComparePostcodes } from "./compare-postcodes.js";
import { getAreaSignalsToolDef, getAreaSignalsToolName, parseGetAreaSignalsArgs, executeGetAreaSignals } from "./get-area-signals.js";
import { getSignalsByCategoryToolDef, getSignalsByCategoryToolName, parseGetSignalsByCategoryArgs, executeGetSignalsByCategory } from "./get-signals-by-category.js";
import { findAreasToolDef, findAreasToolName, parseFindAreasArgs, executeFindAreas } from "./find-areas.js";
import { findPeersToolDef, findPeersToolName, parseFindPeersArgs, executeFindPeers } from "./find-peers.js";
import { watchPortfolioToolDef, watchPortfolioToolName, parseWatchPortfolioArgs, executeWatchPortfolio } from "./watch-portfolio.js";
import { getPortfolioChangesToolDef, getPortfolioChangesToolName, parseGetPortfolioChangesArgs, executeGetPortfolioChanges } from "./get-portfolio-changes.js";
import { areaBriefToolDef, areaBriefToolName, parseAreaBriefArgs, executeAreaBrief } from "./area-brief.js";
import { methodologyForToolDef, methodologyForToolName, parseMethodologyForArgs, executeMethodologyFor } from "./methodology-for.js";
import { engineVersionToolDef, engineVersionToolName, executeEngineVersion } from "./engine-version.js";

export {
  OogaApiClient,
  OogaApiError,
  DEFAULT_BASE,
  buildUserAgent,
} from "../api-client.js";
export type { OogaApiClientOptions, HostClient, FetchLike } from "../api-client.js";

export {
  resolvePlaceToolDef,
  scorePostcodeToolDef,
  comparePostcodesToolDef,
  getAreaSignalsToolDef,
  getSignalsByCategoryToolDef,
  findAreasToolDef,
  findPeersToolDef,
  watchPortfolioToolDef,
  getPortfolioChangesToolDef,
  areaBriefToolDef,
  methodologyForToolDef,
  engineVersionToolDef,
};

type WithTitleAnnotation<T extends { title: string; annotations: object }> = Omit<T, "annotations"> & {
  readonly annotations: T["annotations"] & { readonly title: T["title"] };
};

/* The MCP spec reads a tool's readable name from the top-level title, the
   Claude directory from annotations.title; every tool carries both. */
function withTitleAnnotation<T extends { title: string; annotations: object }>(tool: T): WithTitleAnnotation<T> {
  return { ...tool, annotations: { title: tool.title, ...tool.annotations } };
}

/** Every tool, in the order clients list them. */
export const TOOL_DEFINITIONS = [
  withTitleAnnotation(resolvePlaceToolDef),
  withTitleAnnotation(scorePostcodeToolDef),
  withTitleAnnotation(comparePostcodesToolDef),
  withTitleAnnotation(getAreaSignalsToolDef),
  withTitleAnnotation(getSignalsByCategoryToolDef),
  withTitleAnnotation(findAreasToolDef),
  withTitleAnnotation(findPeersToolDef),
  withTitleAnnotation(watchPortfolioToolDef),
  withTitleAnnotation(getPortfolioChangesToolDef),
  withTitleAnnotation(areaBriefToolDef),
  withTitleAnnotation(methodologyForToolDef),
  withTitleAnnotation(engineVersionToolDef),
] as const;

export type ToolName = (typeof TOOL_DEFINITIONS)[number]["name"];

export const TOOL_NAMES: readonly ToolName[] = TOOL_DEFINITIONS.map((t) => t.name);

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

/** Runs one tool call against the given client. Argument parsing throws on
    a bad shape, as before; the transport turns that into a protocol error. */
export async function callTool(client: OogaApiClient, name: string, args: unknown): Promise<ToolResult> {
  switch (name) {
    case resolvePlaceToolName: return executeResolvePlace(client, parseResolvePlaceArgs(args));
    case scorePostcodeToolName: return executeScorePostcode(client, parseScorePostcodeArgs(args));
    case comparePostcodesToolName: return executeComparePostcodes(client, parseComparePostcodesArgs(args));
    case getAreaSignalsToolName: return executeGetAreaSignals(client, parseGetAreaSignalsArgs(args));
    case getSignalsByCategoryToolName: return executeGetSignalsByCategory(client, parseGetSignalsByCategoryArgs(args));
    case findAreasToolName: return executeFindAreas(client, parseFindAreasArgs(args));
    case findPeersToolName: return executeFindPeers(client, parseFindPeersArgs(args));
    case watchPortfolioToolName: return executeWatchPortfolio(client, parseWatchPortfolioArgs(args));
    case getPortfolioChangesToolName: return executeGetPortfolioChanges(client, parseGetPortfolioChangesArgs(args));
    case areaBriefToolName: return executeAreaBrief(client, parseAreaBriefArgs(args));
    case methodologyForToolName: return executeMethodologyFor(parseMethodologyForArgs(args));
    case engineVersionToolName: return executeEngineVersion(client);
    default:
      return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  }
}
