/**
 * Thin HTTP client for the OneGoodArea REST API.
 * Used by every MCP tool, keeps auth + base URL handling in one place.
 *
 * AR-364: rewritten to target the live apps/api at /v1/* directly (not
 * the apps/web /api/v1/* proxy, which is silently broken since AR-324).
 * Uses /v1/score?explain=true so brief-shape narrative is composed
 * server-side from real engine state, no client-side text synthesis.
 */

export const DEFAULT_BASE = "https://api.onegoodarea.com";

/** The subset of fetch the client needs, so a host can run it in-process. */
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal: AbortSignal }) => Promise<Response>;

export interface HostClient {
  name?: string;
  version?: string;
}

/* The API reads this header (AR-375): the stamp sets source=mcp, the host
   client in brackets (claude-ai, claude-code, cursor) sets client_app. */
export function buildUserAgent(version: string, host?: HostClient): string {
  const stamp = `onegoodarea-mcp-server/${version}`;
  const name = host?.name?.trim().replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 64);
  if (!name) return stamp;
  const hostVersion = host?.version?.trim().replace(/[^A-Za-z0-9._-]+/g, "").slice(0, 32);
  return hostVersion ? `${stamp} (${name}/${hostVersion})` : `${stamp} (${name})`;
}

export type Preset = "moving" | "business" | "investing" | "research";

/** AR-366: the seven signal categories exposed by /v1/signals/:category.
    Mirrors @onegoodarea/contracts SIGNAL_CATEGORIES. */
export const SIGNAL_CATEGORIES = [
  "crime",
  "deprivation",
  "property",
  "schools",
  "amenities",
  "transport",
  "environment",
] as const;
export type SignalCategory = typeof SIGNAL_CATEGORIES[number];

/** AR-1007: orders a signal list newest first by a date. Mirrors
    @onegoodarea/contracts SORT_ORDERS. */
export const SORT_ORDERS = ["period", "loaded", "released"] as const;
export type SortOrder = typeof SORT_ORDERS[number];

/** AR-366: one addressable signal as returned by /v1/area + /v1/signals/:category.
    Matches @onegoodarea/contracts Signal. */
const sortQuery = (sort?: SortOrder): string => (sort ? `&sort=${sort}` : "");

/** The tool argument for a date order: absent, or one of SORT_ORDERS. */
export function parseSortArg(raw: unknown): SortOrder | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || !(SORT_ORDERS as readonly string[]).includes(raw)) {
    throw new Error(`sort must be one of: ${SORT_ORDERS.join(", ")}`);
  }
  return raw as SortOrder;
}

/** The JSON-schema property both signal-list tools declare. */
export const SORT_PROPERTY = {
  type: "string",
  enum: SORT_ORDERS,
  description:
    "Optional. Order signals newest first by their period, by when OneGoodArea loaded them, or by the publisher's release date. Omit to keep catalogue order.",
} as const;

export interface OogaSignal {
  key: string;
  category: SignalCategory;
  label: string;
  value: number | string | null;
  unit: string | null;
  normalized_value?: number | null;
  percentile?: number | null;
  /** AR-1085: the published rank and, where the publisher gives one, the score behind a deprivation domain's decile. Mirrors @onegoodarea/contracts SignalDetail. */
  detail?: { rank?: number; score?: number };
  direction: "higher_is_better" | "lower_is_better" | "neutral";
  confidence: number;
  confidence_reason: string;
  source: string;
  observed_period: string;
  /** AR-1007: what the value describes, as calendar dates. */
  period?: { start: string; end: string } | null;
  /** reference: the source states the date; load: the day the value entered OneGoodArea. */
  period_basis?: "reference" | "load" | null;
  released_at?: string | null;
  loaded_at?: string | null;
  retrieved_at?: string | null;
}

/** AR-367: the seven Intelligence plan ops. Mirrors @onegoodarea/contracts
    QueryPlan.op discriminator. */
