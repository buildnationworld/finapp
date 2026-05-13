import { airtelParser } from "./airtel";
import { equityParser } from "./equity";
import { kcbParser } from "./kcb";
import { mpesaParser } from "./mpesa";
import type { ParsedTransaction, SmsParser } from "./types";

/**
 * Registry of all SMS parsers. Order matters — the first parser whose
 * `match()` returns true is asked to parse. M-Pesa wins ties because it has
 * the most distinctive reference prefix and is the most common in Kenya.
 */
export const PARSERS: readonly SmsParser[] = [mpesaParser, equityParser, kcbParser, airtelParser];

export type ParseOutcome =
  | { ok: true; tx: ParsedTransaction }
  | { ok: false; reason: string; tried: string[] };

/** Try every parser in registry order. Returns the first successful parse. */
export function parseSms(text: string): ParseOutcome {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: "empty_text", tried: [] };

  const tried: string[] = [];
  for (const p of PARSERS) {
    if (!p.match(trimmed)) continue;
    tried.push(p.name);
    const res = p.parse(trimmed);
    if (res.tx) return { ok: true, tx: res.tx };
  }
  return {
    ok: false,
    reason: tried.length ? "all_matched_parsers_rejected" : "no_parser_matched",
    tried,
  };
}

/**
 * Split a multi-message paste into individual SMS bodies. We split on blank
 * lines OR on the start of a known confirmation phrase (a 10-char alphanumeric
 * ref + "Confirmed", or "Dear Customer", or "Trans ID:").
 */
export function splitMessages(input: string): string[] {
  const blocks: string[] = [];
  const normalized = input.replace(/\r\n/g, "\n").trim();
  if (!normalized) return blocks;

  // Strategy 1: split on blank lines.
  const blank = normalized.split(/\n\s*\n+/);
  for (const block of blank) {
    const piece = block.trim();
    if (!piece) continue;
    // Within a block, further split if it contains multiple obvious SMS starts.
    const subs = piece.split(
      /(?=^[A-Z0-9]{10}\s+Confirmed|^Dear\s+Customer|^Trans\s*ID|^You\s+have\s+used\s+Fuliza)/m,
    );
    for (const s of subs) {
      const trimmed = s.trim();
      if (trimmed) blocks.push(trimmed);
    }
  }
  return blocks;
}

export type { ParsedTransaction, SmsParser } from "./types";
