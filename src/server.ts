#!/usr/bin/env node
/**
 * OneGoodArea MCP server, entry point.
 *
 * Exposes the OneGoodArea engine as MCP tools so Claude Desktop / Cursor /
 * any MCP-compatible client can score UK areas inline.
 *
 * Auth: reads OOGA_API_KEY from env (the customer's API key from
 * https://www.onegoodarea.com/dashboard). Keys start with `oga_`.
 *
 * Base URL: defaults to https://api.onegoodarea.com (the live API).
 * Override via OOGA_API_BASE env (useful for local dev against
 * `cd apps/api && npm run dev`).
 *
 * Run via npx: `npx @oga-mcp/server`
 *
 * Claude Desktop config example:
 *   {
 *     "mcpServers": {
 *       "onegoodarea": {
 *         "command": "npx",
 *         "args": ["-y", "@oga-mcp/server"],
 *         "env": { "OOGA_API_KEY": "oga_..." }
 *       }
 *     }
 *   }
 */

import { createRequire } from "node:module";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { DEFAULT_BASE, OogaApiClient } from "./api-client.js";
import {
  scorePostcodeToolDef,
  scorePostcodeToolName,
  parseScorePostcodeArgs,
  executeScorePostcode,
} from "./tools/score-postcode.js";
import {
  comparePostcodesToolDef,
  comparePostcodesToolName,
  parseComparePostcodesArgs,
  executeComparePostcodes,
} from "./tools/compare-postcodes.js";
import {
  methodologyForToolDef,
  methodologyForToolName,
  parseMethodologyForArgs,
  executeMethodologyFor,
} from "./tools/methodology-for.js";
import {
  engineVersionToolDef,
  engineVersionToolName,
  executeEngineVersion,
} from "./tools/engine-version.js";
import {
  getAreaSignalsToolDef,
  getAreaSignalsToolName,
  parseGetAreaSignalsArgs,
  executeGetAreaSignals,
} from "./tools/get-area-signals.js";
import {
  getSignalsByCategoryToolDef,
  getSignalsByCategoryToolName,
  parseGetSignalsByCategoryArgs,
  executeGetSignalsByCategory,
} from "./tools/get-signals-by-category.js";
import {
  findAreasToolDef,
  findAreasToolName,
  parseFindAreasArgs,
  executeFindAreas,
} from "./tools/find-areas.js";
import {
  findPeersToolDef,
  findPeersToolName,
  parseFindPeersArgs,
  executeFindPeers,
} from "./tools/find-peers.js";
import {
  watchPortfolioToolDef,
  watchPortfolioToolName,
  parseWatchPortfolioArgs,
  executeWatchPortfolio,
} from "./tools/watch-portfolio.js";
import {
  getPortfolioChangesToolDef,
  getPortfolioChangesToolName,
  parseGetPortfolioChangesArgs,
  executeGetPortfolioChanges,
} from "./tools/get-portfolio-changes.js";
import {
  areaBriefToolDef,
  areaBriefToolName,
  parseAreaBriefArgs,
  executeAreaBrief,
} from "./tools/area-brief.js";

const SERVER_VERSION: string = createRequire(import.meta.url)("../package.json").version;

function readApiKey(): string {
  const key = process.env.OOGA_API_KEY;
  if (!key) {
    process.stderr.write(
      "[oga-mcp] Missing OOGA_API_KEY env var. Get one at https://www.onegoodarea.com/dashboard\n",
    );
    process.exit(1);
  }
  if (!key.startsWith("oga_")) {
    process.stderr.write(
      `[oga-mcp] OOGA_API_KEY looks malformed (expected to start with 'oga_'). Got prefix: ${key.slice(0, 4)}\n`,
    );
    process.exit(1);
  }
  return key;
}

