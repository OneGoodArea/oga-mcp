/**
 * Tool-selection eval, the fifty prompts (AR-1155).
 *
 * Each case is a prompt a user of Claude Desktop or Claude Code might type,
 * the tool it should trigger (or none), and checks on the arguments. The
 * eval never calls the OneGoodArea API, so the postcodes and names only
 * need to be plausible, not current.
 */

import type { ArgumentCheck, EvalCase, ToolInput } from "./score.js";

function norm(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/\s+/g, "");
}

/** A resolved input may be the raw text or the place id the fixture returned. */
function names(value: unknown, wanted: string): boolean {
  const v = norm(value);
  return v.includes(norm(wanted)) || v.startsWith("oga_pl_");
}

function all(...checks: ArgumentCheck[]): ArgumentCheck {
  return (input) => {
    for (const check of checks) {
      const reason = check(input);
      if (reason) return reason;
    }
    return null;
  };
}

function field(key: string, wanted: string): ArgumentCheck {
  return (input) => (names(input[key], wanted) ? null : `${key} should name ${wanted}`);
}

function equals(key: string, wanted: string | number): ArgumentCheck {
  return (input) => (input[key] === wanted ? null : `${key} should be ${JSON.stringify(wanted)}`);
}

function includesWord(key: string, wanted: string): ArgumentCheck {
  return (input) => (norm(input[key]).includes(norm(wanted)) ? null : `${key} should mention ${wanted}`);
}

function listHas(key: string, wanted: string[]): ArgumentCheck {
  return (input: ToolInput) => {
    const entries = input[key];
    if (!Array.isArray(entries)) return `${key} should be a list`;
    const ids = entries.filter((e) => norm(e).startsWith("oga_pl_")).length;
    const missing = wanted.filter((w) => !entries.some((e) => norm(e).includes(norm(w))));
    return missing.length <= ids ? null : `${key} should include ${missing.join(", ")}`;
  };
}

function listIncludes(key: string, wanted: string): ArgumentCheck {
  return (input) => {
    const entries = input[key];
    if (!Array.isArray(entries)) return `${key} should be a list`;
    return entries.includes(wanted) ? null : `${key} should include ${wanted}`;
  };
}

const compare: EvalCase[] = [
  {
    id: "compare-01",
    group: "compare",
    prompt: "Compare SE15 5DP, E17 4AA and N16 8BX for a buy-to-let investment.",
    expect: "compare_postcodes",
    check: all(listHas("areas", ["SE15 5DP", "E17 4AA", "N16 8BX"]), equals("preset", "investing")),
  },
  {
    id: "compare-02",
    group: "compare",
    prompt: "Which is the better spot to open a coffee shop: M1 1AE or M4 1HN?",
    expect: "compare_postcodes",
    check: all(listHas("areas", ["M1 1AE", "M4 1HN"]), equals("preset", "business")),
  },
  {
    id: "compare-03",
    group: "compare",
    prompt: "I am choosing between Leeds city centre and Headingley for a first home. Which scores better?",
    expect: "compare_postcodes",
    check: all(listHas("areas", ["Leeds city centre", "Headingley"]), equals("preset", "moving")),
  },
  {
    id: "compare-04",
    group: "compare",
    prompt: "Rank these postcodes on a neutral baseline: EH1 1YZ, G1 1XQ, AB10 1AB, DD1 1DB.",
    expect: "compare_postcodes",
    check: all(listHas("areas", ["EH1 1YZ", "G1 1XQ", "AB10 1AB", "DD1 1DB"]), equals("preset", "research")),
  },
  {
    id: "compare-05",
    group: "compare",
    prompt: "Side by side: CF10 1EP against SA1 1AA for a retail unit.",
    expect: "compare_postcodes",
    check: all(listHas("areas", ["CF10 1EP", "SA1 1AA"]), equals("preset", "business")),
  },
  {
    id: "compare-06",
    group: "compare",
    prompt: "Score BS1 4DJ, BA1 1AA and GL1 1AA for a residential mortgage book and put them in one table.",
    expect: "compare_postcodes",
    check: all(listHas("areas", ["BS1 4DJ", "BA1 1AA", "GL1 1AA"]), equals("preset", "moving")),
  },
  {
    id: "compare-07",
    group: "compare",
    prompt: "Which of NE1 7RU, SR1 3AA and DH1 3AA would a property investor prefer?",
    expect: "compare_postcodes",
    check: all(listHas("areas", ["NE1 7RU", "SR1 3AA", "DH1 3AA"]), equals("preset", "investing")),
  },
  {
    id: "compare-08",
    group: "compare",
    prompt: "Put Peckham, Brixton, Camberwell and Dulwich head to head for someone buying a flat to live in.",
    expect: "compare_postcodes",
    check: all(listHas("areas", ["Peckham", "Brixton", "Camberwell", "Dulwich"]), equals("preset", "moving")),
  },
];

