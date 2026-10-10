# `@oga-mcp/server`

OneGoodArea is the intelligence layer for place: sourced, dated facts, explained scores, change monitoring and typed queries for every neighbourhood in Great Britain, served by one API with the methodology version on every response.

This package is one way to deliver it. It puts the same API inside Claude Desktop, Cursor, Claude Code, Windsurf or any MCP-compatible client: score a place for one of four presets, read the signals catalog, ask in natural language, find peers, watch portfolios for material change and generate audience-shaped briefs. Every answer is composed on the server from the engine. No client-side prose synthesis: every line of output cites real engine state.

---

## Data policy (read this)

By default, queries made through this MCP server are used to improve OneGoodArea's own AI models (planner translations and brief composition). You can opt out per API key at any time.

- **What's captured:** natural-language questions to `find_areas`, and full `score_postcode` requests + responses when explain is on. Operational logs (which tool was called, when, by whom) are kept either way.
- **How to opt out:** sign in at https://www.onegoodarea.com/api-usage and click the "Training" toggle next to any of your keys. Takes effect on the next request from any MCP client using that key.
- **Where state is shown:** on every server start, this MCP logs `[oga-mcp] Training-data capture: ON | OFF` so you can see the current state for the key you're using.
- **Retention:** training data is purged automatically after 365 days.
- **Full policy:** https://www.onegoodarea.com/legal/data-policy

---

## Install

You don't install it directly. Configure your MCP client to spawn it via `npx`.

The server is listed in the [official MCP Registry](https://registry.modelcontextprotocol.io) as `com.onegoodarea/oga-mcp`. Clients that install from the registry can add it by that name. Everything else uses one of the config blocks below.

### Claude Desktop

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

### Cursor

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

### Claude Code (CLI)

One command:

```sh
claude mcp add onegoodarea -e OOGA_API_KEY=oga_xxx -- npx -y @oga-mcp/server
```

---

## Get an API key

1. Sign up at https://www.onegoodarea.com/sign-up.
2. Go to https://www.onegoodarea.com/dashboard.
3. Create an API key; it starts with `oga_`.
4. Paste it into the `OOGA_API_KEY` env var above.

---

## Tools

Eleven tools across six surfaces. Every response is composed server-side from the deterministic engine, with no client-side prose synthesis.

### Scores

#### `score_postcode(area, preset)`

Score a UK postcode or place name for a preset (`moving`, `business`, `investing`, `research`). Returns the 0-100 score, seven weighted dimensions with engine-grounded reasoning + confidence, a one-paragraph summary, recommendations, and data sources.

#### `compare_postcodes(areas, preset)`

Score 2-8 areas side-by-side for the same preset. Returns a sorted comparison table with per-area summaries. Partial failures surface inline.

### Signals

#### `get_area_signals(area)`

Full signals catalog across all seven categories (crime, deprivation, property, schools, amenities, transport, environment). Each signal carries value + unit, percentile when store-backed, confidence with engine-grounded reason, source attribution, and observation period.

#### `get_signals_by_category(area, category)`

Same shape as `get_area_signals`, narrowed to one category. Use when the LLM needs to focus on a single data domain.

### Intelligence

#### `find_areas(question)`

Ask in natural language. The planner translates the question into a typed plan (one of seven ops: `rank_areas`, `get_area`, `score_area`, `compare_areas`, `find_peers`, `find_insights`, `find_forecast`); the database executes it. The response returns the emitted plan + results, so every answer carries the query that produced it and can be run again.

#### `find_peers(area, k?)`

k-nearest-neighbour peers for a UK area by normalised signal values. Returns the target's geo_code, the signal dimensions used in the comparison, and a ranked peers list with distance (0 = identical, 1 = maximally distant) and `n_dims_used`.

### Monitor

#### `watch_portfolio(name, areas)`

One-shot setup: creates a tracked portfolio and adds areas. Returns the new `portfolio_id` and the area list. If the add step fails after the create, the response surfaces the partial state so the LLM can act.

#### `get_portfolio_changes(portfolio_id, threshold_pct?, baseline?, min_transactions?)`

Check a portfolio for material signal changes between two time-series periods. Returns scope, counts, and a per-area table of material moves with direction, from/to values, delta, and percent change. Probe calls don't fire customer webhooks.

### Brief

#### `area_brief(area, audience)`, marquee

One audience-shaped advisory document per area. Audience ∈ `{lender, insurer, retailer, investor}`. Composes the full signals catalog with the audience's scoring preset (with explain mode), then renders an audience-specific brief: overall verdict, audience-relevant dimensions, audience-relevant signals with provenance, recommendations, and data sources.

### Reference

#### `methodology_for(dimension)`

Methodology for any scoring dimension: data source, scoring function summary, per-preset weights. Static lookup: no network, no quota cost.

#### `engine_version()`

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

## Source

The source lives at https://github.com/OneGoodArea/oga-mcp, a read-only mirror of the `mcp/` folder in OneGoodArea's monorepo, updated on every change. Open issues there. Code changes are made upstream and arrive with the next sync.

---

## License

MIT. © 2026 OneGoodArea. Full text in [LICENSE](LICENSE).
