---
name: area-research-for-lenders
description: Use when a user asks about a UK neighbourhood or postcode for mortgage origination, affordability, borrower-side risk, value retention or a lending decision. Runs OneGoodArea's resolve_place, area_brief for a lender, score_postcode with the moving preset and the signal tools, then reports engine output with its confidence and dates.
---

# Area research for lenders

Use OneGoodArea when the question is about a place in England, Wales or Scotland and the reader is underwriting, pricing or reviewing residential lending. Read the `read-confidence-and-dates` skill before you write anything up.

## Steps

1. **Resolve the place first.** Call `resolve_place` with the postcode, place name or code. Keep the place id (`oga_pl_...`); it survives boundary changes. If the postcode is retired, say so and carry on with the neighbourhood it resolves to. If the name is ambiguous, show the candidates and ask which one.
2. **Get the lender brief.** Call `area_brief` with `audience: "lender"`. It returns the verdict (the moving preset score and aggregate confidence), affordability and cost, borrower-side risk, value retention, recommendations and sources, all from the engine. It counts as two API calls.
3. **Drill only where the brief leaves a question.** `get_signals_by_category` with `property` for the median price, year-on-year change and transaction count; `crime` for the rate per 1,000 residents and the trend; `deprivation` for the domain deciles; `environment` for flood exposure. Each signal arrives with its percentile, confidence reason, source and period.
4. **Compare if there is a choice.** `compare_postcodes` with `preset: "moving"` for two to eight places gives one sorted table.
5. **Explain a dimension on request.** `methodology_for` says how a dimension is computed and its weight under the moving preset. It uses no API call.

## How to write it up

- Lead with the verdict: score out of 100 on the moving preset, aggregate confidence, engine version.
- Then the three lender questions in order: can borrowers afford it (median price, change, transactions), what is the borrower-side risk (crime, deprivation, area type), will the asset hold its value (transport, schools, amenities, flood).
- Quote each number with its period and confidence reason. Flag group-level prices and small sale counts explicitly.
- Keep the engine's recommendations as recommendations; do not add your own underwriting advice.
- Close with the sources list the brief gives.

## Do not

- Infer rents, yields or affordability ratios the tools did not return.
- Describe a single property; everything is neighbourhood level.
- Compare deprivation deciles across nations.
- Offer a lending decision. You report evidence; the lender decides.