async function checkMcpAccess(client: OogaApiClient): Promise<void> {
  let me: Awaited<ReturnType<typeof client.me>>;
  try {
    me = await client.me();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[oga-mcp] Could not verify entitlement at /v1/me: ${msg}\n`);
    process.stderr.write(`[oga-mcp] Check OOGA_API_KEY is valid and OOGA_API_BASE is reachable.\n`);
    process.exit(1);
  }

  if (!me.mcp_access) {
    process.stderr.write(
      `[oga-mcp] Your plan (${me.plan_name}) does not include MCP access.\n` +
        `[oga-mcp] The MCP server is included on the free Developer tier and every paid package.\n` +
        `[oga-mcp] See https://www.onegoodarea.com/pricing or book a demo.\n`,
    );
    process.exit(1);
  }

  process.stderr.write(
    `[oga-mcp] Entitlement OK · plan: ${me.plan_name} · engine: ${me.engine_version}\n`,
  );

  /* AR-385: surface the per-key training-data capture state on every
     boot. Customers can toggle in /api-usage; this log makes the current
     state visible every time their MCP client (Claude Code / Cursor /
     Claude Desktop) starts the server. Defaults to false (capturing)
     when the apps/api response predates AR-385. */
  const trainingOptout = me.key?.training_optout ?? false;
  const captureState = trainingOptout ? "OFF (you opted out)" : "ON";
  process.stderr.write(
    `[oga-mcp] Training-data capture: ${captureState} for this key. ` +
      `Toggle at https://www.onegoodarea.com/api-usage · ` +
      `Policy: https://www.onegoodarea.com/legal/data-policy\n`,
  );
}

async function main(): Promise<void> {
  const apiKey = readApiKey();
  const baseUrl = process.env.OOGA_API_BASE;

  const client = new OogaApiClient({ apiKey, baseUrl });

  // Fail fast if customer's plan doesn't include MCP access.
  await checkMcpAccess(client);

  const server = new Server(
    {
      name: "onegoodarea",
      version: SERVER_VERSION,
    },
    {
      capabilities: { tools: {} },
    },
  );
  server.oninitialized = () => client.setHostClient(server.getClientVersion());

  // 11 tools: score_postcode, compare_postcodes, get_area_signals,
  // get_signals_by_category, find_areas, find_peers, watch_portfolio,
  // get_portfolio_changes, area_brief, engine_version (network);
  // methodology_for (static lookup).
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
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
    ],
  }));

  // Dispatch on tool name. Each tool owns its own arg parsing + execution.
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;

    if (name === scorePostcodeToolName) {
      const parsed = parseScorePostcodeArgs(args);
      return executeScorePostcode(client, parsed);
    }
    if (name === comparePostcodesToolName) {
      const parsed = parseComparePostcodesArgs(args);
      return executeComparePostcodes(client, parsed);
    }
    if (name === getAreaSignalsToolName) {
      const parsed = parseGetAreaSignalsArgs(args);
      return executeGetAreaSignals(client, parsed);
    }
    if (name === getSignalsByCategoryToolName) {
      const parsed = parseGetSignalsByCategoryArgs(args);
      return executeGetSignalsByCategory(client, parsed);
    }
    if (name === findAreasToolName) {
      const parsed = parseFindAreasArgs(args);
      return executeFindAreas(client, parsed);
    }
    if (name === findPeersToolName) {
      const parsed = parseFindPeersArgs(args);
      return executeFindPeers(client, parsed);
    }
    if (name === watchPortfolioToolName) {
      const parsed = parseWatchPortfolioArgs(args);
      return executeWatchPortfolio(client, parsed);
    }
    if (name === getPortfolioChangesToolName) {
      const parsed = parseGetPortfolioChangesArgs(args);
      return executeGetPortfolioChanges(client, parsed);
    }
    if (name === areaBriefToolName) {
      const parsed = parseAreaBriefArgs(args);
      return executeAreaBrief(client, parsed);
    }
    if (name === methodologyForToolName) {
      const parsed = parseMethodologyForArgs(args);
      return executeMethodologyFor(parsed);
    }
    if (name === engineVersionToolName) {
      return executeEngineVersion(client);
    }

    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write(
    `[oga-mcp] v${SERVER_VERSION} listening on stdio (api: ${baseUrl ?? DEFAULT_BASE})\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`[oga-mcp] Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
