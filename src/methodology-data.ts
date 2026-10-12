/**
 * How each scoring dimension works, baked into the MCP server so
 * `methodology_for` answers without a network round-trip. The engine
 * version and release history are read live by `engine_version`.
 *
 * Source of truth: https://www.onegoodarea.com/methodology. Update this
 * file when a methodology release changes how a dimension scores. The
 * dimension names match the labels the engine emits in `dimensions[].label`;
 * every preset scores the same seven, and intent changes only the weights.
 */

export interface DimensionMethodology {
  dimension: string;
  intents: string[];
  source: string;
  summary: string;
  weights: Record<string, number>;
}

export const METHODOLOGY: DimensionMethodology[] = [
  {
    dimension: "Crime",
    intents: ["moving", "business", "investing", "research"],
    source: "police.uk street-level recorded crime, trailing 12 months",
    summary:
      "Scores the monthly rate of recorded crime on a smooth curve (about 10 a month scores in the 80s, 60 a month scores 50), then adjusts for the share of violent crime and robbery and for a rising or falling trend. Confidence follows the size and length of the sample. Weighted highest for moving.",
    weights: { moving: 20, business: 5, investing: 10, research: 15 },
  },
  {
    dimension: "Deprivation",
    intents: ["moving", "business", "investing", "research"],
    source: "IMD 2025 (England), WIMD 2025 (Wales), SIMD 2020 (Scotland)",
    summary:
      "The official deprivation decile of the neighbourhood mapped to 0 to 100 (decile 1 most deprived, decile 10 least). The business preset reads the same decile as a spending-power proxy. England carries high confidence on IMD 2025, the current release; Wales (WIMD 2025) and Scotland (SIMD 2020) carry medium confidence because their indices are updated about every five years.",
    weights: { moving: 10, business: 15, investing: 10, research: 15 },
  },
  {
    dimension: "Property",
    intents: ["moving", "business", "investing", "research"],
    source: "ONS house price statistics for the neighbourhood group (MSOA); HM Land Registry sales where the store has no figure",
    summary:
      "Intent-aware. For moving and research it is affordability: the median sale price against the national median. For business it is a commercial-cost proxy (higher values, lower score). For investing it averages year-on-year price growth and an inferred rental yield. Confidence follows the sales behind the median. Falls back to the deprivation decile, at low confidence, when there is no price data.",
    weights: { moving: 20, business: 15, investing: 30, research: 14 },
  },
  {
    dimension: "Schools",
    intents: ["moving", "business", "investing", "research"],
    source: "Ofsted grades (England), school locations (Wales and Scotland)",
    summary:
      "England: the quality-weighted count of graded schools within 1.5km, ranked among neighbourhoods of the same kind (urban, suburban or rural), so 70 means better served than about 70% of similar places. Every school carries its most recent Ofsted grade. Wales and Scotland rank the school count. Confidence follows the number of graded schools, and drops when many schools are ungraded or the grades are old.",
    weights: { moving: 20, business: 5, investing: 5, research: 14 },
  },
  {
    dimension: "Amenities",
    intents: ["moving", "business", "investing", "research"],
    source: "OpenStreetMap (schools, food and drink, healthcare, shops, parks and leisure)",
    summary:
      "Counts of each amenity category nearby, each ranked among neighbourhoods of the same kind (urban, suburban or rural) and combined by weight, so a rural area is judged against rural areas. The business preset weights this category highest as the footfall and catchment driver.",
    weights: { moving: 10, business: 25, investing: 15, research: 14 },
  },
  {
    dimension: "Transport",
    intents: ["moving", "business", "investing", "research"],
    source: "NaPTAN, the national register of public transport stops",
    summary:
      "Rail and underground stations within 2km and bus stops within 500m, each ranked among neighbourhoods of the same kind (urban, suburban or rural) and weighted equally. The reasoning states both ranks. Weighted heaviest for business, where access drives footfall.",
    weights: { moving: 15, business: 20, investing: 15, research: 14 },
  },
  {
    dimension: "Environment",
    intents: ["moving", "business", "investing", "research"],
    source: "Environment Agency (England), SEPA (Scotland), Natural Resources Wales; OpenStreetMap green space",
    summary:
      "Counts the flood risk areas or flood maps near the neighbourhood's centre (the Environment Agency's own 3km rule in England; SEPA and Natural Resources Wales maps within 250m) and ranks that exposure among the nation's neighbourhoods, the least exposed scoring highest. Parks and green space add a little; an active flood warning, when warnings were checked for the response, takes points off. The reasoning names the agency and what it measures. Without flood data the score rests on green space at reduced confidence.",
    weights: { moving: 5, business: 15, investing: 15, research: 14 },
  },
];

/** Match a user's dimension query against the canonical names (case-insensitive, partial match). */
export function findDimension(query: string): DimensionMethodology | null {
  const q = query.toLowerCase().trim();
  // Exact match first
  const exact = METHODOLOGY.find((d) => d.dimension.toLowerCase() === q);
  if (exact) return exact;
  // Substring match (e.g. "environ" matches "Environment")
  return METHODOLOGY.find((d) => d.dimension.toLowerCase().includes(q)) ?? null;
}
