# `@oga-mcp/server`

OneGoodArea is the intelligence layer for place: sourced, dated facts, explained scores, change monitoring and typed queries for every neighbourhood in Great Britain, served by one API with the methodology version on every response.

This package is one way to deliver it. It puts the same API inside Claude Desktop, Cursor, Claude Code, Windsurf or any MCP-compatible client: resolve any postcode, name or code to a permanent place id, score a place for one of four presets, read the signals catalog, ask in natural language, find peers, watch portfolios for material change and generate audience-shaped briefs. Every answer is composed on the server from the engine. No client-side prose synthesis: every line of output cites real engine state.

---

## Data policy

Training-data capture is off by default. Nothing you ask through this server is used to improve OneGoodArea's own models unless you switch capture on for a key.

- **What capture would store, if you opt in:** natural-language questions to `find_areas`, and full `score_postcode` requests and responses when explain is on. Operational logs (which tool was called, when, by whom) are kept either way.
- **How to opt in or out:** sign in at https://www.onegoodarea.com/api-usage and use the "Training" switch next to any of your keys. It takes effect on the next request from any client using that key.
- **Where the state is shown:** on every start this server logs `[oga-mcp] Training-data capture: OFF | ON` for the key in use.
- **Retention:** captured data is purged automatically after 365 days.
- **Full policy:** https://www.onegoodarea.com/legal/data-policy

---

## Install

Two ways to connect, same twelve tools, same key.

### Hosted endpoint, nothing to install

The API serves the tools itself at `https://api.onegoodarea.com/mcp` (Streamable HTTP). Nothing runs on your machine.

#### Sign in, no key to copy

In Claude (web and apps): Settings, Connectors, Add custom connector. Name it OneGoodArea, paste `https://api.onegoodarea.com/mcp`, keep the detected defaults and connect. Sign in to OneGoodArea, click Allow access, and the tools are in your next chat.

In Claude Code:

```sh
claude mcp add --transport http onegoodarea https://api.onegoodarea.com/mcp
```

then type `/mcp`, pick `onegoodarea` and choose Authenticate. Your browser opens the same sign-in.

Approving creates an API key named after the app in your account (for example "Claude connector"). It carries your plan and allowance like any other key, and revoking it from your dashboard disconnects the app. Any client that supports MCP sign-in (OAuth) works the same way from the URL alone.

#### Or send your API key in a header

Claude Code:

```sh
claude mcp add --transport http onegoodarea https://api.onegoodarea.com/mcp --header "Authorization: Bearer oga_xxx"
```

Cursor, in `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "onegoodarea": {
      "url": "https://api.onegoodarea.com/mcp",
      "headers": { "Authorization": "Bearer oga_xxx" }
    }
  }
}
```

Any other client: point its remote MCP server setting at the URL above and add the header. Each tool call is metered exactly like a direct API call under your key. ChatGPT follows once the server is listed in the OpenAI apps directory.

### Local package

