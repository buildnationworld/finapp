import { AccountProvider, TransactionDirection, TransactionType } from "@prisma/client";

import type { ParsedTransaction, ParserResult, SmsParser } from "./types";
import { cleanName, parseAmount, parseSmsDate } from "./util";

/**
 * KCB account / KCB M-Pesa SMS. Two common shapes:
 *   1. "Confirmed. KES 3,000.00 sent to KCB acc 234567890 from KCB acc 123456789
 *       on 21/02/24 at 10:00. New balance KES 22,000.00. Ref TXN123"
 *   2. "Dear Customer, KES 5,000.00 deposited into account 1234567890 on
 *       21/02/2024. Available balance KES 17,000.00. Ref: KCBABC123"
 */
const HAS_KCB = /\bKCB\b/i;
const REF_RE = /Ref[:.]?\s*([A-Z0-9]{4,20})/i;
const BALANCE_RE = /(?:New|Available)\s+balance(?:\s+is)?\s+(?:KES|Ksh|KSH)\s*([\d,]+(?:\.\d+)?)/i;
const KES_AMT = /(?:KES|Ksh|KSH)\s*([\d,]+(?:\.\d+)?)/i;
const DATE_RE =
  /on\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(?:at\s+)?(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)/i;

function trySentFromTo(text: string): ParsedTransaction | null {
  const re =
    /KES\s*([\d,]+(?:\.\d+)?)\s+sent\s+to\s+(KCB\s+acc\s+\d+|[A-Z0-9][A-Z0-9\s.'&-]+?)\s+from\s+(?:KCB\s+acc\s+)?(\d+)/i;
  const m = re.exec(text);
  if (!m) return null;
  const amount = parseAmount(m[1]);
  const dateM = DATE_RE.exec(text);
  const occurredAt = parseSmsDate(`${dateM?.[1]} ${dateM?.[2]}`);
  if (amount === null || !occurredAt) return null;
  return {
    externalRef: REF_RE.exec(text)?.[1] ?? null,
    provider: AccountProvider.KCB,
    direction: TransactionDirection.OUT,
    type: TransactionType.TRANSFER,
    amount,
    fee: 0,
    balanceAfter: parseAmount(BALANCE_RE.exec(text)?.[1]) ?? null,
    counterpartyName: cleanName(m[2]),
    counterpartyPhone: null,
    merchant: null,
    occurredAt,
    rawText: text,
    confidence: 0.9,
    parser: "kcb",
  };
}

function tryDeposit(text: string): ParsedTransaction | null {
  const re =
    /KES\s*([\d,]+(?:\.\d+)?)\s+deposited\s+into\s+account\s+(\d+)\s+on\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i;
  const m = re.exec(text);
  if (!m) return null;
  const amount = parseAmount(m[1]);
  const occurredAt = parseSmsDate(m[3]);
  if (amount === null || !occurredAt) return null;
  return {
    externalRef: REF_RE.exec(text)?.[1] ?? null,
    provider: AccountProvider.KCB,
    direction: TransactionDirection.IN,
    type: TransactionType.DEPOSIT,
    amount,
    fee: 0,
    balanceAfter: parseAmount(BALANCE_RE.exec(text)?.[1]) ?? null,
    counterpartyName: "KCB Deposit",
    counterpartyPhone: null,
    merchant: null,
    occurredAt,
    rawText: text,
    confidence: 0.9,
    parser: "kcb",
  };
}

const PIPELINE = [trySentFromTo, tryDeposit] as const;

export const kcbParser: SmsParser = {
  name: "kcb",
  provider: AccountProvider.KCB,
  match: (text) => HAS_KCB.test(text) && KES_AMT.test(text),
  parse: (text): ParserResult => {
    for (const fn of PIPELINE) {
      const tx = fn(text.trim());
      if (tx) return { tx };
    }
    return { tx: null, reason: "no_kcb_pattern_matched" };
  },
};
