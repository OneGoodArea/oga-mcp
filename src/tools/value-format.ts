/**
 * How every MCP tool writes a value, a percentile and a month (AR-974): one
 * formatter, so no tool prints a raw unit code ("4 count"), a wrong ordinal
 * ("22th") or a machine month ("2026-06").
 */

import type { OogaSignal } from "../api-client.js";

const whole = (n: number) => Math.round(n).toLocaleString("en-GB");

/** A signal's value with its unit in words; "n/a" when there is none. */
export function formatValue(s: Pick<OogaSignal, "value" | "unit">): string {
  if (s.value === null) return "n/a";
  if (typeof s.value === "string") return s.value;
  const n = s.value;
  switch (s.unit) {
    case "GBP": return `£${whole(n)}`;
    case "pct": return `${n.toFixed(1)}%`;
    case "count": case "rank": return whole(n);
    case "decile": return `${whole(n)} of 10`;
    case "per_month": return `${n.toFixed(1)} a month`;
    case "rate_per_month": return `${n.toFixed(2)} a month, per month`;
    case "per_1000": return `${n.toFixed(1)} per 1,000 residents`;
    case "per_10k": return `${n.toFixed(1)} per 10,000 residents`;
    case "z_score": return `${n.toFixed(2)} standard deviations`;
    default: return n.toLocaleString("en-GB");
  }
}

/** 1 -> "1st", 22 -> "22nd", 13 -> "13th". */
export function ordinal(n: number): string {
  const r = Math.round(n);
  const tens = r % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[r % 10] ?? "th";
  return `${r}${suffix}`;
}

/** A percentile as an ordinal: 68.89 -> "69th percentile". */
export const formatPercentile = (p: number): string => `${ordinal(p)} percentile`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-06" -> "Jun 2026"; anything else unchanged. */
export function monthText(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return m && month ? `${month} ${m[1]}` : period;
}
