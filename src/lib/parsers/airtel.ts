import { AccountProvider, TransactionDirection, TransactionType } from "@prisma/client";

import type { ParsedTransaction, ParserResult, SmsParser } from "./types";
import { cleanName, normalizePhone, parseAmount, parseSmsDate } from "./util";

/**
 * Airtel Money SMS markers. Airtel uses "Trans ID" or "TID" prefixes and the
 * "Airtel Money" / "AirtelMoney" string. Some templates use "Ksh" and others
 * "KES"; we accept both.
 */
const HAS_AIRTEL = /(Airtel\s*Money|AirtelMoney|Trans\s*ID:|TID:)/i;
const REF_RE = /(?:Trans\s*ID|TID)[:\s]+([A-Z0-9.]{6,30})/i;
const KSH = /K(?:sh|ES)\s*([\d,]+(?:\.\d+)?)/i;
const BALANCE_RE = /(?:Available|New)\s+balance(?:\s+is)?\s+K(?:sh|ES)?\s*([\d,]+(?:\.\d+)?)/i;
const FEE_RE = /(?:Charge|Fee|Cost)[:,]?\s*K(?:sh|ES)?\s*([\d,]+(?:\.\d+)?)/i;

function base(
  rawText: string,
): Pick<ParsedTransaction, "externalRef" | "balanceAfter" | "fee" | "provider" | "parser"> {
  const refM = REF_RE.exec(rawText);
  const balM = BALANCE_RE.exec(rawText);
  const feeM = FEE_RE.exec(rawText);
  return {
    externalRef: refM?.[1] ?? null,
    balanceAfter: parseAmount(balM?.[1]) ?? null,
    fee: parseAmount(feeM?.[1]) ?? 0,
    provider: AccountProvider.AIRTEL,
    parser: "airtel",
  };
}

/** "You have received Ksh 1,000.00 from JOHN DOE - 0732123456. Available balance Ksh 5,500.00. on 26-02-2024 13:45" */
function tryReceived(text: string): ParsedTransaction | null {
  const re =
    /received\s+K(?:sh|ES)?\s*([\d,]+(?:\.\d+)?)\s+from\s+([A-Z][A-Z\s.'-]+?)\s*-\s*(\+?\d{3,15})/i;
  const m = re.exec(text);
  if (!m) return null;
  const dateM = /on\s+([\d\-\/\.]+\s+[\d:]+)/i.exec(text);
  const occurredAt = parseSmsDate(dateM?.[1]);
  const amount = parseAmount(m[1]);
  if (!occurredAt || amount === null) return null;
  return {
    ...base(text),
    direction: TransactionDirection.IN,
    type: TransactionType.TRANSFER,
    amount,
    counterpartyName: cleanName(m[2]),
    counterpartyPhone: normalizePhone(m[3]),
    merchant: null,
    occurredAt,
    rawText: text,
    confidence: 0.92,
  };
}

/** "You have sent Ksh 500.00 to JANE SMITH - 0723123456. New balance Ksh 4,500.00. on 26-02-2024 14:00" */
function trySent(text: string): ParsedTransaction | null {
  const re =
    /sent\s+K(?:sh|ES)?\s*([\d,]+(?:\.\d+)?)\s+to\s+([A-Z][A-Z\s.'-]+?)\s*-\s*(\+?\d{3,15})/i;
  const m = re.exec(text);
  if (!m) return null;
  const dateM = /on\s+([\d\-\/\.]+\s+[\d:]+)/i.exec(text);
  const occurredAt = parseSmsDate(dateM?.[1]);
  const amount = parseAmount(m[1]);
  if (!occurredAt || amount === null) return null;
  return {
    ...base(text),
    direction: TransactionDirection.OUT,
    type: TransactionType.TRANSFER,
    amount,
    counterpartyName: cleanName(m[2]),
    counterpartyPhone: normalizePhone(m[3]),
    merchant: null,
    occurredAt,
    rawText: text,
    confidence: 0.92,
  };
}

/** "Paid Ksh 1,200.00 to KPLC for account 12345. on 27-02-2024 09:00" */
function tryPaid(text: string): ParsedTransaction | null {
  const re =
    /Paid\s+K(?:sh|ES)?\s*([\d,]+(?:\.\d+)?)\s+to\s+([A-Z0-9][A-Z0-9\s.'&-]+?)(?:\s+for\s+account\s+([\w-]+))?/i;
  const m = re.exec(text);
  if (!m) return null;
  const dateM = /on\s+([\d\-\/\.]+\s+[\d:]+)/i.exec(text);
  const occurredAt = parseSmsDate(dateM?.[1]);
  const amount = parseAmount(m[1]);
  if (!occurredAt || amount === null) return null;
  const merchant = cleanName(m[2]);
  return {
    ...base(text),
    direction: TransactionDirection.OUT,
    type: m[3] ? TransactionType.PAYBILL : TransactionType.TILL,
    amount,
    counterpartyName: merchant,
    counterpartyPhone: null,
    merchant: m[3] ? `${merchant} (acc ${m[3]})` : merchant,
    occurredAt,
    rawText: text,
    confidence: 0.9,
  };
}

const PIPELINE = [tryReceived, trySent, tryPaid] as const;

export const airtelParser: SmsParser = {
  name: "airtel",
  provider: AccountProvider.AIRTEL,
  match: (text) => HAS_AIRTEL.test(text) && KSH.test(text),
  parse: (text): ParserResult => {
    for (const fn of PIPELINE) {
      const tx = fn(text.trim());
      if (tx) return { tx };
    }
    return { tx: null, reason: "no_airtel_pattern_matched" };
  },
};
