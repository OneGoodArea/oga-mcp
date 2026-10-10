/**
 * AR-369: AUDIENCES config for `area_brief`. The marquee composite tool
 * shapes its output by audience: lender, insurer, retailer, investor.
 *
 * Each entry says:
 *   - which scoring preset to call /v1/score?explain=true with
 *   - which dimension labels to emphasise in the brief
 *   - which raw signal keys to highlight, grouped by section
 *
 * Server-side narrative policy: nothing here invents prose. Every
 * "highlight" is just selection, which real field from the response
 * renders in which section. The score's `summary`, `recommendations`,
 * per-dimension `reasoning` + `confidence_reason` all come from the
 * engine; the audience config decides *which* of them surface.
 */

import type { Preset } from "../api-client.js";

export type Audience = "lender" | "insurer" | "retailer" | "investor";

export const AUDIENCES: Audience[] = ["lender", "insurer", "retailer", "investor"];

export interface BriefSection {
  /** Section heading shown in the markdown output. */
  title: string;
  /** Dimension labels (from the score response) to render in this section,
      in order. Labels match what the engine emits in `dimensions[].label`. */
  dimensions: string[];
  /** Raw signal keys (from the /v1/area catalog) to render in this section,
      in order. */
  signals: string[];
}

export interface AudienceConfig {
  audience: Audience;
  /** Display label for the brief header. */
  label: string;
  /** One-line description of who this brief is for. */
  framing: string;
  /** Which scoring preset feeds the overall verdict. */
  preset: Preset;
  /** Ordered sections after the verdict block. */
  sections: BriefSection[];
}

/** Lender (residential mortgage origination): preset=moving. Focused on
    affordability, borrower-side risk, and long-term value retention. */
const LENDER: AudienceConfig = {
  audience: "lender",
  label: "Lender brief",
  framing: "Residential mortgage origination: affordability, borrower-side risk, and long-term value retention.",
  preset: "moving",
  sections: [
    {
      title: "Affordability & cost",
      dimensions: ["Property", "Cost of Living"],
      signals: ["property.median_price", "property.price_change_pct", "property.transaction_count"],
    },
    {
      title: "Borrower-side risk",
      dimensions: ["Crime", "Safety", "Safety & Crime"],
      signals: ["crime.total_12m", "crime.monthly_rate", "environment.flood_areas_nearby", "environment.active_flood_warnings"],
    },
    {
      title: "Long-term value drivers",
      dimensions: ["Transport", "Schools", "Transport & Commute", "Schools & Education"],
      signals: ["schools.rated_count", "schools.good_or_outstanding_pct", "transport.stations", "transport.bus_stops"],
    },
  ],
};

/** Insurer (property risk underwriting): preset=investing (still risk-aware).
    Focused on physical hazards + crime + building stock signals. */
const INSURER: AudienceConfig = {
  audience: "insurer",
  label: "Insurer brief",
  framing: "Property risk underwriting: physical hazards, crime profile, and replacement-cost signals.",
  preset: "investing",
  sections: [
    {
      title: "Physical hazard",
      dimensions: ["Environment", "Risk Factors"],
      signals: ["environment.flood_areas_nearby", "environment.active_flood_warnings"],
    },
    {
      title: "Crime profile",
      dimensions: ["Crime", "Safety", "Safety & Crime"],
      signals: ["crime.total_12m", "crime.monthly_rate"],
    },
    {
      title: "Building stock & market signals",
      dimensions: ["Property", "Price Growth"],
      signals: ["property.median_price", "property.transaction_count", "property.price_change_pct"],
    },
  ],
};

/** Retailer (commercial site selection): preset=business. Focused on
    catchment demand, competition, access, and commercial costs. */
const RETAILER: AudienceConfig = {
  audience: "retailer",
  label: "Retailer brief",
  framing: "Commercial site selection: catchment demand, competition, access, and commercial costs.",
  preset: "business",
  sections: [
    {
      title: "Footfall & spending power",
      dimensions: ["Amenities", "Deprivation", "Foot Traffic", "Local Spending Power", "Spending Power"],
      signals: ["amenities.total", "amenities.restaurants_cafes", "amenities.shops"],
    },
    {
      title: "Competition",
      dimensions: ["Amenities", "Competition", "Competition Density"],
      signals: ["amenities.shops", "amenities.pubs_bars", "amenities.restaurants_cafes"],
    },
    {
      title: "Access",
      dimensions: ["Transport", "Transport Access"],
      signals: ["transport.stations", "transport.bus_stops"],
    },
    {
      title: "Commercial costs",
      dimensions: ["Property", "Commercial Costs"],
      signals: ["property.median_price"],
    },
  ],
};

/** Investor (residential investment): preset=investing. Focused on yield,
    growth, demand pressure, and risk discount. */
const INVESTOR: AudienceConfig = {
  audience: "investor",
  label: "Investor brief",
  framing: "Residential investment: yield, growth, demand pressure, and risk discount.",
  preset: "investing",
  sections: [
    {
      title: "Yield & growth",
      dimensions: ["Property", "Price Growth", "Rental Yield"],
      signals: ["property.median_price", "property.price_change_pct", "property.transaction_count"],
    },
    {
      title: "Demand pressure",
      dimensions: ["Amenities", "Transport", "Tenant Demand", "Regeneration", "Regeneration & Infrastructure"],
      signals: ["amenities.total", "transport.stations", "transport.bus_stops"],
    },
    {
      title: "Risk discount",
      dimensions: ["Crime", "Environment", "Risk Factors"],
      signals: ["crime.total_12m", "environment.flood_areas_nearby", "environment.active_flood_warnings"],
    },
  ],
};

const BY_AUDIENCE: Record<Audience, AudienceConfig> = {
  lender: LENDER,
  insurer: INSURER,
  retailer: RETAILER,
  investor: INVESTOR,
};

export function getAudienceConfig(audience: Audience): AudienceConfig {
  return BY_AUDIENCE[audience];
}
