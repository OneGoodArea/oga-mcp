---
name: read-confidence-and-dates
description: Use whenever you report a number from a OneGoodArea tool. Explains how to read confidence and its reason, observation periods, percentiles and direction, group-level values, deprivation deciles, the methodology version, and what must never be inferred from the data.
---

# Reading OneGoodArea output

Every OneGoodArea answer is engine output rendered on the server. Your job is to report it faithfully, with the qualifiers the engine attached. This skill tells you which qualifiers matter and how to say them.

## Always carry four things with a number

1. **The value with its unit**, as the tool printed it (for example "£500,000", "26.3 per 1,000 residents", "2 of 10").
2. **The observation period and source**, from the `Source:` line (for example "HM Land Registry · 2025-Q3"). If the line says "date loaded; the source states no date", say that the date is when OneGoodArea loaded the data, not when it was observed.
3. **The confidence and its reason**, printed as "Confidence 40% · <reason>". The reason is the engine's own explanation; quote or paraphrase it, never drop it when confidence is below about 70%.
4. **The engine version** from the header ("Engine version: 1.12.6"). The same version is stamped on every score and signal, so two answers with different versions are not directly comparable.

## Percentiles and direction

A percentile line reads "91st percentile (direction: higher is better)". The percentile ranks the place among the comparison set the engine used, usually neighbourhoods of the same area type (urban or rural) or all of Great Britain when the area type is unavailable. Read the direction before judging: "4th percentile" is good for flood exposure and bad for amenities.

## Group-level values

Some values are inherited from a wider group because the neighbourhood itself has too few observations. Property is the common case: the median price and year-on-year change can come from the wider MSOA group with its transaction count, while the neighbourhood's own sales are few. The confidence reason says so and gives both counts. When you see it, say "group-level" and give the counts; do not present the figure as the neighbourhood's own.

## Deprivation

Deprivation deciles run from 1 (most deprived) to 10 and are relative within a nation. England uses IMD 2025, Wales WIMD 2025, Scotland SIMD 2020. Each domain carries the published rank, and a score where the publisher gives one. Never compare a Welsh decile with an English one as if they shared a scale, and when asking `find_areas` about deprivation, name the nation or district.

## Scores

`score_postcode` and `compare_postcodes` return a 0 to 100 score for a preset (moving, business, investing, research) built from seven weighted dimensions, each with its own confidence and reasoning. Quote the preset with the score. A score is deterministic for a given engine version; `methodology_for` explains how any dimension is computed and weighted, without using an API call.

## Never infer

- **Rents or yields.** OneGoodArea holds sale prices, not rents. If a brief marks yield as directional, repeat that wording and do not underwrite on it.
- **Individual properties.** Every value describes a neighbourhood (roughly 1,500 people) or a wider group, never an address.
- **Future values**, unless the user asked `find_areas` for a projection and the answer carries the plan that produced it.
- **Causes from correlation.** A low score and a high crime count sit side by side; the engine's reasoning says what drove the score, nothing else does.
- **Northern Ireland.** Coverage is England, Wales and Scotland. Say so if asked.
- **Precision the engine did not give.** Do not round a 40% confidence away, and do not add decimals the tool did not print.

## When data is missing

A signal that reads "n/a" has no value for that place. A tool that returns an error names the reason (an unknown postcode, a retired one, a quota reached). Report the reason; do not fill the gap from memory. A retired postcode still resolves to the neighbourhood it was in; say that it is retired and when.