export type OogaPlanOp =
  | "rank_areas"
  | "get_area"
  | "score_area"
  | "compare_areas"
  | "find_peers"
  | "find_insights"
  | "find_forecast";

/** AR-367: response from POST /v1/query, discriminated by plan.op. We
    don't strict-decode the per-op results shapes here; the formatter
    walks them defensively. Matches @onegoodarea/contracts QueryResponse. */
export interface OogaQueryResponse {
  plan: { op: OogaPlanOp; params: unknown };
  plan_source: "client" | "nl";
  results: unknown;
  meta: { generated_at: string };
}

/** AR-368: Monitor types, matches @onegoodarea/contracts Portfolio + PortfolioArea. */
export interface OogaPortfolio {
  id: string;
  name: string;
  area_count?: number;
  created_at?: string;
}

export interface OogaPortfolioArea {
  id: string;
  area: string;
  label: string | null;
  created_at?: string;
}

/** AR-368: response from POST /v1/portfolios/:id/areas (the route returns
    the updated portfolio detail with all areas). */
export interface OogaPortfolioDetail extends OogaPortfolio {
  areas: OogaPortfolioArea[];
}

/** AR-977: why a value moved. Mirrors @onegoodarea/contracts ChangeCause. */
export type OogaChangeCause = "source" | "method" | "source_and_method";

/** AR-368: a material signal change for one tracked area between two
    time-series periods. Mirrors @onegoodarea/contracts SignalChange. */
export interface OogaSignalChange {
  signal_key: string;
  label: string | null;
  area: string;
  geo_code: string;
  period_from: string;
  period_to: string;
  value_from: number | null;
  value_to: number | null;
  delta: number | null;
  pct_change: number | null;
  direction: "up" | "down" | "flat";
  material: boolean;
  /** AR-977: why it moved: the source data, a methodology release over the
      same period, or both. Absent from an API older than the field. */
  cause?: OogaChangeCause;
  /** The methodology releases between the two points that moved this signal. */
  method_releases?: string[];
  engine_version_from?: string | null;
  engine_version_to?: string | null;
}

/** AR-368: the response from POST /v1/portfolios/:id/changes, a change
    detection report for one portfolio between two periods. */
export interface OogaChangeReport {
  portfolio_id: string;
  baseline: "previous" | "first";
  threshold_pct: number;
  min_transactions: number;
  areas_checked: number;
  material_count: number;
  /** The causes listed; absent from an API older than the filter. */
  causes?: OogaChangeCause[];
  changes: OogaSignalChange[];
  generated_at: string;
}

/** AR-367: typed peers response from POST /v1/peers. */
export interface OogaPeersResponse {
  target: {
    geo_code: string;
    signals_used: string[];
  };
  peers: Array<{
    geo_code: string;
    distance: number;
    n_dims_used: number;
  }>;
  meta: { generated_at: string; scope: string };
}

/** AR-366: the AreaProfile response from /v1/area and /v1/signals/:category. */
export interface OogaAreaProfile {
  geo: {
    query: string;
    postcode: string | null;
    latitude: number;
    longitude: number;
    lsoa: string | null;
    msoa: string | null;
    admin_district: string | null;
    region: string | null;
    country: string;
    /** Null when no official class is known for the area. */
    area_type: "urban" | "suburban" | "rural" | null;
  };
  signals: OogaSignal[];
  meta: {
    engine_version: string;
    generated_at: string;
    sources: string[];
    fetch_mode: "live" | "store" | "hybrid";
  };
}

/** One weighted component of a composite score. Matches the
    @onegoodarea/contracts `ScoreDimension` shape; we redeclare it here
    so the MCP package can be published independently of the monorepo
    contracts (the npm release ships only mcp/dist). */
export interface OogaScoreDimension {
  key: string;
  label: string;
  score: number;
  weight: number;
  confidence: number;
  reasoning: string;
  confidence_reason: string;
}

