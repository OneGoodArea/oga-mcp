---
name: site-comparison-for-retail
description: Use when a user wants to shortlist, rank or compare locations in England, Wales or Scotland for a shop, branch, clinic or other physical site. Runs OneGoodArea's compare_postcodes with the business preset, area_brief for a retailer, find_peers and the amenities, transport and crime signals, and reports engine output with its confidence and dates.
---

# Site comparison for retail

Use OneGoodArea when someone is choosing between places for a physical site. The business preset weights what site selection cares about: amenities and demand, transport access, competition and the local risk picture. Read the `read-confidence-and-dates` skill before you write anything up.

## Steps

1. **Resolve every candidate.** Call `resolve_place` for each postcode or name so you work with the right neighbourhood and keep its id. Ambiguous names get a question back to the user, not a guess.
2. **Rank the shortlist.** Call `compare_postcodes` with all candidates (two to eight) and `preset: "business"`. You get one table sorted by score with area type, strongest dimension and a one-line summary per place. A candidate that fails is reported in its row; the others still return.
3. **Brief the finalists.** Call `area_brief` with `audience: "retailer"` for the top two or three. It returns the verdict, footfall and demand proxies, access, competition and risk sections with provenance, and recommendations. It counts as two API calls per place.
4. **Check the drivers.** `get_signals_by_category` with `amenities` (count nearby and percentile), `transport` (stations within 2 km, bus stops within 500 m) and `crime` (rate per 1,000 residents and trend) when the brief needs a number behind it.
5. **Find more like the winner.** `find_peers` on the best-performing existing site returns the neighbourhoods most similar to it across the signals they share, with a distance from 0 (identical) to 1. `find_areas` answers a filtered question in plain English ("neighbourhoods in Greater Manchester with amenities above the 80th percentile") and returns the plan it ran; it uses one natural-language question from the monthly allowance.

## How to write it up

- One table first: place, business score, area type, strongest dimension, one-line summary, straight from `compare_postcodes`.
- Then the finalists, each with the retailer brief's verdict and the two or three signals that separate them, every number with period and confidence.
- Say what the data is a proxy for. Amenity counts and transport stops describe the surroundings; they are not footfall counts, and OneGoodArea holds no footfall or turnover data.
- Note area type. An urban score and a rural score are ranked among different comparison sets.

## Do not

- Invent footfall, catchment population or spend figures.
- Treat a higher score as a recommendation; present it as the engine's weighted view under the business preset and name the dimensions behind it.
- Compare places scored under different presets or engine versions in one table.