The server is also an npm package your client spawns with `npx`. It is listed in the [official MCP Registry](https://registry.modelcontextprotocol.io) as `com.onegoodarea/oga-mcp`; clients that install from the registry can add it by that name. Everything else uses one of the config blocks below.

#### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "onegoodarea": {
      "command": "npx",
      "args": ["-y", "@oga-mcp/server"],
      "env": {
        "OOGA_API_KEY": "oga_xxx"
      }
    }
  }
}
```

Restart Claude Desktop. The OneGoodArea tools appear when you start a conversation about a UK location.

#### Cursor

Add to `.cursor/mcp.json` in your project (or global config):

```json
{
  "mcpServers": {
    "onegoodarea": {
      "command": "npx",
      "args": ["-y", "@oga-mcp/server"],
      "env": { "OOGA_API_KEY": "oga_xxx" }
    }
  }
}
```

#### Claude Code (CLI)

One command:

```sh
claude mcp add onegoodarea -e OOGA_API_KEY=oga_xxx -- npx -y @oga-mcp/server
```

---

## Claude plugin

The `plugin/` folder is a Claude plugin: the hosted connector plus four skills that teach Claude how to use the tools well (area research for lenders, site comparison for retail, reading confidence and dates, portfolio watch). Once it is listed in the Claude directory, installing the plugin connects you with a sign-in. To try it before then, run `claude --plugin-dir ./plugin` from a checkout of this repository. Details in `plugin/README.md`.

## Get an API key

1. Sign up at https://www.onegoodarea.com/sign-up.
2. Go to https://www.onegoodarea.com/dashboard.
3. Create an API key; it starts with `oga_`.
4. Paste it after `Bearer` in the hosted header, or into the `OOGA_API_KEY` env var for the local package. If your client signs in instead, skip this: the key is created for you when you allow access.

---

## Tools

Twelve tools across seven surfaces. Every response is composed server-side from the deterministic engine, with no client-side prose synthesis.

### Places

#### `resolve_place(query)`: Resolve a place

One input, the permanent place it names. Accepts a postcode, a place name, an official neighbourhood code or an `oga_pl_` place id and returns the id, type, name, country and nation, how it resolved, and for a postcode whether it is live or retired. A retired postcode still resolves to the neighbourhood it was in, with the month it was retired. Several matches come back as candidates with their ids; nothing comes back with the reason.

### Scores

#### `score_postcode(area, preset)`: Score a place for a decision

Score a UK postcode or place name for a preset (`moving`, `business`, `investing`, `research`). Returns the 0-100 score, seven weighted dimensions with engine-grounded reasoning + confidence, a one-paragraph summary, recommendations, and data sources.

#### `compare_postcodes(areas, preset)`: Compare places side by side

Score 2-8 areas side-by-side for the same preset. Returns a sorted comparison table with per-area summaries. Partial failures surface inline.

### Signals

#### `get_area_signals(area)`: All signals for a place

Full signals catalog across all seven categories (crime, deprivation, property, schools, amenities, transport, environment). Each signal carries value + unit, percentile when store-backed, confidence with engine-grounded reason, source attribution, and observation period.

#### `get_signals_by_category(area, category)`: Signals in one category

Same shape as `get_area_signals`, narrowed to one category. Use when the LLM needs to focus on a single data domain.

### Intelligence

#### `find_areas(question)`: Find neighbourhoods matching a question

Ask in natural language. The planner translates the question into a typed plan (one of seven ops: `rank_areas`, `get_area`, `score_area`, `compare_areas`, `find_peers`, `find_insights`, `find_forecast`); the database executes it. The response returns the emitted plan + results, so every answer carries the query that produced it and can be run again.

#### `find_peers(area, k?)`: Find similar neighbourhoods

k-nearest-neighbour peers for a UK area by normalised signal values. Returns the target's geo_code, the signal dimensions used in the comparison, and a ranked peers list with distance (0 = identical, 1 = maximally distant) and `n_dims_used`.

### Monitor

#### `watch_portfolio(name, areas)`: Watch a portfolio of places

One-shot setup: creates a tracked portfolio and adds areas. Returns the new `portfolio_id` and the area list. If the add step fails after the create, the response surfaces the partial state so the LLM can act.

#### `get_portfolio_changes(portfolio_id, threshold_pct?, baseline?, min_transactions?)`: Material changes in a portfolio

Check a portfolio for material signal changes between two time-series periods. Returns scope, counts, and a per-area table of material moves with direction, from/to values, delta, and percent change. Probe calls don't fire customer webhooks.

### Brief

#### `area_brief(area, audience)`: Brief on a place for an audience

One audience-shaped advisory document per area. Audience ∈ `{lender, insurer, retailer, investor}`. Composes the full signals catalog with the audience's scoring preset (with explain mode), then renders an audience-specific brief: overall verdict, audience-relevant dimensions, audience-relevant signals with provenance, recommendations, and data sources.

### Reference

#### `methodology_for(dimension)`: Methodology for a scoring dimension

Methodology for any scoring dimension: data source, scoring function summary, per-preset weights. Static lookup: no network, no quota cost.

#### `engine_version()`: Engine version and releases

Current engine version and the most recent methodology releases, read live from the API. The live engine version is also stamped on every `score_postcode` and `get_area_signals` response.

---

## Pricing

The MCP server is **free**. API calls go through your OneGoodArea plan; current tiers and any MCP-specific terms live at https://www.onegoodarea.com/pricing.

---

## Development

```sh
cd mcp
npm install
npm run dev          # run via tsx, reads OOGA_API_KEY from env
npm test             # vitest
npm run build        # tsc to dist/
```

Override the API base for local dev against the standalone API server:

```sh
OOGA_API_BASE=http://localhost:4000 OOGA_API_KEY=oga_dev npm run dev
```

---

## Evaluation

Fifty prompts a user might type are sent to Claude with the twelve tool definitions attached, and each answer is scored on which tool was called and with which arguments: compare named places, rank or find neighbourhoods, places like this one, history and changes, watch a portfolio, resolve a place, one place, and ten prompts that must not call a tool. The eval never calls the OneGoodArea API. Score for 1.0.13, run on 20 October 2026 against `claude-haiku-4-5`: 49 of 50 passed (98%). The one miss was a question about Belfast, outside coverage, that called `find_areas`. Per-group results and failures are in [eval/RESULTS.md](eval/RESULTS.md); the run below rewrites it.

```sh
ANTHROPIC_API_KEY=... npm run eval                  # writes eval/RESULTS.md
OGA_EVAL_MODEL=claude-sonnet-4-5 npm run eval       # another model
```

In CI it runs by hand or on an `mcp-v*` tag, never on pull requests, because every run spends tokens.

---

## Source

The source lives at https://github.com/OneGoodArea/oga-mcp, a read-only mirror of the `mcp/` folder in OneGoodArea's monorepo, updated on every change. Open issues there. Code changes are made upstream and arrive with the next sync.

---

## License

MIT. © 2026 OneGoodArea. Full text in [LICENSE](LICENSE).
