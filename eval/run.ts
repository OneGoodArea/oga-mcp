/**
 * Tool-selection eval, the runner (AR-1155).
 *
 * Sends each prompt to Claude with the twelve tool definitions attached,
 * exactly as an MCP client presents them, and records which tool was
 * called with which arguments. No tool is executed: a first turn that only
 * calls resolve_place is answered with a fixture so the second turn can be
 * scored. Needs ANTHROPIC_API_KEY. Writes eval/RESULTS.md.
 *
 *   npm run eval                      the model the ticket names
 *   OGA_EVAL_MODEL=... npm run eval   another model
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { TOOL_DEFINITIONS, resolvePlaceToolDef } from "../src/tools/index.js";
import { CASES } from "./cases.js";
import { renderResults, scoreCase, summarise } from "./score.js";
import type { EvalCase, Observation, ToolInput } from "./score.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const MODEL = process.env.OGA_EVAL_MODEL ?? "claude-haiku-4-5";
const CONCURRENCY = 4;
const MAX_TOKENS = 1024;

const SYSTEM =
  "You are a helpful assistant. Tools are available: call one when it answers what the user asked, and answer directly when none applies.";

interface ApiToolCall {
  id: string;
  name: string;
  input: ToolInput;
}

function toolsForApi(): Anthropic.Tool[] {
  return TOOL_DEFINITIONS.map((t, i) => {
    const tool: Anthropic.Tool = {
      name: t.name,
      description: t.description,
      input_schema: JSON.parse(JSON.stringify(t.inputSchema)) as Anthropic.Tool.InputSchema,
    };
    if (i === TOOL_DEFINITIONS.length - 1) tool.cache_control = { type: "ephemeral" };
    return tool;
  });
}

function toolCalls(message: Anthropic.Message): ApiToolCall[] {
  const calls: ApiToolCall[] = [];
  for (const block of message.content) {
    if (block.type === "tool_use") {
      const input = typeof block.input === "object" && block.input !== null ? (block.input as ToolInput) : {};
      calls.push({ id: block.id, name: block.name, input });
    }
  }
  return calls;
}

/** What resolve_place would say for a live postcode, shaped like the tool's own output. */
function resolveFixture(input: ToolInput): string {
  const query = String(input.query ?? "").trim();
  return [
    "Place id: oga_pl_evalfixture00000",
    `Type: neighbourhood · Name: ${query}`,
    "Country: GB",
    `Resolved via postcode ${query}. Postcode status: live.`,
    "(Evaluation fixture: no OneGoodArea API call was made.)",
  ].join("\n");
}

async function observe(client: Anthropic, tools: Anthropic.Tool[], c: EvalCase): Promise<Observation> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: c.prompt }];
  const request = () =>
    client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature: 0,
      system: SYSTEM,
      tools,
      tool_choice: { type: "auto" },
      messages,
    });

  try {
    const first = await request();
    const firstCalls = toolCalls(first);
    const onlyResolve = firstCalls.length > 0 && firstCalls.every((call) => call.name === resolvePlaceToolDef.name);
    if (!onlyResolve || c.expect === resolvePlaceToolDef.name) {
      return { calls: firstCalls, resolvedFirst: false };
    }
    messages.push({ role: "assistant", content: first.content });
    messages.push({
      role: "user",
      content: firstCalls.map((call) => ({ type: "tool_result" as const, tool_use_id: call.id, content: resolveFixture(call.input) })),
    });
    const second = await request();
    return { calls: toolCalls(second), resolvedFirst: true };
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      return { calls: [], resolvedFirst: false, error: `${err.status ?? "network"} ${err.message}` };
    }
    return { calls: [], resolvedFirst: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set.");
    process.exit(2);
  }

  const client = new Anthropic();
  const tools = toolsForApi();
  const observations = new Array<Observation>(CASES.length);
  let next = 0;

  const worker = async () => {
    while (next < CASES.length) {
      const index = next++;
      const c = CASES[index];
      observations[index] = await observe(client, tools, c);
      const o = observations[index];
      const called = o.calls.map((call) => call.name).join(", ") || "no tool";
      console.error(`${c.id.padEnd(13)} ${o.error ? `FAILED ${o.error}` : called}${o.resolvedFirst ? " (after resolve_place)" : ""}`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const results = CASES.map((c, i) => scoreCase(c, observations[i]));
  const summary = summarise(results);
  const pkg = JSON.parse(readFileSync(join(HERE, "..", "package.json"), "utf8")) as { version: string };
  const markdown = renderResults(summary, {
    model: MODEL,
    packageVersion: pkg.version,
    ranOn: new Date().toISOString().slice(0, 10),
  });

  writeFileSync(join(HERE, "RESULTS.md"), markdown);
  console.log(markdown);

  if (summary.errors > 0) {
    console.error(`${summary.errors} request(s) failed; the score above is not a release score.`);
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
