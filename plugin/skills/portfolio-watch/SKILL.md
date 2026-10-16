---
name: portfolio-watch
description: Use when a user wants to track a list of places in England, Wales or Scotland over time and learn what changed. Runs OneGoodArea's watch_portfolio once to create the portfolio, then get_portfolio_changes to report material moves with their size, direction and cause, and explains thresholds, baselines and the sample-size gate.
---

# Portfolio watch

OneGoodArea Monitor tracks a named list of places and reports material signal changes between periods, with the cause of each change. Read the `read-confidence-and-dates` skill before you write anything up.

## Steps

1. **Create the portfolio once.** Call `watch_portfolio` with a display name and the places (postcodes, place names or neighbourhood codes). Every call creates a new portfolio, so call it once per list and keep the returned portfolio id (`pf_...`). If the user already has a portfolio id, do not create another.
2. **Read the changes.** Call `get_portfolio_changes` with the portfolio id. Defaults: changes of 5% or more count as material (`threshold_pct`), the latest period is compared with the previous one (`baseline: "previous"`), and a price move needs at least 8 sales in both periods (`min_transactions`). Use `baseline: "first"` to measure drift since the portfolio's first period.
3. **Filter by cause when asked.** Each change carries a cause: `source` (the source data moved), `method` (a OneGoodArea methodology release changed how the value is computed, named by version) or `source_and_method`. Pass `cause` to list only one kind.
4. **Explain a mover.** For a place that moved, `get_signals_by_category` gives the current value with its period and confidence reason; `methodology_for` explains a dimension if a method change is involved.

## How to write it up

- Start with the counts: places checked, changes found, the threshold and baseline used, the periods compared.
- Then one line per material change: place, signal, from and to values with units, delta and percent, direction, cause. Group by place.
- Separate the two causes. A `method` change means the world may not have moved; the engine's release did. Name the version and point to `engine_version` or the changelog.
- Mention the sample-size gate when a price move is absent because sales were below the minimum, if the user expects one.

## Do not

- Create a second portfolio for the same list; reuse the id.
- Describe a check as sending alerts. Reading changes never fires the portfolio's webhooks.
- Report a change below the threshold as material, or infer a trend from a single period-over-period move.
- Promise alerts on individual properties; portfolios hold neighbourhoods.