/** The response of POST /v1/score?explain=true. The `summary`,
    `recommendations`, and `data_sources` fields are server-side
    composed when explain mode is on (AR-363). */
export interface OogaScoreResponse {
  area: string;
  preset: Preset;
  score: number;
  /** Null when no official class is known; transport, schools and
      amenities were then ranked among all GB neighbourhoods. */
  area_type: "urban" | "suburban" | "rural" | null;
  dimensions: OogaScoreDimension[];
  confidence: number;
  weights_source: "preset" | "custom";
  engine_version: string;
  /** Brief-shape fields, present when ?explain=true. */
  summary?: string;
  recommendations?: string[];
  data_sources?: string[];
}

/** Place registry (ADR 0044): a place as every response refers to it, and
    the outcome of GET /v1/places/resolve. Mirrors @onegoodarea/contracts
    PlaceRef and PlaceResolution. */
export interface OogaPlaceRef {
  place_id: string;
  place_type: "country" | "nation" | "region" | "district" | "group" | "neighbourhood";
  name: string | null;
  country: string;
  nation: string | null;
}

export interface OogaPlaceCandidate {
  label: string;
  postcode: string | null;
  place: OogaPlaceRef | null;
}

export type OogaPlaceResolution =
  | {
      status: "resolved";
      input: string;
      place: OogaPlaceRef;
      resolved_via: { kind: "place_id" | "postcode" | "code" | "name"; scheme: string | null; value: string };
      postcode: { postcode: string; status: "live" | "terminated"; terminated_on: string | null } | null;
    }
  | { status: "ambiguous"; input: string; candidates: OogaPlaceCandidate[] }
  | { status: "not_found"; input: string; reason: string; message: string };

export interface OogaPlaceResolveResponse {
  result: OogaPlaceResolution;
  meta: { engine_version: string; generated_at: string };
}

export interface OogaApiClientOptions {
  apiKey: string;
  baseUrl?: string;
  /** Defaults to 60 seconds, the engine takes 15-45s on cache miss. */
  timeoutMs?: number;
  /** The server version named in the User-Agent; the stdio entry passes its
      package version, a host passes its own. */
  version?: string;
  /** Replaces global fetch, so a host can answer calls in-process. */
  fetch?: FetchLike;
}

/** /v1/me response shape (the bits MCP relies on). The API returns more
    fields (org, key allowlist, addons, etc.), we only declare what we
    use, since extra fields are fine at runtime. */
export interface OogaMeResponse {
  plan: string;
  plan_name: string;
  api_access: boolean;
  mcp_access: boolean;
  api_calls_per_month: number;
  used_this_month: number;
  limit_this_month: number | null;
  engine_version: string;
  /* AR-385: per-key training-data opt-out state, surfaced so the MCP
     server can log capture state on every boot. Optional: an API build
     without it is read as opted out, the default since AR-1152. */
  key?: {
    allowed_ip_cidrs?: string[];
    training_optout?: boolean;
  };
}

/** GET /v1/meta: the engine version the API stamps now, and the
    methodology history, newest last. */
export interface OogaMetaResponse {
  engine_version: string;
  methodology: Array<{ version: string; released_at: string; summary: string }>;
}

export class OogaApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly responseBody?: unknown,
  ) {
    super(message);
    this.name = "OogaApiError";
  }
}

