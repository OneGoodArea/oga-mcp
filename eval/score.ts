/**
 * Tool-selection eval, the scoring half (AR-1155).
 *
 * Pure functions: a case plus what the model did in, a result out, and a
 * RESULTS.md renderer. No network, so the tests cover every rule here and
 * run.ts only has to talk to the API.
 */

import type { ToolName } from "../src/tools/index.js";

export type ToolInput = Record<string, unknown>;

/** Returns null when the arguments are acceptable, otherwise the reason. */
export type ArgumentCheck = (input: ToolInput) => string | null;

export type EvalGroup = "compare" | "find" | "peers" | "history" | "portfolio" | "resolve" | "single" | "none";

export interface EvalCase {
  id: string;
  group: EvalGroup;
  prompt: string;
  /** The tool the prompt should trigger; null when no tool should be called. */
  expect: ToolName | null;
  check?: ArgumentCheck;
}

export const GROUPS: Readonly<Record<EvalGroup, { label: string; cases: number }>> = {
  compare: { label: "Compare named places", cases: 8 },
  find: { label: "Rank or find neighbourhoods", cases: 8 },
  peers: { label: "Places like this one", cases: 4 },
  history: { label: "History and changes", cases: 5 },
  portfolio: { label: "Watch a portfolio", cases: 4 },
  resolve: { label: "Resolve a place", cases: 5 },
  single: { label: "One place", cases: 6 },
  none: { label: "Must not call a tool", cases: 10 },
};

export const GROUP_ORDER: readonly EvalGroup[] = ["compare", "find", "peers", "history", "portfolio", "resolve", "single", "none"];

export interface ToolCall {
  name: string;
  input: ToolInput;
}

/** What the model did on the decisive turn of one prompt. */
export interface Observation {
  calls: ToolCall[];
  /** The first turn called only resolve_place and the second turn was scored. */
  resolvedFirst: boolean;
  /** A transport or API failure; the case fails and the run exits non-zero. */
  error?: string;
}

export interface CaseResult {
  id: string;
  group: EvalGroup;
  prompt: string;
  expect: ToolName | null;
  called: string[];
  resolvedFirst: boolean;
  toolPass: boolean;
  pass: boolean;
  failure: string | null;
}

export function scoreCase(c: EvalCase, o: Observation): CaseResult {
  const called = o.calls.map((call) => call.name);
  const base = { id: c.id, group: c.group, prompt: c.prompt, expect: c.expect, called, resolvedFirst: o.resolvedFirst };

  if (o.error) {
    return { ...base, toolPass: false, pass: false, failure: `request failed: ${o.error}` };
  }

  if (c.expect === null) {
    const toolPass = called.length === 0;
    return { ...base, toolPass, pass: toolPass, failure: toolPass ? null : `expected no tool, called ${called.join(", ")}` };
  }

  const match = o.calls.find((call) => call.name === c.expect);
  if (!match) {
    return { ...base, toolPass: false, pass: false, failure: `expected ${c.expect}, called ${called.length ? called.join(", ") : "no tool"}` };
  }

  const reason = c.check ? c.check(match.input) : null;
  if (reason) {
    return { ...base, toolPass: true, pass: false, failure: `${c.expect} called with ${JSON.stringify(match.input)}: ${reason}` };
  }
  return { ...base, toolPass: true, pass: true, failure: null };
}

export interface GroupSummary {
  group: EvalGroup;
  label: string;
  cases: number;
  toolPass: number;
  pass: number;
}

export interface Summary {
  groups: GroupSummary[];
  cases: number;
  toolPass: number;
  pass: number;
  resolvedFirst: number;
  errors: number;
  failures: CaseResult[];
}

export function summarise(results: CaseResult[]): Summary {
  const groups = GROUP_ORDER.map((group) => {
    const rows = results.filter((r) => r.group === group);
    return {
      group,
      label: GROUPS[group].label,
      cases: rows.length,
      toolPass: rows.filter((r) => r.toolPass).length,
      pass: rows.filter((r) => r.pass).length,
    };
  });
  return {
    groups,
    cases: results.length,
    toolPass: results.filter((r) => r.toolPass).length,
    pass: results.filter((r) => r.pass).length,
    resolvedFirst: results.filter((r) => r.resolvedFirst).length,
    errors: results.filter((r) => r.failure?.startsWith("request failed")).length,
    failures: results.filter((r) => !r.pass),
  };
}

export interface RunMeta {
  model: string;
  packageVersion: string;
  /** ISO date, UTC. The time of day is left out so two runs on one day diff cleanly. */
  ranOn: string;
}

function percent(part: number, whole: number): string {
  return whole === 0 ? "0%" : `${Math.round((part / whole) * 100)}%`;
}

export function renderResults(summary: Summary, meta: RunMeta): string {
  const lines: string[] = [];
  lines.push("# Tool-selection eval");
  lines.push("");
  lines.push(
    `${summary.cases} prompts sent to \`${meta.model}\` with the twelve tool definitions of \`@oga-mcp/server\` ${meta.packageVersion} attached, ` +
      "scored on which tool was called and with which arguments. " +
      `Run on ${meta.ranOn}. The eval never calls the OneGoodArea API; the places in the prompts are illustrative.`,
  );
  lines.push("");
  lines.push("| Group | Cases | Tool choice | Pass |");
  lines.push("|---|---|---|---|");
  for (const g of summary.groups) {
    lines.push(`| ${g.label} | ${g.cases} | ${g.toolPass} | ${g.pass} |`);
  }
  lines.push(`| All | ${summary.cases} | ${summary.toolPass} | ${summary.pass} |`);
  lines.push("");
  lines.push(
    `Overall: ${summary.pass} of ${summary.cases} passed (${percent(summary.pass, summary.cases)}). ` +
      `Tool choice right in ${summary.toolPass} of ${summary.cases} (${percent(summary.toolPass, summary.cases)}). ` +
      `${summary.resolvedFirst} prompt${summary.resolvedFirst === 1 ? "" : "s"} went through resolve_place first.` +
      (summary.errors ? ` ${summary.errors} request${summary.errors === 1 ? "" : "s"} failed.` : ""),
  );
  lines.push("");
  lines.push("## Failures");
  lines.push("");
  if (summary.failures.length === 0) {
    lines.push("None.");
  } else {
    for (const f of summary.failures) {
      lines.push(`- \`${f.id}\`: ${f.failure}. Prompt: "${f.prompt}"`);
    }
  }
  lines.push("");
  lines.push("## How to read it");
  lines.push("");
  lines.push(
    "Tool choice: the expected tool was among the calls of the decisive turn, or no tool was called when none should be. " +
      "Pass: tool choice right and every argument check met. " +
      "A first turn that calls only resolve_place is answered with a fixture and the second turn is the decisive one, " +
      "because the resolve_place description asks for that path when an input may be retired or ambiguous.",
  );
  lines.push("");
  return lines.join("\n");
}