const find: EvalCase[] = [
  {
    id: "find-01",
    group: "find",
    prompt: "Which neighbourhoods in Manchester have a median house price under 250,000 pounds and rising prices?",
    expect: "find_areas",
    check: includesWord("question", "Manchester"),
  },
  {
    id: "find-02",
    group: "find",
    prompt: "List the ten least deprived neighbourhoods in Wales.",
    expect: "find_areas",
    check: includesWord("question", "Wales"),
  },
  {
    id: "find-03",
    group: "find",
    prompt: "Where in Leeds are the most Outstanding schools within walking distance?",
    expect: "find_areas",
    check: includesWord("question", "Leeds"),
  },
  {
    id: "find-04",
    group: "find",
    prompt: "Find areas in Glasgow with low crime and good transport links.",
    expect: "find_areas",
    check: includesWord("question", "Glasgow"),
  },
  {
    id: "find-05",
    group: "find",
    prompt: "Which parts of Bristol have the lowest flood risk?",
    expect: "find_areas",
    check: includesWord("question", "Bristol"),
  },
  {
    id: "find-06",
    group: "find",
    prompt: "Rank Edinburgh neighbourhoods by house price growth over the last year.",
    expect: "find_areas",
    check: includesWord("question", "Edinburgh"),
  },
  {
    id: "find-07",
    group: "find",
    prompt: "Show me cheap neighbourhoods in Birmingham with plenty of amenities.",
    expect: "find_areas",
    check: includesWord("question", "Birmingham"),
  },
  {
    id: "find-08",
    group: "find",
    prompt: "What are the most deprived neighbourhoods in Scotland?",
    expect: "find_areas",
    check: includesWord("question", "Scotland"),
  },
];

const peers: EvalCase[] = [
  {
    id: "peers-01",
    group: "peers",
    prompt: "Find neighbourhoods similar to SE15 5DP.",
    expect: "find_peers",
    check: field("area", "SE15 5DP"),
  },
  {
    id: "peers-02",
    group: "peers",
    prompt: "Give me ten areas like Didsbury.",
    expect: "find_peers",
    check: all(field("area", "Didsbury"), equals("k", 10)),
  },
  {
    id: "peers-03",
    group: "peers",
    prompt: "Which places in Great Britain most resemble EH3 9DR statistically?",
    expect: "find_peers",
    check: field("area", "EH3 9DR"),
  },
  {
    id: "peers-04",
    group: "peers",
    prompt: "We like CF11 9HA. What are its closest peers?",
    expect: "find_peers",
    check: field("area", "CF11 9HA"),
  },
];

const history: EvalCase[] = [
  {
    id: "history-01",
    group: "history",
    prompt: "What changed materially in portfolio pf_7f3a9c since the last period?",
    expect: "get_portfolio_changes",
    check: equals("portfolio_id", "pf_7f3a9c"),
  },
  {
    id: "history-02",
    group: "history",
    prompt: "For portfolio pf_7f3a9c, show only the changes caused by a methodology release, with a 10 percent threshold.",
    expect: "get_portfolio_changes",
    check: all(equals("portfolio_id", "pf_7f3a9c"), listIncludes("cause", "method"), equals("threshold_pct", 10)),
  },
  {
    id: "history-03",
    group: "history",
    prompt: "What methodology version is the OneGoodArea engine on right now?",
    expect: "engine_version",
  },
  {
    id: "history-04",
    group: "history",
    prompt: "How is the Crime dimension scored and what weight does it carry under each preset?",
    expect: "methodology_for",
    check: includesWord("dimension", "crime"),
  },
  {
    id: "history-05",
    group: "history",
    prompt: "Why would Environment score 80 for a place? Explain the method behind that dimension.",
    expect: "methodology_for",
    check: includesWord("dimension", "environ"),
  },
];

