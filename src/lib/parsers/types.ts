import type { AccountProvider, TransactionDirection, TransactionType } from "@prisma/client";

export interface ParsedTransaction {
  /** Provider-issued reference / transaction ID, used for dedupe. */
  externalRef: string | null;
  /** Wallet / bank that emitted the SMS. */
  provider: AccountProvider;
  /** Direction relative to the user. */
  direction: TransactionDirection;
  /** Coarse type, refined later by categorization. */
  type: TransactionType;
  /** Always positive — direction encodes the sign. */
  amount: number;
  /** Wallet fee charged on top of `amount`. */
  fee: number;
  /** Balance reported after the transaction, when present. */
  balanceAfter: number | null;
  /** Display name of the other party (best-effort). */
  counterpartyName: string | null;
  /** E.164-ish phone number for the other party (best-effort). */
  counterpartyPhone: string | null;
  /** Merchant or paybill account, when distinct from counterparty. */
  merchant: string | null;
  /** Local-time transaction timestamp. */
  occurredAt: Date;
  /** Raw SMS body that was parsed. */
  rawText: string;
  /** 0..1 — how confident the parser is in the structure. */
  confidence: number;
  /** Which parser produced this. */
  parser: string;
}

export interface ParserResult {
  /** A successful structured parse, or `null` if this parser didn't match. */
  tx: ParsedTransaction | null;
  /** When `tx === null` and this is set, a short reason the parser rejected. */
  reason?: string;
}

export interface SmsParser {
  /** Stable identifier — also written to `Transaction.metadata.parser`. */
  name: string;
  /** Provider this parser targets. */
  provider: AccountProvider;
  /** Cheap pre-check — returns true if `parse` is worth running. */
  match: (text: string) => boolean;
  /** Returns a structured transaction or `null` if the text doesn't fit. */
  parse: (text: string) => ParserResult;
}