export class OogaApiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly version: string;
  private readonly fetchImpl: FetchLike | undefined;
  private host: HostClient | undefined;

  setHostClient(host: HostClient | undefined): void {
    this.host = host;
  }

  private userAgent(): string {
    return buildUserAgent(this.version, this.host);
  }

  private doFetch(url: string, init: Parameters<FetchLike>[1]): Promise<Response> {
    return (this.fetchImpl ?? fetch)(url, init);
  }

  constructor(opts: OogaApiClientOptions) {
    if (!opts.apiKey) throw new Error("OogaApiClient requires apiKey");
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
    this.timeoutMs = opts.timeoutMs ?? 60_000;
    this.version = opts.version ?? "unknown";
    this.fetchImpl = opts.fetch;
  }

  /**
   * GET /v1/me, returns the authenticated user's plan + entitlements.
   * Called by the MCP server at startup to check `mcp_access`.
   */
  async me(): Promise<OogaMeResponse> {
    const url = `${this.baseUrl}/v1/me`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await this.doFetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "User-Agent": this.userAgent(),
        },
        signal: controller.signal,
      });

      const text = await res.text();
      let body: unknown;
      try { body = JSON.parse(text); } catch { body = text; }

      if (!res.ok) {
        const errMsg =
          typeof body === "object" && body !== null && "error" in body
            ? String((body as { error: unknown }).error)
            : `HTTP ${res.status}`;
        throw new OogaApiError(errMsg, res.status, body);
      }

      return body as OogaMeResponse;
    } finally {
      clearTimeout(timeout);
    }
  }

  /** GET /v1/meta: the live engine version and methodology history. */
  async meta(): Promise<OogaMetaResponse> {
    return this.getJson<OogaMetaResponse>("/v1/meta");
  }

  /** GET /v1/places/resolve?q=: one input to the place it names. The API
      answers not_found with HTTP 404 and the same body shape, so that status
      is a result here, not an error. */
  async resolvePlace(query: string): Promise<OogaPlaceResolveResponse> {
    return this.getJson<OogaPlaceResolveResponse>(`/v1/places/resolve?q=${encodeURIComponent(query)}`, { acceptStatuses: [404] });
  }

  /**
   * POST /v1/score?explain=true, score a UK area for the given preset.
   * `explain=true` triggers server-side composition of the brief-shape
   * fields (summary, recommendations, data_sources) from real engine
   * state. Per the brief-shape policy, the MCP never synthesises text.
   */
  async scoreArea(area: string, preset: Preset): Promise<OogaScoreResponse> {
    const url = `${this.baseUrl}/v1/score?explain=true`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await this.doFetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "User-Agent": this.userAgent(),
        },
        body: JSON.stringify({ area, preset }),
        signal: controller.signal,
      });

      const text = await res.text();
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }

      if (!res.ok) {
        const errMsg =
          typeof body === "object" && body !== null && "error" in body
            ? String((body as { error: unknown }).error)
            : `HTTP ${res.status}`;
        throw new OogaApiError(errMsg, res.status, body);
      }

      return body as OogaScoreResponse;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * GET /v1/area?area=<area>, full signal catalog for an area.
   * Returns every signal with its raw value, normalized value + percentile
   * (when store-backed), per-signal confidence + reason, source attribution,
   * and observation period. The full Signals primitive (AR-366).
   */
  async getAreaSignals(area: string, sort?: SortOrder): Promise<OogaAreaProfile> {
    return this.getJson<OogaAreaProfile>(`/v1/area?area=${encodeURIComponent(area)}${sortQuery(sort)}`);
  }

  /**
   * GET /v1/signals/:category?area=<area>, signals filtered to one category
   * (crime / deprivation / property / schools / amenities / transport /
   * environment). Same Signal shape as /v1/area; just a narrower payload
   * for when the LLM only needs one slice.
   */
  async getSignalsByCategory(area: string, category: SignalCategory, sort?: SortOrder): Promise<OogaAreaProfile> {
    return this.getJson<OogaAreaProfile>(`/v1/signals/${category}?area=${encodeURIComponent(area)}${sortQuery(sort)}`);
  }

  /**
   * POST /v1/query with `{question}`, natural-language interface to the
   * Intelligence query plane. The planner emits a typed plan; the DB
   * executes it; the response carries plan + plan_source + results so
   * every answer is reproducible (AR-367).
   */
  async findAreas(question: string): Promise<OogaQueryResponse> {
    return this.postIntelligence("/v1/query", { question });
  }

  /**
   * POST /v1/peers with `{target: {area}, k?}`, k-NN over normalized
   * signal values. Returns the target geo_code + signals_used + a
   * ranked peers[] list (AR-367).
   */
  async findPeers(area: string, k?: number): Promise<OogaPeersResponse> {
    const body: { target: { area: string }; k?: number } = { target: { area } };
    if (k !== undefined) body.k = k;
    return this.postIntelligence("/v1/peers", body);
  }

  /**
   * POST /v1/portfolios, create a new Monitor portfolio. AR-368.
   */
  async createPortfolio(name: string): Promise<OogaPortfolio> {
    return this.postIntelligence<OogaPortfolio>("/v1/portfolios", { name });
  }

  /**
   * POST /v1/portfolios/:id/areas, add tracked areas to a portfolio.
   * AR-386: returns `{ added: <count>, portfolio: PortfolioDetail }`.
   * Previously typed as bare PortfolioDetail; the actual response shape
   * was `{added: N}` only, which crashed watch_portfolio's response
   * formatter on `.areas.length`. apps/api now returns the full detail
   * alongside the count in a single round-trip.
   */
  async addPortfolioAreas(
    portfolioId: string,
    areas: Array<{ area: string; label?: string | null }>,
  ): Promise<{ added: number; portfolio: OogaPortfolioDetail }> {
    return this.postIntelligence<{ added: number; portfolio: OogaPortfolioDetail }>(
      `/v1/portfolios/${encodeURIComponent(portfolioId)}/areas`,
      { areas },
    );
  }

  /**
   * POST /v1/portfolios/:id/changes, detect material signal changes between
   * two time-series periods. AR-368.
   */
  async getPortfolioChanges(
    portfolioId: string,
    opts: { baseline?: "previous" | "first"; threshold_pct?: number; min_transactions?: number; cause?: OogaChangeCause[] } = {},
  ): Promise<OogaChangeReport> {
    const body: Record<string, unknown> = {};
    if (opts.baseline !== undefined) body.baseline = opts.baseline;
    if (opts.cause !== undefined) body.cause = opts.cause;
    if (opts.threshold_pct !== undefined) body.threshold_pct = opts.threshold_pct;
    if (opts.min_transactions !== undefined) body.min_transactions = opts.min_transactions;
    /* Default emit:false, the MCP shouldn't fire webhooks on a probe call. */
    body.emit = false;
    return this.postIntelligence<OogaChangeReport>(
      `/v1/portfolios/${encodeURIComponent(portfolioId)}/changes`,
      body,
    );
  }

  /** Shared POST handler for the Intelligence endpoints. */
  private async postIntelligence<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await this.doFetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "User-Agent": this.userAgent(),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const text = await res.text();
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { parsed = text; }

      if (!res.ok) {
        const errMsg =
          typeof parsed === "object" && parsed !== null && "error" in parsed
            ? String((parsed as { error: unknown }).error)
            : `HTTP ${res.status}`;
        throw new OogaApiError(errMsg, res.status, parsed);
      }

      return parsed as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Shared authenticated GET. A status in acceptStatuses is a result when the
      body is not an error object. */
  private async getJson<T>(path: string, opts: { acceptStatuses?: readonly number[] } = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await this.doFetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "User-Agent": this.userAgent(),
        },
        signal: controller.signal,
      });

      const text = await res.text();
      let body: unknown;
      try { body = JSON.parse(text); } catch { body = text; }

      const errorBody = typeof body === "object" && body !== null && "error" in body;
      const accepted = res.ok || (!errorBody && (opts.acceptStatuses?.includes(res.status) ?? false));
      if (!accepted) {
        const errMsg = errorBody ? String((body as { error: unknown }).error) : `HTTP ${res.status}`;
        throw new OogaApiError(errMsg, res.status, body);
      }

      return body as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}
