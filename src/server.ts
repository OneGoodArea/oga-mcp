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
import { trainingCaptureLine } from "./startup.js";
import { TOOL_DEFINITIONS, callTool } from "./tools/index.js";

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

  process.stderr.write(trainingCaptureLine(me));
}

async function main(): Promise<void> {
  const apiKey = readApiKey();
  const baseUrl = process.env.OOGA_API_BASE;

  const client = new OogaApiClient({ apiKey, baseUrl, version: SERVER_VERSION });

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

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...TOOL_DEFINITIONS],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) =>
    callTool(client, req.params.name, req.params.arguments),
  );

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