const portfolio: EvalCase[] = [
  {
    id: "portfolio-01",
    group: "portfolio",
    prompt: "Start watching SE15 5DP, SE22 8HF and SE5 8TR for me and call it South London book.",
    expect: "watch_portfolio",
    check: all(listHas("areas", ["SE15 5DP", "SE22 8HF", "SE5 8TR"]), includesWord("name", "South London")),
  },
  {
    id: "portfolio-02",
    group: "portfolio",
    prompt: "Track these sites for material changes: M1 1AE, M2 4WU, M3 3EB.",
    expect: "watch_portfolio",
    check: listHas("areas", ["M1 1AE", "M2 4WU", "M3 3EB"]),
  },
  {
    id: "portfolio-03",
    group: "portfolio",
    prompt: "Set up monitoring on EH1 1YZ and G1 1XQ under the name Scottish pilot.",
    expect: "watch_portfolio",
    check: all(listHas("areas", ["EH1 1YZ", "G1 1XQ"]), includesWord("name", "Scottish pilot")),
  },
  {
    id: "portfolio-04",
    group: "portfolio",
    prompt: "Create a portfolio named Lender Q4 with CF10 1EP, SA1 1AA and LL57 1DT in it.",
    expect: "watch_portfolio",
    check: all(listHas("areas", ["CF10 1EP", "SA1 1AA", "LL57 1DT"]), includesWord("name", "Lender Q4")),
  },
];

const resolve: EvalCase[] = [
  {
    id: "resolve-01",
    group: "resolve",
    prompt: "Our old records carry the postcode E14 9GE, which I think was retired. Which neighbourhood was it in?",
    expect: "resolve_place",
    check: includesWord("query", "E14 9GE"),
  },
  {
    id: "resolve-02",
    group: "resolve",
    prompt: "Is SW1A 1AA still a live postcode?",
    expect: "resolve_place",
    check: includesWord("query", "SW1A 1AA"),
  },
  {
    id: "resolve-03",
    group: "resolve",
    prompt: "What is the OneGoodArea place id for Peckham?",
    expect: "resolve_place",
    check: includesWord("query", "Peckham"),
  },
  {
    id: "resolve-04",
    group: "resolve",
    prompt: "Which neighbourhood is the code E01003920?",
    expect: "resolve_place",
    check: includesWord("query", "E01003920"),
  },
  {
    id: "resolve-05",
    group: "resolve",
    prompt: "There are several places called Newport. Which ones does OneGoodArea know, with their ids?",
    expect: "resolve_place",
    check: includesWord("query", "Newport"),
  },
];

const single: EvalCase[] = [
  {
    id: "single-01",
    group: "single",
    prompt: "Score SE15 5DP for a buy-to-let investment.",
    expect: "score_postcode",
    check: all(field("area", "SE15 5DP"), equals("preset", "investing")),
  },
  {
    id: "single-02",
    group: "single",
    prompt: "How does M1 1AE score as a place to buy a home and live in?",
    expect: "score_postcode",
    check: all(field("area", "M1 1AE"), equals("preset", "moving")),
  },
  {
    id: "single-03",
    group: "single",
    prompt: "Give me every data point you hold on EH1 1YZ, with sources and dates.",
    expect: "get_area_signals",
    check: field("area", "EH1 1YZ"),
  },
  {
    id: "single-04",
    group: "single",
    prompt: "What is the crime data for CF10 1EP?",
    expect: "get_signals_by_category",
    check: all(field("area", "CF10 1EP"), equals("category", "crime")),
  },
  {
    id: "single-05",
    group: "single",
    prompt: "Write a brief on BS1 4DJ for a mortgage lender.",
    expect: "area_brief",
    check: all(field("area", "BS1 4DJ"), equals("audience", "lender")),
  },
  {
    id: "single-06",
    group: "single",
    prompt: "Prepare an insurer's view of G1 1XQ.",
    expect: "area_brief",
    check: all(field("area", "G1 1XQ"), equals("audience", "insurer")),
  },
];

const none: EvalCase[] = [
  { id: "none-01", group: "none", prompt: "What is the capital of France?", expect: null },
  { id: "none-02", group: "none", prompt: "Write a haiku about rain in Manchester.", expect: null },
  { id: "none-03", group: "none", prompt: "Explain the difference between a postcode district and a postcode sector.", expect: null },
  { id: "none-04", group: "none", prompt: "Draft a short email to my landlord about a broken boiler.", expect: null },
  { id: "none-05", group: "none", prompt: "What is 15 percent of 240,000?", expect: null },
  { id: "none-06", group: "none", prompt: "Which neighbourhoods in Belfast have the lowest crime?", expect: null },
  { id: "none-07", group: "none", prompt: "Compare Dublin 4 and Dublin 6 for a rental investment.", expect: null },
  { id: "none-08", group: "none", prompt: "Translate 'good morning' into Welsh.", expect: null },
  { id: "none-09", group: "none", prompt: "Summarise the plot of Pride and Prejudice in two sentences.", expect: null },
  { id: "none-10", group: "none", prompt: "How do I convert a CSV file to JSON in Python?", expect: null },
];

export const CASES: readonly EvalCase[] = [...compare, ...find, ...peers, ...history, ...portfolio, ...resolve, ...single, ...none];
