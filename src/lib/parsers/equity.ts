import { AccountProvider, TransactionDirection, TransactionType } from "@prisma/client";

import type { ParsedTransaction, ParserResult, SmsParser } from "./types";
import { cleanName, parseAmount, parseSmsDate } from "./util";

/**
 * Equity Bank account alert SMS. Templates vary, but the giveaway is the
 * "account <digits> has been DEBITED/CREDITED" phrasing and the "Ref:" suffix.
 */
const HAS_EQUITY = /\b(EQUITY|Equitel|EazzyBanking|Eazzy\s+Banking)\b/i;
const DEBIT_CREDIT =
  /account\s+(\d{6,14})\s+has\s+been\s+(DEBITED|CREDITED)\s+with\s+(KES|Ksh|KSH)\s*([\d,]+(?:\.\d+)?)/i;
const REF_RE = /Ref[:.]?\s*([A-Z0-9]{4,20})/i;
const BALANCE_RE = /(?:Available\s+balance|Bal)\s+(?:KES|Ksh|KSH)\s*([\d,]+(?:\.\d+)?)/i;
const DATE_RE = /(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}-\d{1,2}-\d{2,4})\s+(\d{1,2}:\d{2}(?::\d{2})?)/;
const AT_RE = /\bat\s+([A-Z0-9][A-Z0-9\s.'&-]+?)(?:\.|,|$)/i;

export const equityParser: SmsParser = {
  name: "equity",
  provider: AccountProvider.EQUITY,
  match: (text) =>
    HAS_EQUITY.test(text) || /account\s+\d{6,14}\s+has\s+been\s+(DEBITED|CREDITED)/i.test(text),
  parse: (text): ParserResult => {
    const trimmed = text.trim();
    const m = DEBIT_CREDIT.exec(trimmed);
    if (!m) return { tx: null, reason: "no_equity_pattern_matched" };

    const accountNumber = m[1];
    const movement = m[2] ?? "DEBITED";
    const direction =
      movement.toUpperCase() === "CREDITED" ? TransactionDirection.IN : TransactionDirection.OUT;
    const amount = parseAmount(m[4]);

    const dateM = DATE_RE.exec(trimmed);
    const occurredAt = parseSmsDate(`${dateM?.[1]} ${dateM?.[2]}`);
    if (amount === null || !occurredAt) return { tx: null, reason: "missing_amount_or_date" };

    const balM = BALANCE_RE.exec(trimmed);
    const refM = REF_RE.exec(trimmed);
    const atM = AT_RE.exec(trimmed);

    const merchant = cleanName(atM?.[1] ?? null);

    return {
      tx: {
        externalRef: refM?.[1] ?? null,
        provider: AccountProvider.EQUITY,
        direction,
        type:
          direction === TransactionDirection.IN
            ? TransactionType.DEPOSIT
            : merchant
              ? TransactionType.PAYMENT
              : TransactionType.TRANSFER,
        amount,
        fee: 0,
        balanceAfter: parseAmount(balM?.[1]) ?? null,
        counterpartyName: merchant,
        counterpartyPhone: null,
        merchant,
        occurredAt,
        rawText: trimmed,
        confidence: 0.92,
        parser: "equity",
        // Equity SMS reference the account number itself; stash on metadata
        // via the merchant field is wrong, so we leave it implicit here. The
        // import API will associate by Account when accountNumber is known.
      },
    };
  },
};

/** Exported for the import flow to associate to the right Account row. */
export function extractEquityAccountNumber(text: string): string | null {
  return DEBIT_CREDIT.exec(text)?.[1] ?? null;
}
