# OneGoodArea plugin for Claude

OneGoodArea is the intelligence layer for place: sourced, dated facts, explained scores, peers and change monitoring for every neighbourhood in England, Wales and Scotland, served by one API. This plugin connects Claude to the hosted MCP server at `https://api.onegoodarea.com/mcp` and adds four skills that teach Claude how to use the twelve tools well.

## What is inside

- `.mcp.json` points Claude at the hosted server. Nothing runs on your machine. On first use Claude asks you to sign in to OneGoodArea and allow access; that creates an API key in your account, named after the app, which you can revoke at any time from your dashboard.
- `skills/area-research-for-lenders`: how to research a neighbourhood for mortgage origination, affordability and value retention.
- `skills/site-comparison-for-retail`: how to shortlist and compare sites with the business preset, amenities, transport and crime.
- `skills/read-confidence-and-dates`: how to read confidence, observation periods, percentiles, group-level values and the methodology version, and what never to infer.
- `skills/portfolio-watch`: how to watch a list of places and report material change with its cause.

## Try it before it is listed

From a checkout of this repository, start Claude Code with the folder as a plugin for one session:

```sh
claude --plugin-dir ./plugin
```

The first tool call asks you to sign in to OneGoodArea.

## The twelve tools

resolve_place, score_postcode, compare_postcodes, get_area_signals, get_signals_by_category, find_areas, find_peers, watch_portfolio, get_portfolio_changes, area_brief, methodology_for and engine_version. Every answer is composed on the server from engine output; the model reports numbers, it does not invent them. Each tool call is an ordinary API call under your plan. The free sandbox covers 500 calls a month.

## Links

- Documentation: https://www.onegoodarea.com/docs/mcp
- Methodology: https://www.onegoodarea.com/methodology
- Data policy: https://www.onegoodarea.com/legal/data-policy
- Source for the server and this plugin: https://github.com/OneGoodArea/oga-mcp
- Support: https://www.onegoodarea.com/contact

## Licence

MIT, see `LICENSE`.
